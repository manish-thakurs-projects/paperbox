import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  PermissionsAndroid,
} from "react-native";
import { showAlert } from "../services/alertService";

// Local themed Alert shim — route Alert.alert calls to our themed alert
const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { VaultFile } from "../types";
import RNFS from "react-native-fs";
import * as FileSystem from "expo-file-system/legacy";
import { decryptVaultFileForUse } from "../services/vaultStorage";
import { downloadFile } from "../services/downloadService";

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
  onDownload?: () => void;
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
  onDownload,
}: FileActionModalProps) {
  const { colors } = usePaperTheme();
  const s = styles(colors);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
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

  // Single Modal instance for both the action sheet and the rename dialog.
  // Switching *content* inside one mounted native Modal (instead of
  // toggling between two separate <Modal> components) avoids the
  // dismiss/present race that caused the glitch when opening rename.
  return (
    <Modal
      animationType={renameVisible ? "fade" : "slide"}
      transparent
      visible={visible}
      onShow={() => {
        if (renameVisible) {
          // Focus only after the dialog has finished presenting, so the
          // keyboard's layout shift doesn't collide with the modal's own
          // entrance animation.
          inputRef.current?.focus();
        }
      }}
      onRequestClose={() => {
        if (renameVisible) {
          setRenameVisible(false);
        } else {
          onRequestClose();
        }
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={renameVisible ? s.renameModalOverlay : s.modalOverlay}
        keyboardVerticalOffset={Platform.OS === "ios" ? 70 : 20}
      >
        <Pressable
          style={renameVisible ? s.renameModalOverlay : s.modalOverlay}
          onPress={() =>
            renameVisible ? setRenameVisible(false) : onRequestClose()
          }
        >
          {renameVisible ? (
            <Pressable
              style={s.renameModalCard}
              onPress={(event) => event.stopPropagation()}
            >
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
                <Pressable
                  style={[s.modalActionButton, s.modalCancelButton]}
                  onPress={() => setRenameVisible(false)}
                >
                  <Text style={s.modalActionText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.modalActionButton, s.modalSaveButton]}
                  onPress={saveRename}
                >
                  <Text style={[s.modalActionText, s.modalSaveText]}>
                    Save
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          ) : (
            <Pressable
              style={s.modalContent}
              onPress={(event) => event.stopPropagation()}
            >
              <Text style={s.modalTitle}>File actions</Text>
              {file ? (
                <>
                  <Text numberOfLines={1} style={s.modalFileName}>
                    {file.name}
                  </Text>
                  <ScrollView
                    style={s.modalActions}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Pressable style={s.actionItem} onPress={onInfo}>
                      <Text style={s.actionLabel}>Info</Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={openRename}>
                      <Text style={s.actionLabel}>Rename file</Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onToggleFavorite}>
                      <Text style={s.actionLabel}>
                        {file.isFavorite
                          ? "Remove favorite"
                          : "Add to favorites"}
                      </Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onTogglePin}>
                      <Text style={s.actionLabel}>
                        {file.isPinned ? "Unpin" : "Pin"}
                      </Text>
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onOpenMoveModal}>
                      <Text style={s.actionLabel}>Move to folders</Text>
                    </Pressable>
                    {onRemoveFromFolder ? (
                      <Pressable
                        style={s.actionItem}
                        onPress={onRemoveFromFolder}
                      >
                        <Text style={s.actionLabel}>Remove from folder</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={s.actionItem}
                      onPress={async () => {
                        if (!onShare) return;
                        try {
                          setShareLoading(true);
                          await onShare();
                        } catch (e) {
                          // caller handles errors
                        } finally {
                          setShareLoading(false);
                        }
                      }}
                    >
                      {shareLoading ? (
                        <>
                          <ActivityIndicator size="small" color={colors.text} />
                          <Text style={[s.actionLabel, { marginLeft: 8 }]}>
                            Decrypting...
                          </Text>
                        </>
                      ) : (
                        <Text style={s.actionLabel}>Share</Text>
                      )}
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onDelete}>
                      <Text style={[s.actionLabel, s.destructiveAction]}>
                        Delete from vault
                      </Text>
                    </Pressable>

                    <Pressable
                      style={s.actionItem}
                      onPress={async () => {
                        if (!file) return;
                        setDownloadLoading(true);
                        try {
                          const saved = await downloadFile(file);
                          Alert.alert("Download complete", `Saved to ${saved}`);
                          try {
                            onDownload && onDownload();
                          } catch (_) {}
                        } catch (e: any) {
                          if (
                            e &&
                            typeof e.message === "string" &&
                            e.message.includes("No folder selected")
                          ) {
                            Alert.alert(
                              "Download cancelled",
                              "No folder selected for saving files.",
                            );
                          } else if (e && typeof e.message === "string") {
                            Alert.alert("Download failed", e.message);
                          } else {
                            Alert.alert(
                              "Download failed",
                              "Unable to save file to device.",
                            );
                          }
                        } finally {
                          setDownloadLoading(false);
                          onRequestClose();
                        }
                      }}
                    >
                      {downloadLoading ? (
                        <>
                          <ActivityIndicator size="small" color={colors.text} />
                          <Text style={[s.actionLabel, { marginLeft: 8 }]}>
                            Decrypting...
                          </Text>
                        </>
                      ) : (
                        <Text style={s.actionLabel}>Download file</Text>
                      )}
                    </Pressable>
                  </ScrollView>
                  <Pressable
                    style={[s.modalButton, s.modalCancelButton]}
                    onPress={onRequestClose}
                  >
                    <Text style={[s.modalButtonText, s.modalCancelText]}>
                      Cancel
                    </Text>
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
      backgroundColor: withAlpha(c.text, 0.01),
    },
    renameModalOverlay: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 20,
      paddingVertical: 24,
      backgroundColor: withAlpha(c.text, 0.01),
    },
    modalContent: {
      borderWidth: 1,
      borderColor: withAlpha(c.text, 0.2),
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