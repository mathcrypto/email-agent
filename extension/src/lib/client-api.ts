import type {
  ApiResponse,
  AuthData,
  ContentPayload,
  ExtensionMessage,
} from "../types/messages";

const NO_RESPONSE: ApiResponse = { ok: false, error: "No response" };

async function sendMessage<T = ApiResponse>(
  message: ExtensionMessage,
): Promise<T> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as T | undefined;
    return res ?? (NO_RESPONSE as T);
  } catch {
    return NO_RESPONSE as T;
  }
}

export function getAuth(): Promise<AuthData> {
  return sendMessage<ApiResponse>({ type: "GET_AUTH" }).then(
    (res) => res.auth || {},
  );
}

export function clearAuth() {
  return sendMessage({ type: "CLEAR_AUTH" });
}

export function openConnect() {
  return sendMessage({ type: "OPEN_CONNECT" });
}

export function toContent(payload: ContentPayload) {
  return sendMessage({ type: "TO_CONTENT", payload });
}

export function apiFetch(path: string, body: unknown) {
  return sendMessage({ type: "API_FETCH", method: "POST", path, body });
}

export function apiStream(body: unknown) {
  return sendMessage({
    type: "API_STREAM",
    path: "/agent/reply",
    body: { ...(body as object), stream: true },
  });
}

export function errorFrom(response: ApiResponse, fallback: string) {
  return response.data?.error || response.error || fallback;
}
