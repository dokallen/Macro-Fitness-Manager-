# Step 11 — PWA configuration

## Files created

- `public/manifest.json` — Web app manifest (`Macro Fit` / `MacroFit`, standalone, `#09090b`, icons).
- `public/icon-192.png` — Placeholder app icon (dark `#09090b` background, “MF” text).
- `public/icon-512.png` — Same at 512×512.
- `public/sw.js` — Service worker: precaches `/` and `/offline`, network-first with cache fallback, HTML navigations fall back to cached `/offline` or inline offline HTML.
- `components/pwa/ServiceWorkerRegister.tsx` — Client component; registers `/sw.js` on `load` in **production** only.
- `app/offline/page.tsx` — Offline route with short copy and link home.

## Files modified

- `app/layout.tsx` — `<head>`: `<link rel="manifest">`, `<meta name="theme-color">`; `<ServiceWorkerRegister />` in `<body>`.

## Behavior notes

- **Install:** SW opens cache `macrofit-pwa-v1` and adds `/` and `/offline` (failed precache entries are ignored per URL).
- **Fetch:** Same-origin GET tries network; successful responses are stored; on failure returns cache match, or for HTML-like requests serves cached `/offline` or a minimal offline HTML response.
- **Dev:** Service worker is not registered in development (`NODE_ENV !== "production"`) to avoid interfering with HMR.
- **Testing PWA:** Use `npm run build` + `npm start` (or production deploy) and install from a secure origin.

## Verification checklist

- [ ] `/manifest.json` returns JSON and references `/icon-192.png` and `/icon-512.png`.
- [ ] Lighthouse / browser “Install app” recognizes manifest and icons.
- [ ] After production load, Application → Service Workers shows `sw.js` active.
- [ ] With network disabled, a cached navigation or fallback shows offline UI.
