import React, { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { BottomTabBarButtonProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

function IconOnlyTabBarButton({
  accessibilityState,
  children,
  onPress,
  onLongPress,
  style,
  label,
  ...props
}: Omit<BottomTabBarButtonProps, "style"> & { label: string; style?: any }) {
  const { colors } = usePaperTheme();
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!showTooltip) {
      return;
    }

    const timeout = setTimeout(() => setShowTooltip(false), 1200);
    return () => clearTimeout(timeout);
  }, [showTooltip]);

  const { ref, ...buttonProps } = props as any;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={onPress}
      onLongPress={(event) => {
        setShowTooltip(true);
        if (onLongPress) {
          onLongPress(event);
        }
      }}
      onPressOut={() => setShowTooltip(false)}
      style={[styles.tabButton, style]}
      {...buttonProps}
    >
      {children}
      {showTooltip && (
        <View style={[styles.tooltip, { backgroundColor: colors.elevated, borderColor: colors.border }]}> 
          <Text style={[styles.tooltipText, { color: colors.text }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function AppTabs() {
  const { colors } = usePaperTheme();

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
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
        tabBarButton: (props) => (
          <IconOnlyTabBarButton {...props} label={route.name} />
        ),
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

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  tooltip: {
    position: "absolute",
    top: -36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tooltipText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

