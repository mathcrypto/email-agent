export type FetchResult =
  | { ok: true; status?: number; data: unknown }
  | { ok: false; error: string };

function authHeaders(apiSecret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiSecret) headers.Authorization = `Bearer ${apiSecret}`;
  return headers;
}

export async function fetchJson(
  apiBase: string,
  opts: {
    path: string;
    method?: string;
    body?: unknown;
    apiSecret?: string;
  },
): Promise<FetchResult> {
  try {
    const res = await fetch(`${apiBase}${opts.path}`, {
      method: opts.method || "GET",
      headers: authHeaders(opts.apiSecret),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      return { ok: false, error: "Use API_STREAM for SSE endpoints" };
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data };
    return {
      ok: false,
      error: (data as { error?: string }).error || `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function parseSseBlock(chunk: string): { event: string; data: string } | null {
  const lines = chunk.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trimStart();
      continue;
    }
    if (line.startsWith("data:")) {
      const raw = line.slice(5);
      dataLines.push(raw.startsWith(" ") ? raw.slice(1) : raw);
    }
  }

  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

export async function fetchSse(
  apiBase: string,
  opts: { path: string; body: unknown; apiSecret?: string },
  onDelta: (delta: string, full: string) => void,
): Promise<FetchResult> {
  try {
    const res = await fetch(`${apiBase}${opts.path}`, {
      method: "POST",
      headers: authHeaders(opts.apiSecret),
      body: JSON.stringify(opts.body),
    });

    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: unknown = null;
    let streamed = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\n\n|\r\n\r\n/);
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const parsedBlock = parseSseBlock(chunk);
        if (!parsedBlock) continue;
        try {
          const parsed = JSON.parse(parsedBlock.data) as {
            delta?: string;
            result?: unknown;
            error?: string;
          };
          if (parsedBlock.event === "delta" && parsed.delta) {
            streamed += parsed.delta;
            onDelta(parsed.delta, streamed);
          }
          if (parsedBlock.event === "done") finalResult = parsed.result;
          if (parsedBlock.event === "error") {
            return { ok: false, error: parsed.error || "Stream error" };
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }

    return {
      ok: true,
      data: { result: finalResult || { body: streamed } },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Stream failed",
    };
  }
}
