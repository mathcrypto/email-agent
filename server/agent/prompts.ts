import type { ReplyTone, ThreadEmailContext } from "../schemas.js";
import { findCounterpart, normalizeEmail } from "../lib/gmail.js";

type EmailMessage = ThreadEmailContext["messages"][number];

function isMe(message: EmailMessage, meEmail?: string) {
  const me = normalizeEmail(meEmail);
  if (!me || !message.fromEmail) return false;
  return normalizeEmail(message.fromEmail) === me;
}

export function emailBlob(ctx: ThreadEmailContext) {
  const me = ctx.meEmail || "(unknown — the Gmail account owner)";
  const themMsg = findCounterpart(ctx.messages, ctx.meEmail);
  const them =
    themMsg?.fromEmail || themMsg?.fromName || "the other person in the thread";

  const body = ctx.messages
    .slice(-4)
    .map((m) => {
      const who = isMe(m, ctx.meEmail)
        ? `YOU (${me})`
        : `THEM (${m.fromName || m.fromEmail || "unknown"})`;
      return `${who}:\n${m.bodyText || ""}`;
    })
    .join("\n\n---\n\n")
    .slice(0, 3200);

  return `YOUR identity (author of the reply you must write): ${me}
OTHER party (who you are writing TO): ${them}

Subject: ${ctx.subject || "(no subject)"}

Thread (labels YOU = the account owner, THEM = other people):
${body}`;
}

export function replySystem(ctx: ThreadEmailContext) {
  const me = ctx.meEmail || "the Gmail account owner";
  return `You draft email replies for ${me}.
You write IN FIRST PERSON as ${me} — the message will be sent by them.
The incoming mail is FROM someone else TO ${me}.
Never write as the other party. Never address ${me} as if they are receiving your draft.
Do not thank ${me} or answer questions directed at ${me} from their own POV as the sender.
Output only the reply body (no subject, no "here's a draft").`;
}

function toneLine(tone: ReplyTone) {
  if (tone === "warm") return "Tone: warm and friendly.";
  if (tone === "formal") return "Tone: formal and professional.";
  return "Tone: concise and clear.";
}

export function buildUserPrompt(
  ctx: ThreadEmailContext,
  instructions?: string,
  tone: ReplyTone = "concise",
) {
  const intent = instructions?.trim();
  const me = ctx.meEmail || "the account owner";
  const themMsg = findCounterpart(ctx.messages, ctx.meEmail);
  const them = themMsg?.fromEmail || themMsg?.fromName || "the other party";
  const base = `${emailBlob(ctx)}

${toneLine(tone)}
Match the language of THEIR last message.
Write as ${me} replying to ${them}.`;

  if (intent) {
    return `${base}

Intent for this reply (from ${me}): ${intent}

Write only the reply email body. No subject line, no preamble.`;
  }
  return `${base}

Write only a concise natural reply body from ${me} to ${them}. No subject line, no preamble.`;
}
