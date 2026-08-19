import React, { useEffect, useState } from "react";
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
import {
  consumePendingWidgetAction,
  PendingWidgetAction,
  syncWidgetFolders,
} from "@/services/widgetService";

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const lockEnabled = useSettingsStore((s) => s.lockEnabled);
  const folders = useVaultStore((s) => s.folders);
  const vaultReady = useVaultStore((s) => s.ready);
  const setLockEnabled = useSettingsStore((s) => s.setLockEnabled);
  const hydrate = useVaultStore((s) => s.hydrate);
  const [authenticated, setAuthenticated] = useState(!lockEnabled);
  const [authAvailable, setAuthAvailable] = useState<boolean | null>(null);
  const [navigationReady, setNavigationReady] = useState(false);
  const [incomingPdf, setIncomingPdf] = useState<IncomingPdf | null>(null);
  const [pendingWidgetAction, setPendingWidgetAction] =
    useState<PendingWidgetAction | null>(null);

  const readIncomingPdf = async () => {
    const document = await consumeIncomingPdf();
    if (document?.uri) setIncomingPdf(document);
  };

  const readWidgetAction = async () => {
    const action = await consumePendingWidgetAction();
    if (action) setPendingWidgetAction(action);
  };

  useEffect(() => {
    // These operations touch independent storage locations, so start them in
    // parallel to reduce time-to-first-screen after launch.
    void clearDecryptedCache();
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setAuthenticated(!lockEnabled);
  }, [lockEnabled]);

  useEffect(() => {
    if (!vaultReady) return;
    void syncWidgetFolders(folders);
  }, [folders, vaultReady]);

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
    void readIncomingPdf();
    void readWidgetAction();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void readIncomingPdf();
        void readWidgetAction();
      }
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

  useEffect(() => {
    if (!pendingWidgetAction || !navigationReady || !authenticated) return;

    if (pendingWidgetAction.action === "paperbox.widget.SCAN") {
      navigationRef.navigate("Vault", {
        screen: "Camera",
        params: { widgetAction: "scan" },
      });
    } else if (pendingWidgetAction.action === "paperbox.widget.CREATE_PDF") {
      navigationRef.navigate("Vault", {
        screen: "Camera",
        params: { widgetAction: "createPdf" },
      });
    } else if (pendingWidgetAction.action === "paperbox.widget.IMPORT") {
      navigationRef.navigate("Vault", {
        screen: "Home",
        params: { widgetAction: "import" },
      });
    } else if (pendingWidgetAction.folderId) {
      navigationRef.navigate("FolderDetail", {
        folderId: pendingWidgetAction.folderId,
      });
    }

    setPendingWidgetAction(null);
  }, [authenticated, navigationReady, pendingWidgetAction]);

  // Clear decrypted cache when app backgrounds to reduce the window where
  // plaintext temp files can remain on disk without doing work on every focus.
  useEffect(() => {
    const handler = (nextState: string) => {
      if (nextState === "background") {
        void clearDecryptedCache();
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
