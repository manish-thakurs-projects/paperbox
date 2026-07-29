PaperBox Desktop (scaffold)

This folder contains a minimal Electron + TypeScript scaffold implementing the modular layout for the desktop app.

Key points:
- Main process: src/main/main.ts
- Preload: src/main/preload.ts (exposes safe IPC)
- Module stubs: discovery, pairing, websocket, upload, storage, security, settings, notifications
- Renderer is a minimal static page at src/renderer/index.html for initial testing

Next steps:
1. Run `npm install` inside electron-app
2. Run `npm run start` to build and start Electron (first build may take a moment)
3. Implement module details: mDNS in discovery, secure pairing (key exchange + QR), WebSocket server, and HTTP upload with checksum verification.

Design notes and checklist are intentionally left for the next iteration; ask if you'd like a detailed design document or a working prototype for a specific subsystem (discovery/pairing/upload).
