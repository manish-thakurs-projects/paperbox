import React, { useEffect, useState } from "react";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "@/navigation/AppNavigator";
import { useSettingsStore } from "@/store/useSettingsStore";
import { LockScreen } from "@/screens/LockScreen";
import { useVaultStore } from "@/store/useVaultStore";

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const hydrate = useVaultStore((s) => s.hydrate);
  const lockEnabled = useSettingsStore((s) => s.lockEnabled);
  const [unlocked, setUnlocked] = useState(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // if lock enabled by settings, start locked
  useEffect(() => {
    if (lockEnabled) setUnlocked(false);
  }, [lockEnabled]);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        {lockEnabled && !unlocked ? (
          <LockScreen onUnlock={() => setUnlocked(true)} />
        ) : (
          <AppNavigator />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
