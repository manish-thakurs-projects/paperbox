import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { Folder } from "../types";

interface FolderMoveModalProps {
  visible: boolean;
  folders: Folder[];
  selectedFolderIds: string[];
  onRequestClose: () => void;
  onToggleFolder: (folderId: string) => void;
  onSave: () => void;
}

export function FolderMoveModal({
  visible,
  folders,
  selectedFolderIds,
  onRequestClose,
  onToggleFolder,
  onSave,
}: FolderMoveModalProps) {
  const { colors } = usePaperTheme();
  const s = styles(colors);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onRequestClose}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Move to folders</Text>
          <Text style={s.modalSubtitle}>
            Select one or more folders for this file.
          </Text>
          <ScrollView
            style={s.modalActions}
            showsVerticalScrollIndicator={false}
          >
            {folders.length ? (
              folders.map((folder) => {
                const selected = selectedFolderIds.includes(folder.id);
                return (
                  <Pressable
                    key={folder.id}
                    style={[s.folderRow, selected && s.folderRowSelected]}
                    onPress={() => onToggleFolder(folder.id)}
                  >
                    <Text style={s.actionLabel}>{folder.name}</Text>
                    <Text style={s.actionLabel}>{selected ? "✓" : "○"}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={s.modalEmpty}>
                Create a folder first to organize this file.
              </Text>
            )}
          </ScrollView>
          <View style={s.modalFooter}>
            <Pressable
              style={[s.modalActionButton, s.modalCancelButton]}
              onPress={onRequestClose}
            >
              <Text style={s.modalActionText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.modalActionButton, s.modalSaveButton]}
              onPress={onSave}
            >
              <Text style={[s.modalActionText, s.modalSaveText]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
}) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
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
    modalSubtitle: {
      color: c.secondary,
      fontSize: 14,
      marginBottom: 16,
      lineHeight: 20,
    },
    modalActions: {
      marginBottom: 16,
    },
    folderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    folderRowSelected: {
      backgroundColor: c.elevated,
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
    modalCancelButton: {
      backgroundColor: c.background,
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
    actionLabel: {
      color: c.text,
      fontSize: 16,
    },
    modalEmpty: {
      color: c.secondary,
      fontSize: 14,
      textAlign: "center",
      paddingVertical: 16,
    },
  });
