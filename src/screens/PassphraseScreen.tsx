import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";
import { initializeVaultWithPassphrase } from "../services/vaultStorage";

export function PassphraseScreen({ mode = "create", onComplete }: { mode?: "create" | "unlock"; onComplete: () => void }) {
  const { colors } = usePaperTheme();
  const styles = s(colors);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!passphrase || (mode === "create" && passphrase !== confirm)) {
      Alert.alert("Passphrase error", mode === "create" ? "Passphrases must match and not be empty" : "Passphrase required");
      return;
    }
    try {
      setLoading(true);
      await initializeVaultWithPassphrase(passphrase, mode === "create");
      onComplete();
    } catch (err) {
      Alert.alert("Unlock failed", "Unable to derive key from passphrase. Please try again.");
      console.warn("PassphraseScreen initialize failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PaperBox — Vault Passphrase</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{mode === "create" ? "Create a passphrase" : "Enter your passphrase"}</Text>
        <TextInput
          secureTextEntry
          value={passphrase}
          onChangeText={setPassphrase}
          style={styles.input}
          placeholder="Passphrase"
          placeholderTextColor={colors.muted}
        />
        {mode === "create" ? (
          <TextInput
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            style={styles.input}
            placeholder="Confirm passphrase"
            placeholderTextColor={colors.muted}
          />
        ) : null}
        <Pressable onPress={submit} style={styles.button} disabled={loading}>
          <Text style={styles.buttonText}>{mode === "create" ? "Create and continue" : "Unlock vault"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, justifyContent: "center", padding: 24 },
    title: { fontSize: 28, fontWeight: "800", color: c.text, marginBottom: 18, textAlign: "center" },
    card: { backgroundColor: c.surface, padding: 18, borderRadius: 12 },
    label: { color: c.text, marginBottom: 8 },
    input: { backgroundColor: c.background, padding: 10, borderRadius: 8, marginBottom: 12, color: c.text },
    button: { backgroundColor: c.text, padding: 12, borderRadius: 8, alignItems: "center" },
    buttonText: { color: c.background, fontWeight: "700" },
  });
