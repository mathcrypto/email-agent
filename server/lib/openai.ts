import { getOpenAIModel, requireOpenAIApiKey } from "../env.js";

function chatMessages(system: string, user: string) {
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function chatCompletion(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  json?: boolean;
}) {
  const body: Record<string, unknown> = {
    model: getOpenAIModel(),
    max_completion_tokens: opts.maxTokens ?? 500,
    messages: chatMessages(opts.system, opts.user),
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenAIApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

export async function streamChatCompletion(
  opts: { system: string; user: string; maxTokens?: number },
  onDelta: (chunk: string) => void,
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenAIApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      stream: true,
      max_completion_tokens: opts.maxTokens ?? 500,
      messages: chatMessages(opts.system, opts.user),
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`OpenAI error: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }

  return full.trim();
}
