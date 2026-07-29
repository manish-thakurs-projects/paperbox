import { Notification } from 'electron';

export async function start() {
  return {
    notify(title: string, body: string) {
      new Notification({ title, body }).show();
    },
    async stop() {}
  };
}
