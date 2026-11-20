// إرسال Web Push بدون مكتبات خارجية (RFC 8291 + RFC 8292 VAPID)
import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(s, "base64url");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

// تشفير الرسالة لاشتراك معيّن (aes128gcm)
export function encryptPayload(payload, p256dh, auth, opts = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = crypto.createECDH("prime256v1");
  if (opts.asPrivate) ecdh.setPrivateKey(fromB64u(opts.asPrivate));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // 65 bytes uncompressed
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ? fromB64u(opts.salt) : crypto.randomBytes(16);

  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

// توقيع VAPID
export function vapidHeader(endpoint, publicKey, privateKey, subject) {
  const pub = fromB64u(publicKey);
  const jwk = { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
  const key = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  }));
  const data = `${header}.${claims}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64u(sig)}, k=${publicKey}`;
}

// إرسال إشعار واحد — يرجع رقم حالة الخادم
export async function sendPush(subscription, payload, vapid, { ttl = 86400, urgency = "high" } = {}) {
  const body = encryptPayload(JSON.stringify(payload), subscription.keys.p256dh, subscription.keys.auth);
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeader(subscription.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
  return res.status;
}
