# AGENTS.md

Two plain-JS apps in `PasswordsManager/` (no build step, no package.json, no tests/lint). The Git repo root is this `Tools/` directory, current branch: `edge_extension`.

## Web app (PasswordsManager/)

Vanilla HTML/CSS/JS loaded via `<script defer>` tags — **script order in `index.html` is load order and matters**: `config → utils → ui → auth → storage → passwordManager → importExport → main → sync` (after `papaparse`/`marked`). Files share globals, no modules. `ui.js` defines globals that `passwordManager.js` and others use (`svg`, `EYE_ICON`, `EYE_OFF_ICON`).

- All localStorage keys + settings live in `config.js` (e.g. `master_password_hash`, `encrypted_passwords`, `preferred_theme`, `custom_keys`). Change them there, not inline.
- Crypto: master password PBKDF2-hashed (`auth.js`), vault AES-GCM encrypted. Never log secrets.
- Dropbox sync (`sync.js`): `REDIRECT_URI` in `config.js` must match the Dropbox OAuth app config; `app_key`/`app_secret`/refresh token are user-entered and stored in localStorage.

### SVG icons (recently centralized — preserve this)

- One hidden sprite at the top of `<body>` in `index.html`: ~32 `<symbol id="icon-*">`. **Add any new icon there first.**
- Static HTML: `<svg class="icon" width=".." height=".." aria-hidden="true"><use href="#icon-name"></use></svg>`
- JS templates: `svg('name', size)` factory in `ui.js` (default 18).
- Presentation lives in the `.icon` CSS rule (`fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round`); icons are Feather-style 24×24 stroke outlines.
- `all.min.css` (FontAwesome) is an unused leftover — do not re-add the link or use `fa-` classes.
- Do NOT convert the ⚠️ emoji alert prefixes or 😉 instructional text to SVGs; they are intentional.

### Themes

- CSS custom properties on `:root` + `[data-theme="misty-blue"|"peach-pink"|"pine-green"|"night-black"]` blocks. Default `blue` = `:root` (no explicit block).
- `--primary-color-rgb` drives `color-mix()` soft tokens (`--primary-soft`, `--primary-softer`) used for icon chips, backgrounds, focus rings — keep them theme-adaptive.
- Theme applied as `data-theme` on `<body>` and persisted to `preferred_theme`.

## Edge extension (PasswordsManager/edge-extension/)

Separate MV3 mini-app (not built from the web app). `background.js` is an ES module service worker; `popup.js` is not. It has its OWN inline SVGs in `popup.html` (sparkles/clipboard/eye/eye-off) with class-based show/hide toggling — **do not refactor it to the web sprite system**; toggling relies on `.icon-eye`/`.icon-eye-off` classes.

## Verification (no tooling exists)

- JS syntax: `node --check <file>.js` on the edited files.
- CSS brace balance / HTML tag balance: quick one-off node one-liners (no linter in repo).
- No test suite or CI. Manually verify in-browser.

## Environment gotchas

- Shell is WSL bash, but `node` resolves to **Windows node.exe**: it cannot read `/tmp/...` (maps to `D:\tmp`). Put scratch scripts/temp files inside the project dir, run, then delete.
- User runs Edge and browser-caches `style.css`/`index.html` aggressively — after CSS/HTML changes tell them to hard-refresh (Ctrl+Shift+R).

## Conventions

- UI text and comments are in Chinese (zh-CN).
- Per `codebuddy.md`: split large functions into single-purpose small ones; one-line comment per small function, detailed comments for large ones.
- Pending features are listed in `PasswordsManager/待办.txt`.
