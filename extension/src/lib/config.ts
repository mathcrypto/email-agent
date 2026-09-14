export const API_BASE = "http://127.0.0.1:3000";

declare const __API_SECRET__: string;
export const API_SECRET = typeof __API_SECRET__ !== "undefined" ? __API_SECRET__ : "";
