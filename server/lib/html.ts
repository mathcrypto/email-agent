export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function authHandoffPage(opts: {
  extId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  email?: string;
  name?: string;
  error?: string;
}) {
  const payload = JSON.stringify({
    type: "EMAIL_AGENT_AUTH",
    accessToken: opts.accessToken ?? "",
    refreshToken: opts.refreshToken ?? "",
    expiryDate: opts.expiryDate,
    email: opts.email ?? "",
    name: opts.name ?? "",
  });
  const extId = opts.extId ?? "";
  const error = opts.error ?? "";

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Email Agent</title>
<style>
body{font-family:IBM Plex Sans,system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;background:#f7f2e8;color:#1c1915}
.err{color:#8a4b2e;background:rgba(138,75,46,.1);padding:10px 12px;border-radius:10px}
</style></head>
<body>
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:11px;color:#6b645a">Email Agent</p>
  <h1 id="status">${error ? "Connection incomplete" : "Connected"}</h1>
  ${error ? `<p class="err">${escapeHtml(error)}</p>` : `<p>Signed in as <strong>${escapeHtml(opts.email || "")}</strong>. Return to Gmail and open the side panel.</p>`}
  <p style="color:#6b645a;font-size:13px">You can close this tab. Keep <code>npm run dev</code> running.</p>
  <script>
    (function () {
      var error = ${JSON.stringify(error)};
      if (error) return;
      var payload = ${payload};
      var extId = ${JSON.stringify(extId)};
      if (extId && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        try { chrome.runtime.sendMessage(extId, payload); } catch (e) {}
      }
      document.getElementById("status").textContent = "Connected — return to Gmail";
    })();
  </script>
</body></html>`;
}

export function apiHomePage(baseUrl: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Email Agent API</title>
<style>
  body{font-family:IBM Plex Sans,system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;background:#f7f2e8;color:#1c1915}
  code{background:#ebe4d7;padding:2px 6px;border-radius:6px}
  a{color:#2f5d50}
</style></head>
<body>
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:11px;color:#6b645a">Email Agent</p>
  <h1>API backend</h1>
  <p>This server powers the <strong>Chrome extension</strong>. The product lives inside Gmail.</p>
  <ol>
    <li>Load unpacked folder <code>extension/</code> in Chrome</li>
    <li>Open Gmail → click the extension / EA badge</li>
    <li>Connect Gmail once, then use Reply</li>
  </ol>
  <p>Health: <a href="/health">/health</a> · Base: ${baseUrl}</p>
</body></html>`;
}
