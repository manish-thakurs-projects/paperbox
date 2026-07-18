import React from "react";
import { Feather } from "@expo/vector-icons";
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { VaultFile } from "../types";
import { fileSize, relativeDate } from "../utils/files";
import { radius } from "../theme/tokens";
import { PaperColors, usePaperTheme } from "../theme/usePaperTheme";
const icons: Record<string, keyof typeof Feather.glyphMap> = {
  pdf: 'file-text',
  document: 'file-text',
  spreadsheet: 'grid',
  presentation: 'monitor',
  image: 'image',
  video: 'film',   
  archive: 'archive',
  text: 'align-left',
  other: 'file'
};
export function FileRow({
  file,
  onPress,
  onMore,
  onLongPress,
  selected,
}: {
  file: VaultFile;
  onPress?: () => void;
  onMore?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}) {
  const { colors } = usePaperTheme(),
    s = styles(colors);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.row, selected && s.selectedRow, pressed && s.pressedRow]}
    >
      <View style={s.icon}>
        <Feather name={icons[file.kind]} size={20} color={colors.text} />
      </View>
      <View style={s.copy}>
        <Text numberOfLines={1} style={s.name}>
          {file.name}
        </Text>
        <Text style={s.meta}>
          {fileSize(file.size)} · {relativeDate(file.createdAt)}
        </Text>
      </View>
      {file.isPinned && (
        <Feather name="bookmark" size={16} color={colors.text} />
      )}
      {selected ? (
        <View style={s.checkmark}>
          <Feather name="check" size={20} color={colors.inverse} />
        </View>
      ) : (
        <Pressable
          hitSlop={10}
          onPress={(event: GestureResponderEvent) => {
            event.stopPropagation();
            onMore?.();
          }}
        >
          <Feather name="more-horizontal" size={20} color={colors.secondary} />
        </Pressable>
      )}
    </Pressable>
  );
}
const styles = (c: PaperColors) =>
  StyleSheet.create({
    row: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
    },
    selectedRow: {
      backgroundColor: c.elevated,
    },
    pressedRow: {
      opacity: 0.75,
    },
    icon: {
      width: 42,
      height: 42,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
    },
    copy: { flex: 1, gap: 4 },
    name: { fontSize: 15, fontWeight: "600", color: c.text },
    meta: { fontSize: 12, color: c.secondary },
    checkmark: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.text,
    },
  });
