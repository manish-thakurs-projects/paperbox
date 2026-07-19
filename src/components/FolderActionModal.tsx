import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePaperTheme, PaperColors } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { Folder } from "../types";

interface FolderActionModalProps {
  visible: boolean;
  folder: Folder | null;
  onRequestClose: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

export function FolderActionModal({
  visible,
  folder,
  onRequestClose,
  onTogglePin,
  onDelete,
  onRename,
}: FolderActionModalProps) {
  const { colors } = usePaperTheme();
  const s = styles(colors);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");

  useEffect(() => {
    setRenameText(folder?.name || "");
  }, [folder]);

  useEffect(() => {
    if (!visible) {
      setRenameVisible(false);
    }
  }, [visible]);

  const openRename = () => {
    if (!folder) return;
    setRenameText(folder.name);
    setRenameVisible(true);
  };

  const handleRename = () => {
    if (!renameText.trim()) {
      Alert.alert("Error", "Folder name cannot be empty.");
      return;
    }
    onRename(renameText.trim());
    setRenameVisible(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete folder?", "This will remove the folder. Files inside will remain.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  };

  if (renameVisible) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={s.overlay}
        >
          <Pressable style={s.overlay} onPress={() => setRenameVisible(false)}>
            <Pressable style={s.modal} onPress={(e) => e.stopPropagation()}>
              <Text style={s.modalTitle}>Rename Folder</Text>
              <TextInput
                style={s.input}
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Folder name"
                placeholderTextColor={colors.secondary}
                autoFocus
              />
              <View style={s.footer}>
                <Pressable
                  style={[s.button, s.cancelButton]}
                  onPress={() => setRenameVisible(false)}
                >
                  <Text style={[s.buttonText, s.cancelText]}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.button, s.saveButton]} onPress={handleRename}>
                  <Text style={[s.buttonText, s.saveText]}>Rename</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={s.overlay} onPress={onRequestClose}>
        <Pressable style={s.modal} onPress={(e) => e.stopPropagation()}>
          <View style={s.header}>
            <Text style={s.modalTitle}>{folder?.name}</Text>
            <Pressable onPress={onRequestClose}>
              <Feather name="x" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={s.actions}>
            <Pressable style={s.action} onPress={openRename}>
              <Feather name="edit-2" size={18} color={colors.text} />
              <Text style={s.actionLabel}>Rename</Text>
            </Pressable>
            <Pressable style={s.action} onPress={onTogglePin}>
              <Feather name={folder?.isPinned ? "bookmark" : "bookmark"} size={18} color={colors.text} />
              <Text style={s.actionLabel}>{folder?.isPinned ? "Unpin" : "Pin"}</Text>
            </Pressable>
            <Pressable style={[s.action, s.destructive]} onPress={handleDelete}>
              <Feather name="trash-2" size={18} color={colors.destructive} />
              <Text style={[s.actionLabel, s.destructiveText]}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (c: PaperColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: withAlpha(c.text, 0.25),
      justifyContent: "flex-end",
    },
    modal: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 32,
      paddingTop: 16,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: 18,
      paddingVertical: 8,
      paddingHorizontal: 16,
      fontWeight: "700",
      color: c.text,
    },
    actions: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    action: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    actionLabel: {
      fontSize: 16,
      fontWeight: "500",
      color: c.text,
    },
    destructive: {
      borderBottomWidth: 0,
    },
    destructiveText: {
      color: c.destructive,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginHorizontal: 20,
      marginBottom: 16,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.elevated,
    },
    footer: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
      marginTop: 16,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelButton: {
      backgroundColor: c.elevated,
    },
    saveButton: {
      backgroundColor: c.inverse,
      borderColor: c.inverse,
    },
    buttonText: {
      fontWeight: "700",
      fontSize: 16,
    },
    cancelText: {
      color: c.text,
    },
    saveText: {
      color: c.background,
    },
  });
