import crypto from "node:crypto";
import { sendPush } from "./webpush.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const keyFor = (endpoint) => crypto.createHash("sha256").update(endpoint).digest("hex");

function validSub(s) {
  return s && typeof s.endpoint === "string" && s.endpoint.startsWith("https://") && s.endpoint.length < 1000 &&
    s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" &&
    s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
}

// POST = اشتراك ، DELETE = إلغاء
export async function handleSubscribe(req, store) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const sub = body && body.subscription;
  if (!validSub(sub)) return json({ error: "invalid subscription" }, 400);
  const key = keyFor(sub.endpoint);
  if (req.method === "DELETE") { await store.delete(key); return json({ ok: true }); }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  await store.setJSON(key, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, at: Date.now() });
  return json({ ok: true });
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// POST {title, body, url} مع ترويسة x-admin-key
export async function handleSend(req, store, env, send = sendPush) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!env.ADMIN_KEY || !safeEqual(req.headers.get("x-admin-key"), env.ADMIN_KEY)) return json({ error: "كلمة المرور غير صحيحة" }, 401);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return json({ error: "مفاتيح VAPID غير مضبوطة في Netlify" }, 500);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const title = String(b.title || "").trim().slice(0, 120);
  const text = String(b.body || "").trim().slice(0, 300);
  let url = String(b.url || "/").trim();
  if (!url.startsWith("/")) url = "/";
  if (!title) return json({ error: "اكتب عنوان الإشعار" }, 400);

  const r = await broadcast({ title, body: text, url, tag: "nufais-" + Date.now() }, store, env, send);
  return json({ ok: true, ...r });
}

function vapidFrom(env) {
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || "https://alnufaisqrn.com" };
}

// إرسال لكل المشتركين وحذف المنتهية
export async function broadcast(payload, store, env, send = sendPush) {
  const vapid = vapidFrom(env);
  const { blobs } = await store.list();
  let sent = 0, failed = 0, removed = 0;
  const errors = {};
  for (let i = 0; i < blobs.length; i += 50) {
    await Promise.all(blobs.slice(i, i + 50).map(async ({ key }) => {
      const sub = await store.get(key, { type: "json" });
      if (!sub) return;
      try {
        const status = await send(sub, payload, vapid);
        if (status >= 200 && status < 300) sent++;
        else if (status === 404 || status === 410) { await store.delete(key); removed++; }
        else { failed++; errors[status] = (errors[status] || 0) + 1; }
      } catch (e) { failed++; errors.network = (errors.network || 0) + 1; }
    }));
  }
  return { total: blobs.length, sent, failed, removed, errors };
}

// الإشعارات المجدولة: ترسل كل عنصر حان وقته مرة وحدة فقط
export async function runQueue(queue, store, meta, env, now = Date.now(), send = sendPush) {
  const log = [];
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return [{ error: "VAPID keys missing" }];
  for (const item of queue || []) {
    const t = Date.parse(item.at);
    if (!item.id || !item.title || isNaN(t)) { log.push({ id: item.id, skip: "invalid" }); continue; }
    if (t > now) continue;                                   // لسا ما حان وقته
    if (now - t > 6 * 3600 * 1000) continue;                 // فات وقته بأكثر من ٦ ساعات
    const mark = "sent:" + item.id;
    if (await meta.get(mark)) continue;                      // انرسل قبل
    await meta.set(mark, new Date(now).toISOString());       // نسجّل قبل الإرسال لمنع التكرار
    let url = String(item.url || "/"); if (!url.startsWith("/")) url = "/";
    const r = await broadcast({ title: String(item.title).slice(0, 120), body: String(item.body || "").slice(0, 300), url, tag: "nufais-" + item.id }, store, env, send);
    log.push({ id: item.id, ...r });
  }
  return log;
}

// عدد المشتركين (للوحة الإدارة)
export async function handleCount(req, store, env) {
  if (!env.ADMIN_KEY || !safeEqual(req.headers.get("x-admin-key"), env.ADMIN_KEY)) return json({ error: "كلمة المرور غير صحيحة" }, 401);
  const { blobs } = await store.list();
  return json({ count: blobs.length });
}
