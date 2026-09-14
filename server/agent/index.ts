import { chatCompletion, streamChatCompletion } from "../lib/openai.js";
import type { ReplyTone, ThreadEmailContext } from "../schemas.js";
import { buildUserPrompt, emailBlob, replySystem } from "./prompts.js";

export async function summarizeThread(ctx: ThreadEmailContext) {
  const me = ctx.meEmail || "the account owner";
  const content = await chatCompletion({
    system: `Summarize an inbox thread for ${me}. Return JSON: { "summary": string, "ask": string, "urgency": "low"|"medium"|"high" }. "ask" = what the OTHER party wants from ${me}, not what ${me} wants.`,
    user: `${emailBlob(ctx)}\n\nSummarize in the thread language. Perspective: helping ${me} decide what to do.`,
    maxTokens: 400,
    json: true,
  });

  let parsed: { summary?: string; ask?: string; urgency?: string } = {};
  try {
    parsed = JSON.parse(content || "{}") as typeof parsed;
  } catch {
    // Model occasionally returns non-JSON; fall back to defaults below.
  }

  return {
    summary: parsed.summary || content || "No summary",
    ask: parsed.ask || "No clear ask",
    urgency: parsed.urgency || "medium",
  };
}

export async function generateReply(
  ctx: ThreadEmailContext,
  instructions?: string,
  tone: ReplyTone = "concise",
) {
  const content = await chatCompletion({
    system: replySystem(ctx),
    user: buildUserPrompt(ctx, instructions, tone),
  });
  if (!content) throw new Error("Model returned empty reply");
  return { body: content };
}

export async function streamReply(
  ctx: ThreadEmailContext,
  instructions: string | undefined,
  tone: ReplyTone,
  onDelta: (delta: string) => void,
) {
  const body = await streamChatCompletion(
    {
      system: replySystem(ctx),
      user: buildUserPrompt(ctx, instructions, tone),
    },
    onDelta,
  );
  if (!body) throw new Error("Model returned empty reply");
  return { body };
}
