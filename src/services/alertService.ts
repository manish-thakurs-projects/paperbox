type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type AlertPayload = {
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  resolve?: (value: number | null) => void;
};

const listeners: Array<(p: AlertPayload) => void> = [];

export function subscribe(fn: (p: AlertPayload) => void) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function showAlert(
  title?: string,
  message?: string,
  buttons?: AlertButton[],
) {
  return new Promise<number | null>((resolve) => {
    const payload: AlertPayload = { title, message, buttons, resolve };
    listeners.forEach((l) => {
      try {
        l(payload);
      } catch (e) {
        /* ignore */
      }
    });
  });
}

export default { subscribe, showAlert };
