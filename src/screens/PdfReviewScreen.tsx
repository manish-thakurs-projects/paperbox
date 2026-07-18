import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Modal,
  PanResponder,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Print from "expo-print";
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from "react-native-document-scanner-plugin";
import { usePaperTheme } from "../theme/usePaperTheme";
import { Feather } from '@expo/vector-icons';
import { useVaultStore } from "../store/useVaultStore";
import { RootStackParams } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParams, "PdfReview">;

export function PdfReviewScreen({ navigation, route }: Props) {
  const { imageUris } = route.params;
  const { width } = useWindowDimensions();
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [pages, setPages] = useState(imageUris.map((uri, index) => ({ id: `${index}-${uri}`, uri })));
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [deleteAlertVisible, setDeleteAlertVisible] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isReordering, setIsReordering] = useState(false);
  const columnCount = 6;
  const itemWidth = width / columnCount;
  const itemHeight = width * 0.4;
  const gridRef = useRef<View | null>(null);
  const gridOrigin = useRef({ x: 0, y: 0 });

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (isPreviewVisible) {
          setIsPreviewVisible(false);
          return true;
        }
        if (isReordering) {
          setIsReordering(false);
          return true;
        }
        navigation.goBack();
        return true;
      };

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [navigation, isPreviewVisible, isReordering]),
  );
  const addFiles = useVaultStore((s) => s.addFiles);
  const { colors } = usePaperTheme();
  const styles = getStyles(colors, itemWidth, itemHeight, width);
  const pageUris = pages.map((page) => page.uri);
  const rowSelectionMode = !isReordering && selectedPageIds.length > 0;
  const hasPages = pages.length > 0;

  const normalizeUri = (uri: string) => {
    if (!uri) return uri;
    return uri.startsWith("file://") ? uri : `file://${uri}`;
  };

  const requestCameraPermission = async () => {
    if (Platform.OS !== "android") {
      return true;
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: "Camera access required",
        message: "Paper Box needs camera access to scan documents.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      },
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const addPages = async () => {
    if (isScanning) return;
    setIsScanning(true);

    try {
      const granted = await requestCameraPermission();
      if (!granted) {
        Alert.alert("Camera permission required", "Allow camera access to scan documents.");
        return;
      }

      const result = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        maxNumDocuments: 10,
      });

      if (result.status === ScanDocumentResponseStatus.Cancel) {
        return;
      }

      const scannedImages = result.scannedImages?.filter(Boolean).map(normalizeUri) ?? [];
      if (!scannedImages.length) {
        Alert.alert("No scan result", "Try scanning again.");
        return;
      }

      setPages((current) => [
        ...current,
        ...scannedImages.map((uri, index) => ({ id: `${Date.now()}-${current.length + index}-${uri}`, uri })),
      ]);
    } catch (error) {
      console.warn("addPages error", error);
      Alert.alert("Scan failed", "Unable to scan documents. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const deletePreviewPage = () => {
    if (selectedImageIndex === null) return;
    const pageToRemove = pages[selectedImageIndex];
    if (!pageToRemove) return;

    const nextPages = pages.filter((page) => page.id !== pageToRemove.id);
    setPages(nextPages);
    setSelectedPageIds((current) => current.filter((id) => id !== pageToRemove.id));

    if (!nextPages.length) {
      closePreview();
      return;
    }

    if (selectedImageIndex >= nextPages.length) {
      setSelectedImageIndex(nextPages.length - 1);
    }
  };

  const getFileSize = async (uri: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists ? info.size : 0;
    } catch (error) {
      console.warn("PdfReview getFileSize error", error);
      return 0;
    }
  };

  const createPdf = async () => {
    if (!pageUris.length) {
      Alert.alert("No pages", "Capture at least one page before creating a PDF.");
      return;
    }

    try {
      setIsSaving(true);

      const imagesHtml = await Promise.all(
        pageUris.map(async (photoUri) => {
          const resized = await ImageManipulator.manipulateAsync(
            photoUri,
            [{ resize: { width: 800 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );

          if (!resized.base64) {
            throw new Error("Unable to resize image for PDF generation");
          }

          return `<div class="page"><img src="data:image/jpeg;base64,${resized.base64}" /></div>`;
        }),
      );

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>@page{size:A4;margin:0;}html,body{margin:0;padding:0;background:#000;width:100%;height:100%;}body{padding:0;} .page{width:100%;height:100vh;display:flex;justify-content:center;align-items:center;overflow:hidden;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;} .page:last-child{page-break-after:auto;break-after:auto;} img{width:100%;height:100%;object-fit:cover;display:block;margin:0;padding:0;border:none;}</style></head><body>${imagesHtml.join('')}</body></html>`;
      const { uri: generatedPdfUri } = await Print.printToFileAsync({ html });

      if (!generatedPdfUri) {
        throw new Error("Unable to generate PDF file");
      }

      const filename = `Scan-${Date.now()}.pdf`;
      const documentDirectory = FileSystem.documentDirectory;
      if (!documentDirectory) {
        throw new Error("Unable to access the document directory");
      }

      const destinationUri = `${documentDirectory}${filename}`;
      await FileSystem.copyAsync({ from: generatedPdfUri, to: destinationUri });
      const info = await FileSystem.getInfoAsync(destinationUri);
      console.warn("PdfReview created PDF destination info:", info);
      const fileSize = await getFileSize(destinationUri);

      addFiles([
        {
          id: `${Date.now()}-${Math.random()}`,
          name: filename,
          uri: destinationUri,
          mimeType: "application/pdf",
          size: fileSize,
          extension: "pdf",
          kind: "pdf",
          createdAt: new Date().toISOString(),
          isFavorite: false,
          isPinned: false,
          tags: [],
          source: "camera",
        },
      ]);

      Alert.alert("PDF created", "Your scanned PDF was saved to the vault.", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.warn("PdfReview createPdf error", error);
      Alert.alert("PDF creation failed", "Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const openPreview = (index: number) => {
    setSelectedImageIndex(index);
    setIsPreviewVisible(true);
  };

  const closePreview = () => {
    setIsPreviewVisible(false);
    setSelectedImageIndex(null);
  };

  const startReorder = () => {
    if (!hasPages) return;
    setSelectedPageIds([]);
    setIsReordering(true);
  };

  const finishReorder = () => {
    setIsReordering(false);
  };

  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds((current) =>
      current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId],
    );
  };

  const clearPageSelection = () => {
    setSelectedPageIds([]);
  };

  const deleteSelectedPages = () => {
    if (!selectedPageIds.length) return;
    setDeleteAlertVisible(true);
  };

  const confirmDeletePages = () => {
    setPages((current) => current.filter((page) => !selectedPageIds.includes(page.id)));
    setSelectedPageIds([]);
    setDeleteAlertVisible(false);
  };

  const cancelDeletePages = () => {
    setDeleteAlertVisible(false);
  };

  const movePage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setPages((current) => {
      if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  // Compute a grid target index directly from the fixed column geometry rather than
  // relying on per-tile onLayout snapshots (which go stale as soon as items reflow).
  const getTargetIndexFromWindowPoint = (pageX: number, pageY: number) => {
    const relativeX = pageX - gridOrigin.current.x;
    const relativeY = pageY - gridOrigin.current.y;
    const col = Math.min(columnCount - 1, Math.max(0, Math.floor(relativeX / itemWidth)));
    const row = Math.max(0, Math.floor(relativeY / itemHeight));
    const index = row * columnCount + col;
    return Math.min(pages.length - 1, Math.max(0, index));
  };

  const createPanResponder = (pageId: string, index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => isReordering,
      onMoveShouldSetPanResponder: () => isReordering,
      onPanResponderGrant: () => {
        if (!isReordering) return;
        setDraggedItemId(pageId);
        setDraggedIndex(index);
        setDragOffset({ x: 0, y: 0 });
        gridRef.current?.measureInWindow((x, y) => {
          gridOrigin.current = { x, y };
        });
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!isReordering) return;
        setDragOffset({ x: gestureState.dx, y: gestureState.dy });

        setDraggedIndex((currentDraggedIndex) => {
          if (currentDraggedIndex === null) return currentDraggedIndex;
          const targetIndex = getTargetIndexFromWindowPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          if (targetIndex !== currentDraggedIndex) {
            movePage(currentDraggedIndex, targetIndex);
            return targetIndex;
          }
          return currentDraggedIndex;
        });
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (!isReordering) {
          if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
            openPreview(index);
          }
        }
        setDraggedItemId(null);
        setDraggedIndex(null);
        setDragOffset({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        setDraggedItemId(null);
        setDraggedIndex(null);
        setDragOffset({ x: 0, y: 0 });
      },
    });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.reviewHeader}>
        <View>
          <Text style={styles.title}>Review pages</Text>
          <Text style={styles.subtitle}>
            {pages.length} page{pages.length === 1 ? "" : "s"} ready to export.
          </Text>
        </View>
        <View style={styles.pageCountBadge}>
          <Text style={styles.pageCountText}>{pages.length}</Text>
        </View>
      </View>

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionButton, isScanning && styles.actionButtonDisabled]}
          onPress={addPages}
          disabled={isScanning}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              <Feather name="plus" size={16} color={colors.background} style={styles.actionIcon} />
              <Text style={styles.actionButtonText}>Add page</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            isReordering && styles.actionButtonActive,
            !hasPages && !isReordering && styles.actionButtonDisabled,
          ]}
          onPress={isReordering ? finishReorder : startReorder}
          disabled={!hasPages && !isReordering}
        >
          <Feather name={isReordering ? "check" : "move"} size={16} color={isReordering ? colors.background : colors.text} style={styles.actionIcon} />
          <Text style={[styles.actionButtonText, isReordering && styles.actionButtonTextActive]}>
            {isReordering ? "Done" : "Reorder"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, !selectedPageIds.length && styles.actionButtonDisabled]}
          onPress={deleteSelectedPages}
          disabled={!selectedPageIds.length}
        >
          <Feather name="trash-2" size={16} color={colors.background} style={styles.actionIcon} />
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {isReordering ? (
        <View style={styles.reorderBanner}>
          <Text style={styles.reorderBannerText}>Drag and drop pages to reorder them.</Text>
          <TouchableOpacity style={styles.reorderDoneButton} onPress={finishReorder}>
            <Text style={styles.reorderDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : rowSelectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionTitle}>{selectedPageIds.length} selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionActionButton} onPress={clearPageSelection}>
              <Text style={styles.selectionActionText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionActionButton} onPress={deleteSelectedPages}>
              <Text style={styles.selectionActionText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {hasPages ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.pagesGridContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isReordering}
        >
          <View ref={gridRef} style={[styles.pagesGrid, { width }]}>
            {pages.map((page, index) => {
              const panHandlers = createPanResponder(page.id, index).panHandlers;
              const isSelected = selectedPageIds.includes(page.id);
              const isDragged = draggedItemId === page.id;
              const isFirstColumn = index % columnCount === 0;
              const isFirstRow = index < columnCount;
              return (
                <Pressable
                  key={page.id}
                  style={[
                    styles.pageCard,
                    {
                      flexBasis: `${100 / columnCount}%`,
                      maxWidth: `${100 / columnCount}%`,
                      marginBottom: 0,
                      borderLeftWidth: isFirstColumn ? 0 : 1,
                      borderTopWidth: isFirstRow ? 0 : 1,
                    },
                    isSelected && styles.pageCardSelected,
                    isDragged && [
                      styles.pageCardDragged,
                      { transform: [{ translateX: dragOffset.x }, { translateY: dragOffset.y }, { scale: 1.08 }] },
                    ],
                  ]}
                  onPress={() => (rowSelectionMode ? togglePageSelection(page.id) : openPreview(index))}
                  onLongPress={() => !isReordering && togglePageSelection(page.id)}
                  {...panHandlers}
                >
                  <Image source={{ uri: page.uri }} style={styles.pageImage} />
                  {isSelected ? (
                    <>
                      <View style={styles.pageSelectionOverlay} />
                      <View style={styles.pageSelectionIcon}>
                        <Feather name="check-circle" size={20} color="#fff" />
                      </View>
                    </>
                  ) : null}
                  {isReordering ? (
                    <View style={styles.dragHandle}>
                      <Feather name="move" size={12} color="#fff" />
                    </View>
                  ) : null}
                  <Text style={styles.pageNumberBadge}>{index + 1}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Feather name="file-text" size={28} color={colors.secondary} />
          </View>
          <Text style={styles.emptyTitle}>No pages yet</Text>
          <Text style={styles.emptySubtitle}>Scan a document to start building your PDF.</Text>
          <TouchableOpacity style={styles.emptyAddButton} onPress={addPages} disabled={isScanning}>
            {isScanning ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <Feather name="plus" size={16} color={colors.background} style={styles.actionIcon} />
                <Text style={styles.actionButtonText}>Add page</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, (isSaving || !hasPages) && styles.primaryButtonDisabled]}
          onPress={createPdf}
          disabled={isSaving || !hasPages}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <View style={styles.primaryButtonContent}>
              <Feather name="file-text" size={16} color={colors.background} style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Create PDF</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={isPreviewVisible} transparent={true} animationType="fade" onRequestClose={closePreview}>
        <View style={styles.previewModalContainer}>
          <View style={styles.previewHeader}>
            <TouchableOpacity style={styles.previewHeaderButton} onPress={closePreview}>
              <Feather name="arrow-left" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.previewTitle}>{selectedImageIndex !== null ? `Image ${selectedImageIndex + 1} of ${pages.length}` : "Preview"}</Text>
            <View style={styles.previewHeaderSpacer} />
          </View>

          {selectedImageIndex !== null && pages[selectedImageIndex] ? (
            <Image source={{ uri: pages[selectedImageIndex].uri }} style={styles.previewImage} resizeMode="contain" />
          ) : null}

          <View style={styles.previewFooter}>
            <TouchableOpacity style={styles.previewFooterButton} onPress={deletePreviewPage}>
              <Feather name="trash-2" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteAlertVisible} transparent animationType="fade" onRequestClose={cancelDeletePages}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertContainer}>
            <Text style={styles.alertTitle}>Delete selected pages?</Text>
            <Text style={styles.alertMessage}>
              {selectedPageIds.length} page{selectedPageIds.length === 1 ? "" : "s"} will be removed from this PDF preview.
            </Text>
            <View style={styles.alertActions}>
              <TouchableOpacity style={[styles.alertButton, styles.alertCancelButton]} onPress={cancelDeletePages}>
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.alertButton, styles.alertDeleteButton]} onPress={confirmDeletePages}>
                <Text style={styles.alertDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (
  c: {
    background: string;
    surface: string;
    elevated: string;
    text: string;
    secondary: string;
    border: string;
    muted: string;
    inverse: string;
  },
  itemWidth: number,
  itemHeight: number,
  width: number,
) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      padding: 0,
      backgroundColor: c.background,
    },
    reviewHeader: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: c.background,
    },
    title: {
      fontSize: 24,
      fontWeight: "900",
      color: c.text,
      lineHeight: 32,
    },
    subtitle: {
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
      maxWidth: "80%",
    },
    pageCountBadge: {
      minWidth: 56,
      minHeight: 56,
      borderRadius: 28,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 5,
    },
    pageCountText: {
      color: c.text,
      fontWeight: "800",
      fontSize: 18,
    },
    actionBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      gap: 12,
      marginBottom: 10,
    },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: 48,
    },
    actionButtonText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    actionButtonTextActive: {
      color: c.background,
    },
    actionButtonActive: {
      backgroundColor: c.text,
      borderColor: c.text,
    },
    actionButtonDisabled: {
      opacity: 0.45,
    },
    actionIcon: {
      marginRight: 8,
    },
    scrollArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    pagesGridContent: {
      paddingHorizontal: 0,
      paddingBottom: 24,
    },
    pagesGrid: {
      width,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-start",
    },
    pageCard: {
      position: "relative",
      borderRadius: 0,
      overflow: "hidden",
      backgroundColor: c.background,
      borderColor: c.border,
      height: itemHeight,
    },
    pageCardDragged: {
      zIndex: 10,
      elevation: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      opacity: 0.95,
    },
    pageImage: {
      width: "100%",
      height: "100%",
      backgroundColor: c.background,
      resizeMode: "cover",
    },
    dragHandle: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
    pageNumberBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      minWidth: 26,
      minHeight: 26,
      paddingHorizontal: 8,
      borderRadius: 14,
      backgroundColor: "rgba(0,0,0,0.55)",
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center",
      textAlignVertical: "center",
      lineHeight: 24,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 6,
    },
    emptySubtitle: {
      color: c.secondary,
      fontSize: 14,
      textAlign: "center",
      marginBottom: 20,
    },
    emptyAddButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 999,
      backgroundColor: c.text,
    },
    alertOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    alertContainer: {
      width: "100%",
      maxWidth: 360,
      padding: 24,
      borderRadius: 24,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 12,
    },
    alertTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 8,
    },
    alertMessage: {
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 24,
    },
    alertActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
    },
    alertButton: {
      minWidth: 90,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    alertCancelButton: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    alertDeleteButton: {
      backgroundColor: c.text,
    },
    alertCancelText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 14,
    },
    alertDeleteText: {
      color: c.background,
      fontWeight: "700",
      fontSize: 14,
    },
    selectionBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    selectionTitle: {
      color: c.text,
      fontWeight: "700",
      fontSize: 15,
    },
    selectionActions: {
      flexDirection: "row",
      gap: 10,
    },
    selectionActionButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
      justifyContent: "center",
      alignItems: "center",
    },
    selectionActionText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 13,
    },
    pageCardSelected: {
      borderWidth: 2,
      borderColor: c.text,
    },
    pageSelectionOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.30)",
    },
    pageSelectionIcon: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
    reorderBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    reorderBannerText: {
      color: c.text,
      fontSize: 14,
      fontWeight: "600",
      flex: 1,
      marginRight: 12,
    },
    reorderDoneButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: c.text,
      alignItems: "center",
      justifyContent: "center",
    },
    reorderDoneText: {
      color: c.background,
      fontWeight: "700",
      fontSize: 13,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 24,
      backgroundColor: c.background,
    },
    primaryButton: {
      flex: 1,
      paddingVertical: 14,
      backgroundColor: c.text,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      color: c.background,
      fontWeight: "700",
      fontSize: 15,
    },
    previewModalContainer: {
      flex: 1,
      backgroundColor: "#000000",
    },
    previewHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    previewHeaderButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    previewHeaderSpacer: {
      width: 40,
      height: 40,
    },
    previewTitle: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
      flex: 1,
      textAlign: "center",
    },
    previewImage: {
      flex: 1,
      width: "100%",
      backgroundColor: "#000000",
    },
    previewFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      paddingVertical: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    previewFooterButton: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
    },
  });