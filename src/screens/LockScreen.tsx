import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";
import { useSettingsStore } from "../store/useSettingsStore";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { colors } = usePaperTheme();
  const s = styles(colors);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const verifyPasscode = useSettingsStore((s) => s.verifyPasscode);
  const biometricEnabled = useSettingsStore((s) => (s as any).biometricEnabled);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!biometricEnabled) return;
      try {
        // dynamic require so bundler doesn't fail if expo-local-authentication isn't installed
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const LocalAuth = require("expo-local-authentication");
        if (!LocalAuth) return;
        const has = await LocalAuth.hasHardwareAsync?.();
        const enrolled = await LocalAuth.isEnrolledAsync?.();
        if (has && enrolled) {
          const res = await LocalAuth.authenticateAsync({ promptMessage: "Unlock Paper Box" });
          if (active && res && (res as any).success) {
            onUnlock();
          }
        }
      } catch (e) {
        console.warn("biometric auth error", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [biometricEnabled, onUnlock]);

  const submit = async () => {
    setError(null);
    const ok = await verifyPasscode(pin);
    if (ok) {
      setPin("");
      onUnlock();
    } else {
      setError("Incorrect passcode");
    }
  };

  const tryBiometric = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const LocalAuth = require("expo-local-authentication");
      if (!LocalAuth) {
        Alert.alert("Biometric unavailable", "Biometric authentication is not available on this device or dependency is not installed.");
        return;
      }
      const has = await LocalAuth.hasHardwareAsync?.();
      const enrolled = await LocalAuth.isEnrolledAsync?.();
      if (!has || !enrolled) {
        Alert.alert("Biometric unavailable", "No biometric hardware or no biometrics enrolled on this device.");
        return;
      }
      const res = await LocalAuth.authenticateAsync({ promptMessage: "Unlock Paper Box" });
      if ((res as any).success) onUnlock();
    } catch (e) {
      console.warn("biometric auth error", e);
      Alert.alert("Biometric failed", "Biometric authentication could not be completed.");
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.container}>
      <View style={s.card}>
        <Text style={s.title}>Enter passcode</Text>
        <Text style={s.subtitle}>This app is locked. Enter your passcode to continue.</Text>
        <TextInput
          value={pin}
          onChangeText={setPin}
          keyboardType="numeric"
          secureTextEntry
          placeholder="••••"
          placeholderTextColor={colors.secondary}
          style={s.input}
          maxLength={32}
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <TouchableOpacity style={s.button} onPress={submit}>
          <Text style={s.buttonText}>Unlock</Text>
        </TouchableOpacity>
        {biometricEnabled ? (
          <TouchableOpacity style={[s.button, { marginTop: 10, backgroundColor: colors.surface }]} onPress={tryBiometric}>
            <Text style={[s.buttonText, { color: colors.text }]}>Use biometrics</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, justifyContent: "center", alignItems: "center" },
    card: { width: "90%", padding: 20, borderRadius: 14, backgroundColor: c.surface, alignItems: "center" },
    title: { fontSize: 20, fontWeight: "800", color: c.text, marginBottom: 8 },
    subtitle: { color: c.secondary, textAlign: "center", marginBottom: 16 },
    input: { width: "60%", padding: 12, borderRadius: 8, backgroundColor: c.background, textAlign: "center", fontSize: 18, color: c.text, marginBottom: 12 },
    button: { backgroundColor: c.inverse, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
    buttonText: { color: c.background, fontWeight: "700" },
    error: { color: "#C84B4B", marginBottom: 8 },
  });
