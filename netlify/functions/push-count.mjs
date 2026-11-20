import { getStore } from "@netlify/blobs";
import { handleCount } from "../lib/handlers.mjs";
export default (req) => handleCount(req, getStore("push-subscriptions"), process.env);
export const config = { path: "/api/push/count" };
