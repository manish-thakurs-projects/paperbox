import React from "react";
import { Feather } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "../screens/HomeScreen";
import { FoldersScreen } from "../screens/FoldersScreen";
import { CameraScreen } from "@/screens/CameraScreen";
import { FavoritesScreen } from "../screens/FavoritesScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { usePaperTheme } from "../theme/usePaperTheme";
type Tabs = {
  Home: undefined;
  Folders: undefined;
  Camera: undefined;
  Favorites: undefined;
  Settings: undefined;
};
const Tab = createBottomTabNavigator<Tabs>();
const icons: Record<keyof Tabs, keyof typeof Feather.glyphMap> = {
  Home: "home",
  Folders: "folder",
  Camera: "camera",
  Favorites: "star",
  Settings: "settings",
};
export function AppTabs() {
  const { colors } = usePaperTheme();

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          backgroundColor: colors.elevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 76,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          paddingTop: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginBottom: 4,
        },
        tabBarIcon: ({ color, size }) => (
          <Feather
            name={icons[route.name]}
            color={color}
            size={size}
            style={{ marginTop: -2 }}
          />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Folders" component={FoldersScreen} />
      <Tab.Screen name="Camera" component={CameraScreen} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
