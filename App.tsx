import React, { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "@/navigation/AppNavigator";
import { LockScreen } from "@/screens/LockScreen";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useVaultStore } from "@/store/useVaultStore";
import { checkLocalAuthenticationAvailable } from "@/utils/localAuthentication";

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const lockEnabled = useSettingsStore((s) => s.lockEnabled);
  const lockSuppressed = useSettingsStore((s) => s.lockSuppressed);
  const setLockEnabled = useSettingsStore((s) => s.setLockEnabled);
  const hydrate = useVaultStore((s) => s.hydrate);
  const [authenticated, setAuthenticated] = useState(!lockEnabled);
  const [authAvailable, setAuthAvailable] = useState<boolean | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setAuthenticated(!lockEnabled);
  }, [lockEnabled]);

  useEffect(() => {
    let active = true;
    (async () => {
      const available = await checkLocalAuthenticationAvailable();
      if (!active) return;
      setAuthAvailable(available);
      if (!available && lockEnabled) {
        setLockEnabled(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [lockEnabled, setLockEnabled]);

  useEffect(() => {
    appState.current = AppState.currentState;
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        {lockEnabled && authAvailable && !authenticated ? (
          <LockScreen onUnlock={() => setAuthenticated(true)} />
        ) : (
          <AppNavigator />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
