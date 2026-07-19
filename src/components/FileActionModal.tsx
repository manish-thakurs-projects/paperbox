import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { VaultFile } from "../types";

interface FileActionModalProps {
  visible: boolean;
  file: VaultFile | null;
  onRequestClose: () => void;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  onOpenMoveModal: () => void;
  onShare: () => void;
  onDelete: () => void;
  onInfo: () => void;
  onRename: (name: string) => void;
  onRemoveFromFolder?: () => void;
}

export function FileActionModal({
  visible,
  file,
  onRequestClose,
  onToggleFavorite,
  onTogglePin,
  onOpenMoveModal,
  onShare,
  onDelete,
  onInfo,
  onRename,
  onRemoveFromFolder,
}: FileActionModalProps) {
  const { colors } = usePaperTheme();
  const s = styles(colors);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!file) {
      setRenameText("");
      return;
    }

    if (!renameVisible) {
      setRenameText(file.name);
    }
  }, [file, renameVisible]);

  useEffect(() => {
    if (!visible) {
      setRenameVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!renameVisible) return;

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [renameVisible]);

  const openRename = () => {
    if (!file) return;
    setRenameText(file.name);
    setRenameVisible(true);
  };

  const saveRename = () => {
    if (!file) return;
    const trimmed = renameText.trim();
    if (trimmed && trimmed !== file.name) {
      onRename(trimmed);
    }
    setRenameVisible(false);
  };

  return (
    <Modal animationType="none" transparent visible={visible} onRequestClose={renameVisible ? () => setRenameVisible(false) : onRequestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.modalOverlay}
        keyboardVerticalOffset={Platform.OS === "ios" ? 70 : 20}
      >
        <Pressable style={renameVisible ? s.renameModalOverlay : s.modalOverlay} onPress={renameVisible ? () => setRenameVisible(false) : onRequestClose}>
          {renameVisible ? (
            <Pressable style={s.renameModalCard} onPress={(event) => event.stopPropagation()}>
              <Text style={s.modalTitle}>Rename file</Text>
              <TextInput
                ref={inputRef}
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Enter new file name"
                placeholderTextColor={colors.secondary}
                style={s.modalInput}
                returnKeyType="done"
                onSubmitEditing={saveRename}
                blurOnSubmit={false}
              />
              <View style={s.modalFooter}>
                <Pressable style={[s.modalActionButton, s.modalCancelButton]} onPress={() => setRenameVisible(false)}>
                  <Text style={s.modalActionText}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.modalActionButton, s.modalSaveButton]} onPress={saveRename}>
                  <Text style={[s.modalActionText, s.modalSaveText]}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          ) : (
            <Pressable style={s.modalContent} onPress={(event) => event.stopPropagation()}>
              <Text style={s.modalTitle}>File actions</Text>
              {file ? (
                <>
                  <Text numberOfLines={1} style={s.modalFileName}>
                    {file.name}
                  </Text>
                  <ScrollView style={s.modalActions} keyboardShouldPersistTaps="handled">
                    <Pressable style={s.actionItem} onPress={onInfo}>
                      <Text style={s.actionLabel}>Info</Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={openRename}>
                      <Text style={s.actionLabel}>Rename file</Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onToggleFavorite}>
                      <Text style={s.actionLabel}>
                        {file.isFavorite ? "Remove favorite" : "Add to favorites"}
                      </Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onTogglePin}>
                      <Text style={s.actionLabel}>{file.isPinned ? "Unpin" : "Pin"}</Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onOpenMoveModal}>
                      <Text style={s.actionLabel}>Move to folders</Text>
                    </Pressable>
                    {onRemoveFromFolder ? (
                      <Pressable style={s.actionItem} onPress={onRemoveFromFolder}>
                        <Text style={s.actionLabel}>Remove from folder</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={s.actionItem} onPress={onShare}>
                      <Text style={s.actionLabel}>Share</Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onDelete}>
                      <Text style={[s.actionLabel, s.destructiveAction]}>Delete from vault</Text>
                    </Pressable>
                  </ScrollView>
                  <Pressable style={[s.modalButton, s.modalCancelButton]} onPress={onRequestClose}>
                    <Text style={[s.modalButtonText, s.modalCancelText]}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={s.modalEmpty}>Unable to load file actions.</Text>
              )}
            </Pressable>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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
  accent: string;
  destructive: string;
}) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: withAlpha(c.text, 0.38),
    },
    renameModalOverlay: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 24,
      backgroundColor: withAlpha(c.text, 0.38),
    },
    modalContent: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      maxHeight: "80%",
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.text,
      marginBottom: 12,
    },
    modalFileName: {
      color: c.secondary,
      marginBottom: 12,
    },
    modalActions: {
      marginBottom: 16,
    },
    actionItem: {
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    actionLabel: {
      color: c.text,
      fontSize: 16,
    },
    destructiveAction: {
      color: c.destructive,
    },
    modalButton: {
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 8,
    },
    modalButtonText: {
      color: c.text,
      fontWeight: "700",
    },
    modalCancelButton: {
      backgroundColor: c.background,
    },
    modalCancelText: {
      color: c.text,
    },
    modalEmpty: {
      color: c.secondary,
      fontSize: 14,
      textAlign: "center",
      paddingVertical: 16,
    },
    renameModalCard: {
      backgroundColor: c.surface,
      borderRadius: 24,
      padding: 20,
      marginHorizontal: 20,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      marginBottom: 16,
      backgroundColor: c.background,
    },
    modalFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
    },
    modalActionButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalSaveButton: {
      backgroundColor: c.inverse,
      borderColor: c.inverse,
    },
    modalActionText: {
      color: c.text,
      fontWeight: "700",
    },
    modalSaveText: {
      color: c.background,
    },
  });
