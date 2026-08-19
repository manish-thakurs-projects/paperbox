import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { subscribe, subscribeToasts } from "../services/alertService";
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";

export function ThemedAlert() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [buttons, setButtons] = useState<any[]>([]);
  const [resolver, setResolver] = useState<((v: number | null) => void) | null>(
    null,
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = usePaperTheme();

  useEffect(() => {
    const unsub = subscribe((p) => {
      setTitle(p.title);
      setMessage(p.message);
      setButtons(p.buttons || [{ text: "OK" }]);
      setResolver(() => p.resolve || null);
      setVisible(true);
    });
    const unsubToast = subscribeToasts((message, duration) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToastMessage(message);
      toastTimer.current = setTimeout(() => {
        toastTimer.current = null;
        setToastMessage(null);
      }, duration);
    });
    return () => {
      unsub();
      unsubToast();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const onPress = (idx: number) => {
    const btn = buttons[idx];
    try {
      if (btn && typeof btn.onPress === "function") btn.onPress();
    } catch (_) {}
    try {
      if (resolver) resolver(idx);
    } catch (_) {}
    setVisible(false);
  };

  if (!visible && !toastMessage) return null;

  return (
    <>
      {visible ? (
        <Modal
          transparent
          animationType="fade"
          visible={visible}
          onRequestClose={() => onPress(0)}
        >
          <View
            style={[
              styles.overlay,
              { backgroundColor: withAlpha(colors.text, 0.38) },
            ]}
          >
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {title ? (
                <Text style={[styles.title, { color: colors.text }]}>
                  {title}
                </Text>
              ) : null}
              {message ? (
                <Text style={[styles.message, { color: colors.secondary }]}>
                  {message}
                </Text>
              ) : null}
              <View style={styles.footer}>
                {buttons.map((b, i) => (
                  <Pressable
                    key={i}
                    style={[styles.button, { borderColor: colors.border }]}
                    onPress={() => onPress(i)}
                  >
                    <Text style={{ color: colors.text }}>{b.text}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      {toastMessage ? (
        <View pointerEvents="none" style={styles.toastContainer}>
          <View
            style={[styles.toast, { backgroundColor: colors.inverse }]}
          >
            <Text style={[styles.toastText, { color: colors.background }]}>
              {toastMessage}
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { width: "84%", padding: 18, borderRadius: 12 },
  title: { fontWeight: "700", fontSize: 16, marginBottom: 8 },
  message: { fontSize: 14, marginBottom: 12 },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  toastContainer: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 102,
    alignItems: "center",
  },
  toast: {
    maxWidth: "92%",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  toastText: { fontSize: 13, fontWeight: "600" },
});

export default ThemedAlert;
