import { getStore } from "@netlify/blobs";
import { handleSend } from "../lib/handlers.mjs";
export default (req) => handleSend(req, getStore("push-subscriptions"), process.env);
export const config = { path: "/api/push/send" };
