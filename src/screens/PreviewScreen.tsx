import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Modal,
  Linking,
  AppState,
  PermissionsAndroid,
  Pressable,
} from "react-native";
import { showAlert, showToast } from "../services/alertService";

const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { Video, ResizeMode } from "expo-av";
import { Feather } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import ImageViewer from "react-native-image-zoom-viewer";
import { RootStackParams } from "../navigation/types";
import { Screen } from "../components/Screen";
import { useVaultStore } from "../store/useVaultStore";
import { usePaperTheme } from "../theme/usePaperTheme";
import { withAlpha } from "../theme/utils";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import RNFS from "react-native-fs";
import * as ScreenCapture from "expo-screen-capture";
import {
  decryptVaultFileForUse,
  clearDecryptedCache,
  persistVaultFile,
} from "../services/vaultStorage";
import PdfViewer from "../components/PdfViewer";
import { downloadFile } from "../services/downloadService";
import {
  convertOfficeFileToPdf,
  isOfficeExtension,
} from "../services/officeToPdfService";
import { shouldShowExternalPdfOption } from "../services/externalPdfService";
import { PdfDraft, VaultFile } from "../types";
import { kindOf } from "../utils/files";

type Props = NativeStackScreenProps<RootStackParams, "Preview">;

const EXTERNAL_HANDOFF_GRACE_MS = 1500;

const extFromUri = (uri: string) => {
  try {
    const last = uri.split("?")[0].split("/").pop() || "";
    const parts = last.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  } catch {
    return "";
  }
};

const getCacheDirectory = () =>
  (FileSystem as any).cacheDirectory ??
  (FileSystem as any).documentDirectory ??
  "";

const normalizeFileUri = (uri: string) =>
  uri.startsWith("file://") || uri.startsWith("content://")
    ? uri
    : `file://${uri}`;

const isEncryptedUri = (uri?: string | null) =>
  !!uri && (uri.endsWith(".enc") || uri.includes(".enc?"));

const ensureFilename = (name: string, ext: string) => {
  const cleaned = name.replace(/[^a-z0-9\-_.]/gi, "_");
  const normalizedExt = ext.toLowerCase();
  if (!normalizedExt) return cleaned || "file";
  if (cleaned.toLowerCase().endsWith(`.${normalizedExt}`)) {
    return cleaned;
  }
  return `${cleaned}.${normalizedExt}`;
};

const extensionFromMimeType = (mimeType?: string) => {
  if (!mimeType) return "";
  const type = mimeType.toLowerCase();
  if (type.includes("pdf")) return "pdf";
  if (type.includes("presentationml.presentation") || type.includes("pptx"))
    return "pptx";
  if (type.includes("powerpoint") || type.includes("ppt")) return "ppt";
  if (type.includes("wordprocessingml.document") || type.includes("docx"))
    return "docx";
  if (type.includes("msword")) return "doc";
  if (type.includes("spreadsheetml.sheet") || type.includes("xlsx"))
    return "xlsx";
  if (type.includes("excel") || type.includes("xls")) return "xls";
  return "";
};

const mimeTypeFromExtension = (ext: string): string => {
  switch (ext.toLowerCase()) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    default:
      return "*/*";
  }
};

const saveUriToCache = async (
  uri: string,
  filename: string,
): Promise<string> => {
  const cacheDir = getCacheDirectory();
  const destinationPath = `${cacheDir}${filename}`;
  const destination = normalizeFileUri(destinationPath);
  const fsAny = FileSystem as any;

  // A file may already be staged at this exact cache location. Deleting it before copying
  // would delete the source as well, leaving external apps with a broken URI.
  if (normalizeFileUri(uri) === destination) {
    return destination;
  }

  if (cacheDir) {
    try {
      await fsAny.makeDirectoryAsync(cacheDir, { intermediates: true });
    } catch {
      // Directory may already exist or be managed by the file system.
    }
  }

  try {
    const existing = await fsAny.getInfoAsync(destination);
    if (existing.exists) {
      await fsAny.deleteAsync(destination, { idempotent: true });
    }
  } catch (e) {
    // Ignore cache inspection failures.
  }

  if (cacheDir) {
    try {
      await fsAny.makeDirectoryAsync(cacheDir, { intermediates: true });
    } catch (e) {
      // Directory may already exist or be managed by the file system.
    }
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const { uri: downloadedUri } = await FileSystem.downloadAsync(
      uri,
      destination,
    );
    return normalizeFileUri(downloadedUri);
  }

  if (isEncryptedUri(uri)) {
    const decryptedUri = await decryptVaultFileForUse({
      id: "preview",
      name: filename,
      uri,
      size: 0,
      extension: filename.includes(".")
        ? filename.split(".").pop() || "bin"
        : "bin",
      kind: "other",
      createdAt: new Date().toISOString(),
      isFavorite: false,
      isPinned: false,
      tags: [],
    });
    return normalizeFileUri(decryptedUri);
  }

  if (uri.startsWith("content://") || uri.startsWith("file://")) {
    try {
      await FileSystem.copyAsync({ from: uri, to: destination });
      return normalizeFileUri(destination);
    } catch (e) {
      // Ignore copy failures and fall back to reading the file directly.
    }

    try {
      const base64 = await fsAny.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await fsAny.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return normalizeFileUri(destination);
    } catch (e) {
      // Ignore fallback cache write errors.
      return normalizeFileUri(uri);
    }
  }

  return normalizeFileUri(uri);
};

export function PreviewScreen({ route, navigation }: Props) {
  const { colors } = usePaperTheme();
  const styles = getStyles(colors);
  const vaultFile = useVaultStore((s) =>
    s.files.find((f) => f.id === route.params.fileId),
  );
  const externalUri = route.params.externalUri;
  const externalName = route.params.externalName || "document.pdf";
  const file: VaultFile | undefined = vaultFile ||
    (externalUri
      ? {
          id: `external-${externalUri}`,
          name: externalName,
          uri: externalUri,
          mimeType: route.params.externalMimeType || "application/pdf",
          size: 0,
          extension: "pdf",
          kind: "pdf",
          createdAt: new Date().toISOString(),
          isFavorite: false,
          isPinned: false,
          tags: [],
        }
      : undefined);
  const addFiles = useVaultStore((s) => s.addFiles);
  const addConvertedPdf = useVaultStore((s) => s.addConvertedPdf);
  const addPdfDraft = useVaultStore((s) => s.addPdfDraft);
  const isExternalFile = Boolean(externalUri || !vaultFile);
  const savedConvertedPdf = useVaultStore((s) => {
    const source = s.files.find((f) => f.id === route.params.fileId);
    return source?.convertedPdfId
      ? s.files.find((f) => f.id === source.convertedPdfId)
      : undefined;
  });

  if (!file) {
    return (
      <Screen style={styles.content}>
        <View style={styles.center}>
          <Feather name="alert-circle" size={48} color={colors.secondary} />
          <Text style={styles.errorText}>File not found.</Text>
        </View>
      </Screen>
    );
  }

  const uri = file.uri;
  const name = file.name || "preview";
  const officeExtension = (
    file.extension || extensionFromMimeType(file.mimeType) || extFromUri(uri)
  ).toLowerCase();
  const isOfficeFile = isOfficeExtension(officeExtension);
  const isPdfFile = file.kind === "pdf" || officeExtension === "pdf";
  const isImageFile =
    file.kind === "image" ||
    ["jpg", "jpeg", "png", "gif", "webp"].includes(officeExtension);

  const [loading, setLoading] = useState<boolean>(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [convertedFilename, setConvertedFilename] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [zoomVisible, setZoomVisible] = useState<boolean>(false);
  const [pdfOpened, setPdfOpened] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showExternalPdfOption, setShowExternalPdfOption] = useState<boolean | null>(
    Platform.OS === "android" ? null : true,
  );
  const videoRef = useRef<Video | null>(null);

  // reloadKey forces re-run of preview preparation
  const [reloadKey, setReloadKey] = useState(0);

  // Keep a ref mirror of localUri so background/AppState handlers and async callbacks always see
  // the latest value without needing to be re-subscribed on every state change.
  const localUriRef = useRef<string | null>(null);
  useEffect(() => {
    localUriRef.current = localUri;
  }, [localUri]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title:
        loading && isOfficeFile
          ? "Converting to PDF…"
          : convertedFilename || name,
      headerTitleStyle: {
        fontSize: 18,
        fontWeight: "500",
      },
      headerRight: () =>
        isPdfFile || convertedFilename || isImageFile ? (
          <Pressable
            onPress={() => setMenuVisible(true)}
            disabled={Boolean(actionLoading) || loading}
            style={styles.headerMenuButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Preview actions"
          >
            <Feather name="more-vertical" size={22} color={colors.text} />
          </Pressable>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    navigation,
    colors.text,
    file,
    actionLoading,
    loading,
    isOfficeFile,
    isPdfFile,
    isImageFile,
    convertedFilename,
    name,
  ]);

  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync();
    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);

  // Clear decrypted cache on background to minimize risk of plaintext remnants. Also try
  // to delete any single-file preview currently in use.
  // Keep decrypted file available when launching external viewers. When the app backgrounds
  // because an external viewer was opened, skip immediate deletion so the viewer can read the
  // file. Clear decrypted cache on resume instead — but only on a "real" resume, not on the
  // background/active flicker that chooser sheets and permission dialogs cause.
  const openedExternallyRef = useRef(false);
  const lastBackgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (nextState: string) => {
      try {
        if (nextState === "active") {
          const backgroundedAt = lastBackgroundedAtRef.current;
          const elapsed = backgroundedAt ? Date.now() - backgroundedAt : null;
          const isLikelyHandoffFlicker =
            openedExternallyRef.current &&
            elapsed !== null &&
            elapsed < EXTERNAL_HANDOFF_GRACE_MS;

          if (isLikelyHandoffFlicker) {
            try {
            } catch (e) {}
            return;
          }

          openedExternallyRef.current = false;
          void clearDecryptedCache();
          return;
        }

        // If app goes to background/inactive and we specifically opened an external viewer,
        // leave the decrypted file in place so the external app can read it. Otherwise purge.
        if (nextState === "background" || nextState === "inactive") {
          lastBackgroundedAtRef.current = Date.now();

          if (openedExternallyRef.current) {
            try {
            } catch (e) {}
            return;
          }

          try {
            void clearDecryptedCache();
          } catch (e) {
            try {
            } catch (_) {}
          }

          const currentLocalUri = localUriRef.current;
          if (
            currentLocalUri &&
            currentLocalUri !== uri &&
            currentLocalUri.startsWith("file://")
          ) {
            void (FileSystem as any)
              .deleteAsync(currentLocalUri, { idempotent: true })
              .catch((err: any) => {
                try {
                } catch (e) {}
              });
            // remove reference so we don't attempt to double-delete on unmount
            setLocalUri(null);
          }
        }
      } catch (e) {
        try {
        } catch (e) {}
      }
    };

    const sub = AppState.addEventListener
      ? AppState.addEventListener("change", handler)
      : null;
    return () => {
      try {
        if (sub && typeof sub.remove === "function") sub.remove();
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [uri]);
  const extension = file.extension?.toLowerCase() || "";
  const mimeExtension = extensionFromMimeType(file.mimeType);
  const ext =
    extension ||
    mimeExtension ||
    (file.kind === "pdf" ? "pdf" : "") ||
    extFromUri(uri);
  const filename = ensureFilename(
    name,
    ext || extension || mimeExtension || "bin",
  );

  const isImage = isImageFile;
  const isVideo =
    file.kind === "video" || ["mp4", "mov", "mkv", "webm"].includes(ext);
  const isPdf = file.kind === "pdf" || ext === "pdf";
  const isAudio = ["mp3", "m4a", "wav", "aac", "ogg"].includes(ext);
  const isPdfPreview = isPdf || Boolean(convertedFilename);
  const previewFilename = convertedFilename || filename;

  useEffect(() => {
    let active = true;
    if (!isPdfPreview) {
      setShowExternalPdfOption(true);
      return () => {
        active = false;
      };
    }

    setShowExternalPdfOption(Platform.OS === "android" ? null : true);
    void shouldShowExternalPdfOption().then((shouldShow) => {
      if (active) setShowExternalPdfOption(shouldShow);
    });

    return () => {
      active = false;
    };
  }, [isPdfPreview, uri]);

  const closeActionMenu = () => setMenuVisible(false);

  const refreshPreview = () => {
    closeActionMenu();
    setError(null);
    if (!isOfficeFile) setLoading(true);
    setLocalUri(null);
    setConvertedFilename(null);
    setReloadKey((key) => key + 1);
  };

  const downloadFromMenu = async () => {
    if (actionLoading || !file) return;
    closeActionMenu();
    setActionLoading("Downloading…");
    try {
      const saved = await downloadFile(file);
      Alert.alert("Download complete", `Saved to ${saved}`);
    } catch (e: any) {
      if (
        e &&
        typeof e.message === "string" &&
        e.message.includes("No folder selected")
      ) {
        Alert.alert(
          "Download cancelled",
          "No folder selected for saving files.",
        );
      } else if (e && typeof e.message === "string") {
        Alert.alert("Download failed", e.message);
      } else {
        Alert.alert("Download failed", "Unable to save file to device.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const importToVaultFromMenu = async () => {
    if (actionLoading || !file) return;
    closeActionMenu();
    setActionLoading("Importing to vault…");
    try {
      let sourceUri = localUriRef.current || localUri;
      if (!sourceUri) {
        sourceUri = await saveUriToCache(uri, filename);
      }
      if (!sourceUri) {
        throw new Error("Could not access file to import.");
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const extension = ext || extensionFromMimeType(file.mimeType) || "pdf";
      const cleanName = file.name || "Imported Document";
      const filenameWithoutExt = cleanName.replace(/\.[^/.]+$/, "");

      const vaultUri = await persistVaultFile(
        sourceUri,
        `${id}-${filenameWithoutExt}`,
        extension,
        false,
      );

      let fileSize = file.size ?? 0;
      if (!fileSize) {
        try {
          const info = await (FileSystem as any).getInfoAsync(sourceUri, {
            size: true,
          });
          if (info.exists && info.size) {
            fileSize = info.size;
          }
        } catch (_) {}
      }

      const sourceKey = `${cleanName.trim().toLowerCase()}|${fileSize}|${(
        file.mimeType || ""
      ).toLowerCase()}`;

      const importedVaultFile: VaultFile = {
        id,
        name: cleanName,
        uri: vaultUri,
        mimeType:
          file.mimeType ||
          mimeTypeFromExtension(extension) ||
          "application/pdf",
        size: fileSize,
        extension,
        kind: kindOf(extension),
        createdAt: new Date().toISOString(),
        isFavorite: false,
        isPinned: false,
        tags: [],
        source: "import",
        sourceKey,
      };

      addFiles([importedVaultFile]);
      showToast("File imported to vault");
      navigation.replace("Preview", { fileId: importedVaultFile.id });
    } catch (e: any) {
      Alert.alert(
        "Import failed",
        e?.message || "Unable to encrypt and import file into vault.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const addPageToPdf = async () => {
    if (actionLoading || !vaultFile || !isPdfPreview) return;
    closeActionMenu();
    setActionLoading("Preparing page editor…");
    try {
      const now = new Date().toISOString();
      const draft: PdfDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: `Edit-${vaultFile.name}`,
        pages: vaultFile.pdfPages ? [...vaultFile.pdfPages] : [],
        createdAt: now,
        updatedAt: now,
        sourcePdfId: vaultFile.id,
        includesSourcePages: Boolean(
          vaultFile.pdfPages?.length && !vaultFile.pdfHasUnextractedBase,
        ),
        basePageCount: vaultFile.pdfHasUnextractedBase
          ? vaultFile.pdfPages?.length ?? 0
          : 0,
      };
      await addPdfDraft(draft);
      navigation.navigate("PdfReview", { draftId: draft.id });
    } catch {
      Alert.alert("Could not add page", "Unable to prepare this PDF for editing.");
    } finally {
      setActionLoading(null);
    }
  };

  const convertToPdf = async () => {
    if (savedConvertedPdf) {
      navigation.navigate("Preview", { fileId: savedConvertedPdf.id });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let sourceUri = localUriRef.current;
      if (!sourceUri) {
        sourceUri = await saveUriToCache(uri, filename);
        setLocalUri(sourceUri);
      }

      const converted = await convertOfficeFileToPdf(sourceUri, filename);
      const convertedId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const convertedInfo = await (FileSystem as any).getInfoAsync(
        converted.uri,
        { size: true },
      );
      const vaultUri = await persistVaultFile(
        converted.uri,
        `${convertedId}-${converted.filename.replace(/\.pdf$/i, "")}`,
        "pdf",
      );
      const inheritedFolderIds = file.folderIds ?? (file.folderId ? [file.folderId] : []);
      const convertedFile: VaultFile = {
        id: convertedId,
        name: converted.filename,
        uri: vaultUri,
        mimeType: "application/pdf",
        size: convertedInfo.size ?? 0,
        extension: "pdf",
        kind: "pdf",
        folderIds: inheritedFolderIds.length ? inheritedFolderIds : undefined,
        folderId: inheritedFolderIds[0],
        createdAt: new Date().toISOString(),
        isFavorite: false,
        isPinned: false,
        tags: [],
        source: "import",
        convertedFromId: file.id,
      };
      addConvertedPdf(file.id, convertedFile);
      navigation.replace("Preview", { fileId: convertedFile.id });
    } catch (conversionError: any) {
      setError(
        conversionError?.message ||
          "Unable to convert this Office file to PDF.",
      );
    } finally {
      setLoading(false);
    }
  };

  // … (download logic unchanged) …
  useEffect(() => {
    let mounted = true;

    async function maybeDownload() {
      // Office files start on the action screen. Only stage a plaintext copy when the
      // user chooses conversion or hands the document to another application.
      if (isOfficeFile) return;

      // If the stored URI points to an encrypted blob, always decrypt it first regardless of kind
      try {
        if (isEncryptedUri(uri)) {
          setLoading(true);
          try {
            try {
            } catch (e) {}
            const savedUri = await saveUriToCache(uri, filename);
            try {
            } catch (e) {}
            if (mounted) setLocalUri(savedUri);
          } catch (e) {
            if (mounted)
              setError("Unable to prepare encrypted file for preview.");
          } finally {
            if (mounted) setLoading(false);
          }
          return;
        }
      } catch (e) {
        // ignore URI helper errors
      }

      if (isPdf || (!isImage && !isVideo && !isAudio)) {
        setLoading(true);
        try {
          try {
          } catch (e) {}
          const savedUri = await saveUriToCache(uri, filename);
          try {
          } catch (e) {}
          // Cached preview URI prepared.
          if (mounted) setLocalUri(savedUri);
        } catch (e) {
          if (mounted) setError("Unable to prepare file for preview.");
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        try {
        } catch (e) {}
        setLocalUri(uri);
      }
    }

    maybeDownload();
    return () => {
      mounted = false;
    };
  }, [uri, reloadKey, isOfficeFile]);

  useEffect(() => {
    return () => {
      try {
      } catch (e) {}
      if (!localUri || localUri === uri) return;
      // If we intentionally opened the file externally, preserve the decrypted temp so the external
      // app can read it. It will be cleared on resume by the AppState handler.
      if (openedExternallyRef.current) {
        try {
        } catch (e) {}
        return;
      }
      if (!localUri.startsWith("file://")) return;
      void (FileSystem as any)
        .deleteAsync(localUri, { idempotent: true })
        .catch((err: any) => {
          try {
          } catch (e) {}
        });
    };
  }, [localUri, uri]);

  // In-app PDF rendering will be used for PDFs (react-native-pdf). The previous behavior
  // automatically opened PDFs in an external viewer; that auto-open is disabled so the in-app
  // viewer can be shown instead. Falling back to external viewer is still supported via UI.
  // (Effect intentionally removed.)

  const copyToDownloads = async (
    sourceUri: string,
    filename: string,
  ): Promise<string> => {
    try {
      // Normalize source path to a filesystem path for RNFS
      const srcPath = sourceUri.startsWith("file://")
        ? sourceUri.replace("file://", "")
        : sourceUri;
      const rnfsAny = RNFS as any;
      let downloadsDir =
        rnfsAny.DownloadDirectoryPath ||
        (rnfsAny.ExternalStorageDirectoryPath
          ? `${rnfsAny.ExternalStorageDirectoryPath}/Download`
          : null);
      if (!downloadsDir) {
        throw new Error("No Downloads directory available on this device");
      }

      // Request write permission on Android if needed
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          // Still attempt copy; caller will receive an error if it truly fails due to permission.
          throw new Error("WRITE_EXTERNAL_STORAGE permission denied");
        }
      } catch (permErr) {
        // Log and continue; copying will likely fail, but we'll attempt other strategies.
        try {
        } catch (_) {}
      }

      const destPath = `${downloadsDir}/${filename}`;

      // If destination exists, overwrite
      try {
        const exists = await rnfsAny.exists(destPath);
        if (exists) {
          await rnfsAny.unlink(destPath).catch(() => {});
        }
      } catch (e) {
        // ignore
      }

      // First try a direct RNFS copy from the app file path (no base64 roundtrip).
      try {
        const srcExists = await rnfsAny.exists(srcPath);
        if (srcExists) {
          await rnfsAny.copyFile(srcPath, destPath);
          return `file://${destPath}`;
        }
      } catch (e) {
        // Ignore and fall back to reading via expo-file-system
        try {
        } catch (_) {}
      }

      // Fallback: use expo-file-system to read base64 and write with RNFS
      try {
        const fsAny = FileSystem as any;
        const info = await fsAny.getInfoAsync(sourceUri, { size: true });
        if (!info.exists)
          throw new Error("Source file does not exist for export");

        const base64 = await fsAny.readAsStringAsync(sourceUri, {
          encoding: fsAny.EncodingType.Base64,
        });
        await rnfsAny.writeFile(destPath, base64, "base64");
        return `file://${destPath}`;
      } catch (e) {
        try {
        } catch (_) {}
        throw e;
      }
    } catch (e) {
      try {
      } catch (_) {}
      throw e;
    }
  };
  const openExternally = async () => {
    // Mark we're initiating an external handoff so AppState handler won't purge decrypted files during export/launch.
    openedExternallyRef.current = true;
    lastBackgroundedAtRef.current = null;
    try {
      try {
      // Always hand Android a fresh content:// URI. Passing a private file:// URI (or a
      // previously-generated content URI) directly is unreliable across viewers, especially
      // for Office files. getContentUriAsync creates a FileProvider URI and grants the selected
      // application read access using the documented IntentLauncher flow.
      let readyForExternalApp = localUriRef.current;
      if (!readyForExternalApp) {
        readyForExternalApp = await saveUriToCache(uri, filename);
      }
      readyForExternalApp = await saveUriToCache(readyForExternalApp, filename);
      localUriRef.current = readyForExternalApp;
      setLocalUri(readyForExternalApp);

      const directMimeType = file.mimeType || mimeTypeFromExtension(ext);
      if (Platform.OS === "android") {
        const fsAny = FileSystem as any;
        const contentUri = readyForExternalApp.startsWith("content://")
          ? readyForExternalApp
          : await fsAny.getContentUriAsync(readyForExternalApp);

        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          type: directMimeType,
          // FLAG_GRANT_READ_URI_PERMISSION. Do not request broad storage permissions.
          flags: 1,
        });
        return;
      }

      // iOS does not expose Android-style VIEW intents. Its system share/open sheet is the
      // supported way to hand a local document to another installed application.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(readyForExternalApp, { dialogTitle: file.name });
        return;
      }
      } catch {
        // Some older Android devices/providers cannot create a content URI from the staging
        // file. Keep the previous, more permissive fallback below for those devices.
      }

      let target = localUriRef.current;
      if (!target) {
        target = await saveUriToCache(uri, filename);
        if (target) {
          setLocalUri(target);
        }
      }

      if (!target) {
        target = uri;
      }

      const finalTarget = target || uri;
      let mimeType = file.mimeType || mimeTypeFromExtension(ext);
      // Ensure we hand over a decrypted file to external apps. If finalTarget points to
      // an encrypted blob (.enc), decrypt it first so external viewers receive the real PDF/image.

      let dataUri = finalTarget;
      try {
        if (isEncryptedUri(dataUri)) {
          try {
            // Keep decrypted temp available for external app to read; mark openedExternallyRef
            openedExternallyRef.current = true;
            // If dataUri is a content:// URI (converted earlier), copy it to app cache so
            // decryptVaultFileForUse can read it (expo FileSystem.readAsStringAsync doesn't support content://).
            const fsAny = FileSystem as any;
            let decryptSource = dataUri;
            if (decryptSource.startsWith("content://")) {
              try {
                const cacheDir = getCacheDirectory();
                const tmpName = `tmp-decrypt-${Date.now()}-${Math.random().toString(36).slice(2)}.${filename.includes(".") ? filename.split(".").pop() : "enc"}`;
                const tmpDest = `${cacheDir}${tmpName}`;
                try {
                  await fsAny.copyAsync({ from: decryptSource, to: tmpDest });
                  decryptSource = tmpDest;
                  try {
                  } catch (_) {}
                } catch (copyErr) {
                  try {
                  } catch (_) {}
                }
              } catch (copyErr2) {
                try {
                } catch (_) {}
              }
            }

            const decrypted = await decryptVaultFileForUse({
              id: "external",
              name: filename,
              uri: decryptSource,
              size: 0,
              extension: filename.includes(".")
                ? filename.split(".").pop() || "bin"
                : "bin",
              kind: "other",
              createdAt: new Date().toISOString(),
              isFavorite: false,
              isPinned: false,
              tags: [],
            });
            if (decrypted) {
              dataUri = decrypted;
              try {
              } catch (_) {}
              // Preserve localUri so cleanup logic doesn't delete it while external app reads it
              if (dataUri.startsWith("file://")) {
                setLocalUri(dataUri);
              }
            }
          } catch (decryptErr) {
            try {
            } catch (_) {}
            // continue — we'll attempt other fallbacks below
          }
        }
      } catch (e) {
        try {
        } catch (_) {}
      }

      // Open the file with the appropriate external handler.

      if (Platform.OS === "android") {
        // Verify the file exists and is non-empty before attempting an external handoff.
        try {
          const fsAny = FileSystem as any;
          const infoCheck = await fsAny.getInfoAsync(
            normalizeFileUri(dataUri),
            { size: true },
          );
          if (
            !infoCheck.exists ||
            (infoCheck.size !== undefined && infoCheck.size === 0)
          ) {
            // If the prepared local file is missing/empty, surface an error instead of launching a blank viewer.
            try {
            } catch (_) {}
            setError("File not available to open externally.");
            openedExternallyRef.current = false;
            return;
          }
        } catch (e) {
          // getInfoAsync may fail for some content URIs; ignore and continue with other checks.
          try {
          } catch (_) {}
        }

        // Prefer converting an app-private file:// URI to a content:// URI so external apps can read it
        // without requiring WRITE_EXTERNAL_STORAGE or copying into Downloads. This is supported by
        // expo-file-system.getContentUriAsync on Android.
        try {
          const fsAny = FileSystem as any;
          if (
            dataUri.startsWith("file://") &&
            typeof fsAny.getContentUriAsync === "function"
          ) {
            try {
              const content = await fsAny.getContentUriAsync(dataUri);
              const contentUri =
                typeof content === "string" ? content : content?.uri;
              if (contentUri && contentUri.startsWith("content://")) {
                dataUri = contentUri;
                try {
                } catch (_) {}
              }
            } catch (e) {
              try {
              } catch (_) {}
            }
          }
        } catch (e) {
          try {
          } catch (_) {}
        }

        // If conversion to content:// succeeded, try launching intent directly (preferred).
        if (dataUri.startsWith("content://")) {
          try {
            // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (0x10000000).
            // NOTE: 2 is FLAG_GRANT_WRITE_URI_PERMISSION, not read — using it here was the
            // original bug that made every external viewer fail to read the handed-off file.
            const INTENT_FLAGS = 1 | 0x10000000;
            await IntentLauncher.startActivityAsync(
              "android.intent.action.VIEW",
              {
                data: dataUri,
                type: mimeType,
                flags: INTENT_FLAGS,
              },
            );
            return;
          } catch (e) {
            // Do not clear openedExternallyRef here yet; allow fallback strategies to preserve the file until failure is final.
            try {
            } catch (_) {}
            // Fall through to attempt other strategies
          }
        }

        // If we were not able to obtain a content:// URI, fall back to copying into Downloads.
        try {
          const exported = await copyToDownloads(dataUri, filename);
          if (exported) {
            dataUri = exported;
            try {
            } catch (_) {}
          }
        } catch (e) {
          try {
          } catch (_) {}
        }

        // Normalize to file:// when necessary for downstream handlers
        if (
          !dataUri.startsWith("file://") &&
          !dataUri.startsWith("content://") &&
          dataUri.startsWith("/")
        ) {
          dataUri = `file://${dataUri}`;
        }

        // If we copied to Downloads and have a file:// path, try converting that to content:// too.
        if (dataUri.startsWith("file://")) {
          const fsAny = FileSystem as any;
          if (typeof fsAny.getContentUriAsync === "function") {
            try {
              const content = await fsAny.getContentUriAsync(dataUri);
              const contentUri =
                typeof content === "string" ? content : content?.uri;
              if (contentUri && contentUri.startsWith("content://")) {
                dataUri = contentUri;
                try {
                } catch (_) {}
              }
            } catch (e) {
              try {
              } catch (_) {}
            }
          }
        }

        try {
          // Launch Intent with GRANT_READ_URI_PERMISSION so the external app can read the content:// URI
          // returned by getContentUriAsync. Use FLAG_GRANT_READ_URI_PERMISSION and FLAG_ACTIVITY_NEW_TASK.
          const INTENT_FLAGS = 1 | 0x10000000;
          await IntentLauncher.startActivityAsync(
            "android.intent.action.VIEW",
            {
              data: dataUri,
              type: mimeType,
              flags: INTENT_FLAGS,
            },
          );
          return;
        } catch (e) {
          // If IntentLauncher fails, we will try a generic open fallback. Do not clear openedExternallyRef here yet;
          // allow the fallbacks to attempt an alternative that may still read the file.
          try {
          } catch (_) {}
        }
      }

      try {
        // open with Linking; assume dataUri is a file:// or content:// URI. The openedExternallyRef
        // was set at the start of this function to prevent premature purges; only revert if this call fails.
        await Linking.openURL(dataUri);
        return;
      } catch (e) {
        try {
          openedExternallyRef.current = false;
        } catch (_) {}
        // Linking failed, continue to fallback sharing.
      }

      try {
        const shareTarget = dataUri || target;
        if (shareTarget) {
          try {
            // Fallback to sharing if external open was not available.
            await Sharing.shareAsync(shareTarget);
            return;
          } finally {
            // leave openedExternallyRef as true until resume so the decrypted cache isn't removed while the chooser is active.
          }
        }
      } catch (e) {
        try {
          openedExternallyRef.current = false;
        } catch (_) {}
        // Share fallback failed, surface an error to the user.
      }

      setError("Unable to open file in another app.");
    } catch (_e) {
      try {
        openedExternallyRef.current = false;
      } catch (_) {}
      setError("Unable to open file in another app.");
    }
  };

  const openExternallyWithLoader = async () => {
    if (actionLoading) return;
    closeActionMenu();
    setActionLoading("Opening in another app…");
    try {
      await openExternally();
    } finally {
      setActionLoading(null);
    }
  };

  const previewActionMenu = isPdfPreview || isImage ? (
    <Modal
      visible={menuVisible}
      transparent
      animationType="fade"
      onRequestClose={closeActionMenu}
    >
      <View style={styles.pdfMenuOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeActionMenu}
        />
        <View style={styles.pdfMenuContainer}>
          <TouchableOpacity style={styles.pdfMenuItem} onPress={refreshPreview}>
            <Feather name="refresh-cw" size={18} color={colors.text} />
            <Text style={styles.pdfMenuItemText}>Refresh</Text>
          </TouchableOpacity>
          {isExternalFile ? (
            <TouchableOpacity
              style={styles.pdfMenuItem}
              onPress={() => void importToVaultFromMenu()}
            >
              <Feather name="download-cloud" size={18} color={colors.text} />
              <Text style={styles.pdfMenuItemText}>Import</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.pdfMenuItem}
              onPress={() => void downloadFromMenu()}
            >
              <Feather name="download" size={18} color={colors.text} />
              <Text style={styles.pdfMenuItemText}>Download</Text>
            </TouchableOpacity>
          )}
          {showExternalPdfOption ? (
            <TouchableOpacity
              style={styles.pdfMenuItem}
              onPress={() => void openExternallyWithLoader()}
            >
              <Feather name="external-link" size={18} color={colors.text} />
              <Text style={styles.pdfMenuItemText}>Open in other app</Text>
            </TouchableOpacity>
          ) : null}
          {isPdfPreview && vaultFile ? (
            <TouchableOpacity
              style={styles.pdfMenuItem}
              onPress={() => void addPageToPdf()}
            >
              <Feather name="file-plus" size={18} color={colors.text} />
              <Text style={styles.pdfMenuItemText}>Add page</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  ) : null;

  const actionLoader = actionLoading ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.actionLoaderOverlay}>
        <View style={styles.actionLoaderCard}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={styles.actionLoaderTitle}>{actionLoading}</Text>
          <Text style={styles.actionLoaderMessage}>
            Please wait while PaperBox finishes this action.
          </Text>
        </View>
      </View>
    </Modal>
  ) : null;

  if (loading) {
    return (
      <Screen style={styles.content}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={styles.loadingText}>Preparing preview…</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen style={styles.content}>
        <View style={styles.center}>
          <Feather name="alert-circle" size={48} color={colors.secondary} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </Screen>
    );
  }

  // IMAGE with zoom button
  if (isImage) {
    const rawImageUri = localUri || uri;
    const imageUri = normalizeFileUri(rawImageUri);
    return (
      <>
        <Screen style={styles.content}>
          <TouchableOpacity
            style={styles.imageWrapper}
            onPress={() => setZoomVisible(true)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </Screen>

        <Modal
          visible={zoomVisible}
          transparent={true}
          onRequestClose={() => setZoomVisible(false)}
          animationType="fade"
        >
          <ImageViewer
            imageUrls={[{ url: imageUri }]}
            onCancel={() => setZoomVisible(false)}
            enableSwipeDown={true}
            onSwipeDown={() => setZoomVisible(false)}
            backgroundColor={colors.background}
          />
        </Modal>
        {previewActionMenu}
        {actionLoader}
      </>
    );
  }

  // VIDEO
  if (isVideo) {
    const windowWidth = Dimensions.get("window").width;
    const videoHeight = windowWidth * (9 / 16);
    const videoUri = normalizeFileUri(localUri || uri);
    return (
      <Screen style={styles.content}>
        <View style={styles.mediaContainer}>
          <Video
            ref={(r) => {
              videoRef.current = r;
            }}
            source={{ uri: videoUri }}
            style={[styles.video, { width: windowWidth, height: videoHeight }]}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
          />
        </View>
      </Screen>
    );
  }

  // AUDIO
  if (isAudio) {
    return (
      <Screen style={styles.content}>
        <View style={styles.center}>
          <Feather name="volume-2" size={64} color={colors.text} />
          <Text style={styles.audioLabel}>Audio file</Text>
        </View>
      </Screen>
    );
  }

  // Office files need an explicit user choice. The conversion is intentionally on-demand:
  // it avoids creating a plaintext PDF until the user asks to view one.
  if (isOfficeFile && !convertedFilename) {
    return (
      <Screen style={styles.content}>
        <View style={styles.center}>
          <Feather name="file-text" size={64} color={colors.text} />
          <Text style={styles.title}>{file.name}</Text>
          <Text style={styles.copy}>
            Choose how you would like to open this Office file.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => void convertToPdf()}
            activeOpacity={0.8}
          >
            <Feather
              name={savedConvertedPdf ? "file" : "file-plus"}
              size={18}
              color={colors.text}
            />
            <Text style={styles.primaryButtonText}>
              {savedConvertedPdf ? "Open PDF" : "Convert to PDF"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, styles.secondaryButton]}
            onPress={() => void openExternallyWithLoader()}
            activeOpacity={0.8}
          >
            <Feather name="external-link" size={18} color={colors.text} />
            <Text style={styles.primaryButtonText}>Open in other app</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  // PDF (including a PDF created from an Office document above).
  if (isPdfPreview) {
    const target = localUri || uri;
    // If we have a local decrypted file, render it in-app using react-native-pdf. If rendering
    // fails, fall back to the existing external open flow.
    if (target) {
      const pdfUri = normalizeFileUri(target);
      return (
        <>
          <Screen style={styles.pdfContent}>
            <PdfViewer
              uri={pdfUri}
              filename={previewFilename}
              colors={colors}
              onError={async (e) => {
              try {
              } catch (_) {}

              // Guard: only attempt a content:// retry if we still have a genuinely decrypted
              // local file. If localUri has been cleared or somehow points back at the encrypted
              // .enc blob (e.g. a background/active flicker purged the decrypted cache mid-read),
              // retrying will just hand react-native-pdf ciphertext again and it will fail the
              // same way. In that case, re-decrypt from scratch instead of retrying blindly.
              const currentLocalUri = localUriRef.current;
              if (convertedFilename) {
                setError("Unable to render the converted PDF in-app.");
                void openExternally();
                return;
              }
              if (!currentLocalUri || isEncryptedUri(currentLocalUri)) {
                try {
                } catch (_) {}
                try {
                  setLoading(true);
                  const savedUri = await saveUriToCache(uri, filename);
                  setLocalUri(savedUri);
                } catch (reErr) {
                  try {
                  } catch (_) {}
                  setError(
                    "Unable to render PDF in-app. Opening in default viewer...",
                  );
                  void openExternally();
                } finally {
                  setLoading(false);
                }
                return;
              }

              // Try to convert local file:// path to a content:// URI and retry in-app render once.
              try {
                const fsAny = FileSystem as any;
                if (
                  Platform.OS === "android" &&
                  pdfUri.startsWith("file://") &&
                  typeof fsAny.getContentUriAsync === "function"
                ) {
                  try {
                    const content = await fsAny.getContentUriAsync(pdfUri);
                    const contentUri =
                      typeof content === "string" ? content : content?.uri;
                    if (contentUri) {
                      try {
                      } catch (_) {}
                      // Update localUri so PdfViewer receives the content URI and re-renders
                      setLocalUri(contentUri);
                      return;
                    }
                  } catch (convErr) {
                    try {
                    } catch (_) {}
                  }
                }
              } catch (convErr2) {
                try {
                } catch (_) {}
              }

              // If retry didn't work, surface an error and open externally as before
              setError(
                "Unable to render PDF in-app. Opening in default viewer...",
              );
              // Attempt external open as fallback
              void openExternally();
              }}
              onOpenExternal={() => {
                void openExternallyWithLoader();
              }}
            />
          </Screen>
          {previewActionMenu}
          {actionLoader}
        </>
      );
    }

    // No target available — show fallback UI that allows external open / share
    return (
      <>
        <Screen style={styles.pdfContent}>
          <View style={styles.center}>
            <Feather name="file-text" size={64} color={colors.text} />
            <Text style={styles.title}>{file.name}</Text>
            <Text style={styles.copy}>
              PDFs open in your device's default viewer.
            </Text>

            <Text style={[styles.copy, { marginTop: 10 }]}>
              Use the Refresh action in the header to re-prepare this preview.
            </Text>
          </View>
        </Screen>
        {previewActionMenu}
        {actionLoader}
      </>
    );
  }

  // FALLBACK
  return (
    <Screen style={styles.content}>
      <View style={styles.center}>
        <Feather name="file" size={48} color={colors.text} />
        <Text style={styles.title}>{file.name}</Text>
        <Text style={styles.copy}>
          Preview is not available for this file type.
        </Text>
      </View>
    </Screen>
  );
}

export default PreviewScreen;

const getStyles = (colors: any) =>
  StyleSheet.create({
    content: {
      flexGrow: 1,
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    pdfContent: {
      flexGrow: 1,
      padding: 0,
      backgroundColor: colors.background,
    },
    headerMenuButton: {
      width: 40,
      height: 40,
      marginRight: 6,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    loadingText: {
      marginTop: 12,
      color: colors.text,
      fontSize: 15,
    },
    errorText: {
      color: colors.secondary,
      textAlign: "center",
      marginTop: 12,
      fontSize: 15,
      lineHeight: 21,
    },
    mediaContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    video: {
      backgroundColor: colors.surface,
    },
    imageWrapper: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    image: {
      width: "100%",
      height: "100%",
    },
    zoomButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    pdf: {
      flex: 1,
      width: "100%",
    },
    pdfLoader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    primaryButton: {
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    primaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "600",
      marginLeft: 8,
    },
    pdfMenuOverlay: {
      flex: 1,
      alignItems: "flex-end",
      paddingTop: 56,
      paddingRight: 8,
      backgroundColor: withAlpha(colors.text, 0.28),
    },
    pdfMenuContainer: {
      width: 220,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 18,
      elevation: 10,
    },
    pdfMenuItem: {
      minHeight: 48,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    pdfMenuItemText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    actionLoaderOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: withAlpha(colors.text, 0.45),
    },
    actionLoaderCard: {
      width: "100%",
      maxWidth: 360,
      padding: 28,
      borderRadius: 24,
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 12,
    },
    actionLoaderTitle: {
      marginTop: 18,
      marginBottom: 8,
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
    },
    actionLoaderMessage: {
      color: colors.secondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
    secondaryButton: {
      marginTop: 12,
    },
    floatingButton: {
      position: "absolute",
      bottom: 30,
      right: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 24,
      shadowColor: withAlpha(colors.text, 0.12),
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
    },
    audioLabel: {
      color: colors.text,
      fontSize: 17,
      marginTop: 10,
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
      color: colors.text,
      marginTop: 17,
    },
    copy: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 21,
      color: colors.secondary,
      marginTop: 10,
    },
  });
