import { z, ZodError } from "zod";

export const replyToneSchema = z.enum(["concise", "warm", "formal"]);

export const emailMessageSchema = z.object({
  fromEmail: z.string().optional(),
  fromName: z.string().optional(),
  bodyText: z.string().optional(),
});

export const threadContextSchema = z.object({
  threadId: z.string().optional(),
  subject: z.string().optional(),
  meEmail: z.string().optional(),
  messages: z.array(emailMessageSchema),
});

export const summarizeSchema = z.object({
  threadContext: threadContextSchema,
});

export const replySchema = z.object({
  instructions: z.string().optional(),
  tone: replyToneSchema.optional(),
  stream: z.boolean().optional(),
  threadContext: threadContextSchema,
});

export const gmailThreadRequestSchema = z.object({
  threadId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  meEmail: z.string().optional(),
});

export type ThreadEmailContext = z.infer<typeof threadContextSchema>;
export type ReplyTone = z.infer<typeof replyToneSchema>;

export function requireThreadText(ctx: ThreadEmailContext) {
  const hasText = ctx.messages.some((m) => Boolean(m.bodyText?.trim()));
  if (!hasText) {
    throw new Error(
      "No message bodies in this thread. Open a Gmail thread and refresh.",
    );
  }
}

export function errorStatus(err: unknown): 400 | 500 {
  if (err instanceof ZodError) return 400;
  if (
    err instanceof Error &&
    /No message bodies|Open a Gmail thread/i.test(err.message)
  ) {
    return 400;
  }
  return 500;
}

export function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ZodError) {
    return err.issues[0]?.message || "Invalid request";
  }
  return err instanceof Error ? err.message : fallback;
}
