import { google } from "googleapis";
import { createOAuthClient } from "./oauth.js";

export type GmailThreadMessage = {
  fromEmail?: string;
  fromName?: string;
  bodyText?: string;
};

export type GmailThreadResult = {
  threadId: string;
  subject: string;
  meEmail: string;
  messages: GmailThreadMessage[];
  from: string;
  fromName: string;
};

export function normalizeEmail(value?: string) {
  return (value || "").trim().toLowerCase();
}

export function findCounterpart<T extends { fromEmail?: string }>(
  messages: T[],
  meEmail?: string,
): T | undefined {
  if (!messages.length) return undefined;
  const me = normalizeEmail(meEmail);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const from = normalizeEmail(messages[i].fromEmail);
    if (!me || !from || from !== me) return messages[i];
  }
  return messages[messages.length - 1];
}

function decodeBody(data?: string | null) {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function headerValue(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string,
) {
  const found = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

function parseFrom(fromHeader: string) {
  const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^<>@\s]+@[^<>\s]+)>?$/);
  if (match) {
    return {
      fromName: (match[1] || "").trim(),
      fromEmail: (match[2] || "").trim().toLowerCase(),
    };
  }
  const emailMatch = fromHeader.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return {
    fromName: "",
    fromEmail: (emailMatch?.[0] || fromHeader).trim().toLowerCase(),
  };
}

type MimePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: MimePart[] | null;
};

function extractText(part?: MimePart | null): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBody(part.body.data);
  }
  if (part.parts?.length) {
    for (const child of part.parts) {
      const text = extractText(child);
      if (text) return text;
    }
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBody(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

export async function fetchGmailThread(opts: {
  accessToken: string;
  refreshToken?: string;
  threadId: string;
  meEmail?: string;
}): Promise<GmailThreadResult> {
  const oauth2 = createOAuthClient();
  oauth2.setCredentials({
    access_token: opts.accessToken,
    refresh_token: opts.refreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const { data } = await gmail.users.threads.get({
    userId: "me",
    id: opts.threadId,
    format: "full",
  });

  const meEmail = (opts.meEmail || "").toLowerCase();
  const messages: GmailThreadMessage[] = [];
  let subject = "";

  for (const message of data.messages || []) {
    const headers = message.payload?.headers || [];
    if (!subject) subject = headerValue(headers, "Subject");
    const from = parseFrom(headerValue(headers, "From"));
    const bodyText = extractText(message.payload as MimePart).slice(0, 4000);
    messages.push({
      fromEmail: from.fromEmail,
      fromName: from.fromName,
      bodyText,
    });
  }

  const counterpart = findCounterpart(messages, meEmail);

  if (!messages.length) {
    throw new Error("Gmail API returned an empty thread");
  }

  return {
    threadId: data.id || opts.threadId,
    subject: subject || "(no subject)",
    meEmail,
    messages,
    from: counterpart?.fromEmail || counterpart?.fromName || "",
    fromName: counterpart?.fromName || "",
  };
}
