import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireLocalApiSecret } from "./env.js";
import { registerRoutes } from "./routes/index.js";

const app = new Hono();

function isPublicPath(path: string) {
  return path === "/" || path === "/health" || path.startsWith("/auth/");
}

function bearerMatches(header: string | undefined, secret: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length);
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (
        origin === "https://mail.google.com" ||
        origin.startsWith("chrome-extension://")
      ) {
        return origin;
      }
      return "";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS" || isPublicPath(c.req.path)) {
    return next();
  }
  const secret = requireLocalApiSecret();
  if (!bearerMatches(c.req.header("Authorization"), secret)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

registerRoutes(app);

export default app;
