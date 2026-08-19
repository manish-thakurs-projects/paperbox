import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { showAlert } from "../services/alertService";

const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { EmptyState } from "../components/EmptyState";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { usePaperTheme } from "../theme/usePaperTheme";
import { useVaultStore } from "../store/useVaultStore";
import { shareVaultFile } from "../services/shareService";
import { getFolderIdsForFile } from "../utils/files";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParams } from "../navigation/types";
import { PdfDraft, VaultFile } from "../types";
import { StyleSheet, TouchableOpacity } from "react-native";

export function CapturedFilesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const styles = getStyles(colors);

  const files = useVaultStore((s) => s.files);
  const folders = useVaultStore((s) => s.folders);
  const drafts = useVaultStore((s) => s.drafts);
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite);
  const togglePin = useVaultStore((s) => s.togglePin);
  const renameFile = useVaultStore((s) => s.renameFile);
  const setFileFolderMembership = useVaultStore(
    (s) => s.setFileFolderMembership,
  );
  const removeFile = useVaultStore((s) => s.removeFile);
  const deletePdfDraft = useVaultStore((s) => s.deletePdfDraft);
  const renamePdfDraft = useVaultStore((s) => s.renamePdfDraft);

  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [moveVisible, setMoveVisible] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(
    null,
  );
  const [confirmDeleteSelectionVisible, setConfirmDeleteSelectionVisible] =
    useState(false);

  const actionFile = useMemo<VaultFile | PdfDraft | null>(
    () =>
      actionFileId
        ? (files.find((f) => f.id === actionFileId) ??
          drafts.find((draft) => draft.id === actionFileId) ??
          null)
        : null,
    [files, drafts, actionFileId],
  );

  const capturedFiles = useMemo(
    () =>
      [
        ...files.filter((file) => file.source === "camera"),
        ...drafts,
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [files, drafts],
  );

  const openFileActions = (file: VaultFile | PdfDraft) => {
    setActionFileId(file.id);
    setActionsVisible(true);
  };
  const closeActions = () => {
    setActionsVisible(false);
    setActionFileId(null);
  };

  const openMoveModal = () => {
    if (!folders.length) {
      setMoveVisible(false);
      return;
    }
    if (!actionFile || "pages" in actionFile) return;
    setSelectedFolderIds(getFolderIdsForFile(actionFile));
    setMoveVisible(true);
    setActionsVisible(false);
  };

  const saveFolderSelection = () => {
    if (!actionFile || "pages" in actionFile) return;
    setFileFolderMembership(actionFile.id, selectedFolderIds);
    setMoveVisible(false);
  };

  const deleteFile = () => {
    if (!actionFile) return;
    setConfirmDeleteFileId(actionFile.id);
  };

  const confirmDeleteFile = () => {
    if (!confirmDeleteFileId) return;
    if (drafts.some((draft) => draft.id === confirmDeleteFileId)) {
      void deletePdfDraft(confirmDeleteFileId);
    } else {
      void removeFile(confirmDeleteFileId);
    }
    closeActions();
    setConfirmDeleteFileId(null);
  };

  const cancelDeleteFile = () => setConfirmDeleteFileId(null);

  const renameFileAction = (name: string) => {
    if (!actionFile) return;
    if ("pages" in actionFile) {
      renamePdfDraft(actionFile.id, name);
    } else {
      renameFile(actionFile.id, name);
    }
    closeActions();
  };

  const goToInfo = () => {
    if (!actionFile) return;
    closeActions();
    if ("pages" in actionFile) {
      Alert.alert(
        "Draft details",
        `${actionFile.pages.length} page${actionFile.pages.length === 1 ? "" : "s"} ready to review.`,
      );
    } else {
      navigation.navigate("FileDetail", { fileId: actionFile.id });
    }
  };

  const openDraft = () => {
    if (!actionFile || !("pages" in actionFile)) return;
    const draftId = actionFile.id;
    closeActions();
    navigation.navigate("PdfReview", { draftId });
  };

  const shareFile = async () => {
    if (!actionFile || "pages" in actionFile) return;
    try {
      await shareVaultFile(actionFile);
    } catch (error) {
    } finally {
      closeActions();
    }
  };

  const toggleFavoriteState = () => {
    if (!actionFile || "pages" in actionFile) return;
    toggleFavorite(actionFile.id);
    closeActions();
  };

  const togglePinState = () => {
    if (!actionFile || "pages" in actionFile) return;
    togglePin(actionFile.id);
    closeActions();
  };

  const rowSelectionMode = selectedRowIds.length > 0;

  const toggleRowSelection = (fileId: string) => {
    setSelectedRowIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const clearRowSelection = () => setSelectedRowIds([]);
  const selectAllFiles = () =>
    setSelectedRowIds(
      capturedFiles.map((item) => item.id),
    );
  const deleteSelectedRows = () => setConfirmDeleteSelectionVisible(true);
  const confirmDeleteSelectedRows = () => {
    selectedRowIds.forEach((fileId) => {
      if (drafts.some((draft) => draft.id === fileId)) {
        void deletePdfDraft(fileId);
      } else {
        void removeFile(fileId);
      }
    });
    clearRowSelection();
    setConfirmDeleteSelectionVisible(false);
  };
  const cancelDeleteSelectedRows = () =>
    setConfirmDeleteSelectionVisible(false);
  const openSelectionMoveModal = () => {
    if (!selectedRowIds.length) return;
    if (!selectedRowIds.some((id) => files.some((file) => file.id === id))) {
      Alert.alert(
        "Nothing to move",
        "PDF drafts can be opened, renamed, or deleted after selection.",
      );
      return;
    }
    if (!folders.length) return;
    setSelectedFolderIds([]);
    setMoveVisible(true);
  };
  const handleMoveSelection = () => {
    if (!selectedRowIds.length || !selectedFolderIds.length) {
      setMoveVisible(false);
      return;
    }
    selectedRowIds.forEach((fileId) => {
      if (files.some((file) => file.id === fileId)) {
        setFileFolderMembership(fileId, selectedFolderIds);
      }
    });
    clearRowSelection();
    setMoveVisible(false);
  };

  return (
    <Screen style={styles.screen}>
      {capturedFiles.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <EmptyState
            icon="camera"
            title="No captures"
            body="Files captured from the app will appear here."
          />
        </View>
      ) : (
        <View style={styles.list}>
          {rowSelectionMode ? (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionTitle}>
                {selectedRowIds.length} selected
              </Text>
              <View style={styles.selectionActions}>
                <TouchableOpacity
                  style={styles.selectionActionButton}
                  onPress={selectAllFiles}
                >
                  <Text style={styles.selectionActionText}>Select all</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.selectionActionButton}
                  onPress={clearRowSelection}
                >
                  <Text style={styles.selectionActionText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.selectionActionButton}
                  onPress={openSelectionMoveModal}
                >
                  <Text style={styles.selectionActionText}>Move</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.selectionActionButton}
                  onPress={deleteSelectedRows}
                >
                  <Text style={styles.selectionActionText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {capturedFiles.map((item) => {
            const isDraft = "pages" in item;
            return (
              <FileRow
                key={item.id}
                file={item}
                selected={selectedRowIds.includes(item.id)}
                selectionMode={rowSelectionMode}
                onPress={() =>
                    rowSelectionMode
                      ? toggleRowSelection(item.id)
                      : isDraft
                        ? navigation.navigate("PdfReview", { draftId: item.id })
                        : navigation.navigate("Preview", { fileId: item.id })
                }
                onLongPress={() => toggleRowSelection(item.id)}
                onMore={() => openFileActions(item)}
              />
            );
          })}
        </View>
      )}

      <FileActionModal
        visible={actionsVisible}
        file={actionFile}
        onRequestClose={closeActions}
        onRename={renameFileAction}
        onToggleFavorite={toggleFavoriteState}
        onTogglePin={togglePinState}
        onOpenMoveModal={openMoveModal}
        onShare={shareFile}
        onDelete={deleteFile}
        onInfo={goToInfo}
        onOpenDraft={openDraft}
        onDownload={() => {
          closeActions();
        }}
      />

      <FolderMoveModal
        visible={moveVisible}
        folders={folders}
        selectedFolderIds={selectedFolderIds}
        onRequestClose={() => setMoveVisible(false)}
        onToggleFolder={(folderId) =>
          setSelectedFolderIds((current) =>
            current.includes(folderId)
              ? current.filter((id) => id !== folderId)
              : [...current, folderId],
          )
        }
        onSave={rowSelectionMode ? handleMoveSelection : saveFolderSelection}
      />

      <ConfirmDialog
        visible={!!confirmDeleteFileId}
        title="Delete this file?"
        message="This only removes it from PaperBox."
        confirmText="Delete"
        destructive
        onConfirm={confirmDeleteFile}
        onCancel={cancelDeleteFile}
      />

      <ConfirmDialog
        visible={confirmDeleteSelectionVisible}
        title="Delete selected files?"
        message="This will remove the selected files from PaperBox."
        confirmText="Delete"
        destructive
        onConfirm={confirmDeleteSelectedRows}
        onCancel={cancelDeleteSelectedRows}
      />
    </Screen>
  );
}

const getStyles = (c: any) =>
  StyleSheet.create({
    screen: {
      flexGrow: 1,
      padding: 20,
      backgroundColor: c.background,
    },

    list: {
      overflow: "hidden",
    },
    emptyStateContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 40,
    },
    selectionBar: {
      marginBottom: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    selectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
      marginBottom: 8,
    },
    selectionActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    selectionActionButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: c.elevated,
    },
    selectionActionText: { color: c.text, fontWeight: "700", fontSize: 13 },
  });
