import debug from 'debug';
const log = debug('paperbox:discovery');

export async function start(opts: { onDeviceFound?: (d: any) => void } = {}) {
  log('discovery.start (stub)');
  // TODO: implement mDNS/Bonjour advertising using bonjour-service

  return {
    async stop() {
      log('discovery.stop (stub)');
    }
  };
}
