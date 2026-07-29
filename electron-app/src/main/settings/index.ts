import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.env.APPDATA || process.cwd(), 'PaperBox', 'settings.json');

export async function start() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  let settings = { saveLocation: '', autoOpen: false, maxUploadSize: 50 * 1024 * 1024 };
  if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch {}
  }
  return {
    getSettings() { return settings; },
    update(newSettings: any) { settings = { ...settings, ...newSettings }; fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); },
    async stop() {}
  };
}
