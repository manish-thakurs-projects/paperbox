import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { showAlert } from "../services/alertService";

const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { EmptyState } from "../components/EmptyState";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { radius } from "../theme/tokens";
import { usePaperTheme, PaperColors } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { useVaultStore } from "../store/useVaultStore";
import { getFolderIdsForFile } from "../utils/files";
import { shareVaultFile } from "../services/shareService";
import { VaultFile } from "../types";
import { RootStackParams } from "../navigation/types";

const styles = (c: PaperColors) =>
  StyleSheet.create({
    title: {
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1,
      color: c.text,
      marginBottom: 16,
      marginTop: 30,
    },
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
    folderRowSelected: {
      backgroundColor: c.elevated,
    },
    modalFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
    },
    selectionBar: {
      marginBottom: 20,
      padding: 16,
      borderRadius: radius.md,
      backgroundColor: c.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    selectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
      marginBottom: 10,
    },
    selectionActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    selectionActionButton: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: c.surface,
    },
    selectionActionText: {
      color: c.text,
      fontWeight: "700",
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
    modalEmpty: {
      color: c.secondary,
      fontSize: 14,
      textAlign: "center",
      paddingVertical: 16,
    },
  });

export function FavoritesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const s = styles(colors);
  const files = useVaultStore((state) => state.files);
  const folders = useVaultStore((state) => state.folders);
  const toggleFavorite = useVaultStore((state) => state.toggleFavorite);
  const togglePin = useVaultStore((state) => state.togglePin);
  const renameFile = useVaultStore((state) => state.renameFile);
  const setFileFolderMembership = useVaultStore(
    (state) => state.setFileFolderMembership,
  );
  const removeFile = useVaultStore((state) => state.removeFile);

  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [moveVisible, setMoveVisible] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectionMoveMode, setSelectionMoveMode] = useState(false);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(
    null,
  );
  const [confirmDeleteSelectionVisible, setConfirmDeleteSelectionVisible] =
    useState(false);

  const favorites = useMemo(() => files.filter((f) => f.isFavorite), [files]);
  const rowSelectionMode = selectedRowIds.length > 0;
  const actionFile = useMemo(
    () =>
      actionFileId
        ? (files.find((file) => file.id === actionFileId) ?? null)
        : null,
    [actionFileId, files],
  );

  const closeActions = () => {
    setActionsVisible(false);
    setActionFileId(null);
  };

  const toggleRowSelection = (fileId: string) => {
    setSelectedRowIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const clearRowSelection = () => setSelectedRowIds([]);

  const selectAllRows = () =>
    setSelectedRowIds(favorites.map((file) => file.id));

  const deleteSelectedRows = () => {
    if (!selectedRowIds.length) return;
    setConfirmDeleteSelectionVisible(true);
  };

  const confirmDeleteSelectedRows = () => {
    selectedRowIds.forEach((fileId) => removeFile(fileId));
    clearRowSelection();
    setConfirmDeleteSelectionVisible(false);
  };

  const cancelDeleteSelectedRows = () => {
    setConfirmDeleteSelectionVisible(false);
  };

  const openSelectionMoveModal = () => {
    if (!selectedRowIds.length) return;
    if (!folders.length) {
      Alert.alert(
        "No folders available",
        "Create a folder first in the Folders tab, then move files into it.",
      );
      return;
    }

    setSelectedFolderIds([]);
    setSelectionMoveMode(true);
    setMoveVisible(true);
  };

  const handleMoveSelection = () => {
    if (!selectedRowIds.length || !selectedFolderIds.length) {
      setSelectionMoveMode(false);
      setMoveVisible(false);
      return;
    }

    selectedRowIds.forEach((fileId) => {
      setFileFolderMembership(fileId, selectedFolderIds);
    });
    clearRowSelection();
    setSelectionMoveMode(false);
    setMoveVisible(false);
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

  const shareFile = async () => {
    if (!actionFile) return;

    try {
      await shareVaultFile(actionFile);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Sharing not available on this device"
      ) {
        Alert.alert(
          "Sharing not available",
          "This device cannot share files directly.",
        );
      } else {
        Alert.alert("Could not share file", "Try again later.");
      }
    } finally {
      closeActions();
    }
  };

  const openMoveModal = () => {
    if (!folders.length) {
      Alert.alert(
        "No folders available",
        "Create a folder first in the Folders tab, then move files into it.",
      );
      return;
    }
    if (!actionFile) return;
    setSelectedFolderIds(getFolderIdsForFile(actionFile));
    setSelectionMoveMode(false);
    setMoveVisible(true);
    setActionsVisible(false);
  };

  const saveFolderSelection = () => {
    if (!actionFile) return;
    setFileFolderMembership(actionFile.id, selectedFolderIds);
    setSelectionMoveMode(false);
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

  const cancelDeleteFile = () => {
    setConfirmDeleteFileId(null);
  };

  const openFileActions = (file: VaultFile) => {
    setActionFileId(file.id);
    setActionsVisible(true);
  };

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

  const goToPreview = (file: VaultFile) => {
    navigation.navigate("Preview", { fileId: file.id });
  };

  return (
    <Screen>
      <Text style={s.title}>Favorites</Text>
      {rowSelectionMode ? (
        <View style={s.selectionBar}>
          <Text style={s.selectionTitle}>{selectedRowIds.length} selected</Text>
          <View style={s.selectionActions}>
            <Pressable style={s.selectionActionButton} onPress={selectAllRows}>
              <Text style={s.selectionActionText}>Select all</Text>
            </Pressable>
            <Pressable
              style={s.selectionActionButton}
              onPress={clearRowSelection}
            >
              <Text style={s.selectionActionText}>Clear</Text>
            </Pressable>
            <Pressable
              style={s.selectionActionButton}
              onPress={openSelectionMoveModal}
            >
              <Text style={s.selectionActionText}>Move</Text>
            </Pressable>
            <Pressable
              style={s.selectionActionButton}
              onPress={deleteSelectedRows}
            >
              <Text style={s.selectionActionText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {favorites.length > 0 ? (
        favorites.map((f) => (
          <FileRow
            key={f.id}
                file={f}
                selected={selectedRowIds.includes(f.id)}
                selectionMode={rowSelectionMode}
            onPress={() =>
              rowSelectionMode ? toggleRowSelection(f.id) : goToPreview(f)
            }
            onLongPress={() => toggleRowSelection(f.id)}
            onMore={() => openFileActions(f)}
          />
        ))
      ) : (
        <EmptyState
          icon="star"
          title="No favorites yet"
          body="Mark important files as favorites to keep them close."
        />
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
        onDownload={() => {
          closeActions();
        }}
      />
      <FolderMoveModal
        visible={moveVisible}
        folders={folders}
        selectedFolderIds={selectedFolderIds}
        onRequestClose={() => {
          setMoveVisible(false);
          setSelectionMoveMode(false);
        }}
        onToggleFolder={(folderId) =>
          setSelectedFolderIds((current) =>
            current.includes(folderId)
              ? current.filter((id) => id !== folderId)
              : [...current, folderId],
          )
        }
        onSave={selectionMoveMode ? handleMoveSelection : saveFolderSelection}
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
