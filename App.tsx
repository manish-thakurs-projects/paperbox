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
import { clearDecryptedCache } from "@/services/vaultStorage";

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
    // Clear any leftover decrypted cache from prior runs before hydrating the vault
    // to minimize risk of plaintext remnants on disk.
    (async () => {
      try {
        await clearDecryptedCache();
      } catch (e) {
        try { console.debug('clearDecryptedCache failed on startup', e); } catch (_) {}
      }
      // Now hydrate the in-memory vault/index.
      hydrate();
    })();
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

  // Clear decrypted cache on app lifecycle changes: when app backgrounds or resumes
  // this reduces the window where plaintext temp files can remain on disk.
  useEffect(() => {
    const handler = (nextState: string) => {
      try {
        // Clear on background and on resume (active) to cover both transitions.
        if (nextState === 'background' || nextState === 'inactive' || nextState === 'active') {
          void clearDecryptedCache();
        }
      } catch (e) {
        try { console.debug('clearDecryptedCache AppState handler failed', e); } catch(_){}
      }
    };

    const sub = AppState.addEventListener ? AppState.addEventListener('change', handler) : null;
    return () => {
      try {
        if (sub && typeof (sub as any).remove === 'function') (sub as any).remove();
      } catch (e) {
        // ignore
      }
    };
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
