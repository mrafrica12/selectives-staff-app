import { cp, mkdir, writeFile } from 'node:fs/promises';

const source = new URL('../', import.meta.url);
const output = new URL('./dist/staff/app/', import.meta.url);
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'app.css', 'app.js', 'admin.js', 'sw.js', 'manifest.json', 'icons', 'family']) {
  await cp(new URL(path, source), new URL(path, output), { recursive: true });
}
await writeFile(new URL('config.js', output), `window.APP_CONFIG = {
  API_URL: './api',
  ORG_NAME: 'Selectives Home Care',
  SUPPORT_PHONE: '443-847-4057',
  SUPPORT_EMAIL: 'admin@selectiveshomecare.com',
  TIME_ZONE: 'America/New_York'
};\n`);
