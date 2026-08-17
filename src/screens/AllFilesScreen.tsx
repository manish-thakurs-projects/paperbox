import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
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
import { VaultFile } from "../types";
import { StyleSheet, TouchableOpacity } from "react-native";

export function AllFilesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const styles = getStyles(colors);

  const files = useVaultStore((s) => s.files);
  const folders = useVaultStore((s) => s.folders);
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite);
  const togglePin = useVaultStore((s) => s.togglePin);
  const renameFile = useVaultStore((s) => s.renameFile);
  const setFileFolderMembership = useVaultStore(
    (s) => s.setFileFolderMembership,
  );
  const removeFile = useVaultStore((s) => s.removeFile);

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

  const actionFile = useMemo(
    () =>
      actionFileId ? (files.find((f) => f.id === actionFileId) ?? null) : null,
    [files, actionFileId],
  );

  const allFiles = useMemo(
    () =>
      [...files].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [files],
  );

  const openFileActions = (file: VaultFile) => {
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
    if (!actionFile) return;
    setSelectedFolderIds(getFolderIdsForFile(actionFile));
    setMoveVisible(true);
    setActionsVisible(false);
  };

  const saveFolderSelection = () => {
    if (!actionFile) return;
    setFileFolderMembership(actionFile.id, selectedFolderIds);
    setMoveVisible(false);
  };

  const deleteFile = () => {
    if (!actionFile) return;
    setConfirmDeleteFileId(actionFile.id);
  };

  const confirmDeleteFile = () => {
    if (!confirmDeleteFileId) return;
    removeFile(confirmDeleteFileId);
    closeActions();
    setConfirmDeleteFileId(null);
  };

  const cancelDeleteFile = () => setConfirmDeleteFileId(null);

  const renameFileAction = (name: string) => {
    if (!actionFile) return;
    renameFile(actionFile.id, name);
    closeActions();
  };

  const goToInfo = () => {
    if (!actionFile) return;
    closeActions();
    navigation.navigate("FileDetail", { fileId: actionFile.id });
  };

  const shareFile = async () => {
    if (!actionFile) return;
    try {
      await shareVaultFile(actionFile);
    } catch (error) {
      console.warn("shareFile error", error);
    } finally {
      closeActions();
    }
  };

  const toggleFavoriteState = () => {
    if (!actionFile) return;
    toggleFavorite(actionFile.id);
    closeActions();
  };

  const togglePinState = () => {
    if (!actionFile) return;
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
  const selectAllFiles = () => setSelectedRowIds(allFiles.map((f) => f.id));
  const deleteSelectedRows = () => setConfirmDeleteSelectionVisible(true);
  const confirmDeleteSelectedRows = () => {
    selectedRowIds.forEach((fileId) => removeFile(fileId));
    clearRowSelection();
    setConfirmDeleteSelectionVisible(false);
  };
  const cancelDeleteSelectedRows = () =>
    setConfirmDeleteSelectionVisible(false);
  const openSelectionMoveModal = () => {
    if (!folders.length) return;
    if (!selectedRowIds.length) return;
    setSelectedFolderIds([]);
    setMoveVisible(true);
  };
  const handleMoveSelection = () => {
    if (!selectedRowIds.length || !selectedFolderIds.length) {
      setMoveVisible(false);
      return;
    }
    selectedRowIds.forEach((fileId) =>
      setFileFolderMembership(fileId, selectedFolderIds),
    );
    clearRowSelection();
    setMoveVisible(false);
  };

  return (
    <Screen style={styles.screen}>
      {allFiles.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <EmptyState
            icon="folder"
            title="No files"
            body="Add files by scanning or importing to see them here."
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

          {allFiles.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              selected={selectedRowIds.includes(file.id)}
              onPress={() =>
                rowSelectionMode
                  ? toggleRowSelection(file.id)
                  : navigation.navigate("Preview", { fileId: file.id })
              }
              onLongPress={() => toggleRowSelection(file.id)}
              onMore={() => openFileActions(file)}
            />
          ))}
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
        onDownload={() => { closeActions(); }}
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
    screen: { flexGrow: 1, padding: 20, backgroundColor: c.background },

    list: { overflow: "hidden" },
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
