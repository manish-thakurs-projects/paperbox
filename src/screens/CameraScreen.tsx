import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { usePaperTheme } from "../theme/usePaperTheme";
import { shareVaultFile } from "../services/shareService";
import { useVaultStore } from "../store/useVaultStore";
import { getFolderIdsForFile } from "../utils/files";
import { RootStackParams } from "../navigation/types";
import { VaultFile } from "../types";

export function CameraScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const styles = getStyles(colors);
  const files = useVaultStore((state) => state.files);
  const folders = useVaultStore((state) => state.folders);
  const toggleFavorite = useVaultStore((state) => state.toggleFavorite);
  const togglePin = useVaultStore((state) => state.togglePin);
  const renameFile = useVaultStore((state) => state.renameFile);
  const setFileFolderMembership = useVaultStore((state) => state.setFileFolderMembership);
  const removeFile = useVaultStore((state) => state.removeFile);

  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [moveVisible, setMoveVisible] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null);
  const [confirmDeleteSelectionVisible, setConfirmDeleteSelectionVisible] = useState(false);

  const actionFile = useMemo(
    () => (actionFileId ? files.find((file) => file.id === actionFileId) ?? null : null),
    [files, actionFileId]
  );

  const recentFiles = useMemo(
    () =>
      [...files]
        .filter((file) => file.source === "camera")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
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
      Alert.alert(
        "No folders available",
        "Create a folder first in the Folders tab, then move files into it.",
      );
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

  const cancelDeleteFile = () => {
    setConfirmDeleteFileId(null);
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

  const shareFile = async () => {
    if (!actionFile) return;

    try {
      await shareVaultFile(actionFile);
    } catch (error) {
      if (error instanceof Error && error.message === "Sharing not available on this device") {
        Alert.alert(
          "Sharing not available",
          "This device cannot share files directly.",
        );
      } else {
        console.warn("shareFile error", error);
        Alert.alert("Could not share file", "Try again later.");
      }
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

  const selectAllFiles = () => setSelectedRowIds(recentFiles.map((file) => file.id));

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
    if (!folders.length) {
      Alert.alert(
        "No folders available",
        "Create a folder first in the Folders tab, then move files into it.",
      );
      return;
    }

    if (!selectedRowIds.length) return;
    setSelectedFolderIds([]);
    setMoveVisible(true);
  };

  const handleMoveSelection = () => {
    if (!selectedRowIds.length || !selectedFolderIds.length) {
      setMoveVisible(false);
      return;
    }

    selectedRowIds.forEach((fileId) => {
      setFileFolderMembership(fileId, selectedFolderIds);
    });
    clearRowSelection();
    setMoveVisible(false);
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Camera</Text>
        <Text style={styles.subtitle}>Choose how you want to scan documents.</Text>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => navigation.navigate("CameraCapture", { mode: "photo" })}
        >
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Feather name="camera" size={18} color={colors.text} style={{marginRight: 10}} />
            <Text style={styles.optionText}>Take picture</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => navigation.navigate("CameraCapture", { mode: "pdf" })}
        >
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Feather name="file-text" size={18} color={colors.text} style={{marginRight: 10}} />
            <Text style={styles.optionText}>Create PDF</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.recentSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent captures</Text>
        </View>

        {recentFiles.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <EmptyState
              icon="clock"
              title="No recent captures"
              body="Your latest scanned files will appear here as soon as you capture them."
            />
          </View>
        ) : (
          <View style={styles.recentList}>
            {rowSelectionMode ? (
              <View style={styles.selectionBar}>
                <Text style={styles.selectionTitle}>{selectedRowIds.length} selected</Text>
                <View style={styles.selectionActions}>
                  <TouchableOpacity style={styles.selectionActionButton} onPress={selectAllFiles}>
                    <Text style={styles.selectionActionText}>Select all</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.selectionActionButton} onPress={clearRowSelection}>
                    <Text style={styles.selectionActionText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.selectionActionButton} onPress={openSelectionMoveModal}>
                    <Text style={styles.selectionActionText}>Move</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.selectionActionButton} onPress={deleteSelectedRows}>
                    <Text style={styles.selectionActionText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {recentFiles.map((file) => (
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
      </View>

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
        message="This only removes it from Paper Box."
        confirmText="Delete"
        destructive
        onConfirm={confirmDeleteFile}
        onCancel={cancelDeleteFile}
      />
      <ConfirmDialog
        visible={confirmDeleteSelectionVisible}
        title="Delete selected files?"
        message="This will remove the selected files from Paper Box."
        confirmText="Delete"
        destructive
        onConfirm={confirmDeleteSelectedRows}
        onCancel={cancelDeleteSelectedRows}
      />
    </Screen>
  );
}

const getStyles = (c: {
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
    screen: {
      flexGrow: 1,
      padding: 20,
      backgroundColor: c.background,
    },
    header: {
      marginTop: 30,
      marginBottom: 24,
    },
    title: {
      color: c.text,
      fontSize: 32,
      fontWeight: "800",
      marginBottom: 8,
    },
    subtitle: {
      color: c.secondary,
      fontSize: 16,
      lineHeight: 22,
      maxWidth: "90%",
    },
    buttonGroup: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexDirection: "row",
      flexWrap: "wrap",
    },
    optionButton: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginBottom: 16,
      minWidth: "47%",  
    },
    optionText: {
      color: c.text,
      fontSize: 17,
      fontWeight: "700",
    },
    recentSection: {
      marginTop: 32,
    },
    sectionHeader: {
      marginBottom: 18,
    },
    sectionTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 6,
    },
    sectionDescription: {
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      maxWidth: "92%",
    },
    recentList: {
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
    selectionActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    selectionActionButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: c.elevated,
    },
    selectionActionText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 13,
    },
  });
