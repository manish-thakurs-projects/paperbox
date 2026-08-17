import React, { useEffect, useRef, useState } from "react";
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
  Alert,
  Linking,
  AppState,
  PermissionsAndroid,
} from "react-native";
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
import RNFS from 'react-native-fs';
import * as ScreenCapture from "expo-screen-capture";
import { decryptVaultFileForUse, clearDecryptedCache } from "../services/vaultStorage";
import PdfViewer from "../components/PdfViewer";

type Props = NativeStackScreenProps<RootStackParams, "Preview">;

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

  if (uri.endsWith(".enc") || uri.includes(".enc?")) {
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

export function PreviewScreen({ route }: Props) {
  const { colors } = usePaperTheme();
  const styles = getStyles(colors);
  const file = useVaultStore((s) =>
    s.files.find((f) => f.id === route.params.fileId),
  );

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

  const [loading, setLoading] = useState<boolean>(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomVisible, setZoomVisible] = useState<boolean>(false);
  const [pdfOpened, setPdfOpened] = useState(false);
  const [shareLoading, setShareLoading] = useState<boolean>(false);
  const [shareMessage, setShareMessage] = useState<string>("");
  const videoRef = useRef<Video | null>(null);

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
  // file. Clear decrypted cache on resume instead.
  const openedExternallyRef = useRef(false);

  useEffect(() => {
    const handler = (nextState: string) => {
      try {
        // If the app resumes, always clear decrypted cache (we no longer need the temp files).
        if (nextState === 'active') {
          openedExternallyRef.current = false;
          void clearDecryptedCache();
          return;
        }

        // If app goes to background/inactive and we specifically opened an external viewer,
        // leave the decrypted file in place so the external app can read it. Otherwise purge.
        if (nextState === 'background' || nextState === 'inactive') {
          if (openedExternallyRef.current) {
            try { console.debug('PreviewScreen: skipping clear on background because file opened externally'); } catch(e){}
            return;
          }

          try {
            void clearDecryptedCache();
          } catch (e) {
            try { console.debug('clearDecryptedCache call failed', e); } catch(_){ }
          }

          if (localUri && localUri !== uri) {
            void (FileSystem as any)
              .deleteAsync(localUri, { idempotent: true })
              .catch((err: any) => { try { console.debug('PreviewScreen: background deleteAsync failed', err); } catch(e){} });
            // remove reference so we don't attempt to double-delete on unmount
            setLocalUri(null);
          }
        }
      } catch (e) {
        try { console.debug('PreviewScreen: AppState handler error', e); } catch(e){}
      }
    };

    const sub = AppState.addEventListener ? AppState.addEventListener('change', handler) : null;
    return () => {
      try {
        if (sub && typeof sub.remove === 'function') sub.remove();
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [localUri, uri]);
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


  const isImage =
    file.kind === "image" ||
    ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
  const isVideo =
    file.kind === "video" || ["mp4", "mov", "mkv", "webm"].includes(ext);
  const isPdf = file.kind === "pdf" || ext === "pdf";
  const isAudio = ["mp3", "m4a", "wav", "aac", "ogg"].includes(ext);

  // … (download logic unchanged) …
  useEffect(() => {
    let mounted = true;

    async function maybeDownload() {
      // If the stored URI points to an encrypted blob, always decrypt it first regardless of kind
      try {
        if (uri.endsWith('.enc') || uri.includes('.enc?')) {
          setLoading(true);
          try {
            try { console.debug('PreviewScreen: encrypted uri detected, decrypting before preview', { uri }); } catch(e){}
            const savedUri = await saveUriToCache(uri, filename);
            try { console.debug('PreviewScreen: saveUriToCache (for encrypted) returned', savedUri); } catch(e){}
            if (mounted) setLocalUri(savedUri);
          } catch (e) {
            console.debug('PreviewScreen: decrypting encrypted uri failed', e);
            if (mounted) setError('Unable to prepare encrypted file for preview.');
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
          try { console.debug('PreviewScreen: preparing preview', { uri, filename, ext, isPdf, isImage, isVideo, isAudio }); } catch(e){}
          const savedUri = await saveUriToCache(uri, filename);
          try { console.debug('PreviewScreen: saveUriToCache returned', savedUri); } catch(e){}
          // Cached preview URI prepared.
          if (mounted) setLocalUri(savedUri);
        } catch (e) {
          console.debug('PreviewScreen: prepare preview failed', e);
          if (mounted) setError("Unable to prepare file for preview.");
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        try { console.debug('PreviewScreen: using direct uri for preview', uri); } catch(e){}
        setLocalUri(uri);
      }
    }

    maybeDownload();
    return () => {
      mounted = false;
    };
  }, [uri]);

  useEffect(() => {
    return () => {
      try { console.debug('PreviewScreen: cleaning up localUri', { localUri, uri, openedExternally: openedExternallyRef.current }); } catch(e){}
      if (!localUri || localUri === uri) return;
      // If we intentionally opened the file externally, preserve the decrypted temp so the external
      // app can read it. It will be cleared on resume by the AppState handler.
      if (openedExternallyRef.current) {
        try { console.debug('PreviewScreen: preserving decrypted temp because file was opened externally'); } catch(e){}
        return;
      }
      void (FileSystem as any)
        .deleteAsync(localUri, { idempotent: true })
        .catch((err: any) => { try { console.debug('PreviewScreen: deleteAsync failed', err); } catch(e){} });
    };
  }, [localUri, uri]);

  // In-app PDF rendering will be used for PDFs (react-native-pdf). The previous behavior
  // automatically opened PDFs in an external viewer; that auto-open is disabled so the in-app
  // viewer can be shown instead. Falling back to external viewer is still supported via UI.
  // (Effect intentionally removed.)

  const copyToDownloads = async (sourceUri: string, filename: string): Promise<string> => {
    try {
      // Normalize source path to a filesystem path for RNFS
      const srcPath = sourceUri.startsWith('file://') ? sourceUri.replace('file://', '') : sourceUri;
      const rnfsAny = RNFS as any;
      let downloadsDir = rnfsAny.DownloadDirectoryPath || (rnfsAny.ExternalStorageDirectoryPath ? `${rnfsAny.ExternalStorageDirectoryPath}/Download` : null);
      if (!downloadsDir) {
        throw new Error('No Downloads directory available on this device');
      }
 
      // Request write permission on Android if needed
      try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          // Still attempt copy; caller will receive an error if it truly fails due to permission.
          throw new Error('WRITE_EXTERNAL_STORAGE permission denied');
        }
      } catch (permErr) {
        // Log and continue; copying will likely fail, but we'll attempt other strategies.
        try { console.debug('copyToDownloads: permission request failed', permErr); } catch(_){ }
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
        try { console.debug('copyToDownloads: RNFS.copyFile failed, falling back to base64 method', e); } catch(_){ }
      }

      // Fallback: use expo-file-system to read base64 and write with RNFS
      try {
        const fsAny = FileSystem as any;
        const info = await fsAny.getInfoAsync(sourceUri, { size: true });
        if (!info.exists) throw new Error('Source file does not exist for export');

        const base64 = await fsAny.readAsStringAsync(sourceUri, { encoding: fsAny.EncodingType.Base64 });
        await rnfsAny.writeFile(destPath, base64, 'base64');
        return `file://${destPath}`;
      } catch (e) {
        try { console.debug('copyToDownloads failed', e); } catch(_){ }
        throw e;
      }
    } catch (e) {
      try { console.debug('copyToDownloads failed', e); } catch(_){ }
      throw e;
    }
  };
  const openExternally = async () => {
    // Mark we're initiating an external handoff so AppState handler won't purge decrypted files during export/launch.
    openedExternallyRef.current = true;
    try {
      let target = localUri;
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
      const mimeType = file.mimeType || mimeTypeFromExtension(ext);
      // Open the file with the appropriate external handler.

      if (Platform.OS === "android") {
        let dataUri = finalTarget;

// Prefer converting an app-private file:// URI to a content:// URI so external apps can read it
// without requiring WRITE_EXTERNAL_STORAGE or copying into Downloads. This is supported by
// expo-file-system.getContentUriAsync on Android.
try {
  const fsAny = FileSystem as any;
  if (dataUri.startsWith("file://") && typeof fsAny.getContentUriAsync === "function") {
    try {
      const content = await fsAny.getContentUriAsync(dataUri);
      const contentUri = typeof content === "string" ? content : content?.uri;
      if (contentUri && contentUri.startsWith("content://")) {
        dataUri = contentUri;
        try { console.debug('openExternally: converted to content URI', dataUri); } catch(_){}
      }
    } catch (e) {
      try { console.debug('openExternally: getContentUriAsync failed', e); } catch(_){}
    }
  }
} catch (e) {
  try { console.debug('openExternally: content URI conversion check failed', e); } catch(_){}
}

// If conversion to content:// succeeded, try launching intent directly (preferred).
if (dataUri.startsWith("content://")) {
  try {
    await IntentLauncher.startActivityAsync(
      "android.intent.action.VIEW",
      {
        data: dataUri,
        type: mimeType,
        flags: 2,
      },
    );
    return;
  } catch (e) {
    try { openedExternallyRef.current = false; } catch (_) {}
    try { console.debug('openExternally: Intent launch with content:// failed', e); } catch(_){}
    // Fall through to attempt other strategies
  }
}

// If we were not able to obtain a content:// URI, fall back to copying into Downloads.
try {
  const exported = await copyToDownloads(dataUri, filename);
  if (exported) {
    dataUri = exported;
    try { console.debug('openExternally: exported to Downloads', dataUri); } catch(_){ }
  }
} catch (e) {
  try { console.debug('openExternally: export to Downloads failed, falling back to temp file', e); } catch(_){ }
}

// Normalize to file:// when necessary for downstream handlers
if (!dataUri.startsWith("file://") && !dataUri.startsWith("content://") && dataUri.startsWith("/")) {
  dataUri = `file://${dataUri}`;
}

// If we copied to Downloads and have a file:// path, try converting that to content:// too.
if (dataUri.startsWith("file://")) {
  const fsAny = FileSystem as any;
  if (typeof fsAny.getContentUriAsync === "function") {
    try {
      const content = await fsAny.getContentUriAsync(dataUri);
      const contentUri = typeof content === "string" ? content : content?.uri;
      if (contentUri && contentUri.startsWith("content://")) {
        dataUri = contentUri;
        try { console.debug('openExternally: converted exported file to content URI', dataUri); } catch(_){ }
      }
    } catch (e) {
      try { console.debug('openExternally: getContentUriAsync for exported file failed', e); } catch(_){ }
    }
  }
}

try {
  // Launch Intent with GRANT_READ_URI_PERMISSION so the external app can read the content:// URI
  // returned by getContentUriAsync. Use flag value 2 (FLAG_GRANT_READ_URI_PERMISSION).
  await IntentLauncher.startActivityAsync(
    "android.intent.action.VIEW",
    {
      data: dataUri,
      type: mimeType,
      flags: 2,
    },
  );
  return;
} catch (e) {
  // Revert flag — external launch didn't happen.
  try { openedExternallyRef.current = false; } catch (_) {}
  // If IntentLauncher fails, we will try a generic open fallback.
  try { console.debug('openExternally: final Intent launch failed', e); } catch(_){ }
}
      }

      try {
        // open with Linking; assume finalTarget is a file:// or content:// URI. The openedExternallyRef
        // was set at the start of this function to prevent premature purges; only revert if this call fails.
        await Linking.openURL(finalTarget);
        return;
      } catch (e) {
        try { openedExternallyRef.current = false; } catch(_){ }
        // Linking failed, continue to fallback sharing.
      }

      try {
        const shareTarget = target;
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
        try { openedExternallyRef.current = false; } catch(_){}
        // Share fallback failed, surface an error to the user.
      }

      setError("Unable to open file in another app.");
    } catch (_e) {
      setError("Unable to open file in another app.");
    }
  };

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
          <TouchableOpacity
            onPress={openExternally}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Open in other app</Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            onPress={openExternally}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Open / Share</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  // PDF
  if (isPdf) {
    const target = localUri || uri;
    // If we have a local decrypted file, render it in-app using react-native-pdf. If rendering
    // fails, fall back to the existing external open flow.
    if (target) {
      const pdfUri = normalizeFileUri(target);
      return (
        <Screen style={styles.content}>
          <PdfViewer
            uri={pdfUri}
            filename={filename}
            onError={(e) => {
              try { console.debug('PdfViewer reported error', e); } catch(_){ }
              setError('Unable to render PDF in-app. Opening in default viewer...');
              // Attempt external open as fallback
              void openExternally();
            }}
            onOpenExternal={() => {
              void openExternally();
            }}
          />
        </Screen>
      );
    }

    // No target available — show fallback UI that allows external open / share
    return (
      <Screen style={styles.content}>
        <View style={styles.center}>
          <Feather name="file-text" size={64} color={colors.text} />
          <Text style={styles.title}>{file.name}</Text>
          <Text style={styles.copy}>
            PDFs open in your device's default viewer.
          </Text>

          <TouchableOpacity
            onPress={openExternally}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Open PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              setShareLoading(true);
              setShareMessage('Decrypting file...');
              try {
                let shareTarget = target;
                if (!shareTarget) {
                  setError('No file available to share.');
                  return;
                }

                // If encrypted, decrypt first
                try {
                  if (shareTarget.endsWith('.enc') || shareTarget.includes('.enc?')) {
                    setShareMessage('Decrypting file...');
                    const decrypted = await decryptVaultFileForUse({
                      id: 'share',
                      name: filename,
                      uri: shareTarget,
                      size: 0,
                      extension: filename.includes('.') ? filename.split('.').pop() || 'bin' : 'bin',
                      kind: 'other',
                      createdAt: new Date().toISOString(),
                      isFavorite: false,
                      isPinned: false,
                      tags: [],
                    });
                    shareTarget = decrypted;
                  }
                } catch (e) {
                  console.debug('PreviewScreen: decrypt for share failed', e);
                  setError('Unable to decrypt file for sharing.');
                  return;
                }

                // Convert file:// to content:// on Android when possible so external apps can read it
                try {
                  const fsAny = FileSystem as any;
                  if (Platform.OS === 'android' && typeof fsAny.getContentUriAsync === 'function' && shareTarget.startsWith('file://')) {
                    setShareMessage('Preparing file for sharing...');
                    const content = await fsAny.getContentUriAsync(shareTarget);
                    const contentUri = typeof content === 'string' ? content : content?.uri;
                    if (contentUri) shareTarget = contentUri;
                  }
                } catch (e) {
                  // ignore content uri conversion failures and continue with original path
                }

                // Finally share
                try {
                  await Sharing.shareAsync(shareTarget);
                } catch (e) {
                  console.debug('PreviewScreen: shareAsync failed', e);
                  setError('Share failed. Please try again.');
                }
              } finally {
                setShareLoading(false);
                setShareMessage('');
              }
            }}
            style={[styles.primaryButton, { marginTop: 10 }]}
          >
            <Text style={styles.primaryButtonText}>Share / Open with…</Text>
          </TouchableOpacity>
        </View>
        {shareLoading ? (
          <View style={styles.pdfLoader} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={styles.loadingText}>{shareMessage || 'Preparing file...'}</Text>
          </View>
        ) : null}
      </Screen>
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
        <TouchableOpacity onPress={openExternally} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Open in other app</Text>
        </TouchableOpacity>
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
