# Selectives Home Care — Staff & Family App

An installable phone app (a PWA) for your existing Apps Script backend.
No app store, no monthly fees: it is a folder of static files on free hosting
that talks to the same `/exec` URL your current staff portal uses.

**Who sees what.** The app reads the signed-in role's permissions from the
server and only shows screens that role is allowed to use:

| Role | What they get |
|---|---|
| Caregiver | Home with one-tap GPS **clock in / clock out**, schedule, open shifts (request / withdraw), availability, hours, report a time problem, ask for a location review, visit care notes, notifications, profile |
| Scheduler | Today dashboard, shifts (create, edit, publish, assign, cancel), shift requests, time entries, location checks, staff directory and credentials, service locations with map-pin confirmation, clients |
| Admin | Everything above plus approvals (time entries, timesheets, location overrides, family updates), correction requests, completed-shift corrections, payroll CSV, family access, settings, audit log |
| Family | "Care today": who is coming, verified arrival and finish times, and updates the office approved |

The server still enforces every permission. The app only hides buttons a role can't use.

---

## 1. Try it first (demo mode)

`config.js` ships with `API_URL: 'DEMO'`. The app then runs on built-in sample
data (in `demo.js`), with no Google account needed. Sign in with
`admin@demo.com`, `scheduler@demo.com`, `caregiver@demo.com`, or on the Family
tab `family@demo.com`. The code is always `123456`. Reloading resets everything.

To run it on your computer: `python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## 2. Connect it to your Apps Script (no code changes to the .gs)

1. In the Apps Script editor: **Deploy → Manage deployments**. Confirm the web
   app is **Execute as: Me** and **Who has access: Anyone** (the same settings
   your current site needs). Copy the **Web app URL**. It ends in `/exec`.
2. In `config.js`, set `API_URL` to that URL.
3. Leave `demo.js` in place. It does nothing unless `API_URL` is `'DEMO'`.

## 3. Host it for free (GitHub Pages)

1. Create a new GitHub repository, for example `selectives-app`, and upload every
   file in this folder (keep the `icons/` and `family/` folders).
2. **Settings → Pages → Deploy from branch → main / root**. After about a
   minute the app is live at `https://<you>.github.io/selectives-app/`.
3. **Recommended: use a subdomain**, for example `app.selectiveshomecare.com`.
   Add a `CNAME` DNS record pointing to `<you>.github.io`, then enter the
   domain under **Settings → Pages → Custom domain** and tick **Enforce HTTPS**.

   This matters because your script builds email links from the domain only.
   Family emails link to `<domain>/family/`, and this app includes a `family/`
   page that opens the Family tab. On a `github.io/repo` address that link
   would break.
4. In the app (Admin → Settings), set **Portal Public URL** to the app's
   address so welcome emails send new staff to the app.
5. Your script's emails load the logo from
   `<domain>/assets/img/selectives-care-logo.jpg`. Copy that file from the
   website into an `assets/img/` folder in this repo.

Hostinger works too: upload the folder to a subdomain's `public_html`.

## 4. Install on phones

- **Android (Chrome):** open the link, then tap **Install** on the home screen
  banner or in the menu.
- **iPhone (Safari):** open the link, then **Share → Add to Home Screen**.

Location permission: the first clock-in asks for location. If someone taps
"Don't allow", they can turn it back on in iPhone **Settings → Privacy →
Location Services → Safari Websites**. On Android, use the site settings in
Chrome.

## 5. Releasing updates

Edit the files and push. Then bump `VERSION` in `sw.js` (for example
`selectives-v2`) so phones drop the old cached copy. Phones pick up the new
version the next time the app opens.

## Files

| File | Purpose |
|---|---|
| `config.js` | The only file you change per client: API URL, name, support phone |
| `app.js` | Sign-in, caregiver screens, family view, shared helpers |
| `admin.js` | Scheduler and admin screens |
| `demo.js` | Sample-data backend for demos (inactive unless `API_URL` is `'DEMO'`) |
| `app.css` | All styling (brand colours at the top) |
| `sw.js`, `manifest.json`, `icons/` | What makes it installable and fast to open |

## Reusing it for another agency

Copy the folder and change `config.js`, the colours at the top of `app.css`,
the name in `manifest.json` and the icons. Then pair it with a copy of the
spreadsheet and Apps Script project. The app itself contains nothing specific
to Selectives.
