import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
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
import { withAlpha } from "../theme/utils";
import { Feather } from "@expo/vector-icons";
import ImageViewer from "react-native-image-zoom-viewer";
import { useSettingsStore } from "../store/useSettingsStore";
import { useVaultStore } from "../store/useVaultStore";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RootStackParams } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParams, "PdfReview">;

export function PdfReviewScreen({ navigation, route }: Props) {
  const { imageUris } = route.params;
  const { width } = useWindowDimensions();
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null,
  );
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [pages, setPages] = useState(
    imageUris.map((uri, index) => ({ id: `${index}-${uri}`, uri })),
  );
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [deleteAlertVisible, setDeleteAlertVisible] = useState(false);
  const [successDialogVisible, setSuccessDialogVisible] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isReordering, setIsReordering] = useState(false);

  // menu and modal state
  const [menuVisible, setMenuVisible] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [deleteSelectModalVisible, setDeleteSelectModalVisible] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoTotalSize, setInfoTotalSize] = useState<number | null>(null);
  const [infoEstimatedPdfSize, setInfoEstimatedPdfSize] = useState<number | null>(null);

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const openInfo = async () => {
    closeMenu();
    setInfoLoading(true);
    setInfoModalVisible(true);
    try {
      const ids = selectedPageIds.length ? selectedPageIds : pages.map((p) => p.id);
      const uris = pages.filter((p) => ids.includes(p.id)).map((p) => p.uri);
      const sizes = await Promise.all(uris.map((u) => getFileSize(u)));
      const total = sizes.reduce((s, v) => s + v, 0);
      const estimated = Math.round(total * 0.7) + 1024;
      setInfoTotalSize(total);
      setInfoEstimatedPdfSize(estimated);
    } catch (e) {
      console.warn("info calc error", e);
      setInfoTotalSize(null);
      setInfoEstimatedPdfSize(null);
    } finally {
      setInfoLoading(false);
    }
  };

  const openDeleteSelect = () => {
    closeMenu();
    setSelectedForDeletion(selectedPageIds.length ? selectedPageIds.slice() : []);
    setDeleteSelectModalVisible(true);
  };

  const confirmDeleteSelectedFromModal = () => {
    setSelectedPageIds(selectedForDeletion);
    setDeleteSelectModalVisible(false);
    if (selectedForDeletion.length) setDeleteAlertVisible(true);
  };

  // refs for responders to read latest state without stale closures
  const pagesRef = useRef(pages);
  const isReorderingRef = useRef(isReordering);
  const draggedItemIdRef = useRef(draggedItemId);
  const draggedIndexRef = useRef(draggedIndex);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => {
    isReorderingRef.current = isReordering;
  }, [isReordering]);
  useEffect(() => {
    draggedItemIdRef.current = draggedItemId;
  }, [draggedItemId]);
  useEffect(() => {
    draggedIndexRef.current = draggedIndex;
  }, [draggedIndex]);

  // PanResponder cache per page id
  const panResponderMapRef = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const columnCount = 6;
  const itemWidth = width / columnCount;
  const itemHeight = itemWidth;
  // Insertion threshold: fraction of a tile's dimension the pointer must cross to switch target.
  const insertionThreshold = 0.4;
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

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [navigation, isPreviewVisible, isReordering]),
  );

  const addFiles = useVaultStore((s) => s.addFiles);
  const setLockSuppressed = useSettingsStore((s) => s.setLockSuppressed);
  const { mode, colors } = usePaperTheme();
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
        message: "PaperBox needs camera access to scan documents.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      },
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const addPages = async () => {
    if (isScanning) return;
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

      const result = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        maxNumDocuments: 10,
      });

      if (result.status === ScanDocumentResponseStatus.Cancel) {
        return;
      }

      const scannedImages =
        result.scannedImages?.filter(Boolean).map(normalizeUri) ?? [];
      if (!scannedImages.length) {
        Alert.alert("No scan result", "Try scanning again.");
        return;
      }

      setPages((current) => [
        ...current,
        ...scannedImages.map((uri, index) => ({
          id: `${Date.now()}-${current.length + index}-${uri}`,
          uri,
        })),
      ]);
    } catch (error) {
      console.warn("addPages error", error);
      Alert.alert("Scan failed", "Unable to scan documents. Please try again.");
    } finally {
      setIsScanning(false);
      setLockSuppressed(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Review pages",
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerAddButton}
            onPress={addPages}
            disabled={isScanning}
          >
            <Feather name="plus" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAddButton}
            onPress={openMenu}
            disabled={isScanning}
          >
            <Feather name="more-vertical" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu, colors.text, isScanning, navigation, styles.headerAddButton]);

  const deletePreviewPage = () => {
    if (selectedImageIndex === null) return;
    const pageToRemove = pages[selectedImageIndex];
    if (!pageToRemove) return;

    const nextPages = pages.filter((page) => page.id !== pageToRemove.id);
    setPages(nextPages);
    setSelectedPageIds((current) =>
      current.filter((id) => id !== pageToRemove.id),
    );

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
      Alert.alert(
        "No pages",
        "Capture at least one page before creating a PDF.",
      );
      return;
    }

    try {
      setIsSaving(true);

      const imagesHtml = await Promise.all(
        pageUris.map(async (photoUri) => {
          const resized = await ImageManipulator.manipulateAsync(
            photoUri,
            [{ resize: { width: 800 } }],
            {
              compress: 0.7,
              format: ImageManipulator.SaveFormat.JPEG,
              base64: true,
            },
          );

          if (!resized.base64) {
            throw new Error("Unable to resize image for PDF generation");
          }

          return `<div class="page"><img src="data:image/jpeg;base64,${resized.base64}" /></div>`;
        }),
      );

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=210mm, height=297mm, initial-scale=1.0" /><style>@page{size:210mm 297mm;margin:0;}html,body{margin:0;padding:0;background:#000;width:210mm;height:297mm;}body{padding:0;} .page{width:210mm;height:297mm;display:flex;justify-content:center;align-items:center;overflow:hidden;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;} .page:last-child{page-break-after:auto;break-after:auto;} img{width:210mm;height:297mm;object-fit:cover;display:block;margin:0;padding:0;border:none;}</style></head><body>${imagesHtml.join("")}</body></html>`;
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

      setSuccessDialogVisible(true);
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

  const retakePage = async (index: number) => {
    if (isScanning) return;
    const granted = await requestCameraPermission();
    if (!granted) {
      Alert.alert(
        "Camera permission required",
        "Allow camera access to retake a page.",
      );
      return;
    }

    setLockSuppressed(true);
    setIsScanning(true);

    try {
      const result = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        maxNumDocuments: 1,
      });

      if (result.status === ScanDocumentResponseStatus.Cancel) {
        return;
      }

      const scannedImages = result.scannedImages?.filter(Boolean).map(normalizeUri) ?? [];
      if (!scannedImages.length) {
        Alert.alert("No scan result", "Try retaking the image again.");
        return;
      }

      const newUri = scannedImages[0];
      setPages((current) =>
        current.map((page, pageIndex) =>
          pageIndex === index ? { ...page, uri: newUri } : page,
        ),
      );
    } catch (error) {
      console.warn("retakePage error", error);
      Alert.alert("Retake failed", "Unable to retake the page. Please try again.");
    } finally {
      setIsScanning(false);
      setLockSuppressed(false);
    }
  };

  const updateGridOrigin = () => {
    try {
      gridRef.current?.measureInWindow((x, y) => {
        gridOrigin.current = { x, y };
      });
    } catch (e) {
      // ignore measurement errors
    }
  };

  const startReorder = () => {
    if (!hasPages) return;
    setSelectedPageIds([]);
    setIsReordering(true);
    // measure grid origin after layout stabilizes so target calculations are accurate
    requestAnimationFrame(() => updateGridOrigin());
  };

  const finishReorder = () => {
    setIsReordering(false);
    setDraggedItemId(null);
    setDraggedIndex(null);
    setDragOffset({ x: 0, y: 0 });
  };

  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds((current) =>
      current.includes(pageId)
        ? current.filter((id) => id !== pageId)
        : [...current, pageId],
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
    setPages((current) =>
      current.filter((page) => !selectedPageIds.includes(page.id)),
    );
    setSelectedPageIds([]);
    setDeleteAlertVisible(false);
  };

  // Cancelling a delete should not leave a stray selection behind, since the
  // selection in the long-press-to-delete flow exists only to drive this dialog.
  const cancelDeletePages = () => {
    setDeleteAlertVisible(false);
    setSelectedPageIds([]);
  };

  const closeSuccessDialog = () => {
    setSuccessDialogVisible(false);
    navigation.goBack();
  };

  const movePage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setPages((current) => {
      if (
        fromIndex < 0 ||
        fromIndex >= current.length ||
        toIndex < 0 ||
        toIndex >= current.length
      ) {
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
    // shift = 1 - threshold: pointer must cross `insertionThreshold` fraction of a
    // tile before the target index switches, which avoids jittery re-ordering.
    const shift = 1 - insertionThreshold;
    const col = Math.min(
      columnCount - 1,
      Math.max(0, Math.floor(relativeX / itemWidth + shift)),
    );
    const row = Math.max(0, Math.floor(relativeY / itemHeight + shift));
    const index = row * columnCount + col;
    return Math.min(pages.length - 1, Math.max(0, index));
  };

  const createPanResponder = (pageId: string) => {
    // memoize per page id so we don't recreate responders on every render
    const cached = panResponderMapRef.current.get(pageId);
    if (cached) return cached;

    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => isReorderingRef.current,
      onMoveShouldSetPanResponder: () => isReorderingRef.current,
      onPanResponderGrant: () => {
        if (!isReorderingRef.current) return;
        draggedItemIdRef.current = pageId;
        setDraggedItemId(pageId);
        const startIndex = pagesRef.current.findIndex((p) => p.id === pageId);
        draggedIndexRef.current = startIndex === -1 ? null : startIndex;
        setDraggedIndex(draggedIndexRef.current);
        setDragOffset({ x: 0, y: 0 });
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!isReorderingRef.current) return;
        setDragOffset({ x: gestureState.dx, y: gestureState.dy });
        const resolvedIndex =
          draggedIndexRef.current === null
            ? pagesRef.current.findIndex((p) => p.id === pageId)
            : draggedIndexRef.current;
        if (resolvedIndex === -1 || resolvedIndex === null) return;
        const targetIndex = getTargetIndexFromWindowPoint(
          evt.nativeEvent.pageX,
          evt.nativeEvent.pageY,
        );
        if (targetIndex !== resolvedIndex) {
          movePage(resolvedIndex, targetIndex);
          draggedIndexRef.current = targetIndex;
          setDraggedIndex(targetIndex);
        }
      },
      onPanResponderRelease: () => {
        setDraggedItemId(null);
        draggedItemIdRef.current = null;
        setDraggedIndex(null);
        draggedIndexRef.current = null;
        setDragOffset({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        setDraggedItemId(null);
        draggedItemIdRef.current = null;
        setDraggedIndex(null);
        draggedIndexRef.current = null;
        setDragOffset({ x: 0, y: 0 });
      },
    });
    panResponderMapRef.current.set(pageId, responder);
    return responder;
  };

  // Always select the long-pressed tile (regardless of prior selection state) and
  // surface the delete confirmation. This makes long-press unambiguous: it always
  // means "ask to delete this," never a silent toggle.
  const handleLongPressDelete = (pageId: string) => {
    setSelectedPageIds((current) =>
      current.includes(pageId) ? current : [...current, pageId],
    );
    setDeleteAlertVisible(true);
  };

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {isReordering ? (
        <View style={styles.reorderBanner}>
          <Text style={styles.reorderBannerText}>
            Drag and drop pages to reorder them.
          </Text>
          <TouchableOpacity
            style={styles.reorderDoneButton}
            onPress={finishReorder}
          >
            <Text style={styles.reorderDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : rowSelectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionTitle}>
            {selectedPageIds.length} selected
          </Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={styles.selectionActionButton}
              onPress={clearPageSelection}
            >
              <Text style={styles.selectionActionText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectionActionButton}
              onPress={deleteSelectedPages}
            >
              <Text style={styles.selectionActionText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {hasPages ? (
        <View style={styles.actionBar}>
          <Text style={styles.actionButtonText}>Pages: {pages.length}</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={addPages}
            disabled={isScanning}
          >
            <Feather
              name="plus"
              size={16}
              color={colors.text}
              style={styles.actionIcon}
            />
            <Text style={styles.actionButtonText}>Add page</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {hasPages ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.pagesGridContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isReordering}
        >
          <View ref={gridRef} onLayout={updateGridOrigin} style={[styles.pagesGrid, { width }]}>
            {pages.map((page, index) => {
              const responder = createPanResponder(page.id);
              // Only attach the PanResponder's raw responder props while actually
              // reordering. Leaving them attached at all times makes the parent View
              // participate in touch negotiation on every tap, which can delay or
              // drop the child Pressable's long-press gesture (esp. on Android).
              const panHandlers = isReordering ? responder.panHandlers : {};
              const isSelected = selectedPageIds.includes(page.id);
              const isDragged = draggedItemId === page.id;
              const isFirstColumn = index % columnCount === 0;
              const isFirstRow = index < columnCount;
              return (
                <View
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
                      {
                        transform: [
                          { translateX: dragOffset.x },
                          { translateY: dragOffset.y },
                          { scale: 1.15 },
                        ],
                      },
                    ],
                  ]}
                  {...panHandlers}
                >
                  {/* When not reordering, a full-area Pressable owns tap / long-press.
                      When reordering, it's unmounted so the PanResponder owns the gesture. */}
                  <Image source={{ uri: page.uri }} style={styles.pageImage} />
                  {!isReordering && (
                    <Pressable
                      style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
                      onPress={() =>
                        rowSelectionMode
                          ? togglePageSelection(page.id)
                          : openPreview(index)
                      }
                      onLongPress={() => handleLongPressDelete(page.id)}
                    />
                  )}
                  {isSelected ? (
                    <>
                      <View style={styles.pageSelectionOverlay} />
                      <View style={styles.pageSelectionIcon}>
                        <Feather name="check-circle" size={20} color={colors.background} />
                      </View>
                    </>
                  ) : null}
                  {isReordering ? (
                    <View style={styles.dragHandle}>
                      <Feather name="move" size={12} color={colors.background} />
                    </View>
                  ) : null}
                  <Text style={styles.pageNumberBadge}>{index + 1}</Text>
                </View>
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
          <Text style={styles.emptySubtitle}>
            Scan a document to start building your PDF.
          </Text>
          <TouchableOpacity
            style={styles.emptyAddButton}
            onPress={addPages}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <Feather
                  name="plus"
                  size={16}
                  color={colors.text}
                  style={styles.actionIcon}
                />
                <Text style={styles.actionButtonText}>Add page</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (isSaving || !hasPages) && styles.primaryButtonDisabled,
          ]}
          onPress={createPdf}
          disabled={isSaving || !hasPages}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <View style={styles.primaryButtonContent}>
              <Feather
                name="file-text"
                size={16}
                color={colors.background}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.primaryButtonText}>Create PDF</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            !hasPages && styles.primaryButtonDisabled,
          ]}
          onPress={isReordering ? finishReorder : startReorder}
          disabled={!hasPages}
        >
          <Feather
            name={isReordering ? "check" : "edit-3"}
            size={16}
            color={colors.text}
          />
        </TouchableOpacity>
        
      </View>

      {/* Menu modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <View style={[styles.menuContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.menuItem} onPress={openInfo}>
              <Text style={[styles.menuItemText, { color: colors.text }]}>Info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={openDeleteSelect}>
              <Text style={[styles.menuItemText, { color: colors.text }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Info modal */}
      <Modal visible={infoModalVisible} transparent animationType="fade" onRequestClose={() => setInfoModalVisible(false)}>
        <View style={styles.alertOverlay}>
          <View style={[styles.alertContainer, { maxWidth: 420 }]}>
            <Text style={styles.alertTitle}>Images info</Text>
            {infoLoading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Text style={styles.alertMessage}>Total images: {selectedPageIds.length ? selectedPageIds.length : pages.length}</Text>
                <Text style={styles.alertMessage}>Total size: {infoTotalSize !== null ? formatBytes(infoTotalSize) : "—"}</Text>
                <Text style={styles.alertMessage}>Estimated PDF size: {infoEstimatedPdfSize !== null ? formatBytes(infoEstimatedPdfSize) : "—"}</Text>
              </>
            )}
            <View style={styles.alertActions}>
              <TouchableOpacity style={[styles.alertButton, styles.alertCancelButton]} onPress={() => setInfoModalVisible(false)}>
                <Text style={styles.alertCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete select modal */}
      <Modal visible={deleteSelectModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteSelectModalVisible(false)}>
        <View style={styles.alertOverlay}>
          <View style={[styles.alertContainer, { maxWidth: 640 }]}>
            <Text style={styles.alertTitle}>Select images to delete</Text>
            <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {pages.map((p, i) => {
                  const sel = selectedForDeletion.includes(p.id);
                  return (
                    <Pressable key={p.id} onPress={() => {
                      setSelectedForDeletion((cur) => cur.includes(p.id) ? cur.filter(id=>id!==p.id) : [...cur, p.id]);
                    }} style={{ width: itemWidth, height: itemHeight, padding: 6 }}>
                      <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%', opacity: sel ? 0.5 : 1 }} />
                      {sel &&                       <View style={{ position: 'absolute', right: 8, top: 8, backgroundColor: withAlpha(colors.text, 0.6), padding: 4, borderRadius: 12 }}><Feather name="check" size={14} color={colors.background}/></View>}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.alertActions}>
              <TouchableOpacity style={[styles.alertButton, styles.alertCancelButton]} onPress={() => setDeleteSelectModalVisible(false)}>
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.alertButton, styles.alertDeleteButton]} onPress={confirmDeleteSelectedFromModal}>
                <Text style={styles.alertDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isPreviewVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closePreview}
      >
        <View style={styles.previewModalContainer}>
          <View style={styles.previewHeader}>
            <TouchableOpacity
              style={styles.previewHeaderButton}
              onPress={closePreview}
            >
              <Feather name="arrow-left" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.previewTitle}>
              {selectedImageIndex !== null
                ? `Image ${selectedImageIndex + 1} of ${pages.length}`
                : "Preview"}
            </Text>
            <View style={styles.previewHeaderSpacer} />
          </View>

          {selectedImageIndex !== null && pages[selectedImageIndex] ? (
            <View style={styles.previewScrollContainer}>
              <ImageViewer
                imageUrls={[{ url: pages[selectedImageIndex].uri }]}
                enableSwipeDown={false}
                renderIndicator={() => <View />}
                saveToLocalByLongPress={false}
                backgroundColor={colors.background}
                enableImageZoom
                enablePreload
                style={styles.previewScrollContainer}
              />
            </View>
          ) : null}

          <View style={styles.previewFooter}>
            <TouchableOpacity
              style={styles.previewFooterButton}
              onPress={() => {
                if (selectedImageIndex !== null) retakePage(selectedImageIndex);
              }}
              disabled={isScanning}
            >
              <Feather name="refresh-cw" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.previewFooterButton}
              onPress={deletePreviewPage}
            >
              <Feather name="trash-2" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteAlertVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelDeletePages}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertContainer}>
            <Text style={styles.alertTitle}>Delete selected pages?</Text>
            <Text style={styles.alertMessage}>
              {selectedPageIds.length} page
              {selectedPageIds.length === 1 ? "" : "s"} will be removed from
              this PDF preview.
            </Text>
            <View style={styles.alertActions}>
              <TouchableOpacity
                style={[styles.alertButton, styles.alertCancelButton]}
                onPress={cancelDeletePages}
              >
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.alertButton, styles.alertDeleteButton]}
                onPress={confirmDeletePages}
              >
                <Text style={styles.alertDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={successDialogVisible}
        title="PDF created"
        message="Your scanned PDF was saved to the vault."
        confirmText="Open vault"
        cancelText="Close"
        hideCancelButton
        onConfirm={closeSuccessDialog}
        onCancel={closeSuccessDialog}
      />
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
      shadowColor: withAlpha(c.text, 1),
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
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerAddButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
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
    shadowColor: withAlpha(c.text, 1),
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
    backgroundColor: withAlpha(c.text, 0.55),
      alignItems: "center",
      justifyContent: "center",
    },
    pageNumberBadge: {
      position: "absolute",
      minWidth: 10,
      minHeight: 10,
      borderRadius: 14,
    color: c.text,
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
      backgroundColor: withAlpha(c.text, 0.45),
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
      shadowColor: withAlpha(c.text, 1),
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
    menuOverlay: {
      flex: 1,
      backgroundColor: withAlpha(c.text, 0.3),
      justifyContent: "flex-start",
      alignItems: "flex-end",
      paddingTop: 56,
      paddingRight: 8,
    },
    menuContainer: {
      width: 160,
      borderRadius: 12,
      borderWidth: 1,
      overflow: "hidden",
    },
    menuItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    menuItemText: {
      fontWeight: "700",
      fontSize: 14,
    },
    deleteThumb: {
      width: itemWidth - 12,
      height: itemHeight - 12,
      margin: 6,
      borderRadius: 6,
      overflow: "hidden",
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
      backgroundColor: withAlpha(c.text, 0.30),
    },
    pageSelectionIcon: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: withAlpha(c.text, 0.5),
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
      gap: 12,
    },
    secondaryButton: {
      width: 52,
      height: 44,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
      elevation: 3,
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
      backgroundColor: c.background,
    },
    previewHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 32,
      paddingBottom: 12,
      backgroundColor: withAlpha(c.surface, 0.9),
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    previewHeaderButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: withAlpha(c.surface, 0.18),
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: withAlpha(c.border, 0.7),
    },
    previewHeaderSpacer: {
      width: 40,
      height: 40,
    },
    previewTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: "700",
      flex: 1,
      textAlign: "center",
    },
    previewImage: {
      flex: 1,
      width: "100%",
      backgroundColor: c.background,
    },
    previewFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      paddingVertical: 20,
      backgroundColor: withAlpha(c.surface, 0.9),
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    previewFooterButton: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: withAlpha(c.surface, 0.15),
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: withAlpha(c.text, 0.2),
    },
    previewScrollContainer: {
      flex: 1,
      backgroundColor: c.inverse,
    },
    previewScrollContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },

  });
