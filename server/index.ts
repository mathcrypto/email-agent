import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { serve } from "@hono/node-server";
import app from "./app.js";
import { getPort, requireLocalApiSecret } from "./env.js";

requireLocalApiSecret();

const port = getPort();
const hostname = "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Email Agent API → http://127.0.0.1:${info.port} (localhost only)`);
});
