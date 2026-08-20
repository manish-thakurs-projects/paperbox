import React, { useEffect, useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/types";
import { Feather } from "@expo/vector-icons";
import {
  StyleSheet,
  Switch,
  Text,
  View,
  Pressable,
  Linking,
} from "react-native";
import { showAlert } from "../services/alertService";

const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { Screen } from "../components/Screen";
import { usePaperTheme } from "../theme/usePaperTheme";
import { radius } from "../theme/tokens";
import { useSettingsStore } from "../store/useSettingsStore";
import { checkLocalAuthenticationAvailable } from "../utils/localAuthentication";
import { Settings } from "../types";

type SettingsRowProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  children: React.ReactNode;
  colors: ReturnType<typeof usePaperTheme>["colors"];
  onPress?: () => void;
};

const SettingsRow = ({
  icon,
  label,
  children,
  colors,
  onPress,
}: SettingsRowProps) => {
  const styles = rowStyles(colors);
  const RowComponent = onPress ? Pressable : View;
  return (
    <RowComponent
      style={styles.row}
      onPress={onPress}
      android_ripple={{ color: colors.muted }}
    >
      <Feather name={icon} size={19} color={colors.text} />
      <Text style={styles.name}>{label}</Text>
      {children}
    </RowComponent>
  );
};

export function SettingsScreen() {
  const { colors } = usePaperTheme();
  const s = styles(colors);
  const theme = useSettingsStore((s) => s.theme),
    setTheme = useSettingsStore((s) => s.setTheme),
    lockEnabled = useSettingsStore((s) => s.lockEnabled),
    setLockEnabled = useSettingsStore((s) => s.setLockEnabled);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();

  const [authAvailable, setAuthAvailable] = useState(false);
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const available = await checkLocalAuthenticationAvailable();
      if (isMounted) setAuthAvailable(available);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

  const themeOptions = useMemo(
    () => [
      {
        value: "light" as Settings["theme"],
        label: "Light",
        description: "Always use light mode.",
      },
      {
        value: "dark" as Settings["theme"],
        label: "Dark",
        description: "Always use dark mode.",
      },
    ],
    [],
  );

  const selectedThemeOption =
    themeOptions.find((option) => option.value === theme) ?? themeOptions[0];

  const handleThemeSelect = (value: Settings["theme"]) => {
    setTheme(value);
    setThemeDropdownOpen(false);
  };

  return (
    <Screen>
      <Text style={s.title}>Settings</Text>

      <Text style={s.label}>PREFERENCES</Text>
      <View style={s.group}>
        <SettingsRow
          icon="moon"
          label="Theme"
          colors={colors}
          onPress={() => setThemeDropdownOpen((current) => !current)}
        >
          <View style={s.themeDropdownHeader}>
            <Text style={s.themeDropdownLabel}>
              {selectedThemeOption.label}
            </Text>
            <Feather
              name={themeDropdownOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.secondary}
            />
          </View>
        </SettingsRow>
        {themeDropdownOpen ? (
          <View style={s.themeDropdownOptions}>
            {themeOptions.map((option) => {
              const selected = theme === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    s.themeDropdownOption,
                    selected && s.themeDropdownOptionSelected,
                  ]}
                  onPress={() => handleThemeSelect(option.value)}
                >
                  <View style={s.themeDropdownOptionRow}>
                    <Text
                      style={[
                        s.themeDropdownOptionLabel,
                        selected && s.themeDropdownOptionLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected ? (
                      <Feather name="check" size={16} color={colors.text} />
                    ) : null}
                  </View>
                  <Text style={s.themeDropdownOptionDescription}>
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <SettingsRow icon="shield" label="App lock" colors={colors}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch
              value={lockEnabled}
              disabled={!authAvailable}
              onValueChange={(v) => setLockEnabled(v)}
              trackColor={{ false: colors.muted, true: colors.inverse }}
            />
            {!authAvailable ? (
              <Text style={s.unavailableLabel}>Unavailable</Text>
            ) : null}
          </View>
        </SettingsRow>
        {!authAvailable ? (
          <Text style={s.helpText}>
            App lock requires a native runtime with secure authentication
            support. Use a custom build or standalone app.
          </Text>
        ) : null}
      </View>
      <Text style={s.label}>VAULT</Text>
      <View style={s.group}>
        <SettingsRow
          icon="shield"
          label="Privacy"
          colors={colors}
          onPress={() => navigation.navigate("Privacy")}
        >
          <Feather
            key={theme}
            name="chevron-right"
            size={18}
            color={colors.secondary}
          />
        </SettingsRow>
        <SettingsRow
          icon="mail"
          label="Contact"
          colors={colors}
          onPress={async () => {
            try {
              const mailto =
                "mailto:contact@dustmedia.org?subject=" +
                encodeURIComponent("PaperBox support");
              const supported = await Linking.canOpenURL(mailto);
              if (supported) await Linking.openURL(mailto);
              else
                Alert.alert(
                  "Unable to open mail app",
                  "No mail app is available to send email.",
                );
            } catch (e) {
              Alert.alert(
                "Unable to open mail app",
                "Could not open your mail application.",
              );
            }
          }}
        >
          <Feather
            key={theme}
            name="chevron-right"
            size={18}
            color={colors.secondary}
          />
        </SettingsRow>
      </View>
      <Text style={s.version}>
        PaperBox - Version 1.0.2{"\n"} Developed by DustMedia.{" "}
      </Text>
    </Screen>
  );
}
const styles = (c: {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  secondary: string;
  border: string;
  muted: string;
  inverse: string;
}) =>
  StyleSheet.create({
    title: {
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1,
      color: c.text,
      marginBottom: 28,
      marginTop: 30,
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      color: c.secondary,
      marginBottom: 8,
    },
    group: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      overflow: "hidden",
      marginBottom: 25,
      backgroundColor: c.elevated,
    },
    version: {
      textAlign: "center",
      color: c.secondary,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 20,
    },
    row: {
      height: 60,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    themeDropdownHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    themeDropdownLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: c.text,
    },
    description: {
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
    },
    themeDropdownOptions: {
      borderBottomWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    themeDropdownOption: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    themeDropdownOptionSelected: {
      backgroundColor: c.elevated,
    },
    themeDropdownOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    themeDropdownOptionLabel: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    themeDropdownOptionLabelSelected: {
      color: c.text,
    },
    themeDropdownOptionDescription: {
      marginTop: 4,
      fontSize: 13,
      color: c.secondary,
      lineHeight: 18,
    },
    name: { fontSize: 15, fontWeight: "600", color: c.text, flex: 1 },
    unavailableLabel: {
      color: c.secondary,
      fontSize: 12,
    },
    helpText: {
      color: c.secondary,
      fontSize: 12,
      paddingHorizontal: 16,
      paddingBottom: 10,
      lineHeight: 18,
    },
  });

const rowStyles = (c: {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  secondary: string;
  border: string;
  muted: string;
  inverse: string;
}) =>
  StyleSheet.create({
    row: {
      height: 60,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    name: { fontSize: 15, fontWeight: "600", color: c.text, flex: 1 },
  });
