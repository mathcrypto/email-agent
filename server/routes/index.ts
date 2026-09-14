import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { google } from "googleapis";
import {
  generateReply,
  streamReply,
  summarizeThread,
} from "../agent/index.js";
import { getAppBaseUrl, OAUTH_SCOPES } from "../env.js";
import { fetchGmailThread } from "../lib/gmail.js";
import { apiHomePage, authHandoffPage } from "../lib/html.js";
import { createOAuthClient } from "../lib/oauth.js";
import {
  errorMessage,
  errorStatus,
  gmailThreadRequestSchema,
  replySchema,
  requireThreadText,
  summarizeSchema,
} from "../schemas.js";

export function registerRoutes(app: Hono) {
  app.get("/health", (c) =>
    c.json({ ok: true, service: "email-agent-api" }),
  );

  app.get("/", (c) => c.html(apiHomePage(getAppBaseUrl())));

  app.get("/auth/google", (c) => {
    const ext = c.req.query("ext") ?? "";
    const oauth2 = createOAuthClient();
    const state = ext ? `extension__${ext}` : "extension";
    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: OAUTH_SCOPES,
      include_granted_scopes: false,
      state,
    });
    return c.redirect(url);
  });

  app.get("/auth/callback/google", async (c) => {
    const code = c.req.query("code");
    const error = c.req.query("error");
    const state = c.req.query("state") ?? "";
    const extId = state.startsWith("extension__")
      ? state.slice("extension__".length)
      : "";

    if (error || !code) {
      return c.html(authHandoffPage({ error: error ?? "missing_code", extId }));
    }

    try {
      const oauth2 = createOAuthClient();
      const { tokens } = await oauth2.getToken(code);
      oauth2.setCredentials(tokens);

      const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
      const profile = await oauth2Api.userinfo.get();

      return c.html(
        authHandoffPage({
          extId,
          accessToken: tokens.access_token ?? "",
          refreshToken: tokens.refresh_token ?? "",
          expiryDate: tokens.expiry_date ?? undefined,
          email: profile.data.email ?? "",
          name: profile.data.name ?? "",
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "callback_failed";
      return c.html(authHandoffPage({ error: message, extId }));
    }
  });

  app.post("/gmail/thread", async (c) => {
    try {
      const body = gmailThreadRequestSchema.parse(await c.req.json());
      const result = await fetchGmailThread(body);
      return c.json({ result });
    } catch (err) {
      const message = errorMessage(err, "Gmail fetch failed");
      console.error("[gmail/thread]", message);
      return c.json({ error: message }, errorStatus(err));
    }
  });

  app.post("/agent/summarize", async (c) => {
    try {
      const body = summarizeSchema.parse(await c.req.json());
      requireThreadText(body.threadContext);
      const result = await summarizeThread(body.threadContext);
      return c.json({ result });
    } catch (err) {
      const message = errorMessage(err, "Summarize failed");
      return c.json({ error: message }, errorStatus(err));
    }
  });

  app.post("/agent/reply", async (c) => {
    try {
      const body = replySchema.parse(await c.req.json());
      requireThreadText(body.threadContext);
      const tone = body.tone ?? "concise";

      if (body.stream) {
        return streamSSE(c, async (stream) => {
          try {
            const result = await streamReply(
              body.threadContext,
              body.instructions,
              tone,
              async (delta) => {
                await stream.writeSSE({
                  event: "delta",
                  data: JSON.stringify({ delta }),
                });
              },
            );
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({ result }),
            });
          } catch (err) {
            const message = errorMessage(err, "Agent failed");
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ error: message }),
            });
          }
        });
      }

      const result = await generateReply(
        body.threadContext,
        body.instructions,
        tone,
      );
      return c.json({ result });
    } catch (err) {
      const message = errorMessage(err, "Agent failed");
      console.error("[agent/reply]", message);
      return c.json({ error: message }, errorStatus(err));
    }
  });
}
