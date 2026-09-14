import type {
  AuthData,
  ExtensionMessage,
  ExternalAuthMessage,
} from "../types/messages";
import { API_BASE, API_SECRET } from "../lib/config";
import { fetchJson, fetchSse } from "../lib/background-api";

function getStoredAuth(): Promise<AuthData> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["accessToken", "refreshToken", "expiryDate", "email"],
      (data) => resolve(data as AuthData),
    );
  });
}

async function bodyWithAuth(path: string, body: unknown): Promise<unknown> {
  if (path !== "/gmail/thread") return body;
  const auth = await getStoredAuth();
  const base =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    ...base,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    meEmail: base.meEmail || auth.email,
  };
}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => undefined);

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  const msg = message as ExternalAuthMessage;
  if (msg?.type === "EMAIL_AGENT_AUTH") {
    chrome.storage.local.set(
      {
        accessToken: msg.accessToken,
        refreshToken: msg.refreshToken,
        expiryDate: msg.expiryDate,
        email: msg.email,
      },
      () => sendResponse({ ok: true }),
    );
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msg = message as ExtensionMessage;

  if (msg?.type === "GET_AUTH") {
    chrome.storage.local.get(
      ["accessToken", "refreshToken", "expiryDate", "email"],
      (data) => sendResponse({ auth: data }),
    );
    return true;
  }

  if (msg?.type === "CLEAR_AUTH") {
    chrome.storage.local.remove(
      ["accessToken", "refreshToken", "expiryDate", "email"],
      () => sendResponse({ ok: true }),
    );
    return true;
  }

  if (msg?.type === "OPEN_CONNECT") {
    const extId = chrome.runtime.id;
    chrome.tabs.create({
      url: `${API_BASE}/auth/google?ext=${encodeURIComponent(extId)}`,
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === "OPEN_SIDE_PANEL") {
    const tabId = sender.tab?.id;
    void (async () => {
      try {
        if (tabId != null) {
          await chrome.sidePanel.open({ tabId });
        } else {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tab?.id != null) await chrome.sidePanel.open({ tabId: tab.id });
        }
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not open panel",
        });
      }
    })();
    return true;
  }

  if (msg?.type === "API_FETCH") {
    void (async () => {
      const body = await bodyWithAuth(msg.path, msg.body);
      return fetchJson(API_BASE, {
        path: msg.path,
        method: msg.method,
        body,
        apiSecret: API_SECRET,
      });
    })().then(sendResponse);
    return true;
  }

  if (msg?.type === "API_STREAM") {
    void (async () => {
      const body = await bodyWithAuth(msg.path, msg.body);
      return fetchSse(
        API_BASE,
        { path: msg.path, body, apiSecret: API_SECRET },
        (delta, full) => {
          void chrome.runtime.sendMessage({
            type: "STREAM_DELTA",
            delta,
            full,
          });
        },
      );
    })().then(sendResponse);
    return true;
  }

  if (msg?.type === "TO_CONTENT") {
    void (async () => {
      try {
        let targetTabId = msg.tabId || sender.tab?.id;
        if (!targetTabId) {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          targetTabId = tab?.id;
        }
        if (!targetTabId) {
          sendResponse({ ok: false, error: "No active Gmail tab" });
          return;
        }
        const response = await chrome.tabs.sendMessage(targetTabId, msg.payload);
        sendResponse(response);
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Open mail.google.com and try again",
        });
      }
    })();
    return true;
  }

  return false;
});
