import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function start() {
  const base = path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), 'Documents', 'PaperBox');
  fs.mkdirSync(base, { recursive: true });

  return {
    async storeTempAndFinalize(tempPath: string, finalName: string) {
      const hash = crypto.createHash('sha256');
      const input = fs.createReadStream(tempPath);
      await new Promise((res, rej) => {
        input.on('data', d => hash.update(d));
        input.on('end', res);
        input.on('error', rej);
      });
      const digest = hash.digest('hex');

      // Validate and move to final destination (safe rename)
      const now = new Date();
      const destDir = path.join(base, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2,'0'), String(now.getDate()).padStart(2,'0'));
      fs.mkdirSync(destDir, { recursive: true });
      const finalPath = path.join(destDir, finalName);
      fs.renameSync(tempPath, finalPath);
      return { finalPath, digest };
    },
    async stop() {}
  };
}
