import React, { useEffect, useMemo, useState } from "react";
import {
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from "react-native";
import { showAlert } from "../services/alertService";

const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { Feather } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp, BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from "react-native-document-scanner-plugin";
import * as FileSystem from "expo-file-system/legacy";
import { Screen } from "../components/Screen";
import { FileRow } from "../components/FileRow";
import { FileActionModal } from "../components/FileActionModal";
import { FolderMoveModal } from "../components/FolderMoveModal";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { shareVaultFile } from "../services/shareService";
import { useVaultStore } from "../store/useVaultStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { getFolderIdsForFile, extensionOf, kindOf } from "../utils/files";
import type { BottomTabParams, RootStackParams } from "../navigation/types";
import { PdfDraft, VaultFile } from "../types";
import { persistVaultFile } from "../services/vaultStorage";
import { createPdfDraft } from "../services/pdfDraftService";

type CameraProps = BottomTabScreenProps<BottomTabParams, "Camera">;

export function CameraScreen({ route }: CameraProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<BottomTabParams>>();
  const { colors } = usePaperTheme();
  const styles = getStyles(colors);
  const files = useVaultStore((state) => state.files);
  const folders = useVaultStore((state) => state.folders);
  const drafts = useVaultStore((state) => state.drafts);
  const addFiles = useVaultStore((state) => state.addFiles);
  const addPdfDraft = useVaultStore((state) => state.addPdfDraft);
  const toggleFavorite = useVaultStore((state) => state.toggleFavorite);
  const togglePin = useVaultStore((state) => state.togglePin);
  const renameFile = useVaultStore((state) => state.renameFile);
  const setFileFolderMembership = useVaultStore(
    (state) => state.setFileFolderMembership,
  );
  const removeFile = useVaultStore((state) => state.removeFile);
  const deletePdfDraft = useVaultStore((state) => state.deletePdfDraft);
  const renamePdfDraft = useVaultStore((state) => state.renamePdfDraft);
  const setLockSuppressed = useSettingsStore(
    (state) => state.setLockSuppressed,
  );

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
  const [isScanning, setIsScanning] = useState(false);

  const actionFile = useMemo<VaultFile | PdfDraft | null>(
    () =>
      actionFileId
        ? (files.find((file) => file.id === actionFileId) ??
          drafts.find((draft) => draft.id === actionFileId) ??
          null)
        : null,
    [files, drafts, actionFileId],
  );

  const recentFiles = useMemo(
    () =>
      [
        ...files.filter((file) => file.source === "camera"),
        ...drafts,
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [files, drafts],
  );

  const openFileActions = (file: VaultFile | PdfDraft) => {
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

    if (!actionFile || "pages" in actionFile) return;
    setSelectedFolderIds(getFolderIdsForFile(actionFile));
    setMoveVisible(true);
    setActionsVisible(false);
  };

  const saveFolderSelection = () => {
    if (!actionFile || "pages" in actionFile) return;
    setFileFolderMembership(actionFile.id, selectedFolderIds);
    setMoveVisible(false);
  };

  const deleteFile = () => {
    if (!actionFile) return;
    setConfirmDeleteFileId(actionFile.id);
  };

  const confirmDeleteFile = () => {
    if (!confirmDeleteFileId) return;
    if (drafts.some((draft) => draft.id === confirmDeleteFileId)) {
      void deletePdfDraft(confirmDeleteFileId);
    } else {
      void removeFile(confirmDeleteFileId);
    }
    closeActions();
    setConfirmDeleteFileId(null);
  };

  const cancelDeleteFile = () => {
    setConfirmDeleteFileId(null);
  };

  const renameFileAction = (name: string) => {
    if (!actionFile) return;
    if ("pages" in actionFile) {
      renamePdfDraft(actionFile.id, name);
    } else {
      renameFile(actionFile.id, name);
    }
    closeActions();
  };

  const goToInfo = () => {
    if (!actionFile) return;
    closeActions();
    if ("pages" in actionFile) {
      Alert.alert(
        "Draft details",
        `${actionFile.pages.length} page${actionFile.pages.length === 1 ? "" : "s"} ready to review.`,
      );
    } else {
      navigation.navigate("FileDetail", { fileId: actionFile.id });
    }
  };

  const openDraft = () => {
    if (!actionFile || !("pages" in actionFile)) return;
    const draftId = actionFile.id;
    closeActions();
    navigation.navigate("PdfReview", { draftId });
  };

  const shareFile = async () => {
    if (!actionFile || "pages" in actionFile) return;

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

  const toggleFavoriteState = () => {
    if (!actionFile || "pages" in actionFile) return;
    toggleFavorite(actionFile.id);
    closeActions();
  };

  const togglePinState = () => {
    if (!actionFile || "pages" in actionFile) return;
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

  const selectAllFiles = () =>
    setSelectedRowIds(
      recentFiles.map((item) => item.id),
    );

  const deleteSelectedRows = () => {
    if (!selectedRowIds.length) return;
    setConfirmDeleteSelectionVisible(true);
  };

  const confirmDeleteSelectedRows = () => {
    selectedRowIds.forEach((fileId) => {
      if (drafts.some((draft) => draft.id === fileId)) {
        void deletePdfDraft(fileId);
      } else {
        void removeFile(fileId);
      }
    });
    clearRowSelection();
    setConfirmDeleteSelectionVisible(false);
  };

  const cancelDeleteSelectedRows = () => {
    setConfirmDeleteSelectionVisible(false);
  };

  const openSelectionMoveModal = () => {
    if (!selectedRowIds.length) return;
    if (!selectedRowIds.some((id) => files.some((file) => file.id === id))) {
      Alert.alert(
        "Nothing to move",
        "PDF drafts can be opened, renamed, or deleted after selection.",
      );
      return;
    }
    if (!folders.length) {
      Alert.alert(
        "No folders available",
        "Create a folder first in the Folders tab, then move files into it.",
      );
      return;
    }

    setSelectedFolderIds([]);
    setMoveVisible(true);
  };

  const normalizeUri = (value?: string) => {
    if (!value) return "";
    return value.startsWith("file://") || value.startsWith("content://")
      ? value
      : `file://${value}`;
  };

  const showRetrySaveDialog = async (message: string) => {
      const idx = await showAlert(
        "Save failed",
        message,
        [
          { text: "Retry" },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return idx === 0;
    };

  const saveImageToVault = async (uri: string) => {
    const normalizedUri = normalizeUri(uri);
    try {
    } catch (e) {}
    const filename = `Scan-${Date.now()}.jpg`;
    const extension = extensionOf(normalizedUri) || "jpg";
    const fileId = `${Date.now()}-${Math.random()}`;

    // Try to persist and offer a retry prompt if encryption fails. Do not silently write plaintext.
    let durableUri: string | null = null;
    let attempts = 0;
    while (true) {
      try {
        durableUri = await persistVaultFile(
          normalizedUri,
          `${fileId}-scan`,
          extension,
        );
        break;
      } catch (err: any) {
        attempts += 1;
        const retry = await showRetrySaveDialog(
          `Unable to save encrypted file. ${err?.message || String(err)}. Retry?`,
        );
        if (!retry || attempts >= 3) {
          // Bubble up an error so the caller (scanFromCamera) can show its message
          throw new Error(
            `Failed to save vault file: ${err?.message || String(err)}`,
          );
        }
      }
    }

    if (!durableUri)
      throw new Error("Failed to obtain destination URI for saved file");

    try {
    } catch (e) {}
    const fileInfo = await FileSystem.getInfoAsync(durableUri);
    const file: VaultFile = {
      id: fileId,
      name: filename,
      uri: durableUri,
      mimeType: "image/jpeg",
      size: fileInfo.exists ? fileInfo.size : 0,
      extension,
      kind: kindOf(extension),
      createdAt: new Date().toISOString(),
      isFavorite: false,
      isPinned: false,
      tags: [],
      source: "camera",
    };
    addFiles([file]);
    return file;
  };

  const requestCameraPermission = async () => {
    if (Platform.OS !== "android") {
      return true;
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: "Camera access required",
        message: "PaperBox needs camera access to scan documents.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      },
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const scanFromCamera = async (mode: "photo" | "pdf") => {
    if (isScanning) {
      return;
    }

    setLockSuppressed(true);
    setIsScanning(true);
    try {
      const granted = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          "Camera permission required",
          "Allow camera access to scan documents.",
        );
        return;
      }

      const scanOptions = {
        responseType: ResponseType.ImageFilePath,
        ...(mode === "photo" ? { maxNumDocuments: 1 } : {}),
      };
      const result = await DocumentScanner.scanDocument(scanOptions);

      if (result.status === ScanDocumentResponseStatus.Cancel) {
        return;
      }

      const scannedImages =
        result.scannedImages?.map(normalizeUri).filter(Boolean) ?? [];
      if (!scannedImages.length) {
        Alert.alert("No scan result", "Try scanning again.");
        return;
      }

      if (mode === "photo") {
        const newFile = await saveImageToVault(scannedImages[0]);
        navigation.navigate("Preview", { fileId: newFile.id });
        return;
      }

      const draft = await createPdfDraft(scannedImages);
      await addPdfDraft(draft);
      navigation.navigate("PdfReview", { draftId: draft.id });
    } catch (error) {
      Alert.alert("Scan failed", "Unable to scan document. Please try again.");
    } finally {
      setIsScanning(false);
      setLockSuppressed(false);
    }
  };

  const widgetAction = route.params?.widgetAction;
  useEffect(() => {
    if (!widgetAction) return;
    tabNavigation.setParams({ widgetAction: undefined });
    void scanFromCamera(widgetAction === "createPdf" ? "pdf" : "photo");
    // The action is cleared before starting the scanner so returning to this tab
    // cannot trigger the same widget request a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabNavigation, widgetAction]);

  const handleMoveSelection = () => {
    if (!selectedRowIds.length || !selectedFolderIds.length) {
      setMoveVisible(false);
      return;
    }

    selectedRowIds.forEach((fileId) => {
      if (files.some((file) => file.id === fileId)) {
        setFileFolderMembership(fileId, selectedFolderIds);
      }
    });
    clearRowSelection();
    setMoveVisible(false);
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Camera</Text>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={[styles.optionCard, isScanning && styles.disabledButton]}
          onPress={() => scanFromCamera("photo")}
          disabled={isScanning}
        >
          <View style={styles.cardContent}>
            <Feather
              name="camera"
              size={30}
              color={colors.text}
              style={styles.cardIcon}
            />
            <Text style={styles.cardLabel}>Take picture</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.optionCard, isScanning && styles.disabledButton]}
          onPress={() => scanFromCamera("pdf")}
          disabled={isScanning}
        >
          <View style={styles.cardContent}>
            <Feather
              name="file-text"
              size={30}
              color={colors.text}
              style={styles.cardIcon}
            />
            <Text style={styles.cardLabel}>Create PDF</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.recentSection}>
        <View style={styles.labelRow}>
          <Text style={styles.sectionTitle}>RECENT CAPTURES</Text>
          {recentFiles.length > 5 ? (
            <Pressable
              style={styles.viewAllLink}
              onPress={() => navigation.navigate("CapturedFiles")}
            >
              <Text style={styles.viewAllLinkText}>View all �</Text>
            </Pressable>
          ) : null}
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
            {recentFiles.map((item) => {
              const isDraft = "pages" in item;
              return (
                <FileRow
                  key={item.id}
                  file={item}
                  selected={selectedRowIds.includes(item.id)}
                  selectionMode={rowSelectionMode}
                  onPress={() =>
                    rowSelectionMode
                      ? toggleRowSelection(item.id)
                      : isDraft
                        ? navigation.navigate("PdfReview", { draftId: item.id })
                        : navigation.navigate("Preview", { fileId: item.id })
                  }
                  onLongPress={() => toggleRowSelection(item.id)}
                  onMore={() => openFileActions(item)}
                />
              );
            })}
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
        onOpenDraft={openDraft}
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
    optionCard: {
      backgroundColor: c.surface,
      borderRadius: 18,
      width: "47%",
      height: 120,
      marginBottom: 5,
      alignItems: "center",
      justifyContent: "flex-start",
      paddingTop: 18,
      shadowColor: withAlpha(c.text, 0.18),
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    cardContent: {
      alignItems: "center",
      justifyContent: "flex-start",
      paddingHorizontal: 12,
      flex: 1,
    },
    cardIcon: {
      marginTop: 6,
      marginBottom: 20,
    },
    cardLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: c.text,
      textAlign: "center",
    },
    disabledButton: {
      opacity: 0.5,
    },
    optionText: {
      color: c.text,
      fontSize: 17,
      fontWeight: "700",
    },
    recentSection: {
      marginTop: 32,
    },
    labelRow: {
      marginBottom: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionHeader: {
      marginBottom: 18,
    },
    sectionTitle: {
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
      color: c.secondary,
      fontSize: 13,
      fontWeight: "700",
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
