# Email Agent

Chrome extension that puts an email reply agent **inside Gmail**.

**Not a Next.js app.** Product is the extension; `server/` is a thin Hono API.

## Local use only

This is a **local demo**, not production-ready. Do not expose the API on the public internet.

Hardening included for local use:
- Server binds to **`127.0.0.1` only**
- Protected routes require **`Authorization: Bearer <LOCAL_API_SECRET>`** (extension gets the secret at build time)

Still demo-grade:
- OAuth puts access/refresh tokens in the callback page before handing them to the extension
- Agent endpoints trust thread bodies from the extension
- Tokens live in `chrome.storage.local`; Gmail scope is read-only and nothing auto-sends

## Typical MV3 split

| Piece | Role |
| --- | --- |
| **Content script** | Detect open thread id, inject into compose |
| **Side panel** | UI (vanilla TypeScript) |
| **Background** | Auth storage, network to the API |
| **Server** | Secrets, OpenAI, Gmail API |

Thread content comes from the Gmail API (`users.threads.get`). The content script only supplies the thread id and inserts the draft into compose. Never auto-send.

## Setup

```bash
cp .env.example .env.local   # set keys + LOCAL_API_SECRET
npm install
npm run build:ext            # bakes LOCAL_API_SECRET into the extension
npm run dev
```

1. Google Cloud: enable **Gmail API**, OAuth redirect  
   `http://localhost:3000/auth/callback/google`
2. Consent scopes: `email`, `profile`, `gmail.readonly` (add yourself as a **test user**)
3. Load **`extension/dist`** in Chrome
4. **Disconnect / Connect Gmail again** after scope changes
5. Rebuild the extension whenever you change `LOCAL_API_SECRET`
