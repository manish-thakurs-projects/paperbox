import React, { useLayoutEffect } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { showAlert } from "../services/alertService";

const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { RootStackParams } from "../navigation/types";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useVaultStore } from "../store/useVaultStore";
import { radius } from "../theme/tokens";
import { PaperColors, usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { isFileInFolder } from "../utils/files";

type Props = NativeStackScreenProps<RootStackParams, "FolderDetail">;

export function FolderDetailScreen({ route, navigation }: Props) {
  const { colors } = usePaperTheme();
  const folder = useVaultStore((s) =>
    s.folders.find((folder) => folder.id === route.params.folderId),
  );
  const files = useVaultStore((s) => s.files);
  const folders = useVaultStore((s) => s.folders);
  const assignFilesToFolder = useVaultStore((s) => s.assignFilesToFolder);
  const setFileFolderMembership = useVaultStore(
    (s) => s.setFileFolderMembership,
  );
  const removeFile = useVaultStore((s) => s.removeFile);
  const removeFileFromFolder = useVaultStore((s) => s.removeFileFromFolder);
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite);
  const togglePin = useVaultStore((s) => s.togglePin);
  const renameFile = useVaultStore((s) => s.renameFile);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [selectedFileIds, setSelectedFileIds] = React.useState<string[]>([]);
  const [selectedRowIds, setSelectedRowIds] = React.useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = React.useState<string[]>(
    [],
  );
  const [actionFileId, setActionFileId] = React.useState<string | null>(null);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = React.useState<
    string | null
  >(null);
  const [confirmDeleteSelectionVisible, setConfirmDeleteSelectionVisible] =
    React.useState(false);
  const [actionsVisible, setActionsVisible] = React.useState(false);
  const [selectionMoveVisible, setSelectionMoveVisible] = React.useState(false);
  const s = styles(colors);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: folder?.name ?? "Folder",
      headerTitleAlign: "left",
      headerRight: () => (
        <Pressable style={s.headerAction} onPress={() => setModalVisible(true)}>
          <Feather name="plus" size={18} color={colors.text} />
        </Pressable>
      ),
    });
  }, [folder, navigation]);

  const folderFiles = React.useMemo(
    () => files.filter((file) => isFileInFolder(file, route.params.folderId)),
    [files, route.params.folderId],
  );
  const rowSelectionMode = selectedRowIds.length > 0;

  const actionFile =
    folderFiles.find((file) => file.id === actionFileId) ?? null;

  const availableFiles = React.useMemo(
    () => files.filter((file) => !isFileInFolder(file, route.params.folderId)),
    [files, route.params.folderId],
  );

  const closeActions = () => {
    setActionsVisible(false);
    setActionFileId(null);
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

  const openMoveModal = () => {
    if (!folders.length) {
      Alert.alert(
        "No folders available",
        "Create a folder first in the Folders tab, then move files into it.",
      );
      return;
    }
    if (!actionFile) return;
    setSelectedFolderIds([]);
    setActionsVisible(false);
    setSelectionMoveVisible(true);
  };

  const saveFolderSelection = () => {
    if (!actionFile) return;
    setFileFolderMembership(actionFile.id, selectedFolderIds);
    setSelectionMoveVisible(false);
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

  const removeFromFolder = () => {
    if (!actionFile) return;
    removeFileFromFolder(actionFile.id, route.params.folderId);
    closeActions();
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

  const goToPreview = (file: any) => {
    navigation.navigate("Preview", { fileId: file.id });
  };

  if (!folder)
    return (
      <Screen>
        <Text style={s.title}>Folder unavailable</Text>
      </Screen>
    );

  const toggleSelection = (fileId: string) => {
    setSelectedFileIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const handleAddFiles = () => {
    if (!selectedFileIds.length) return;
    assignFilesToFolder(selectedFileIds, route.params.folderId);
    setSelectedFileIds([]);
    setModalVisible(false);
  };

  const toggleRowSelection = (fileId: string) => {
    setSelectedRowIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const clearRowSelection = () => setSelectedRowIds([]);

  const selectAllFolderFiles = () =>
    setSelectedRowIds(folderFiles.map((file) => file.id));

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
    if (!folder) return;
    if (!selectedRowIds.length) return;
    setSelectedFolderIds([]);
    setSelectionMoveVisible(true);
  };

  const handleMoveSelection = () => {
    if (!selectedRowIds.length || !selectedFolderIds.length) {
      setSelectionMoveVisible(false);
      return;
    }

    selectedRowIds.forEach((fileId) => {
      setFileFolderMembership(fileId, selectedFolderIds);
    });
    clearRowSelection();
    setSelectionMoveVisible(false);
  };

  const activeFile = folderFiles.find((file) => file.id === actionFileId);

  const handleRemoveFromFolder = () => {
    if (!activeFile) return;
    const currentFolderIds =
      activeFile.folderIds ??
      (activeFile.folderId ? [activeFile.folderId] : []);
    const nextFolderIds = currentFolderIds.filter(
      (id) => id !== route.params.folderId,
    );
    setFileFolderMembership(activeFile.id, nextFolderIds);
    setActionFileId(null);
  };

  return (
    <Screen style={s.screen}>
      {folderFiles.length > 0 ? (
        <View>
          {rowSelectionMode ? (
            <View style={s.selectionBar}>
              <Text style={s.selectionTitle}>
                {selectedRowIds.length} selected
              </Text>
              <View style={s.selectionActions}>
                <Pressable
                  style={s.selectionActionButton}
                  onPress={selectAllFolderFiles}
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
          {folderFiles.map((file, index) => (
            <View
              key={file.id}
              style={
                index !== folderFiles.length - 1 ? s.fileRowWrapper : undefined
              }
            >
              <FileRow
                file={file}
                selected={selectedRowIds.includes(file.id)}
                onPress={() =>
                  rowSelectionMode
                    ? toggleRowSelection(file.id)
                    : goToPreview(file)
                }
                onLongPress={() => toggleRowSelection(file.id)}
                onMore={() => {
                  setActionFileId(file.id);
                  setActionsVisible(true);
                }}
              />
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="file"
          title="No files in this folder"
          body="Add files to this folder from your imported files."
        />
      )}
      <Modal
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        transparent={true}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHandle} />

            <Text style={s.modalTitle}>Choose imported files</Text>

            <ScrollView
              style={s.modalList}
              showsVerticalScrollIndicator={false}
            >
              {availableFiles.length > 0 ? (
                availableFiles.map((file) => {
                  const selected = selectedFileIds.includes(file.id);
                  return (
                    <Pressable
                      key={file.id}
                      style={({ pressed }) => [
                        s.fileItem,
                        selected && s.fileItemSelected,
                        pressed && s.fileItemPressed,
                      ]}
                      onPress={() => toggleSelection(file.id)}
                    >
                      <View style={s.fileItemInfo}>
                        <Text style={s.fileName}>{file.name}</Text>
                        <Text style={s.fileSubtitle}>
                          {file.extension || file.kind}
                        </Text>
                      </View>
                      {selected ? (
                        <Feather
                          name="check-circle"
                          size={22}
                          color={colors.text}
                        />
                      ) : (
                        <Feather
                          name="circle"
                          size={22}
                          color={colors.secondary}
                        />
                      )}
                    </Pressable>
                  );
                })
              ) : (
                <View style={s.emptyModalMessage}>
                  <Feather name="inbox" size={40} color={colors.secondary} />
                  <Text style={s.emptyModalTitle}>No imported files</Text>
                  <Text style={s.emptyModalBody}>
                    Import files first from the home screen before adding them
                    to folders.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={s.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  s.modalButton,
                  s.modalCancelButton,
                  pressed && s.modalButtonPressed,
                ]}
                onPress={() => {
                  setSelectedFileIds([]);
                  setModalVisible(false);
                }}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  s.modalButton,
                  s.modalAddButton,
                  (!selectedFileIds.length || pressed) && s.modalButtonDisabled,
                ]}
                onPress={handleAddFiles}
                disabled={!selectedFileIds.length}
              >
                <Text style={s.modalAddText}>
                  Add{" "}
                  {selectedFileIds.length > 0
                    ? `(${selectedFileIds.length})`
                    : ""}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <FileActionModal
        visible={actionsVisible}
        file={actionFile}
        onRequestClose={closeActions}
        onRename={renameFileAction}
        onToggleFavorite={toggleFavoriteState}
        onTogglePin={togglePinState}
        onOpenMoveModal={openMoveModal}
        onShare={() => {}}
        onDelete={deleteFile}
        onInfo={goToInfo}
        onRemoveFromFolder={removeFromFolder}
        onDownload={() => {
          closeActions();
        }}
      />
      <FolderMoveModal
        visible={selectionMoveVisible}
        folders={folders}
        selectedFolderIds={selectedFolderIds}
        onRequestClose={() => setSelectionMoveVisible(false)}
        onToggleFolder={(folderId) =>
          setSelectedFolderIds((current) =>
            current.includes(folderId)
              ? current.filter((id) => id !== folderId)
              : [...current, folderId],
          )
        }
        onSave={handleMoveSelection}
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
    screen: {
      paddingTop: -10,
      paddingHorizontal: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.7,
      color: c.text,
      marginBottom: 4,
    },
    headerAction: {
      padding: 8,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.inverse,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      gap: 8,
    },
    addButtonPressed: {
      opacity: 0.8,
    },
    addText: {
      color: c.background,
      fontWeight: "700",
      fontSize: 14,
    },
    fileRowWrapper: {
      borderBottomWidth: 1,
      borderColor: c.border,
      paddingVertical: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: withAlpha(c.text, 0.4),
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: c.elevated,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 28,
      maxHeight: "85%",
      ...Platform.select({
        ios: {
          shadowColor: c.text,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
        },
        android: {
          elevation: 10,
        },
      }),
    },
    modalHandle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: c.text,
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    modalSubtitle: {
      fontSize: 14,
      color: c.secondary,
      marginBottom: 20,
    },
    modalList: {
      marginBottom: 20,
    },
    fileItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: radius.md,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 10,
    },
    fileItemSelected: {
      backgroundColor: c.surface,
      borderColor: c.text,
    },
    fileItemPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.98 }],
    },
    fileItemInfo: {
      flex: 1,
      marginRight: 12,
    },
    fileName: {
      fontSize: 16,
      fontWeight: "600",
      color: c.text,
    },
    fileSubtitle: {
      fontSize: 13,
      color: c.secondary,
      marginTop: 2,
    },
    emptyModalMessage: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 32,
    },
    emptyModalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
      marginTop: 12,
      marginBottom: 6,
    },
    emptyModalBody: {
      textAlign: "center",
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      maxWidth: "80%",
    },
    modalActions: {
      flexDirection: "row",
      gap: 12,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    modalButtonPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },
    modalCancelButton: {
      backgroundColor: c.border,
    },
    modalAddButton: {
      backgroundColor: c.inverse,
    },
    modalButtonDisabled: {
      opacity: 0.5,
    },
    modalCancelText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 15,
    },
    modalAddText: {
      color: c.background,
      fontWeight: "700",
      fontSize: 15,
    },
    selectionBar: {
      marginBottom: 12,
      padding: 12,
      borderRadius: radius.md,
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
      borderRadius: radius.md,
      backgroundColor: c.elevated,
    },
    selectionActionText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 13,
    },
  });
