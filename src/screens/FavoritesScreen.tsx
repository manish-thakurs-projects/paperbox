import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { EmptyState } from "../components/EmptyState";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { usePaperTheme, PaperColors } from "../theme/usePaperTheme";
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
      backgroundColor: "rgba(0,0,0,0.38)",
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
      color: "#d32f2f",
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

  const favorites = useMemo(() => files.filter((f) => f.isFavorite), [files]);
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
        console.warn("shareFile error", error);
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
    Alert.alert("Delete this file?", "This only removes it from Paper Box.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          removeFile(actionFile.id);
          closeActions();
        },
      },
    ]);
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
      {favorites.length > 0 ? (
        favorites.map((f) => (
          <FileRow
            key={f.id}
            file={f}
            onPress={() => goToPreview(f)}
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
        onSave={saveFolderSelection}
      />
    </Screen>
  );
}
