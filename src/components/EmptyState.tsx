import React from "react";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { PaperColors, usePaperTheme } from "../theme/usePaperTheme";
export function EmptyState({
  icon = "inbox",
  title,
  body,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
}) {
  const { colors } = usePaperTheme(),
    s = styles(colors);
  return (
    <View style={s.wrap}>
      <View style={s.icon}>
        <Feather name={icon} size={26} color={colors.text} />
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
    </View>
  );
}
const styles = (c: PaperColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", paddingTop: 64, paddingHorizontal: 34 },
    icon: {
      width: 60,
      height: 60,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 30,
      backgroundColor: c.surface,
      marginBottom: 16,
    },
    title: { fontSize: 17, fontWeight: "700", color: c.text },
    body: {
      textAlign: "center",
      marginTop: 8,
      lineHeight: 20,
      color: c.secondary,
    },
  });
