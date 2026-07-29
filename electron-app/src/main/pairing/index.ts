import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORE = path.join(process.env.APPDATA || process.cwd(), 'PaperBox', 'pairing.json');

export async function start() {
  // Generates device id and keypair on first run and persists securely (basic file store for scaffold)
  if (!fs.existsSync(STORE)) {
    const id = crypto.randomUUID();
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pub = publicKey.export({ type: 'spki', format: 'pem' });
    const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const data = { id, publicKey: pub, privateKey: priv, paired: [] };
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  return {
    async stop() {
      // cleanup if needed
    }
  };
}
