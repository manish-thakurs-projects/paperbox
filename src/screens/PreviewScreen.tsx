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
import * as ScreenCapture from "expo-screen-capture";
import { decryptVaultFileForUse } from "../services/vaultStorage";

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
    return downloadedUri;
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
    return decryptedUri;
  }

  if (uri.startsWith("content://") || uri.startsWith("file://")) {
    try {
      await FileSystem.copyAsync({ from: uri, to: destination });
      return destination;
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
      return destination;
    } catch (e) {
      // Ignore fallback cache write errors.
      return uri;
    }
  }

  return uri;
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

  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync();
    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);
  const extension = file.extension?.toLowerCase() || "";
  const mimeExtension = extensionFromMimeType(file.mimeType);
  const ext =
    extFromUri(uri) ||
    extension ||
    mimeExtension ||
    (file.kind === "pdf" ? "pdf" : "");
  const filename = ensureFilename(
    name,
    ext || extension || mimeExtension || "bin",
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomVisible, setZoomVisible] = useState<boolean>(false);
  const [pdfOpened, setPdfOpened] = useState(false);
  const videoRef = useRef<Video | null>(null);

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
      if (isPdf || (!isImage && !isVideo && !isAudio)) {
        setLoading(true);
        try {
          const savedUri = await saveUriToCache(uri, filename);
          // Cached preview URI prepared.
          if (mounted) setLocalUri(savedUri);
        } catch (e) {
          if (mounted) setError("Unable to prepare file for preview.");
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
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
      if (!localUri || localUri === uri) return;
      void (FileSystem as any)
        .deleteAsync(localUri, { idempotent: true })
        .catch(() => undefined);
    };
  }, [localUri, uri]);

  useEffect(() => {
    let mounted = true;
    async function openPdfInDefaultViewer() {
      if (isPdf && localUri && !pdfOpened) {
        try {
          await openExternally();
          if (mounted) setPdfOpened(true);
        } catch (e) {
          if (mounted) setError("Unable to open PDF in default viewer.");
        }
      }
    }
    openPdfInDefaultViewer();
    return () => {
      mounted = false;
    };
  }, [localUri, isPdf, pdfOpened]);

  const openExternally = async () => {
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

        if (dataUri.startsWith("file://")) {
          const fsAny = FileSystem as any;
          if (typeof fsAny.getContentUriAsync === "function") {
            try {
              const content = await fsAny.getContentUriAsync(dataUri);
              const contentUri =
                typeof content === "string" ? content : content?.uri;
              if (contentUri && contentUri.startsWith("content://")) {
                dataUri = contentUri;
              }
            } catch (e) {
              // Ignore cache URI conversion failures and fall back to the original URI.
            }
          }
        }

        try {
          await IntentLauncher.startActivityAsync(
            "android.intent.action.VIEW",
            {
              data: dataUri,
              type: mimeType,
              flags: 1,
            },
          );
          return;
        } catch (e) {
          // If IntentLauncher fails, we will try a generic open fallback.
        }
      }

      try {
        await Linking.openURL(finalTarget);
        return;
      } catch (e) {
        // Linking failed, continue to fallback sharing.
      }

      try {
        const shareTarget = target;
        if (shareTarget) {
          // Fallback to sharing if external open was not available.
          await Sharing.shareAsync(shareTarget);
          return;
        }
      } catch (e) {
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
    const imageUri = localUri || uri;
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
    return (
      <Screen style={styles.content}>
        <View style={styles.mediaContainer}>
          <Video
            ref={(r) => {
              videoRef.current = r;
            }}
            source={{ uri: localUri || uri }}
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
              try {
                if (target) await Sharing.shareAsync(target);
              } catch (_e) {
                setError("Share failed. Please try again.");
              }
            }}
            style={[styles.primaryButton, { marginTop: 10 }]}
          >
            <Text style={styles.primaryButtonText}>Share / Open with…</Text>
          </TouchableOpacity>
        </View>
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
