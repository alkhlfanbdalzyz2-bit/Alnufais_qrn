import { getStore } from "@netlify/blobs";
import queue from "../notify-queue.mjs";
import { runQueue, reportCount } from "../lib/handlers.mjs";

export default async () => {
  const subs = getStore("push-subscriptions"), meta = getStore("push-meta");
  const log = await runQueue(queue, subs, meta, process.env);
  if (log.length) console.log("PUSH_SEND " + JSON.stringify(log));
  const c = await reportCount(subs, meta);
  if (c) console.log("PUSH_COUNT " + JSON.stringify(c));
};

// كل دقيقة (UTC — ما يفرق لأن الأوقات في القائمة مكتوبة مع المنطقة الزمنية)
export const config = { schedule: "* * * * *" };
