import React, { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "@/navigation/AppNavigator";
import { LockScreen } from "@/screens/LockScreen";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useVaultStore } from "@/store/useVaultStore";
import { checkLocalAuthenticationAvailable } from "@/utils/localAuthentication";
import { clearDecryptedCache } from "@/services/vaultStorage";
import ThemedAlert from "@/components/ThemedAlert";
import { navigationRef } from "@/navigation/navigationRef";
import {
  consumeIncomingPdf,
  IncomingPdf,
} from "@/services/incomingPdfService";

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const lockEnabled = useSettingsStore((s) => s.lockEnabled);
  const lockSuppressed = useSettingsStore((s) => s.lockSuppressed);
  const setLockEnabled = useSettingsStore((s) => s.setLockEnabled);
  const hydrate = useVaultStore((s) => s.hydrate);
  const [authenticated, setAuthenticated] = useState(!lockEnabled);
  const [authAvailable, setAuthAvailable] = useState<boolean | null>(null);
  const [navigationReady, setNavigationReady] = useState(false);
  const [incomingPdf, setIncomingPdf] = useState<IncomingPdf | null>(null);
  const appState = useRef(AppState.currentState);

  const readIncomingPdf = async () => {
    const document = await consumeIncomingPdf();
    if (document?.uri) setIncomingPdf(document);
  };

  useEffect(() => {
    // Clear any leftover decrypted cache from prior runs before hydrating the vault
    // to minimize risk of plaintext remnants on disk.
    (async () => {
      try {
        await clearDecryptedCache();
      } catch (e) {
        try {
        } catch (_) {}
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

  useEffect(() => {
    void readIncomingPdf();
    const subscription = AppState.addEventListener("change", (nextState) => {
      appState.current = nextState;
      if (nextState === "active") void readIncomingPdf();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!incomingPdf || !navigationReady || !authenticated) return;
    navigationRef.navigate("Preview", {
      externalUri: incomingPdf.uri,
      externalName: incomingPdf.name,
      externalMimeType: incomingPdf.mimeType,
    });
    setIncomingPdf(null);
  }, [authenticated, incomingPdf, navigationReady]);

  // Clear decrypted cache on app lifecycle changes: when app backgrounds or resumes
  // this reduces the window where plaintext temp files can remain on disk.
  useEffect(() => {
    const handler = (nextState: string) => {
      try {
        // Clear on background and on resume (active) to cover both transitions.
        if (
          nextState === "background" ||
          nextState === "inactive" ||
          nextState === "active"
        ) {
          void clearDecryptedCache();
        }
      } catch (e) {
        try {
        } catch (_) {}
      }
    };

    const sub = AppState.addEventListener
      ? AppState.addEventListener("change", handler)
      : null;
    return () => {
      try {
        if (sub && typeof (sub as any).remove === "function")
          (sub as any).remove();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => setNavigationReady(true)}
        theme={theme === "dark" ? DarkTheme : DefaultTheme}
      >
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        {lockEnabled && authAvailable && !authenticated ? (
          <LockScreen onUnlock={() => setAuthenticated(true)} />
        ) : (
          <AppNavigator />
        )}
      </NavigationContainer>
    <ThemedAlert />
    </SafeAreaProvider>
  );
}
