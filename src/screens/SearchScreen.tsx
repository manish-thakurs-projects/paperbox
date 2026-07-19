import React, { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { EmptyState } from "../components/EmptyState";
import { usePaperTheme } from "../theme/usePaperTheme";
import { useVaultStore } from "../store/useVaultStore";
import { VaultFile } from "../types";
import { shareVaultFile } from "../services/shareService";
import { getFolderIdsForFile } from "../utils/files";
import { RootStackParams } from "../navigation/types";

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [moveVisible, setMoveVisible] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const inputRef = useRef<TextInput | null>(null);
  const files = useVaultStore((s) => s.files);
  const folders = useVaultStore((s) => s.folders);
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite);
  const togglePin = useVaultStore((s) => s.togglePin);
  const renameFile = useVaultStore((s) => s.renameFile);
  const setFileFolderMembership = useVaultStore((s) => s.setFileFolderMembership);
  const removeFile = useVaultStore((s) => s.removeFile);
  const removeFileFromFolder = useVaultStore((s) => s.removeFileFromFolder);
  const s = styles(colors);

  const actionFile = useMemo(
    () => (actionFileId ? files.find((file) => file.id === actionFileId) ?? null : null),
    [files, actionFileId],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(
    () =>
      files.filter((f) =>
        `${f.name} ${f.extension} ${f.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [files, query],
  );

  const handleSearch = (text: string) => {
    setQuery(text);
    if (!text.trim()) return;

    setRecentSearches((current) => {
      const trimmed = text.trim().toLowerCase();
      const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 5);
      return next;
    });
  };

  const clearRecentSearches = () => setRecentSearches([]);

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
    setActionsVisible(false);
  };

  const deleteFile = () => {
    if (!actionFile) return;

    removeFile(actionFile.id);
    closeActions();
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

  const renameFileAction = (name: string) => {
    if (!actionFile) return;

    renameFile(actionFile.id, name);
    closeActions();
  };

  const shareFile = async () => {
    if (!actionFile) return;

    try {
      await shareVaultFile(actionFile);
    } catch (error) {
      if (error instanceof Error && error.message === "Sharing not available on this device") {
        Alert.alert("Sharing not available", "This device cannot share files directly.");
      } else {
        console.warn("shareFile error", error);
        Alert.alert("Could not share file", "Try again later.");
      }
    } finally {
      closeActions();
    }
  };

  const removeFromFolder = () => {
    if (!actionFile || !actionFile.folderId) return;

    removeFileFromFolder(actionFile.id, actionFile.folderId);
    closeActions();
  };

  return (
    <Screen>
      <View style={s.box}>
        <Feather name="search" size={19} color={colors.secondary} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
          autoFocus
          placeholder="Search files and tags"
          placeholderTextColor={colors.secondary}
          style={s.input}
        />
      </View>
      {query ? (
        <>
          <Text style={s.label}>{results.length} RESULTS</Text>
          {results.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              onPress={() => navigation.navigate("Preview", { fileId: f.id })}
              onMore={() => openFileActions(f)}
            />
          ))}
        </>
      ) : (
        <View style={s.recentWrap}>
          <View style={s.recentHeader}>
            <Text style={s.label}>RECENT SEARCHES</Text>
            {recentSearches.length > 0 ? (
              <Pressable onPress={clearRecentSearches}>
                <Text style={s.clearText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          {recentSearches.length ? (
            recentSearches.map((item) => (
              <Pressable key={item} style={s.recentItem} onPress={() => handleSearch(item)}>
                <Feather name="clock" size={16} color={colors.secondary} />
                <Text style={s.recentText}>{item}</Text>
              </Pressable>
            ))
          ) : (
            <EmptyState
              icon="search"
              title="Find anything"
              body="Search by file name, type, tag, or folder."
            />
          )}
        </View>
      )}
      {query && !results.length && (
        <EmptyState
          icon="file-text"
          title="Nothing found"
          body="Try a different name or a shorter search."
        />
      )}
      <FileActionModal
        visible={actionsVisible}
        file={actionFile}
        onRequestClose={closeActions}
        onToggleFavorite={toggleFavoriteState}
        onTogglePin={togglePinState}
        onOpenMoveModal={openMoveModal}
        onShare={shareFile}
        onDelete={deleteFile}
        onInfo={() => {
          if (!actionFile) return;
          closeActions();
          navigation.navigate("FileDetail", { fileId: actionFile.id });
        }}
        onRename={renameFileAction}
        onRemoveFromFolder={actionFile?.folderId ? removeFromFolder : undefined}
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
const styles = (c: { background: string; surface: string; elevated: string; text: string; secondary: string; border: string; muted: string; inverse: string }) =>
  StyleSheet.create({
    box: {
      height: 52,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    input: { fontSize: 15, color: c.text, flex: 1 },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      color: c.secondary,
      marginTop: 26,
      marginBottom: 8,
    },
    recentWrap: {
      marginTop: 12,
    },
    recentHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    recentItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    recentText: {
      fontSize: 15,
      color: c.text,
    },
    clearText: {
      fontSize: 13,
      color: c.text,
      fontWeight: "600",
    },
  });
