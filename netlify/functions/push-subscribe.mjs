import { getStore } from "@netlify/blobs";
import { handleSubscribe } from "../lib/handlers.mjs";
export default (req) => handleSubscribe(req, getStore("push-subscriptions"));
export const config = { path: "/api/push/subscribe" };
