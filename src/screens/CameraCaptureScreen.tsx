import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { CameraView, CameraMountError, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "../components/Screen";
import { usePaperTheme } from "../theme/usePaperTheme";
import { useVaultStore } from "../store/useVaultStore";
import { extensionOf, kindOf } from "../utils/files";
import { RootStackParams } from "../navigation/types";
import { VaultFile } from "../types";

type Props = NativeStackScreenProps<RootStackParams, "CameraCapture">;

export function CameraCaptureScreen({ navigation, route }: Props) {
  const { mode } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType, setCameraType] = useState<"back" | "front">("back");
  const [capturedPdfUris, setCapturedPdfUris] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const notificationTimeoutRef = useRef<number | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const { colors } = usePaperTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
  const addFiles = useVaultStore((s) => s.addFiles);

  const getFileSize = async (uri: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists ? info.size : 0;
    } catch (error) {
      console.warn("getFileSize error", error);
      return 0;
    }
  };

  const cropDocument = async (photo: { uri: string; width: number; height: number }) => {
    try {
      const { width, height } = photo;
      const targetAspectRatio = 0.72;
      const imageAspect = width / height;
      let rectWidth = width;
      let rectHeight = height;

      if (imageAspect > targetAspectRatio) {
        rectHeight = Math.min(height, Math.round(width / targetAspectRatio));
      } else {
        rectWidth = Math.min(width, Math.round(height * targetAspectRatio));
      }

      const originX = Math.max(0, Math.floor((width - rectWidth) / 2));
      const originY = Math.max(0, Math.floor((height - rectHeight) / 2));
      const result = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          {
            crop: {
              originX,
              originY,
              width: rectWidth,
              height: rectHeight,
            },
          },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      return result.uri;
    } catch (error) {
      console.warn("cropDocument failed", error);
      return photo.uri;
    }
  };

  const normalizeUri = (result: any) => {
    if (!result) return "";
    if (typeof result === "string") {
      return result.startsWith("file://") ? result : `file://${result}`;
    }
    if (typeof result === "object") {
      if (typeof result.uri === "string") {
        return result.uri.startsWith("file://") ? result.uri : `file://${result.uri}`;
      }
      if (typeof result.path === "string") {
        return result.path.startsWith("file://") ? result.path : `file://${result.path}`;
      }
    }
    return "";
  };

  const getImageSize = (uri: string) =>
    new Promise<[number, number]>((resolve, reject) => {
      Image.getSize(
        uri,
        (width: number, height: number) => resolve([width, height]),
        reject,
      );
    });


  const onCameraReady = () => {
    setCameraReady(true);
  };
  const onCameraMountError = (error: CameraMountError) => {
    console.warn("Camera mount error", error);
    Alert.alert("Camera unavailable", error.message ?? "Unable to start the camera.");
  };

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  const showNotification = (message: string) => {
    setNotificationMessage(message);
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    notificationTimeoutRef.current = setTimeout(() => {
      setNotificationMessage(null);
      notificationTimeoutRef.current = null;
    }, 2200) as unknown as number;
  };


  const goToPdfReview = () => {
    if (!capturedPdfUris.length) return;
    navigation.navigate("PdfReview", { imageUris: capturedPdfUris });
  };

  const switchCamera = () => {
    setCameraType((current) => (current === "back" ? "front" : "back"));
  };

  const takePhoto = async () => {
    if (isSaving || !cameraReady || !cameraRef.current) return;

    try {
      setIsSaving(true);
      const filename = `Scan-${Date.now()}.jpg`;
      const result = await cameraRef.current.takePictureAsync();
      const uri = normalizeUri(result);
      const [width, height] = await getImageSize(uri);
      const croppedUri = await cropDocument({ uri, width, height });
      const extension = extensionOf(filename) || "jpg";
      const fileSize = await getFileSize(croppedUri);
      const file: VaultFile = {
        id: `${Date.now()}-${Math.random()}`,
        name: filename,
        uri: croppedUri,
        mimeType: "image/jpeg",
        size: fileSize,
        extension,
        kind: kindOf(extension),
        createdAt: new Date().toISOString(),
        isFavorite: false,
        isPinned: false,
        tags: [],
        source: "camera",
      };

      addFiles([file]);
      showNotification("Scanned photo added to your vault.");
    } catch (error) {
      console.warn("takePhoto error", error);
      Alert.alert("Capture failed", "Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const captureForPdf = async () => {
    if (isSaving || !cameraReady || !cameraRef.current) return;

    try {
      setIsSaving(true);
      const result = await cameraRef.current.takePictureAsync();
      const uri = normalizeUri(result);
      const [width, height] = await getImageSize(uri);
      const croppedUri = await cropDocument({ uri, width, height });
      setCapturedPdfUris((current) => [...current, croppedUri]);
      showNotification("Saved page to PDF preview.");
    } catch (error) {
      console.warn("captureForPdf error", error);
      Alert.alert("Capture failed", "Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderCameraScreen = () => (
    <View style={styles.cameraScreen}>
      <View style={styles.cameraViewport}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          active={true}
          facing={cameraType}
          flash="off"
          mode="picture"
          onCameraReady={onCameraReady}
          onMountError={onCameraMountError}
        />

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.cameraTopActions, { paddingTop: insets.top + 12 }]}> 
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
              <Feather name="x" size={22} color="#000" />
            </TouchableOpacity>
            <View style={styles.modeIndicator}>
              <Text style={styles.modeIndicatorText}>{mode === "photo" ? "PHOTO" : "PDF"}</Text>
            </View>
          </View>
          {notificationMessage ? (
            <View style={styles.notificationContainer}>
              <Text style={styles.notificationText}>{notificationMessage}</Text>
            </View>
          ) : null}
 
          {mode === "pdf" && capturedPdfUris.length > 0 ? (
            <TouchableOpacity style={styles.pdfGalleryButton} onPress={goToPdfReview}>
              <Image
                source={{ uri: capturedPdfUris[capturedPdfUris.length - 1] }}
                style={styles.pdfGalleryThumbnail}
                resizeMode="cover"
              />
              <View style={styles.pdfGalleryBadge}>
                <Text style={styles.pdfGalleryBadgeText}>{capturedPdfUris.length}</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={[styles.cameraBottomActions, { bottom: insets.bottom + 16 }]}> 
            <TouchableOpacity style={styles.iconButton} onPress={switchCamera}>
              <Feather name="rotate-ccw" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.captureButton, isSaving && styles.captureDisabled]}
              onPress={mode === "photo" ? takePhoto : captureForPdf}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <View style={styles.captureCircle} />
              )}
            </TouchableOpacity>
            {mode === "pdf" ? (
              <TouchableOpacity style={styles.iconButton} onPress={goToPdfReview}>
                <Feather name="check" size={22} color="#000" />
              </TouchableOpacity>
            ) : (
              <View style={styles.smallButtonPlaceholder} />
            )}
          </View>
        </View>
      </View>
    </View>
  );

  if (!permission) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.permissionText}>Checking camera permissions…</Text>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.permissionText}>Camera access is needed to use this screen.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow camera access</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <StatusBar hidden />
      {renderCameraScreen()}
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
      padding: 0,
      backgroundColor: "#000",
    },
    permissionText: {
      color: "#fff",
      fontSize: 16,
      textAlign: "center",
      marginTop: 20,
    },
    permissionButton: {
      marginTop: 24,
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: 30,
      backgroundColor: "#fff",
      alignSelf: "center",
    },
    permissionButtonText: {
      color: "#000",
      fontWeight: "700",
      fontSize: 16,
    },
    cameraScreen: {
      flex: 1,
    },
    cameraTopActions: {
      position: "absolute",
      top: 0,
      left: 20,
      right: 20,
      zIndex: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    cameraBottomActions: {
      position: "absolute",
      left: 20,
      right: 20,
      zIndex: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    pdfGalleryButton: {
      position: "absolute",
      right: 20,
      bottom: 120,
      width: 80,
      height: 108,
      borderRadius: 20,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    pdfGalleryThumbnail: {
      width: "100%",
      height: "100%",
      borderRadius: 14,
      backgroundColor: "#222",
    },
    pdfGalleryBadge: {
      position: "absolute",
      right: 6,
      bottom: 8,
      minWidth: 24,
      paddingHorizontal: 6,
      height: 24,
      borderRadius: 12,
      backgroundColor: "#000",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    pdfGalleryBadgeText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 12,
    },
    iconButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(255,255,255,0.95)",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 8,
    },
    modeIndicator: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.92)",
    },
    modeIndicatorText: {
      color: "#000",
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
    },
    cameraViewport: {
      flex: 1,
      backgroundColor: "#000",
      position: "relative",
    },
    camera: {
      flex: 1,
    },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 20,
      paddingVertical: 24,
      backgroundColor: "rgba(0,0,0,0.32)",
    },
    notificationContainer: {
      position: "absolute",
      top: 90,
      left: 40,
      right: 40,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.95)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 10,
    },
    notificationText: {
      color: "#000",
      fontSize: 14,
      fontWeight: "700",
      textAlign: "center",
    },
    bottomActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 16,
    },
    smallButtonPlaceholder: {
      width: 46,
      height: 46,
    },
    captureButton: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 3,
      borderColor: "rgba(255,255,255,0.9)",
      backgroundColor: "rgba(255,255,255,0.95)",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 12,
    },
    captureCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "#000",
    },
    captureDisabled: {
      opacity: 0.6,
    },
  });
