# Selectives Home Care Staff App

The app is a static PWA for caregivers, schedulers, administrators and authorised family contacts. It uses the existing staff Apps Script API and its Google Sheet. The browser sends the same email-code and attendance requests as the legacy portal through a same-origin Cloudflare Worker.

## Run the demo

Run `python3 -m http.server 8000` in this folder and open `http://localhost:8000/`. Use `caregiver@demo.com`, `scheduler@demo.com`, `admin@demo.com`, or the Family tab with `family@demo.com`. Enter `123456`. The data is synthetic and resets on reload.

## Deploy an isolated preview

1. Verify the Apps Script source/version and headers against [the audit](AUDIT.md). Obtain the existing staging web app URL and role-specific test identities. Use synthetic visits and the existing staging data store.
2. Run `node cloudflare/build.mjs`. The Worker Assets bundle is generated at `cloudflare/dist/staff/app/` and excludes demo data and backend source.
3. From `cloudflare/`, use your authenticated Wrangler installation to deploy the Worker to its preview hostname. Set `APPS_SCRIPT_EXEC_URL` with `wrangler secret put APPS_SCRIPT_EXEC_URL` using the staging `/exec` URL. Browse to `/staff/app/`. An unconfigured Worker returns a service-configuration error.
4. Verify sign-in, schedule, GPS on real devices, both attendance writes, correction history, schedule edits, role boundaries, logout and expiry against staging. Simulate an interrupted attendance response and reconcile against the authoritative schedule before repeating the action. Check the source spreadsheet and both portal views after every write.
5. For each release that modifies cached files, increment `VERSION` in `sw.js` and rebuild. Close all app tabs to let an installed update activate.

Workers Static Assets serve the frontend and the integration from the same hostname. Cloudflare Pages could host the assets, but would still need a same-origin API function or route. The supplied Worker config declares no production routes.

## Promote and roll back

After acceptance, inspect the Cloudflare zone’s existing Workers routes, origin settings and cache rules. Stage the approved production Apps Script URL on a dedicated Worker and scope the route to `selectiveshomecare.com/staff/app/*`. Exclude this path from any broader Cache Everything or HTML rewrite rules. Verify the app, the public homepage, and `/staff/index.html` after adding the route. Family invitations continue to depend on the backend’s configured public URL and family entry route. Validate those links before changing invitation settings.

Record the previous Worker version and route configuration before rollout. If needed, remove the app-specific route to restore the existing origin’s handling of that path, or roll the Worker back to the last verified version. Direct users to `/staff/index.html` while investigating. Rollback of the frontend does not reverse attendance or corrections already accepted by Apps Script. Reconcile those through the existing admin workflow and retain the audit evidence.
