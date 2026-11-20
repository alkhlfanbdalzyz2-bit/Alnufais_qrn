import { getStore } from "@netlify/blobs";
import queue from "../notify-queue.mjs";
import { runQueue } from "../lib/handlers.mjs";

export default async () => {
  const log = await runQueue(queue, getStore("push-subscriptions"), getStore("push-meta"), process.env);
  if (log.length) console.log(JSON.stringify(log));
};

// كل دقيقة (UTC — ما يفرق لأن الأوقات في القائمة مكتوبة مع المنطقة الزمنية)
export const config = { schedule: "* * * * *" };
