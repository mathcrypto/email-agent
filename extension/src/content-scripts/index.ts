import type { ContentPayload } from "../types/messages";
import "./badge.css";

const FOLDER_SEGMENTS = new Set([
  "inbox",
  "sent",
  "drafts",
  "snoozed",
  "starred",
  "imp",
  "all",
  "spam",
  "trash",
  "chats",
  "scheduled",
  "important",
]);

function threadIdFromHash(): string | null {
  const cleaned = (location.hash || "").replace(/^#/, "");
  const parts = cleaned.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = decodeURIComponent(parts[i]);
    if (FOLDER_SEGMENTS.has(part.toLowerCase())) continue;
    // Labels / search tokens — skip short non-id segments
    if (part.length < 10) continue;
    // Gmail thread ids: hex (legacy) or FMfcgz… style
    if (/^[0-9a-f]{10,}$/i.test(part) || /^[A-Za-z0-9_-]{10,}$/.test(part)) {
      return part;
    }
  }
  return null;
}

function threadIdFromDom(): string | null {
  // Prefer the visible conversation — bare document.querySelector often
  // returns a stale thread still left in the DOM after SPA navigation.
  const main = document.querySelector('[role="main"]');
  const scope = main || document;
  return (
    scope
      .querySelector("[data-legacy-thread-id]")
      ?.getAttribute("data-legacy-thread-id") ||
    scope
      .querySelector("[data-thread-perm-id]")
      ?.getAttribute("data-thread-perm-id") ||
    scope
      .querySelector("h2[data-thread-perm-id]")
      ?.getAttribute("data-thread-perm-id") ||
    null
  );
}

function extractThreadId(): string | null {
  // Prefer the visible conversation's legacy id (API-compatible). Hash is a
  // fallback while the DOM catches up after SPA navigation.
  return threadIdFromDom() || threadIdFromHash();
}

function getOpenThread() {
  const threadId = extractThreadId();
  if (!threadId) {
    return {
      ok: false as const,
      error: "Open an email thread in Gmail first",
    };
  }
  return { ok: true as const, threadId };
}

function findComposeBox() {
  return (
    document.querySelector(
      'div[aria-label="Message Body"][contenteditable="true"]',
    ) ||
    document.querySelector(
      'div[aria-label="Corps du message"][contenteditable="true"]',
    ) ||
    document.querySelector('div[g_editable="true"][contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  );
}

async function clickReply() {
  const candidates = [
    ...document.querySelectorAll(
      'div[role="button"], span[role="button"], button',
    ),
  ];
  const reply = candidates.find((el) => {
    const label =
      `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`.toLowerCase();
    return (
      label.includes("reply") ||
      label.includes("répondre") ||
      label === "reply" ||
      label.startsWith("répondre")
    );
  });
  if (reply) {
    (reply as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 450));
  }
}

function insertIntoCompose(body: string) {
  const box = findComposeBox() as HTMLElement | null;
  if (!box) return false;

  box.focus();
  const selected = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  selected?.removeAllRanges();
  selected?.addRange(range);

  const ok = document.execCommand("insertText", false, body);
  if (!ok) {
    box.textContent = body;
    box.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
  return true;
}

async function insertReply(body: string) {
  let box = findComposeBox();
  if (!box) {
    await clickReply();
    box = findComposeBox();
  }
  if (!box) {
    return {
      ok: false as const,
      error: "Could not open Gmail compose. Click Reply once, then Insert.",
    };
  }
  const inserted = insertIntoCompose(body);
  return inserted
    ? { ok: true as const }
    : { ok: false as const, error: "Could not insert into compose box" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as ContentPayload;
  if (msg?.type === "GET_OPEN_THREAD") {
    sendResponse(getOpenThread());
    return false;
  }
  if (msg?.type === "INSERT_REPLY") {
    void insertReply(msg.body || "").then(sendResponse);
    return true;
  }
  return false;
});

function isExtensionAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

let lastAnnouncedThreadId: string | null | undefined;

function announceThreadChange() {
  if (!isExtensionAlive()) return;
  const threadId = extractThreadId();
  if (threadId === lastAnnouncedThreadId) return;
  lastAnnouncedThreadId = threadId;
  try {
    chrome.runtime.sendMessage({ type: "THREAD_CHANGED", threadId });
  } catch {
    // Extension reloaded — ignore
  }
}

let announceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAnnounce(delayMs = 200) {
  if (announceTimer) clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announceTimer = null;
    announceThreadChange();
  }, delayMs);
}

window.addEventListener("hashchange", () => {
  // Hash flips first; force re-check once DOM has likely updated.
  lastAnnouncedThreadId = undefined;
  scheduleAnnounce(300);
});
window.addEventListener("popstate", () => {
  lastAnnouncedThreadId = undefined;
  scheduleAnnounce(300);
});

const observer = new MutationObserver(() => scheduleAnnounce());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["data-legacy-thread-id", "data-thread-perm-id"],
});

announceThreadChange();

function ensureBadge() {
  if (document.getElementById("email-agent-badge")) return;
  const badge = document.createElement("div");
  badge.id = "email-agent-badge";
  badge.textContent = "EA";
  badge.title = "Open Email Agent";
  badge.addEventListener("click", () => {
    if (!isExtensionAlive()) {
      badge.title = "Extension reloaded — refresh this Gmail tab";
      alert(
        "Email Agent was reloaded. Refresh this Gmail tab (⌘⇧R), then click EA again.",
      );
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, (res) => {
        const err = chrome.runtime.lastError?.message;
        const response = res as { ok?: boolean; error?: string } | undefined;
        if (err || !response?.ok) {
          console.warn(
            "[Email Agent]",
            err || response?.error || "Side panel failed",
          );
          if (err?.includes("Extension context invalidated")) {
            alert(
              "Email Agent was reloaded. Refresh this Gmail tab (⌘⇧R), then try again.",
            );
            return;
          }
          alert(
            "Could not open the side panel. Pin Email Agent in the Chrome toolbar, then try again.",
          );
        }
      });
    } catch {
      alert(
        "Email Agent was reloaded. Refresh this Gmail tab (⌘⇧R), then try again.",
      );
    }
  });
  document.documentElement.appendChild(badge);
}

ensureBadge();
