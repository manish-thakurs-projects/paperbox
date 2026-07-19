import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { PaperColors, usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  hideCancelButton?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  destructive = false,
  hideCancelButton = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = usePaperTheme();
  const styles = getStyles(colors, destructive);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {!hideCancelButton ? (
              <Pressable
                style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.buttonPressed]}
                onPress={onCancel}
              >
                <Text style={[styles.buttonText, styles.cancelText]}>{cancelText}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.button, destructive ? styles.destructiveButton : styles.confirmButton, pressed && styles.buttonPressed]}
              onPress={onConfirm}
            >
              <Text style={[styles.buttonText, destructive ? styles.destructiveText : styles.confirmText]}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: PaperColors, destructive: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: withAlpha(colors.text, 0.45),
      paddingHorizontal: 24,
    },
    container: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: withAlpha(colors.text, 0.18),
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 12,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 10,
    },
    message: {
      color: colors.secondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 24,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
    },
    button: {
      minWidth: 90,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonPressed: {
      opacity: 0.8,
    },
    cancelButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmButton: {
      backgroundColor: colors.text,
    },
    destructiveButton: {
      backgroundColor: colors.destructive,
    },
    buttonText: {
      fontWeight: "700",
      fontSize: 14,
    },
    cancelText: {
      color: colors.text,
    },
    confirmText: {
      color: colors.background,
    },
    destructiveText: {
      color: colors.background,
    },
  });
