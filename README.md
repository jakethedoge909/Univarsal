# Universal File Simulator

A lightweight, offline-capable **Progressive Web App** that lets you drop *any* file and intelligently preview / inspect it.

**Supported views**
- **.exe / .dll** → PE header info (architecture, entry point, subsystem…) + hex
- **.jar / .apk / .zip / .war** → full archive contents listing
- **.html / .htm** → sandboxed live preview + source
- **.js / .ts / .tsx / .jsx** and most source files → clean text view
- Images, Video, Audio, PDF
- Pretty-printed JSON
- Hex dump for any binary
- File metadata + SHA-256 hash

Everything runs **locally in your browser**. No files are uploaded anywhere.

---

## Quick start (local)

```bash
# Just open index.html in a modern browser
# Or serve it:
npx serve .
# or
python -m http.server 8080
```

Then visit `http://localhost:8080`.

---

## Publish on GitHub Pages (recommended)

1. Create a new repository on GitHub (e.g. `universal-file-simulator`).
2. Push these files to the `main` branch:

```bash
git init
git add .
git commit -m "Initial Universal File Simulator PWA"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/universal-file-simulator.git
git push -u origin main
```

3. In the GitHub repo → **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` / `/ (root)`
   - Save

4. After a minute your app will be live at:
   `https://YOUR_USERNAME.github.io/universal-file-simulator/`

---

## Install as a PWA

Once the site is live (or even locally on Chrome/Edge):

**Desktop (Chrome / Edge / Brave)**
1. Open the site
2. Click the install icon in the address bar (or the “Install App” button)
3. Confirm → it appears as a standalone app

**Android (Chrome)**
1. Open the site
2. Tap the menu → “Add to Home screen” / “Install app”

**iOS (Safari)**
1. Open the site
2. Tap the Share button → “Add to Home Screen”

The app works offline after the first visit (service worker caches the shell).

---

## File handling notes

- Multiple files can be dropped; click a card to switch.
- Use the toolbar (Auto / Text / Hex / JSON / Info) to force a view mode.
- Hex view is limited to the first 64 KB for performance.
- SHA-256 is computed client-side when possible.

---

## Tech

- Vanilla HTML / CSS / JS (no build step)
- Service Worker for offline support
- Web App Manifest for installability
- File API + Object URLs for previews

Feel free to fork and extend (add ZIP listing with JSZip, more viewers, File System Access API saving, etc.).
