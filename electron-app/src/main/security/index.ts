export async function start() {
  // Placeholder for crypto utilities, validation helpers, filename checks, size limits, etc.
  return {
    validateFilename(name: string) {
      // basic sanitization - disallow path separators
      if (name.includes('..') || name.includes('/') || name.includes('\\')) throw new Error('Invalid filename');
      return name.replace(/[<>:"|?*]/g, '_');
    },
    validateMime(mime: string) {
      // allow common PDF/image MIME types for scaffold
      const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
      return allowed.includes(mime);
    },
    async stop() {}
  };
}
