import React, { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { subscribe } from "../services/alertService";
import { usePaperTheme } from "../theme/usePaperTheme";

export function ThemedAlert() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [buttons, setButtons] = useState<any[]>([]);
  const [resolver, setResolver] = useState<((v: number | null) => void) | null>(
    null,
  );
  const { colors } = usePaperTheme();

  useEffect(() => {
    const unsub = subscribe((p) => {
      setTitle(p.title);
      setMessage(p.message);
      setButtons(p.buttons || [{ text: "OK" }]);
      setResolver(() => p.resolve || null);
      setVisible(true);
    });
    return () => unsub();
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

  if (!visible) return null;

  return (
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
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
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
});

// Helper: withAlpha used here but not imported; duplicate a simple implementation
function withAlpha(hex: string, alpha: number) {
  // naive fallback: return rgba(0,0,0,alpha)
  return `rgba(0,0,0,${alpha})`;
}

export default ThemedAlert;
