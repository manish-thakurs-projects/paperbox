import React, { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParams } from "../navigation/types";
import { Screen } from "../components/Screen";
import { radius } from "../theme/tokens";
import { PaperColors, usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { useVaultStore } from "../store/useVaultStore";
import { fileSize, getFolderIdsForFile, relativeDate } from "../utils/files";
import { shareVaultFile } from "../services/shareService";

type Props = NativeStackScreenProps<RootStackParams, "FileDetail">;

export function FileDetailScreen({ route, navigation }: Props) {
  const { colors } = usePaperTheme();
  const file = useVaultStore((s) => s.files.find((f) => f.id === route.params.fileId));
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite);
  const togglePin = useVaultStore((s) => s.togglePin);
  const renameFile = useVaultStore((s) => s.renameFile);
  const setFileFolderMembership = useVaultStore((s) => s.setFileFolderMembership);
  const folders = useVaultStore((s) => s.folders);
  const remove = useVaultStore((s) => s.removeFile);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [moveVisible, setMoveVisible] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const s = styles(colors);

  React.useEffect(() => {
    if (file) {
      setRenameText(file.name);
    }
  }, [file]);

  if (!file) {
    return (
      <Screen>
        <Text style={s.title}>File unavailable</Text>
      </Screen>
    );
  }

  const deleteFile = () =>
    Alert.alert("Delete this file?", "This only removes it from Paper Box.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          remove(file.id);
          navigation.goBack();
        },
      },
    ]);

  const currentFolders = folders.filter((folder) => getFolderIdsForFile(file).includes(folder.id));

  const openMoveModal = () => {
    if (!folders.length) {
      Alert.alert(
        "No folders available",
        "Create a folder first in the Folders tab, then move files into it.",
      );
      return;
    }

    setSelectedFolderIds(getFolderIdsForFile(file));
    setMoveVisible(true);
  };

  const saveFolderSelection = () => {
    setFileFolderMembership(file.id, selectedFolderIds);
    setMoveVisible(false);
  };

  const shareFile = async () => {
    try {
      await shareVaultFile(file);
    } catch (e) {
      if (e instanceof Error && e.message === "Sharing not available on this device") {
        Alert.alert("Sharing not available", "This device cannot share files directly.");
        return;
      }

      console.warn("shareFile error", e);
      Alert.alert("Could not share file", "Try again later.");
    }
  };

  const favoriteIcon = file.isFavorite ? "star" : "star-border";
  const pinnedIcon = file.isPinned ? "bookmark" : "bookmark-border";

  return (
    <Screen>
      <View style={s.hero}>
        <View style={s.fileIcon}>
          <Feather name="file-text" size={34} color={colors.text} />
        </View>
        <Text style={s.title} numberOfLines={2}>
          {file.name}
        </Text>
        <Text style={s.meta}>
          {file.extension.toUpperCase() || "FILE"} · {fileSize(file.size)} · Added {relativeDate(file.createdAt)}
        </Text>
        {currentFolders.length ? (
          <Text style={s.folderLabel}>In {currentFolders.map((folder) => folder.name).join(", ")}</Text>
        ) : (
          <Text style={s.folderLabel}>Not in any folder</Text>
        )}
      </View>

      <Pressable onPress={() => navigation.navigate("Preview", { fileId: file.id })} style={s.preview}>
        <Feather name="maximize" size={19} color={colors.background} />
        <Text style={s.previewText}>Open preview</Text>
      </Pressable>

      <Text style={s.label}>ACTIONS</Text>
      <View style={s.group}>
        <Pressable style={s.row} onPress={() => toggleFavorite(file.id)}>
          <MaterialIcons name={favoriteIcon} size={19} color={colors.text} />
          <Text style={s.name}>{file.isFavorite ? "Remove from favorites" : "Add to favorites"}</Text>
        </Pressable>
        <Pressable style={s.row} onPress={() => togglePin(file.id)}>
          <MaterialIcons name={pinnedIcon} size={19} color={colors.text} />
          <Text style={s.name}>{file.isPinned ? "Unpin file" : "Pin file"}</Text>
        </Pressable>
        <Pressable style={s.row} onPress={() => setRenameVisible(true)}>
          <Feather name="edit" size={19} color={colors.text} />
          <Text style={s.name}>Rename file</Text>
        </Pressable>
        <Pressable style={s.row} onPress={openMoveModal}>
          <Feather name="folder" size={19} color={colors.text} />
          <Text style={s.name}>Move to folders</Text>
        </Pressable>
        <Pressable style={s.row} onPress={shareFile}>
          <Feather name="share" size={19} color={colors.text} />
          <Text style={s.name}>Share</Text>
        </Pressable>
        <Pressable style={s.row} onPress={deleteFile}>
          <Feather name="trash-2" size={19} color={colors.text} />
          <Text style={s.name}>Delete from vault</Text>
        </Pressable>
      </View>

      <Modal animationType="slide" transparent visible={renameVisible} onRequestClose={() => setRenameVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Rename file</Text>
            <TextInput
              style={s.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Enter new file name"
              placeholderTextColor={colors.secondary}
              autoFocus
            />
            <View style={s.modalFooter}>
              <Pressable style={[s.modalActionButton, s.modalCancelButton]} onPress={() => setRenameVisible(false)}>
                <Text style={s.modalActionText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalActionButton, s.modalSaveButton]}
                onPress={() => {
                  const trimmed = renameText.trim();
                  if (trimmed && trimmed !== file.name) {
                    renameFile(file.id, trimmed);
                  }
                  setRenameVisible(false);
                }}
              >
                <Text style={[s.modalActionText, s.modalSaveText]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={moveVisible} onRequestClose={() => setMoveVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Move to folders</Text>
            <Text style={s.modalSubtitle}>Select one or more folders for this file.</Text>
            <ScrollView style={s.folderList} showsVerticalScrollIndicator={false}>
              {folders.length ? (
                folders.map((folder) => {
                  const selected = selectedFolderIds.includes(folder.id);
                  return (
                    <Pressable
                      key={folder.id}
                      style={[s.folderRow, selected && s.folderRowSelected]}
                      onPress={() =>
                        setSelectedFolderIds((current) =>
                          current.includes(folder.id)
                            ? current.filter((id) => id !== folder.id)
                            : [...current, folder.id],
                        )
                      }
                    >
                      <View style={s.folderRowContent}>
                        <Feather name="folder" size={18} color={selected ? colors.text : colors.secondary} />
                        <Text style={s.folderRowText}>{folder.name}</Text>
                      </View>
                      {selected ? (
                        <Feather name="check-circle" size={20} color={colors.text} />
                      ) : (
                        <Feather name="circle" size={20} color={colors.secondary} />
                      )}
                    </Pressable>
                  );
                })
              ) : (
                <Text style={s.emptyFolderText}>Create a folder first to organize this file.</Text>
              )}
            </ScrollView>
            <View style={s.modalFooter}>
              <Pressable style={[s.modalActionButton, s.modalCancelButton]} onPress={() => setMoveVisible(false)}>
                <Text style={s.modalActionText}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.modalActionButton, s.modalSaveButton]} onPress={saveFolderSelection}>
                <Text style={[s.modalActionText, s.modalSaveText]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = (c: PaperColors) =>
  StyleSheet.create({
    hero: { alignItems: "center", paddingVertical: 24 },
    fileIcon: {
      height: 76,
      width: 76,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.surface,
      marginBottom: 15,
    },
    title: {
      fontSize: 25,
      fontWeight: "800",
      letterSpacing: -0.6,
      color: c.text,
      textAlign: "center",
    },
    meta: {
      fontSize: 12,
      color: c.secondary,
      marginTop: 8,
      textAlign: "center",
    },
    preview: {
      height: 52,
      borderRadius: 14,
      backgroundColor: c.inverse,
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
    },
    previewText: { color: c.background, fontSize: 15, fontWeight: "700" },
    label: {
      fontSize: 11,
      letterSpacing: 1,
      fontWeight: "700",
      color: c.secondary,
      marginTop: 28,
      marginBottom: 8,
    },
    group: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      overflow: "hidden",
    },
    row: {
      height: 56,
      paddingHorizontal: 16,
      alignItems: "center",
      flexDirection: "row",
      gap: 13,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    name: { fontSize: 15, fontWeight: "600", color: c.text },
    folderLabel: { fontSize: 13, color: c.secondary, marginTop: 8 },
    modalOverlay: {
      flex: 1,
      backgroundColor: withAlpha(c.text, 0.35),
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalCard: {
      width: "100%",
      backgroundColor: c.elevated,
      borderRadius: radius.lg,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
      marginBottom: 6,
    },
    modalSubtitle: {
      fontSize: 13,
      color: c.secondary,
      marginBottom: 14,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      marginBottom: 16,
      backgroundColor: c.background,
    },
    folderList: {
      maxHeight: 280,
      marginBottom: 16,
    },
    folderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    folderRowSelected: {
      backgroundColor: c.surface,
    },
    folderRowContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    folderRowText: {
      fontSize: 15,
      color: c.text,
      fontWeight: "600",
    },
    emptyFolderText: {
      fontSize: 14,
      color: c.secondary,
      paddingVertical: 12,
    },
    modalFooter: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
    },
    modalActionButton: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: radius.md,
      backgroundColor: c.surface,
    },
    modalActionText: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    modalSaveButton: {
      backgroundColor: c.inverse,
    },
    modalSaveText: {
      color: c.background,
    },
    modalCancelButton: {
      backgroundColor: c.border,
    },
  });
