# Deploy notes

Two build targets share this codebase.

## Web (served by nginx under /Ouroboros/ouroboros-chat/)

```bash
npm run build:web
```

Produces `dist/` with asset URLs prefixed by `/Ouroboros/ouroboros-chat/`. nginx serves `dist/` via:

```
location ^~ /Ouroboros/ouroboros-chat/ {
    auth_request /auth;
    alias /var/www/philip-wintrip.nl/html/Ouroboros/ouroboros-chat/dist/;
    try_files $uri $uri/ /Ouroboros/ouroboros-chat/index.html;
}
```

The app calls `/api/ouroboros-chat/*` and `/api/cockpit/*`; both are proxied to the Ouroboros docker backend on `127.0.0.1:8010`.

Make `dist/` world-readable so nginx (www-data) can serve it:

```bash
chmod -R a+rX dist/
```

## Tauri (desktop)

```bash
npm run build       # base="/" — correct for local file:// loading
npm run tauri build
```
