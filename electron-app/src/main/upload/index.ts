import debug from 'debug';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const log = debug('paperbox:upload');

export async function start(opts: { onProgress?: (p: any) => void } = {}) {
  log('upload.start (stub)');
  // TODO: implement HTTP upload server (express + multer) with SHA-256 verification, temp file handling, max size

  return {
    async stop() {
      log('upload.stop (stub)');
    }
  };
}
