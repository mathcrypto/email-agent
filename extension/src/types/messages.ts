export type AuthData = {
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  email?: string;
};

export type EmailMessage = {
  fromEmail?: string;
  fromName?: string;
  bodyText?: string;
};

export type ThreadContext = {
  ok: true;
  subject: string;
  meEmail: string;
  threadId: string;
  messages: EmailMessage[];
  from: string;
  fromName: string;
};

export type OpenThreadResult =
  | { ok: true; threadId: string }
  | { ok: false; error: string };

export type ContentPayload =
  | { type: "GET_OPEN_THREAD" }
  | { type: "INSERT_REPLY"; body: string };

export type ExtensionMessage =
  | { type: "GET_AUTH" }
  | { type: "CLEAR_AUTH" }
  | { type: "OPEN_CONNECT" }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "API_FETCH"; method?: string; path: string; body?: unknown }
  | { type: "API_STREAM"; path: string; body: unknown }
  | { type: "TO_CONTENT"; payload: ContentPayload; tabId?: number }
  | { type: "STREAM_DELTA"; delta: string; full: string }
  | { type: "THREAD_CHANGED"; threadId: string | null };

export type ExternalAuthMessage = {
  type: "EMAIL_AGENT_AUTH";
  accessToken: string;
  refreshToken: string;
  expiryDate?: number;
  email: string;
  name?: string;
};

export type ApiResponse = {
  ok: boolean;
  status?: number;
  data?: { result?: unknown; error?: string };
  error?: string;
  auth?: AuthData;
};
