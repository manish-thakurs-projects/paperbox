import React, { useEffect, useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../navigation/types";
import { Feather } from "@expo/vector-icons";
import {
  CameraMountError,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import QRCode from "react-native-qrcode-svg";
import {
  StyleSheet,
  Switch,
  Text,
  View,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
} from "react-native";
import { Screen } from "../components/Screen";
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import { radius } from "../theme/tokens";
import { useSettingsStore } from "../store/useSettingsStore";
import { useVaultStore } from "../store/useVaultStore";
import { checkLocalAuthenticationAvailable } from "../utils/localAuthentication";
import { VaultFile, Folder, Settings } from "../types";
import { decryptVaultFileForUse } from "../services/vaultStorage";

type SettingsRowProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  children: React.ReactNode;
  colors: ReturnType<typeof usePaperTheme>["colors"];
  onPress?: () => void;
};

type ExportType = "folder" | "file" | "all";

type ExportPayload = {
  kind: "paperbox-transfer";
  version: 1;
  exportedAt: string;
  type: ExportType;
  folders: Folder[];
  files: Array<VaultFile & { contentBase64: string }>;
};

const SettingsRow = ({
  icon,
  label,
  children,
  colors,
  onPress,
}: SettingsRowProps) => {
  const styles = rowStyles(colors);
  const RowComponent = onPress ? Pressable : View;
  return (
    <RowComponent
      style={styles.row}
      onPress={onPress}
      android_ripple={{ color: colors.muted }}
    >
      <Feather name={icon} size={19} color={colors.text} />
      <Text style={styles.name}>{label}</Text>
      {children}
    </RowComponent>
  );
};

export function SettingsScreen() {
  const { colors } = usePaperTheme();
  const s = styles(colors);
  const theme = useSettingsStore((s) => s.theme),
    setTheme = useSettingsStore((s) => s.setTheme),
    lockEnabled = useSettingsStore((s) => s.lockEnabled),
    setLockEnabled = useSettingsStore((s) => s.setLockEnabled);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();

  const files = useVaultStore((state) => state.files);
  const folders = useVaultStore((state) => state.folders);
  const addFiles = useVaultStore((state) => state.addFiles);
  const addFolders = useVaultStore((state) => state.addFolders);

  const [authAvailable, setAuthAvailable] = useState(false);
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const available = await checkLocalAuthenticationAvailable();
      if (isMounted) setAuthAvailable(available);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const [exportOptionsVisible, setExportOptionsVisible] = useState(false);
  const [exportSelectionVisible, setExportSelectionVisible] = useState(false);
  const [exportPreviewVisible, setExportPreviewVisible] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportType, setExportType] = useState<ExportType | null>(null);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [exportPayload, setExportPayload] = useState<ExportPayload | null>(
    null,
  );
  const [exportHandshakeLink, setExportHandshakeLink] = useState<string>("");
  const [exportFileUri, setExportFileUri] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState<number | null>(null);
  const [shareHandshakeBusy, setShareHandshakeBusy] = useState(false);
  const [shareFileBusy, setShareFileBusy] = useState(false);

  const [importVisible, setImportVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerPermission, setScannerPermission] = useState<boolean | null>(
    null,
  );
  const [scanned, setScanned] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  const folderSelection = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  );

  const fileSelection = useMemo(
    () => [...files].sort((a, b) => a.name.localeCompare(b.name)),
    [files],
  );

  useEffect(() => {
    if (!importVisible) return;
    let isActive = true;
    (async () => {
      try {
        const response = await requestPermission();
        if (!isActive) return;
        setScannerPermission(response.granted);
      } catch (error) {
        console.warn("Camera permission request failed", error);
        if (!isActive) return;
        setScannerPermission(false);
        Alert.alert(
          "Scanner unavailable",
          "Camera permission is required to scan QR codes. Please allow camera access.",
        );
      } finally {
        if (isActive) setScanned(false);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [importVisible, requestPermission]);

  const toggleExportSelection = (id: string) => {
    setSelectedExportIds((current) =>
      current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id],
    );
  };

  const openExportOptions = () => {
    setExportOptionsVisible(true);
    setExportSelectionVisible(false);
    setExportPreviewVisible(false);
    setExportType(null);
    setSelectedExportIds([]);
  };

  type ExportHandshake = {
    kind: "paperbox-handshake";
    version: 1;
    sessionId: string;
    token: string;
    exportedAt: string;
    type: ExportType;
    fileCount: number;
  };

  const buildHandshakeLink = (handshake: ExportHandshake) =>
    `paperbox://session?data=${encodeURIComponent(JSON.stringify(handshake))}`;

  const readFileAsBase64 = async (file: VaultFile) => {
    if (file.uri.startsWith("http://") || file.uri.startsWith("https://")) {
      const filename = file.name.replace(/[^a-z0-9._-]/gi, "_");
      const destination = `${FileSystem.cacheDirectory}${filename}`;
      const { uri } = await FileSystem.downloadAsync(file.uri, destination);
      return await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    }

    const decryptedUri =
      file.uri.endsWith(".enc") || file.uri.includes(".enc?")
        ? await decryptVaultFileForUse(file)
        : file.uri;

    try {
      return await FileSystem.readAsStringAsync(decryptedUri, {
        encoding: "base64",
      });
    } finally {
      if (decryptedUri !== file.uri) {
        try {
          await FileSystem.deleteAsync(decryptedUri, { idempotent: true });
        } catch {
          // no-op cleanup
        }
      }
    }
  };

  const prepareExportPayload = async (
    type: ExportType,
    selectedIds: string[],
  ): Promise<ExportPayload> => {
    const now = new Date().toISOString();
    const foldersToExport =
      type === "folder"
        ? folders.filter((folder) => selectedIds.includes(folder.id))
        : type === "all"
          ? folders
          : [];
    const fileIdsToExport =
      type === "file"
        ? selectedIds
        : type === "folder"
          ? files
              .filter((file) =>
                (file.folderIds ?? [file.folderId]).some(
                  (folderId) => folderId && selectedIds.includes(folderId),
                ),
              )
              .map((file) => file.id)
          : files.map((file) => file.id);

    const filesToExport = files.filter((file) =>
      fileIdsToExport.includes(file.id),
    );
    const filesWithContent = await Promise.all(
      filesToExport.map(async (file) => ({
        ...file,
        contentBase64: await readFileAsBase64(file),
      })),
    );

    return {
      kind: "paperbox-transfer" as const,
      version: 1,
      exportedAt: now,
      type,
      folders: foldersToExport,
      files: filesWithContent,
    };
  };

  const shareExportFile = async () => {
    if (!exportFileUri || shareFileBusy) return;
    setShareFileBusy(true);
    try {
      await Sharing.shareAsync(exportFileUri, {
        dialogTitle: "Share PaperBox export",
      });
    } catch (error) {
      console.warn("share export file error", error);
      Alert.alert("Unable to share export", "Try again later.");
    } finally {
      setShareFileBusy(false);
    }
  };

  const shareExportLink = async () => {
    if (!exportHandshakeLink || shareHandshakeBusy) return;
    setShareHandshakeBusy(true);
    try {
      await Share.share({
        message: exportHandshakeLink,
        title: "PaperBox transfer handshake",
      });
    } catch (error) {
      console.warn("share handshake error", error);
      Alert.alert("Unable to share handshake", "Try again later.");
    } finally {
      setShareHandshakeBusy(false);
    }
  };

  const generateRandomKey = (length: number) =>
    Array.from({ length }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");

  const finalizeExportPayload = async (payload: ExportPayload) => {
    const payloadText = JSON.stringify(payload);
    const size = payloadText.length;
    setExportSize(size);

    const uri = `${FileSystem.cacheDirectory}paperbox-export-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(uri, payloadText, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    setExportFileUri(uri);
    setExportPayload(payload);

    const handshake: ExportHandshake = {
      kind: "paperbox-handshake",
      version: 1,
      sessionId: `${Date.now()}-${generateRandomKey(8)}`,
      token: generateRandomKey(32),
      exportedAt: payload.exportedAt,
      type: payload.type,
      fileCount: payload.files.length,
    };

    setExportHandshakeLink(buildHandshakeLink(handshake));
  };

  const beginExport = async (type: ExportType) => {
    setExportType(type);
    setExportOptionsVisible(false);
    setSelectedExportIds([]);
    if (type === "all") {
      setExportLoading(true);
      setExportFileUri(null);
      setExportPayload(null);
      setExportHandshakeLink("");
      setExportPreviewVisible(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        const payload = await prepareExportPayload(type, []);
        await finalizeExportPayload(payload);
      } catch (error) {
        console.warn("prepare export error", error);
        Alert.alert("Could not prepare export", "Try again later.");
      } finally {
        setExportLoading(false);
      }
      return;
    }

    setExportSelectionVisible(true);
  };

  const proceedExportSelection = async () => {
    if (!exportType) return;
    if (!selectedExportIds.length && exportType !== "all") {
      Alert.alert(
        "Select at least one item",
        "Choose folders or files to export.",
      );
      return;
    }

    setExportSelectionVisible(false);
    setExportLoading(true);
    setExportFileUri(null);
    setExportPayload(null);
    setExportHandshakeLink("");
    setExportPreviewVisible(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const payload = await prepareExportPayload(exportType, selectedExportIds);
      await finalizeExportPayload(payload);
    } catch (error) {
      console.warn("prepare export error", error);
      Alert.alert("Could not prepare export", "Try again later.");
    } finally {
      setExportLoading(false);
    }
  };

  const [importSession, setImportSession] = useState<ExportHandshake | null>(
    null,
  );
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

  const themeOptions = useMemo(
    () => [
      {
        value: "light" as Settings["theme"],
        label: "Light",
        description: "Always use light mode.",
      },
      {
        value: "dark" as Settings["theme"],
        label: "Dark",
        description: "Always use dark mode.",
      },
    ],
    [],
  );

  const selectedThemeOption =
    themeOptions.find((option) => option.value === theme) ?? themeOptions[0];

  const handleThemeSelect = (value: Settings["theme"]) => {
    setTheme(value);
    setThemeDropdownOpen(false);
  };

  const handleBarCodeScanned = async (scanningResult: { data: string }) => {
    setScanned(true);
    let payloadText = scanningResult.data;

    if (payloadText.startsWith("paperbox://session?")) {
      const query = payloadText.slice(payloadText.indexOf("?") + 1);
      const params = new URLSearchParams(query);
      const encoded = params.get("data");
      if (encoded) {
        payloadText = decodeURIComponent(encoded);
      }
      try {
        const session = JSON.parse(payloadText) as ExportHandshake;
        if (session.kind !== "paperbox-handshake")
          throw new Error("Invalid handshake payload");
        setImportSession(session);
        Alert.alert(
          "Connection established",
          "Ready to receive " +
            session.fileCount +
            " file" +
            (session.fileCount === 1 ? "" : "s") +
            ". Ask the sender to transfer the export file now.",
        );
        return;
      } catch (error) {
        console.warn("handshake parse error", error);
      }
    }

    Alert.alert(
      "Invalid handshake",
      "Please scan a valid PaperBox transfer QR code.",
    );
    setScanned(false);
  };

  const onScannerMountError = (error: CameraMountError) => {
    console.warn("Scanner mount error", error);
    Alert.alert(
      "Scanner unavailable",
      error.message ?? "Unable to start the camera scanner.",
    );
  };

  const importExportFile = async () => {
    if (!importSession) {
      Alert.alert(
        "No active session",
        "Scan a transfer handshake before importing a file.",
      );
      return;
    }

    setImportBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length || !result.assets[0]?.uri)
        return;
      const fileUri = result.assets[0].uri;
      const fileText = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const payload = JSON.parse(fileText) as ExportPayload;
      if (payload.kind !== "paperbox-transfer") {
        throw new Error("Invalid export payload");
      }
      await importPayload(payload);
      Alert.alert(
        "Import complete",
        "Added " +
          payload.files.length +
          " file" +
          (payload.files.length === 1 ? "" : "s") +
          " to your vault.",
      );
      setImportVisible(false);
      setImportSession(null);
      setScanned(false);
    } catch (error) {
      console.warn("import export file error", error);
      Alert.alert(
        "Unable to import file",
        "The selected file is not a valid PaperBox export.",
      );
    } finally {
      setImportBusy(false);
    }
  };

  const importPayload = async (payload: ExportPayload) => {
    setImportBusy(true);
    try {
      const idMap = new Map<string, string>();
      const importedFolders = payload.folders.map((folder) => {
        const newId = `${Date.now()}-${Math.random()}`;
        idMap.set(folder.id, newId);
        return { ...folder, id: newId };
      });

      const remappedFolders = importedFolders.map((folder) => ({
        ...folder,
        parentId: folder.parentId ? idMap.get(folder.parentId) : undefined,
      }));

      if (remappedFolders.length) {
        addFolders(remappedFolders);
      }

      const importedFiles: VaultFile[] = [];
      for (const file of payload.files) {
        const newId = `${Date.now()}-${Math.random()}`;
        const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
        const dest = `${FileSystem.documentDirectory}PaperBox-import-${Date.now()}-${safeName}`;
        await FileSystem.writeAsStringAsync(dest, file.contentBase64, {
          encoding: "base64",
        });
        importedFiles.push({
          ...file,
          id: newId,
          uri: dest,
          folderIds: file.folderIds
            ?.map((old) => idMap.get(old))
            .filter((mapped): mapped is string => Boolean(mapped)),
          folderId: undefined,
        });
      }

      if (importedFiles.length) {
        addFiles(importedFiles);
      }
    } finally {
      setImportBusy(false);
    }
  };

  const renderExportOptions = () => (
    <Modal
      animationType="slide"
      transparent
      visible={exportOptionsVisible}
      onRequestClose={() => setExportOptionsVisible(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Export options</Text>
          <Pressable style={s.optionItem} onPress={() => beginExport("folder")}>
            <Text style={s.optionTitle}>Export folders</Text>
            <Text style={s.optionSubtitle}>
              Select folders and share their contents.
            </Text>
          </Pressable>
          <Pressable style={s.optionItem} onPress={() => beginExport("file")}>
            <Text style={s.optionTitle}>Export files</Text>
            <Text style={s.optionSubtitle}>
              Select individual files to share.
            </Text>
          </Pressable>
          <Pressable style={s.optionItem} onPress={() => beginExport("all")}>
            <Text style={s.optionTitle}>Export all</Text>
            <Text style={s.optionSubtitle}>
              Share your full vault with files and folders.
            </Text>
          </Pressable>
          <Pressable
            style={[s.modalButton, s.modalCancelButton]}
            onPress={() => setExportOptionsVisible(false)}
          >
            <Text style={[s.modalButtonText, s.modalCancelText]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  const renderExportSelection = () => (
    <Modal
      animationType="slide"
      transparent
      visible={exportSelectionVisible}
      onRequestClose={() => setExportSelectionVisible(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>
            {exportType === "folder" ? "Select folders" : "Select files"}
          </Text>
          <ScrollView
            style={s.modalActions}
            showsVerticalScrollIndicator={false}
          >
            {exportType === "folder" ? (
              folderSelection.length ? (
                folderSelection.map((folder) => {
                  const selected = selectedExportIds.includes(folder.id);
                  return (
                    <Pressable
                      key={folder.id}
                      style={[s.optionItem, selected && s.selectedRow]}
                      onPress={() => toggleExportSelection(folder.id)}
                    >
                      <Text style={s.optionTitle}>{folder.name}</Text>
                      <Text style={s.actionLabel}>{selected ? "✓" : "○"}</Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={s.modalEmpty}>
                  No folders available to export.
                </Text>
              )
            ) : fileSelection.length ? (
              fileSelection.map((file) => {
                const selected = selectedExportIds.includes(file.id);
                return (
                  <Pressable
                    key={file.id}
                    style={[s.optionItem, selected && s.selectedRow]}
                    onPress={() => toggleExportSelection(file.id)}
                  >
                    <Text style={s.optionTitle}>{file.name}</Text>
                    <Text style={s.actionLabel}>{selected ? "✓" : "○"}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={s.modalEmpty}>No files available to export.</Text>
            )}
          </ScrollView>
          <View style={s.modalFooter}>
            <Pressable
              style={[s.modalActionButton, s.modalCancelButton]}
              onPress={() => setExportSelectionVisible(false)}
            >
              <Text style={s.modalActionText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                s.modalActionButton,
                s.modalSaveButton,
                !selectedExportIds.length && s.modalDisabledButton,
              ]}
              onPress={proceedExportSelection}
              disabled={!selectedExportIds.length}
            >
              <Text style={[s.modalActionText, s.modalSaveText]}>Next</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderExportPreview = () => (
    <Modal
      animationType="slide"
      transparent
      visible={exportPreviewVisible}
      onRequestClose={() => setExportPreviewVisible(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Share transfer</Text>
          {exportLoading ? (
            <View style={s.loadingArea}>
              <ActivityIndicator size="large" color={colors.inverse} />
              <Text style={s.modalSubtitle}>Preparing transfer session…</Text>
            </View>
          ) : exportHandshakeLink ? (
            <>
              <View style={s.qrFrame}>
                <QRCode
                  value={exportHandshakeLink}
                  size={280}
                  backgroundColor="transparent"
                  color={colors.text}
                />
              </View>
              <Text style={s.modalSubtitle}>
                Scan this QR to establish a secure transfer session. Then send
                the export file to complete the transfer.
              </Text>
              {exportSize !== null ? (
                <Text style={s.modalFileName}>
                  Export file size: {(exportSize / 1024).toFixed(1)} KB
                </Text>
              ) : null}
              <Text
                style={s.modalFileName}
                numberOfLines={2}
                ellipsizeMode="middle"
              >
                {exportHandshakeLink}
              </Text>
              <Pressable
                style={[
                  s.modalButton,
                  s.modalSaveButton,
                  shareHandshakeBusy && s.modalDisabledButton,
                ]}
                onPress={shareExportLink}
                disabled={shareHandshakeBusy}
              >
                {shareHandshakeBusy ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={[s.modalActionText, s.modalSaveText]}>
                    Share handshake
                  </Text>
                )}
              </Pressable>
              {exportFileUri ? (
                <Pressable
                  style={[
                    s.modalButton,
                    s.modalSaveButton,
                    shareFileBusy && s.modalDisabledButton,
                  ]}
                  onPress={shareExportFile}
                  disabled={shareFileBusy}
                >
                  {shareFileBusy ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <Text style={[s.modalActionText, s.modalSaveText]}>
                      Share export file
                    </Text>
                  )}
                </Pressable>
              ) : null}
              <Pressable
                style={[s.modalButton, s.modalCancelButton]}
                onPress={() => setExportPreviewVisible(false)}
              >
                <Text style={[s.modalButtonText, s.modalCancelText]}>
                  Close
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={s.modalEmpty}>Unable to prepare export.</Text>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderImportScanner = () => (
    <Modal
      animationType="slide"
      transparent
      visible={importVisible}
      onRequestClose={() => setImportVisible(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Import transfer</Text>
          {scannerPermission === false ? (
            <Text style={s.modalSubtitle}>
              Camera access is required to scan transfer handshakes.
            </Text>
          ) : scannerPermission === null ? (
            <ActivityIndicator size="large" color={colors.inverse} />
          ) : (
            <View style={s.scannerContainer}>
              <CameraView
                style={s.scanner}
                active={true}
                onMountError={onScannerMountError}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              />
            </View>
          )}
          {importSession ? (
            <>
              <View style={{ marginBottom: 16 }}>
                <Text style={s.modalSubtitle}>
                  Connected to session {importSession.sessionId}. Receive{" "}
                  {importSession.fileCount} file
                  {importSession.fileCount === 1 ? "" : "s"} from the sender.
                </Text>
                <Text style={s.modalSubtitle}>
                  Once the sender shares the exported file, use the button below
                  to import it into your vault.
                </Text>
              </View>
              <Pressable
                style={[
                  s.modalButton,
                  s.modalSaveButton,
                  importBusy && s.modalDisabledButton,
                ]}
                onPress={importExportFile}
                disabled={importBusy}
              >
                {importBusy ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={[s.modalActionText, s.modalSaveText]}>
                    Import export file
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={s.modalSubtitle}>
              Point your camera at a PaperBox transfer QR code to establish the
              secure connection.
            </Text>
          )}
          {importBusy ? (
            <ActivityIndicator size="small" color={colors.inverse} />
          ) : null}
          <Pressable
            style={[s.modalButton, s.modalCancelButton]}
            onPress={() => {
              setImportVisible(false);
              setImportSession(null);
              setScanned(false);
              setScannerPermission(null);
            }}
          >
            <Text style={[s.modalButtonText, s.modalCancelText]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  return (
    <Screen>
      <Text style={s.title}>Settings</Text>

      <Text style={s.label}>PREFERENCES</Text>
      <View style={s.group}>
        <SettingsRow
          icon="moon"
          label="Theme"
          colors={colors}
          onPress={() => setThemeDropdownOpen((current) => !current)}
        >
          <View style={s.themeDropdownHeader}>
            <Text style={s.themeDropdownLabel}>
              {selectedThemeOption.label}
            </Text>
            <Feather
              name={themeDropdownOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.secondary}
            />
          </View>
        </SettingsRow>
        {themeDropdownOpen ? (
          <View style={s.themeDropdownOptions}>
            {themeOptions.map((option) => {
              const selected = theme === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    s.themeDropdownOption,
                    selected && s.themeDropdownOptionSelected,
                  ]}
                  onPress={() => handleThemeSelect(option.value)}
                >
                  <View style={s.themeDropdownOptionRow}>
                    <Text
                      style={[
                        s.themeDropdownOptionLabel,
                        selected && s.themeDropdownOptionLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected ? (
                      <Feather name="check" size={16} color={colors.text} />
                    ) : null}
                  </View>
                  <Text style={s.themeDropdownOptionDescription}>
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <SettingsRow icon="shield" label="App lock" colors={colors}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch
              value={lockEnabled}
              disabled={!authAvailable}
              onValueChange={(v) => setLockEnabled(v)}
              trackColor={{ false: colors.muted, true: colors.inverse }}
            />
            {!authAvailable ? (
              <Text style={s.unavailableLabel}>Unavailable</Text>
            ) : null}
          </View>
        </SettingsRow>
        {!authAvailable ? (
          <Text style={s.helpText}>
            App lock requires a native runtime with secure authentication
            support. Use a custom build or standalone app.
          </Text>
        ) : null}
      </View>
      <Text style={s.label}>VAULT</Text>
      <View style={s.group}>
        <SettingsRow
          icon="download"
          label="Export"
          colors={colors}
          onPress={openExportOptions}
        >
          <Feather
            key={theme}
            name="chevron-right"
            size={18}
            color={colors.secondary}
          />
        </SettingsRow>
        <SettingsRow
          icon="upload"
          label="Import"
          colors={colors}
          onPress={() => setImportVisible(true)}
        >
          <Feather
            key={theme}
            name="chevron-right"
            size={18}
            color={colors.secondary}
          />
        </SettingsRow>
        <SettingsRow
          icon="shield"
          label="Privacy"
          colors={colors}
          onPress={() => navigation.navigate("Privacy")}
        >
          <Feather
            key={theme}
            name="chevron-right"
            size={18}
            color={colors.secondary}
          />
        </SettingsRow>
        <SettingsRow
          icon="mail"
          label="Contact"
          colors={colors}
          onPress={async () => {
            try {
              const mailto =
                "mailto:dustmedianetwork@gmail.com?subject=" +
                encodeURIComponent("PaperBox support");
              const supported = await Linking.canOpenURL(mailto);
              if (supported) await Linking.openURL(mailto);
              else
                Alert.alert(
                  "Unable to open mail app",
                  "No mail app is available to send email.",
                );
            } catch (e) {
              console.warn("open mail error", e);
              Alert.alert(
                "Unable to open mail app",
                "Could not open your mail application.",
              );
            }
          }}
        >
          <Feather
            key={theme}
            name="chevron-right"
            size={18}
            color={colors.secondary}
          />
        </SettingsRow>
      </View>
      <Text style={s.version}>
        PaperBox - Version 1.0.0{"\n"} Developed by DustMedia.{" "}
      </Text>

      {renderExportOptions()}
      {renderExportSelection()}
      {renderExportPreview()}
      {renderImportScanner()}
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
    title: {
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1,
      color: c.text,
      marginBottom: 28,
      marginTop: 30,
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      color: c.secondary,
      marginBottom: 8,
    },
    group: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      overflow: "hidden",
      marginBottom: 25,
      backgroundColor: c.elevated,
    },
    version: {
      textAlign: "center",
      color: c.secondary,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 20,
    },
    row: {
      height: 60,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    themeDropdownHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    themeDropdownLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: c.text,
    },
    description: {
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
    },
    themeDropdownOptions: {
      borderBottomWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    themeDropdownOption: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    themeDropdownOptionSelected: {
      backgroundColor: c.elevated,
    },
    themeDropdownOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    themeDropdownOptionLabel: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    themeDropdownOptionLabelSelected: {
      color: c.text,
    },
    themeDropdownOptionDescription: {
      marginTop: 4,
      fontSize: 13,
      color: c.secondary,
      lineHeight: 18,
    },
    name: { fontSize: 15, fontWeight: "600", color: c.text, flex: 1 },
    unavailableLabel: {
      color: c.secondary,
      fontSize: 12,
    },
    helpText: {
      color: c.secondary,
      fontSize: 12,
      paddingHorizontal: 16,
      paddingBottom: 10,
      lineHeight: 18,
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
    inputField: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.background,
      color: c.text,
      marginBottom: 12,
    },
    modalActions: {
      marginBottom: 16,
    },
    optionItem: {
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    optionTitle: {
      fontWeight: "700",
      color: c.text,
      fontSize: 16,
      maxWidth: "85%",
    },
    optionSubtitle: {
      color: c.secondary,
      fontSize: 13,
      marginTop: 4,
    },
    selectedRow: {
      backgroundColor: c.elevated,
    },
    actionLabel: {
      color: c.text,
      fontSize: 16,
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
    modalDisabledButton: {
      opacity: 0.5,
    },
    qrFrame: {
      alignItems: "center",
      justifyContent: "center",
      height: 320,
      backgroundColor: c.background,
      borderRadius: 20,
      overflow: "hidden",
      marginBottom: 16,
    },
    qrWebView: {
      width: "100%",
      height: "100%",
      backgroundColor: "transparent",
    },
    loadingArea: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 260,
    },
    scannerContainer: {
      width: "100%",
      height: 320,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: c.background,
      marginBottom: 16,
    },
    scanner: {
      flex: 1,
    },
    modalFileName: {
      color: c.secondary,
      marginBottom: 12,
    },
  });

const rowStyles = (c: {
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
    row: {
      height: 60,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    name: { fontSize: 15, fontWeight: "600", color: c.text, flex: 1 },
  });
