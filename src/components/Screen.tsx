import React from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";

export function Screen({
  children,
  style,
  overlay,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  overlay?: React.ReactNode;
}) {
  const { colors } = usePaperTheme();

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}> 
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.content, style]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {overlay}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
});
