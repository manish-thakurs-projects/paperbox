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

type ToastListener = (message: string, duration: number) => void;

const listeners: Array<(p: AlertPayload) => void> = [];
const toastListeners: ToastListener[] = [];

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

export function subscribeToasts(fn: ToastListener) {
  toastListeners.push(fn);
  return () => {
    const idx = toastListeners.indexOf(fn);
    if (idx >= 0) toastListeners.splice(idx, 1);
  };
}

export function showToast(message: string, duration = 2200) {
  toastListeners.forEach((listener) => {
    try {
      listener(message, duration);
    } catch {
      // Toasts are best-effort UI feedback and must not interrupt an action.
    }
  });
}

export default { subscribe, showAlert, subscribeToasts, showToast };
