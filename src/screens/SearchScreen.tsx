import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
import { FileActionModal } from "../components/FileActionModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { EmptyState } from "../components/EmptyState";
import { usePaperTheme } from "../theme/usePaperTheme";
import { useVaultStore } from "../store/useVaultStore";
import { VaultFile } from "../types";
import { shareVaultFile } from "../services/shareService";
import { getFolderIdsForFile } from "../utils/files";
import { RootStackParams } from "../navigation/types";

const RECENT_SEARCHES_KEY = "paperbox.recent-searches";
const MAX_RECENT_SEARCHES = 8;

export function SearchScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const hasLoadedRecentSearches = useRef(false);
  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [moveVisible, setMoveVisible] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<
    string | null
  >(null);
  const inputRef = useRef<TextInput | null>(null);
  const files = useVaultStore((s) => s.files);
  const folders = useVaultStore((s) => s.folders);
  const toggleFavorite = useVaultStore((s) => s.toggleFavorite);
  const togglePin = useVaultStore((s) => s.togglePin);
  const renameFile = useVaultStore((s) => s.renameFile);
  const setFileFolderMembership = useVaultStore(
    (s) => s.setFileFolderMembership,
  );
  const removeFile = useVaultStore((s) => s.removeFile);
  const removeFileFromFolder = useVaultStore((s) => s.removeFileFromFolder);
  const s = styles(colors);

  const actionFile = useMemo(
    () =>
      actionFileId
        ? (files.find((file) => file.id === actionFileId) ?? null)
        : null,
    [files, actionFileId],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((stored) => {
        if (!stored || !active) return;
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(
            parsed
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, MAX_RECENT_SEARCHES),
          );
        }
      })
      .catch(() => {
        // Search history is a convenience feature; an unreadable entry can be ignored.
      })
      .finally(() => {
        if (active) hasLoadedRecentSearches.current = true;
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRecentSearches.current) return;
    void AsyncStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recentSearches),
    ).catch(() => {
      // Keep the in-memory list working when device storage is temporarily unavailable.
    });
  }, [recentSearches]);

  const results = useMemo(
    () =>
      files.filter((f) =>
        `${f.name} ${f.extension} ${f.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [files, query],
  );

  const recordRecentSearch = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setRecentSearches((current) => {
      const normalized = trimmed.toLocaleLowerCase();
      const next = [
        trimmed,
        ...current.filter(
          (item) => item.toLocaleLowerCase() !== normalized,
        ),
      ].slice(0, MAX_RECENT_SEARCHES);
      return next;
    });
  };

  const handleSearch = (text: string) => setQuery(text);

  const clearRecentSearches = () => {
    setRecentSearches([]);
    void AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

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
          onSubmitEditing={() => recordRecentSearch(query)}
          returnKeyType="search"
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
              onPress={() => {
                recordRecentSearch(query);
                navigation.navigate("Preview", { fileId: f.id });
              }}
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
              <Pressable
                key={item}
                style={s.recentItem}
                onPress={() => {
                  handleSearch(item);
                  recordRecentSearch(item);
                }}
              >
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
        onSave={saveFolderSelection}
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
    </Screen>
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
}) =>
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
