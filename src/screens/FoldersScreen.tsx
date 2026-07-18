import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParams } from "../navigation/types";
import { Screen } from "../components/Screen";
import { EmptyState } from "../components/EmptyState";
import { FolderActionModal } from "../components/FolderActionModal";
import { fileSize, isFileInFolder } from "../utils/files";
import { radius } from "../theme/tokens";
import { PaperColors, usePaperTheme } from "../theme/usePaperTheme";
import { useVaultStore } from "../store/useVaultStore";
import { Folder } from "../types";

export function FoldersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { colors } = usePaperTheme();
  const folders = useVaultStore((s) => s.folders),
    files = useVaultStore((s) => s.files),
    add = useVaultStore((s) => s.addFolder),
    renameFolder = useVaultStore((s) => s.renameFolder),
    deleteFolder = useVaultStore((s) => s.deleteFolder),
    togglePinFolder = useVaultStore((s) => s.togglePinFolder);
  const [editing, setEditing] = useState(false),
    [name, setName] = useState("");
  const [actionFolderId, setActionFolderId] = useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);

  const actionFolder = folders.find((f) => f.id === actionFolderId) ?? null;

  const s = styles(colors);
  const create = () => {
    if (!name.trim()) return;
    add(name.trim());
    setName("");
    setEditing(false);
  };

  const closeActions = () => {
    setActionsVisible(false);
    setActionFolderId(null);
  };

  const openFolderActions = (folder: Folder) => {
    setActionFolderId(folder.id);
    setActionsVisible(true);
  };

  const handleRenameFolder = (newName: string) => {
    if (!actionFolder) return;
    renameFolder(actionFolder.id, newName);
    closeActions();
  };

  const handleDeleteFolder = () => {
    if (!actionFolder) return;
    deleteFolder(actionFolder.id);
    closeActions();
  };

  const handleTogglePinFolder = () => {
    if (!actionFolder) return;
    togglePinFolder(actionFolder.id);
    closeActions();
  };
  return (
    <Screen>
      <View style={s.head}>
        <Text style={s.title}>Folders</Text>
        <Pressable onPress={() => setEditing(true)} style={s.new}>
          <Feather name="folder-plus" size={19} color={colors.background} />
          <Text style={s.newText}>New</Text>
        </Pressable>
      </View>
      {editing && (
        <View style={s.form}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Folder name"
            placeholderTextColor={colors.secondary}
            style={s.input}
            onSubmitEditing={create}
          />
          <Pressable onPress={create}>
            <Text style={s.create}>Create</Text>
          </Pressable>
        </View>
      )}
      {folders.length ? (
        folders.map((f) => {
          const folderFiles = files.filter((file) => isFileInFolder(file, f.id));
          const folderSize = folderFiles.reduce((sum, file) => sum + file.size, 0);
          return (
            <Pressable
              key={f.id}
              style={s.row}
              onPress={() => navigation.navigate("FolderDetail", { folderId: f.id })}
              onLongPress={() => openFolderActions(f)}
            >
              <View style={s.icon}>
                <Feather name="folder" size={22} color={colors.text} />
              </View>
              <View style={s.folderText}>
                <Text style={s.name}>{f.name}</Text>
                <Text style={s.count}>
                  {folderFiles.length} {folderFiles.length === 1 ? "file" : "files"} · {fileSize(folderSize)}
                </Text>
              </View>
              {f.isPinned && (
                <Feather name="bookmark" size={18} color={colors.text} />
              )}
              <Feather name="chevron-right" size={18} color={colors.secondary} />
            </Pressable>
          );
        })
      ) : (
        <EmptyState
          icon="folder"
          title="No folders yet"
          body="Create a folder to give your documents a proper home."
        />
      )}
      <FolderActionModal
        visible={actionsVisible}
        folder={actionFolder}
        onRequestClose={closeActions}
        onRename={handleRenameFolder}
        onTogglePin={handleTogglePinFolder}
        onDelete={handleDeleteFolder}
      />
    </Screen>
  );
}
const styles = (c: PaperColors) =>
  StyleSheet.create({
    head: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
      marginTop: 30,
    },
    title: {
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1,
      color: c.text,
      
    },
    new: {
      backgroundColor: c.inverse,
      borderRadius: 12,
      paddingHorizontal: 13,
      height: 40,
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    newText: { color: c.background, fontWeight: "700" },
    form: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: 8,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      backgroundColor: c.elevated,
    },
    input: { height: 38, flex: 1, paddingHorizontal: 8, color: c.text },
    create: { fontWeight: "700", padding: 8, color: c.text },
    row: {
      height: 70,
      borderBottomWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    icon: {
      width: 43,
      height: 43,
      borderRadius: 12,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    name: { fontSize: 16, fontWeight: "600", color: c.text },
    folderText: { flex: 1 },
    count: { fontSize: 13, color: c.secondary, marginTop: 3 },
  });

