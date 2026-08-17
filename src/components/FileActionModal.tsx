import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator, Alert, PermissionsAndroid } from "react-native";
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { VaultFile } from "../types";
import RNFS from 'react-native-fs';
import * as FileSystem from 'expo-file-system/legacy';
import { decryptVaultFileForUse } from "../services/vaultStorage";

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
                          <Text style={[s.actionLabel, { marginLeft: 8 }]}>Decrypting...</Text>
                        </>
                      ) : (
                        <Text style={s.actionLabel}>Share</Text>
                      )}
                    </Pressable>
                    <Pressable style={s.actionItem} onPress={onDelete}>
                      <Text style={[s.actionLabel, s.destructiveAction]}>Delete from vault</Text>
                    </Pressable>

                    <Pressable style={s.actionItem} onPress={async () => {
                      if (!file) return;
                      try {
                        // Decrypt or stage file into app cache first
                        const extension = file.extension || (file.mimeType ? file.mimeType.split('/').pop() : 'bin');
                        const filename = file.name || `file.${extension}`;
                        let sourceUri = file.uri;

                        if (sourceUri.endsWith('.enc') || sourceUri.includes('.enc?')) {
                          try {
                            const decrypted = await decryptVaultFileForUse(file);
                            sourceUri = decrypted;
                          } catch (e) {
                            console.debug('FileActionModal: decrypt for download failed', e);
                            Alert.alert('Download failed', 'Unable to decrypt the file for download.');
                            return;
                          }
                        }

                        // If content://, try to copy into a file:// cache so RNFS can access
                        if (Platform.OS === 'android' && sourceUri.startsWith('content://')) {
                          try {
                            const fsAny = FileSystem as any;
                            const cacheDir = (fsAny as any).cacheDirectory || (fsAny as any).documentDirectory || '';
                            const dest = `${cacheDir}${filename}`;
                            try {
                              await fsAny.copyAsync({ from: sourceUri, to: dest });
                              sourceUri = dest;
                            } catch (copyErr) {
                              // try base64 fallback
                              try {
                                const base64 = await fsAny.readAsStringAsync(sourceUri, { encoding: fsAny.EncodingType.Base64 });
                                await fsAny.writeAsStringAsync(dest, base64, { encoding: fsAny.EncodingType.Base64 });
                                sourceUri = dest;
                              } catch (b64Err) {
                                console.debug('FileActionModal: staging content URI failed', copyErr, b64Err);
                              }
                            }
                          } catch (e) {
                            console.debug('FileActionModal: content:// staging failed', e);
                          }
                        }

                        // Now copy to Downloads (Android) or Documents (iOS)
                        const srcPath = sourceUri.startsWith('file://') ? sourceUri.replace('file://', '') : sourceUri;
                        if (Platform.OS === 'android') {
                          try {
                            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
                            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                              Alert.alert('Permission required', 'Storage permission is required to save files to your device.');
                              return;
                            }
                          } catch (permErr) {
                            console.debug('FileActionModal: permission request failed', permErr);
                          }

                          const downloads = (RNFS as any).DownloadDirectoryPath || ((RNFS as any).ExternalStorageDirectoryPath ? `${(RNFS as any).ExternalStorageDirectoryPath}/Download` : null);
                          if (!downloads) {
                            Alert.alert('Download failed', 'No Downloads directory available on this device.');
                            return;
                          }

                          const destPath = `${downloads}/${filename}`;
                          try {
                            await RNFS.copyFile(srcPath, destPath);
                            Alert.alert('Download complete', `Saved to ${destPath}`);
                            try { onDownload && onDownload(); } catch(_){}
                          } catch (copyErr) {
                            console.debug('FileActionModal: RNFS.copyFile failed, falling back to base64 method', copyErr);
                            try {
                              const base64 = await (FileSystem as any).readAsStringAsync(sourceUri, { encoding: (FileSystem as any).EncodingType.Base64 });
                              await RNFS.writeFile(destPath, base64, 'base64');
                              Alert.alert('Download complete', `Saved to ${destPath}`);
                              try { onDownload && onDownload(); } catch(_){}
                            } catch (e) {
                              console.debug('FileActionModal: download failed', e);
                              Alert.alert('Download failed', 'Unable to save file to Downloads.');
                            }
                          }
                        } else {
                          // iOS: write to DocumentDirectoryPath
                          const dest = `${(RNFS as any).DocumentDirectoryPath}/${filename}`;
                          try {
                            await RNFS.copyFile(srcPath, dest);
                            Alert.alert('Download complete', `Saved to ${dest}`);
                            try { onDownload && onDownload(); } catch(_){}
                          } catch (e) {
                            try {
                              const base64 = await (FileSystem as any).readAsStringAsync(sourceUri, { encoding: (FileSystem as any).EncodingType.Base64 });
                              await RNFS.writeFile(dest, base64, 'base64');
                              Alert.alert('Download complete', `Saved to ${dest}`);
                              try { onDownload && onDownload(); } catch(_){}
                            } catch (err) {
                              console.debug('FileActionModal: iOS download failed', err);
                              Alert.alert('Download failed', 'Unable to save file to documents.');
                            }
                          }
                        }

                      } catch (e) {
                        console.debug('FileActionModal: download action failed', e);
                        Alert.alert('Download failed', 'An unexpected error occurred while saving the file.');
                      } finally {
                        onRequestClose();
                      }
                    }}>
                      <Text style={s.actionLabel}>Download file</Text>
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
