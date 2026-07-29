import debug from 'debug';
const log = debug('paperbox:websocket');

export async function start() {
  log('websocket.start (stub)');
  // TODO: implement a secure WebSocket server with TLS or use authenticated key exchange

  return {
    async stop() {
      log('websocket.stop (stub)');
    }
  };
}
