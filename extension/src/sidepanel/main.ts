import {
  apiFetch,
  apiStream,
  clearAuth,
  errorFrom,
  getAuth,
  openConnect,
  toContent,
} from "../lib/client-api";
import type {
  ExtensionMessage,
  OpenThreadResult,
  ThreadContext,
} from "../types/messages";

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const instructionsEl = $<HTMLTextAreaElement>("instructions");
const draftBtn = $<HTMLButtonElement>("draft-btn");
const insertBtn = $("insert");
const copyBtn = $("copy");
const draftActions = $("draft-actions");
const connectBtn = $("connect");
const disconnectBtn = $("disconnect");
const refreshBtn = $("refresh");
const tonesEl = $("tones");
const statusEl = $("status");
const resultEl = $("result");
const threadLine = $("thread-line");
const fromLine = $("from-line");
const authLine = $("auth-line");
const summaryLine = $("summary-line");
const askLine = $("ask-line");
const urgencyEl = $("urgency");

const POLL_MS = 2500;

type ReplyTone = "concise" | "warm" | "formal";

let lastBody = "";
let selectedTone: ReplyTone = "concise";
let pageCache: ThreadContext | null = null;
let lastThreadKey = "";
let summarizeInFlight = false;
let refreshInFlight = false;
let refreshQueued = false;
let accountEmail = "";

function setStatus(text = "") {
  statusEl.textContent = text;
}

function setDraft(body = "", { streaming = false } = {}) {
  lastBody = body;
  resultEl.textContent = lastBody || "No draft yet.";
  draftActions.classList.toggle("hidden", !lastBody);
  resultEl.classList.toggle("streaming", streaming);
}

function setConnected(connected: boolean) {
  connectBtn.classList.toggle("hidden", connected);
  disconnectBtn.classList.toggle("hidden", !connected);
}

function threadContext() {
  if (!pageCache) {
    return { subject: "", meEmail: accountEmail, threadId: "", messages: [] };
  }
  return {
    subject: pageCache.subject,
    meEmail: pageCache.meEmail || accountEmail,
    threadId: pageCache.threadId,
    messages: pageCache.messages || [],
  };
}

function threadKey(page: { threadId?: string }) {
  return page.threadId || "";
}

chrome.runtime.onMessage.addListener((message) => {
  const msg = message as ExtensionMessage;
  if (msg?.type === "STREAM_DELTA") {
    setDraft(msg.full || "", { streaming: true });
  }
  if (msg?.type === "THREAD_CHANGED") {
    void refreshAuthAndContext();
  }
});

async function runSummarize(force = false) {
  if (!pageCache || summarizeInFlight) return;

  const key = threadKey(pageCache);
  if (!force && summaryLine.dataset.key === key) return;

  summarizeInFlight = true;
  summaryLine.textContent = "Summarizing…";
  askLine.textContent = "";
  askLine.classList.add("hidden");
  urgencyEl.classList.add("hidden");

  try {
    const response = await apiFetch("/agent/summarize", {
      threadContext: threadContext(),
    });

    if (!response.ok) {
      summaryLine.textContent = errorFrom(response, "Summarize failed");
      return;
    }

    const result = (response.data?.result || {}) as {
      summary?: string;
      ask?: string;
      urgency?: string;
    };
    summaryLine.textContent = result.summary || "No summary";
    summaryLine.dataset.key = key;

    if (result.ask) {
      askLine.textContent = result.ask;
      askLine.classList.remove("hidden");
    }

    const urgency = (result.urgency || "medium").toLowerCase();
    urgencyEl.textContent = urgency;
    urgencyEl.className = `pill ${urgency}`;
    urgencyEl.classList.remove("hidden");
  } finally {
    summarizeInFlight = false;
  }
}

async function refreshAuthAndContext() {
  if (refreshInFlight) {
    refreshQueued = true;
    return Boolean(pageCache);
  }
  refreshInFlight = true;

  try {
    const auth = await getAuth();
    if (!auth.accessToken) {
      authLine.textContent = "Not connected";
      setConnected(false);
      threadLine.textContent = "Connect Gmail first";
      fromLine.textContent = "";
      pageCache = null;
      lastThreadKey = "";
      return false;
    }

    authLine.textContent = auth.email || "Connected";
    accountEmail = (auth.email || "").toLowerCase();
    setConnected(true);

    const open = (await toContent({
      type: "GET_OPEN_THREAD",
    })) as OpenThreadResult;

    if (!open?.ok) {
      threadLine.textContent =
        ("error" in open && open.error) || "Open a Gmail thread";
      fromLine.textContent = "";
      pageCache = null;
      lastThreadKey = "";
      return false;
    }

    // Optimistic UI while Gmail API loads the new thread
    if (open.threadId !== lastThreadKey) {
      threadLine.textContent = "Loading thread…";
      fromLine.textContent = "";
      summaryLine.textContent = "Summarizing…";
      askLine.classList.add("hidden");
      urgencyEl.classList.add("hidden");
    }

    const gmail = await apiFetch("/gmail/thread", {
      threadId: open.threadId,
      meEmail: accountEmail,
    });

    if (!gmail.ok || !gmail.data?.result) {
      threadLine.textContent = errorFrom(
        gmail,
        "Could not load thread from Gmail",
      );
      fromLine.textContent = "";
      pageCache = null;
      lastThreadKey = "";
      return false;
    }

    const result = gmail.data.result as Omit<ThreadContext, "ok">;
    const thread: ThreadContext = {
      ok: true,
      subject: result.subject,
      meEmail: result.meEmail || accountEmail,
      threadId: result.threadId || open.threadId,
      messages: result.messages || [],
      from: result.from || "",
      fromName: result.fromName || "",
    };

    const key = threadKey(thread);
    const changed = key !== lastThreadKey;
    lastThreadKey = key;
    pageCache = thread;
    threadLine.textContent = thread.subject || "Current thread";
    fromLine.textContent = thread.from
      ? `Reply to ${thread.fromName || thread.from}`
      : "";

    if (changed) {
      setDraft("");
      void runSummarize(true);
    }
    return true;
  } finally {
    refreshInFlight = false;
    if (refreshQueued) {
      refreshQueued = false;
      void refreshAuthAndContext();
    }
  }
}

async function requireThread(message: string) {
  const ready = await refreshAuthAndContext();
  if (!ready || !pageCache) {
    setStatus(message);
    return false;
  }
  return true;
}

async function runDraft() {
  if (!(await requireThread("Open an email in Gmail first"))) return;

  setStatus("Suggesting draft…");
  draftBtn.disabled = true;
  setDraft("", { streaming: true });

  try {
    const response = await apiStream({
      instructions: instructionsEl.value.trim() || undefined,
      tone: selectedTone,
      threadContext: threadContext(),
    });

    if (!response.ok) {
      setStatus(errorFrom(response, "Draft failed"));
      setDraft("");
      return;
    }

    const result = (response.data?.result || {}) as { body?: string };
    setDraft(result.body || lastBody || "");
    setStatus("Draft suggested — Insert or Copy");
  } finally {
    draftBtn.disabled = false;
    resultEl.classList.remove("streaming");
  }
}

connectBtn.addEventListener("click", () => {
  void openConnect();
});

disconnectBtn.addEventListener("click", async () => {
  await clearAuth();
  await refreshAuthAndContext();
});

refreshBtn.addEventListener("click", async () => {
  await refreshAuthAndContext();
  await runSummarize(true);
});

draftBtn.addEventListener("click", () => void runDraft());

insertBtn.addEventListener("click", async () => {
  if (!lastBody) return;
  const inserted = (await toContent({
    type: "INSERT_REPLY",
    body: lastBody,
  })) as { ok?: boolean; error?: string };
  setStatus(
    inserted?.ok
      ? "Inserted into Gmail compose"
      : inserted?.error || "Insert failed",
  );
});

copyBtn.addEventListener("click", async () => {
  if (!lastBody) return;
  await navigator.clipboard.writeText(lastBody);
  setStatus("Copied");
});

tonesEl.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest("[data-tone]");
  if (!btn) return;
  selectedTone = (btn.getAttribute("data-tone") || "concise") as ReplyTone;
  tonesEl
    .querySelectorAll(".tone")
    .forEach((el) => el.classList.toggle("active", el === btn));
});

void refreshAuthAndContext();
setInterval(() => {
  void refreshAuthAndContext();
}, POLL_MS);
