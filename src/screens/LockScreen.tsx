import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";
import { authenticateWithLocalAuthentication } from "../utils/localAuthentication";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { colors } = usePaperTheme();
  const styles = s(colors);
  const [message, setMessage] = useState("Preparing secure authentication...");
  const [status, setStatus] = useState<"pending" | "failed" | "unavailable">("pending");

  const authenticate = async () => {
    setStatus("pending");
    setMessage("Opening biometric prompt...");

    const result = await authenticateWithLocalAuthentication();
    if (result.success) {
      onUnlock();
      return;
    }

    setStatus(result.error ? "failed" : "unavailable");
    setMessage(result.error ?? "Secure authentication is unavailable in this runtime. Rebuild the app with local authentication support.");
  };

  useEffect(() => {
    authenticate();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Paper Box</Text>
      <Text style={styles.subtitle}>Secure access required</Text>
      <View style={styles.promptCard}>
        {status === "pending" ? (
          <ActivityIndicator size="large" color={colors.inverse} style={styles.indicator} />
        ) : null}
        <Text style={styles.message}>{message}</Text>
        {status !== "pending" ? (
          <Pressable style={styles.retryButton} onPress={authenticate}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = (c: {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  secondary: string;
  border: string;
  muted: string;
  inverse: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    title: {
      fontSize: 32,
      fontWeight: "800",
      color: c.text,
      marginBottom: 10,
    },
    subtitle: {
      color: c.secondary,
      fontSize: 16,
      marginBottom: 24,
      textAlign: "center",
    },
    promptCard: {
      width: "100%",
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    indicator: {
      marginBottom: 18,
    },
    message: {
      color: c.text,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginBottom: 20,
    },
    retryButton: {
      marginTop: 4,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 10,
      backgroundColor: c.text,
    },
    retryText: {
      color: c.background,
      fontWeight: "700",
    },
  });
