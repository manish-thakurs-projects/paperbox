import React, { useEffect } from "react";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "@/navigation/AppNavigator";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useVaultStore } from "@/store/useVaultStore";
export default function App() {
  const theme = useSettingsStore((s) => s.theme),
    hydrate = useVaultStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
