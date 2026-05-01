# Monday File Upload Proxy

Tiny Cloudflare Worker that relays file-upload requests from the
mesheke-checklist app to Monday's `/v2/file` endpoint, with CORS
headers the browser will accept.

## Deploy

```bash
cd worker
npx wrangler login   # opens a browser tab to authorize
npx wrangler deploy
```

Wrangler will print a URL like:

```
https://monday-file-proxy.<your-cloudflare-username>.workers.dev
```

That's the proxy URL. Paste it back into the chat and I'll wire it
into the app via a `VITE_MONDAY_FILE_PROXY_URL` env var.

## What it does

1. Accepts POST requests from the app origin
   (`https://medically-modern.github.io`).
2. Forwards the multipart body to `https://api.monday.com/v2/file`
   with the `Authorization` header the browser sent.
3. Returns Monday's response with `Access-Control-Allow-Origin` set
   so the browser doesn't block it.

The Worker doesn't read or store the Monday token — it just passes
the header through.
