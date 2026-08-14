import React from "react";
import { Feather } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParams } from "../navigation/types";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { EmptyState } from "../components/EmptyState";
import { radius } from "../theme/tokens";
import { PaperColors, usePaperTheme } from "../theme/usePaperTheme";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useVaultStore } from "../store/useVaultStore";
import { pickFiles } from "../services/importService";
import { fileSize, getFolderIdsForFile } from "../utils/files";
import { shareVaultFile } from "../services/shareService";
import { VaultFile } from "../types";

export function HomeScreen() {
  const navigation =
      useNavigation<NativeStackNavigationProp<RootStackParams>>(),
    { colors } = usePaperTheme(),
    s = styles(colors),
    files = useVaultStore((x) => x.files),
    folders = useVaultStore((x) => x.folders),
    addFiles = useVaultStore((x) => x.addFiles),
    toggleFavorite = useVaultStore((x) => x.toggleFavorite),
    togglePin = useVaultStore((x) => x.togglePin),
    renameFile = useVaultStore((x) => x.renameFile),
    setFileFolderMembership = useVaultStore((x) => x.setFileFolderMembership),
    removeFile = useVaultStore((x) => x.removeFile);

  const [actionFileId, setActionFileId] = React.useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = React.useState(false);
  const [moveVisible, setMoveVisible] = React.useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = React.useState<string[]>(
    [],
  );
  const [selectedRowIds, setSelectedRowIds] = React.useState<string[]>([]);
  const [isSelectionMove, setIsSelectionMove] = React.useState(false);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = React.useState<
    string | null
  >(null);
  const [confirmDeleteSelectionVisible, setConfirmDeleteSelectionVisible] =
    React.useState(false);

  const actionFile = React.useMemo(
    () =>
      actionFileId
        ? (files.find((file) => file.id === actionFileId) ?? null)
        : null,
    [files, actionFileId],
  );

  const upload = async () => {
    try {
      addFiles(await pickFiles());
    } catch {
      Alert.alert("Could not import", "Try selecting the files again.");
    }
  };

  const goToSearch = () => navigation.navigate("Search");

  const recent = files.slice(0, 5),
    used = files.reduce((n, f) => n + f.size, 0),
    visibleFiles = recent;

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
    setIsSelectionMove(false);
    setMoveVisible(false);
  };

  const deleteFile = () => {
    if (!actionFile) return;
    setConfirmDeleteFileId(actionFile.id);
  };

  const confirmDeleteFile = () => {
    if (!actionFile || !confirmDeleteFileId) return;
    removeFile(confirmDeleteFileId);
    closeActions();
    setConfirmDeleteFileId(null);
  };

  const cancelDeleteFile = () => {
    setConfirmDeleteFileId(null);
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

  const selectAllRows = () =>
    setSelectedRowIds(visibleFiles.map((file) => file.id));

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
    setIsSelectionMove(true);
    setMoveVisible(true);
  };

  const handleMoveSelection = () => {
    if (!selectedRowIds.length || !selectedFolderIds.length) {
      setIsSelectionMove(false);
      setMoveVisible(false);
      return;
    }
    selectedRowIds.forEach((fileId) => {
      setFileFolderMembership(fileId, selectedFolderIds);
    });
    clearRowSelection();
    setIsSelectionMove(false);
    setMoveVisible(false);
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
      if (
        error instanceof Error &&
        error.message === "Sharing not available on this device"
      ) {
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

  return (
    <Screen>
      <View style={s.head}>
        <View>
          <Text style={s.title}>PaperBox</Text>
        </View>
        <Pressable style={s.add} onPress={upload}>
          <Feather name="plus" size={23} color={colors.background} />
        </Pressable>
      </View>
      <Pressable style={s.searchButton} onPress={goToSearch}>
        <Feather name="search" size={18} color={colors.secondary} />
        <Text style={s.searchButtonText}>Search files and tags</Text>
      </Pressable>
      <View style={s.summary}>
        <View>
          <Text style={s.summaryLabel}>STORAGE USED</Text>
          <Text style={s.summaryValue}>{fileSize(used)}</Text>
          <Text style={s.summaryMeta}>
            {files.length} {files.length === 1 ? "file" : "files"} in your vault
          </Text>
        </View>
        <Feather name="hard-drive" size={26} color={colors.text} />
      </View>
      <View style={s.labelRow}>
        <Text style={s.label}>RECENTLY ADDED</Text>
        {files.length > 5 ? (
          <Pressable
            style={s.viewAllLink}
            onPress={() => navigation.navigate("AllFiles")}
          >
            <Text style={s.viewAllLinkText}>View all ›</Text>
          </Pressable>
        ) : null}
      </View>
      {visibleFiles.length ? (
        <View>
          {rowSelectionMode ? (
            <View style={s.selectionBar}>
              <Text style={s.selectionTitle}>
                {selectedRowIds.length} selected
              </Text>
              <View style={s.selectionActions}>
                <Pressable
                  style={s.selectionActionButton}
                  onPress={selectAllRows}
                >
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
          {visibleFiles.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              selected={selectedRowIds.includes(f.id)}
              onPress={() =>
                rowSelectionMode
                  ? toggleRowSelection(f.id)
                  : navigation.navigate("Preview", { fileId: f.id })
              }
              onLongPress={() => toggleRowSelection(f.id)}
              onMore={() => openFileActions(f)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="upload"
          title="Your vault is empty"
          body="Import documents, images, and more to keep everything in one quiet place."
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
      />
      <FolderMoveModal
        visible={moveVisible}
        folders={folders}
        selectedFolderIds={selectedFolderIds}
        onRequestClose={() => {
          setMoveVisible(false);
          setIsSelectionMove(false);
        }}
        onToggleFolder={(folderId) =>
          setSelectedFolderIds((current) =>
            current.includes(folderId)
              ? current.filter((id) => id !== folderId)
              : [...current, folderId],
          )
        }
        onSave={isSelectionMove ? handleMoveSelection : saveFolderSelection}
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
const styles = (c: PaperColors) =>
  StyleSheet.create({
    head: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
      marginTop: 30,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.3,
      color: c.secondary,
    },
    title: {
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1,
      color: c.text,
      marginTop: 4,
    },
    add: {
      height: 40,
      width: 40,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 14,
      backgroundColor: c.inverse,
    },
    searchButton: {
      marginTop: 16,
      marginBottom: 20,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    searchButtonText: {
      color: c.secondary,
      fontSize: 15,
    },
    summary: {
      marginTop: 0,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      backgroundColor: c.elevated,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    summaryLabel: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1,
      color: c.secondary,
    },
    summaryValue: {
      fontSize: 24,
      fontWeight: "700",
      marginTop: 5,
      color: c.text,
    },
    summaryMeta: { fontSize: 12, color: c.secondary, marginTop: 3 },
    selectionBar: {
      marginTop: 16,
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
      marginBottom: 12,
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
    labelRow: {
      marginTop: 30,
      marginBottom: 7,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.1,
      color: c.secondary,
    },
    viewAllLink: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    viewAllLinkText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.secondary,
    },
    viewAllButton: {
      alignSelf: "center",
      marginTop: 16,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: c.surface,
    },
    viewAllText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
    },
  });
