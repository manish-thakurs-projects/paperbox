import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  LayoutAnimation,
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
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { showAlert } from "../services/alertService";

const Alert = {
  alert: (title?: string, message?: string, buttons?: any[]) => {
    showAlert(title, message, buttons);
  },
};
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
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
import {
  decryptVaultFileAsBase64,
  persistVaultFile,
} from "../services/vaultStorage";
import {
  decryptPdfDraftPage,
  decryptPdfDraftPageAsBase64,
  deletePdfDraftPages,
  persistPdfDraftPage,
} from "../services/pdfDraftService";

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

// Start loading pdf-lib as soon as the review screen mounts so the first tap
// does not also pay the module-loading cost.
let pdfLibPromise: Promise<typeof import("pdf-lib")> | null = null;
const loadPdfLib = () => {
  pdfLibPromise ??= import("pdf-lib");
  return pdfLibPromise;
};

type Props = NativeStackScreenProps<RootStackParams, "PdfReview">;

type ReviewPage = {
  id: string;
  uri: string;
  extension?: string;
};

const extensionFromUri = (uri: string) => {
  const extension = uri.split("?")[0].split(".").pop()?.toLowerCase();
  return extension || "jpg";
};

export function PdfReviewScreen({ navigation, route }: Props) {
  const { imageUris = [], draftId } = route.params;
  const { width } = useWindowDimensions();
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isAddingPages, setIsAddingPages] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(Boolean(draftId));
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null,
  );
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [pages, setPages] = useState<ReviewPage[]>(
    imageUris.map((uri, index) => ({
      id: `${index}-${uri}`,
      uri,
      extension: extensionFromUri(uri),
    })),
  );
  const draft = useVaultStore((s) =>
    draftId ? s.drafts.find((item) => item.id === draftId) ?? null : null,
  );
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [deleteAlertVisible, setDeleteAlertVisible] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const dragPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const dragOpacity = useRef(new Animated.Value(1)).current;
  const dragStartIndexRef = useRef<number | null>(null);
  const dragAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const temporaryUrisRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void loadPdfLib();
  }, []);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // menu and modal state
  const [menuVisible, setMenuVisible] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [deleteSelectModalVisible, setDeleteSelectModalVisible] =
    useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoTotalSize, setInfoTotalSize] = useState<number | null>(null);
  const [infoEstimatedPdfSize, setInfoEstimatedPdfSize] = useState<
    number | null
  >(null);

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
      const ids = selectedPageIds.length
        ? selectedPageIds
        : pages.map((p) => p.id);
      const uris = pages.filter((p) => ids.includes(p.id)).map((p) => p.uri);
      const sizes = await Promise.all(uris.map((u) => getFileSize(u)));
      const total = sizes.reduce((s, v) => s + v, 0);
      const estimated = Math.round(total * 0.7) + 1024;
      setInfoTotalSize(total);
      setInfoEstimatedPdfSize(estimated);
    } catch (e) {
      setInfoTotalSize(null);
      setInfoEstimatedPdfSize(null);
    } finally {
      setInfoLoading(false);
    }
  };

  const openDeleteSelect = () => {
    closeMenu();
    setSelectedForDeletion(
      selectedPageIds.length ? selectedPageIds.slice() : [],
    );
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
  const draggedIndexRef = useRef<number | null>(null);
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
    let active = true;
    let temporaryUris: string[] = [];

    if (!draftId) {
      setIsLoadingDraft(false);
      return () => {
        active = false;
      };
    }

    const draftToLoad = useVaultStore
      .getState()
      .drafts.find((item) => item.id === draftId);

    if (!draftToLoad) {
      setIsLoadingDraft(false);
      return;
    }

    setIsLoadingDraft(true);
    (async () => {
      try {
        const hydratedPages = await Promise.all(
          draftToLoad.pages.map(async (page) => {
            const uri = await decryptPdfDraftPage(page);
            temporaryUris.push(uri);
            temporaryUrisRef.current.add(uri);
            return { id: page.id, uri, extension: page.extension };
          }),
        );

        if (!active) {
          await Promise.all(
            temporaryUris.map((uri) =>
              FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}),
            ),
          );
          return;
        }

        setPages(hydratedPages);
      } catch {
        if (active) {
          setPages([]);
          Alert.alert(
            "Could not open draft",
            "The saved scan is unavailable. You can delete this draft from the recent captures list.",
          );
        }
      } finally {
        if (active) setIsLoadingDraft(false);
      }
    })();

    return () => {
      active = false;
      void Promise.all(
        [...new Set([...temporaryUris, ...temporaryUrisRef.current])].map((uri) =>
          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}),
        ),
      ).finally(() => temporaryUrisRef.current.clear());
    };
  }, [draftId]);

  useEffect(
    () => () => {
      const temporaryUris = [...temporaryUrisRef.current];
      temporaryUrisRef.current.clear();
      void Promise.all(
        temporaryUris.map((uri) =>
          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}),
        ),
      );
    },
    [],
  );

  // PanResponder cache per page id
  const panResponderMapRef = useRef(
    new Map<string, ReturnType<typeof PanResponder.create>>(),
  );
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
          finishReorder();
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
  const updatePdfDraftPages = useVaultStore((s) => s.updatePdfDraftPages);
  const removePdfDraft = useVaultStore((s) => s.removePdfDraft);
  const setLockSuppressed = useSettingsStore((s) => s.setLockSuppressed);
  const { mode, colors } = usePaperTheme();
  const styles = getStyles(colors, itemWidth, itemHeight, width);
  const pageUris = pages.map((page) => page.uri);
  const rowSelectionMode = !isReordering && selectedPageIds.length > 0;
  const hasPages = pages.length > 0;

  const normalizeUri = (uri: string) => {
    if (!uri) return uri;
    return uri.startsWith("file://") || uri.startsWith("content://")
      ? uri
      : `file://${uri}`;
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

      // Keep the review screen blocked while the scanned files are encrypted,
      // previewed, and written back into the draft.
      setIsAddingPages(true);

      const currentDraft = draftId
        ? useVaultStore.getState().drafts.find((item) => item.id === draftId)
        : null;

      if (draftId && currentDraft) {
        let persistedPages: Awaited<ReturnType<typeof persistPdfDraftPage>>[] = [];
        try {
          const results = await Promise.allSettled(
            scannedImages.map((uri, offset) =>
              persistPdfDraftPage(
                uri,
                draftId,
                currentDraft.pages.length + offset,
              ),
            ),
          );
          persistedPages = results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          );
          const failed = results.find(
            (result) => result.status === "rejected",
          );
          if (failed?.status === "rejected") throw failed.reason;

          const newPages = await Promise.all(
            persistedPages.map(async (page) => {
              const decryptedUri = await decryptPdfDraftPage(page);
              temporaryUrisRef.current.add(decryptedUri);
              return {
                id: page.id,
                uri: decryptedUri,
                extension: page.extension,
              };
            }),
          );
          await updatePdfDraftPages(draftId, [
            ...currentDraft.pages,
            ...persistedPages,
          ]);
          setPages((current) => [...current, ...newPages]);
        } catch {
          await deletePdfDraftPages(persistedPages);
          await Promise.all(
            scannedImages.map((uri) =>
              FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}),
            ),
          );
          throw new Error("Unable to save scanned pages to the draft");
        }
      } else {
        const newPages = await Promise.all(
          scannedImages.map(async (uri, index) => ({
            id: `${Date.now()}-${index}-${uri}`,
            uri,
            extension: extensionFromUri(uri),
          })),
        );

        setPages((current) => [...current, ...newPages]);
      }
    } catch (error) {
      Alert.alert("Scan failed", "Unable to scan documents. Please try again.");
    } finally {
      setIsAddingPages(false);
      setIsScanning(false);
      setLockSuppressed(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Review pages",
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerAddButton}
          onPress={openMenu}
          disabled={isScanning}
        >
          <Feather name="more-vertical" size={20} color={colors.text} />
        </TouchableOpacity>
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
      return 0;
    }
  };

  // Keep generated pages within the same maximum size as the previous print
  // based path, while embedding the original JPEG/PNG bytes directly.
  const computePageSizePt = (width: number, height: number) => {
    const MAX_PAGE_DIMENSION_PT = 842;
    const scale = MAX_PAGE_DIMENSION_PT / Math.max(width, height);
    return {
      widthPt: Math.max(1, Math.round(width * scale)),
      heightPt: Math.max(1, Math.round(height * scale)),
    };
  };

  const uint8ArrayToBase64 = (u8: Uint8Array) => {
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      return Buffer.from(u8).toString("base64");
    }
    let CHUNK_SZ = 0x8000;
    let index = 0;
    let length = u8.length;
    let result = "";
    while (index < length) {
      const chunk = u8.subarray(index, Math.min(index + CHUNK_SZ, length));
      result += String.fromCharCode.apply(null, Array.from(chunk));
      index += CHUNK_SZ;
    }
    if (typeof btoa === "function") return btoa(result);
    return "";
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
      // Load the PDF engine only when a PDF is actually being created. This
      // The module is prefetched when this screen mounts, so this resolves
      // immediately in the normal review flow.
      const { PDFDocument } = await loadPdfLib();

      const addImagePage = async (
        pdfDocument: any,
        uri: string,
        extension = extensionFromUri(uri),
        decryptedBase64?: string,
      ) => {
        const base64 =
          decryptedBase64 ??
          (await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          }));
        if (!base64) throw new Error("Unable to read image for PDF generation");

        const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
        const image =
          normalizedExtension === "png"
            ? await pdfDocument.embedPng(base64)
            : await pdfDocument.embedJpg(base64);
        const { width: imageWidth, height: imageHeight } = image.scale(1);
        const { widthPt, heightPt } = computePageSizePt(
          imageWidth,
          imageHeight,
        );
        const page = pdfDocument.addPage([widthPt, heightPt]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: widthPt,
          height: heightPt,
        });
      };

      // Read the latest draft directly. The review screen can mount in the
      // same render that creates the draft, before its selector refreshes.
      const currentDraft = draftId
        ? useVaultStore.getState().drafts.find((item) => item.id === draftId) ??
          draft
        : draft;
      const sourcePdf = currentDraft?.sourcePdfId
        ? useVaultStore
            .getState()
            .files.find((file) => file.id === currentDraft.sourcePdfId)
        : null;
      const appendToExistingPdf = Boolean(
        currentDraft?.sourcePdfId && currentDraft.includesSourcePages === false,
      );

      if (appendToExistingPdf && !sourcePdf) {
        throw new Error("The original PDF is no longer available.");
      }

      // Prefer the render that enabled the button; use the ref only as a
      // fallback for a tap that lands during a state transition.
      const currentPages = pages.length ? pages : pagesRef.current;
      const pagesToAppend = appendToExistingPdf
        ? currentPages.slice(
            Math.min(currentDraft?.basePageCount ?? 0, currentPages.length),
          )
        : currentPages;
      const draftPagesById = new Map(
        (currentDraft?.pages ?? []).map((page) => [page.id, page]),
      );
      // Build one PDF directly. This avoids starting a native print job for
      // every image and then reading/merging all of those temporary PDFs.
      const mergedPdf = await PDFDocument.create();

      if (appendToExistingPdf && sourcePdf) {
        const sourceBase64 = await decryptVaultFileAsBase64(sourcePdf);
        const sourceDoc = await PDFDocument.load(sourceBase64);
        const sourcePages = await mergedPdf.copyPages(
          sourceDoc,
          sourceDoc.getPageIndices(),
        );
        sourcePages.forEach((page) => mergedPdf.addPage(page));
      }

      for (const page of pagesToAppend) {
        const encryptedDraftPage = draftPagesById.get(page.id);
        let decryptedBase64: string | undefined;
        if (encryptedDraftPage) {
          // Reuse the already-hydrated preview file when available. If the
          // cache was purged during the scanner transition, fall back to the
          // encrypted vault page without making the user reopen the draft.
          try {
            decryptedBase64 = await FileSystem.readAsStringAsync(page.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch {
            decryptedBase64 = undefined;
          }
          if (!decryptedBase64) {
            decryptedBase64 = await decryptPdfDraftPageAsBase64(
              encryptedDraftPage,
            );
          }
        }
        try {
          await addImagePage(
            mergedPdf,
            page.uri,
            page.extension,
            decryptedBase64,
          );
        } catch (error) {
          if (!encryptedDraftPage || !decryptedBase64) throw error;
          // A cache cleanup can race the first read. Retry this page directly
          // from its encrypted vault blob before surfacing a failure.
          await addImagePage(
            mergedPdf,
            page.uri,
            page.extension,
            await decryptPdfDraftPageAsBase64(encryptedDraftPage),
          );
        }
      }

      const mergedBytes = await mergedPdf.save();
      const mergedBase64 = uint8ArrayToBase64(mergedBytes);
      const filename = sourcePdf
        ? sourcePdf.name.toLowerCase().endsWith(".pdf")
          ? sourcePdf.name
          : `${sourcePdf.name}.pdf`
        : `Scan-${Date.now()}.pdf`;
      const tempPdfUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(tempPdfUri, mergedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileId = sourcePdf?.id ?? `${Date.now()}-${Math.random()}`;

      // Persist the PDF with retry prompt on errors. Do not silently fall back to plaintext.
      let encryptedUri: string | null = null;
      let attempts = 0;
      while (true) {
        try {
          encryptedUri = await persistVaultFile(tempPdfUri, fileId, "pdf");
          break;
        } catch (err: any) {
          attempts += 1;
          const retry = await showRetrySaveDialog(
            `Unable to save encrypted PDF. ${err?.message || String(err)}. Retry?`,
          );
          if (!retry || attempts >= 3) {
            throw new Error(
              `Failed to save PDF to vault: ${err?.message || String(err)}`,
            );
          }
        }
      }

      if (!encryptedUri) throw new Error("Failed to persist PDF");

      const fileSize = await getFileSize(encryptedUri);

      addFiles([
        {
          id: fileId,
          name: filename,
          uri: encryptedUri,
          mimeType: "application/pdf",
          size: fileSize,
          extension: "pdf",
          kind: "pdf",
          createdAt: new Date().toISOString(),
          tags: [],
          source: sourcePdf?.source ?? "camera",
          folderId: sourcePdf?.folderId,
          folderIds: sourcePdf?.folderIds,
          isFavorite: sourcePdf?.isFavorite ?? false,
          isPinned: sourcePdf?.isPinned ?? false,
          pdfPages: currentDraft?.pages.length ? currentDraft.pages : undefined,
          pdfHasUnextractedBase: appendToExistingPdf || undefined,
        },
      ]);
      if (draftId) {
        removePdfDraft(draftId);
      }
      navigation.navigate("Preview", { fileId });
    } catch (error) {
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

      const scannedImages =
        result.scannedImages?.filter(Boolean).map(normalizeUri) ?? [];
      if (!scannedImages.length) {
        Alert.alert("No scan result", "Try retaking the image again.");
        return;
      }

      const newUri = scannedImages[0];
      setPages((current) =>
        current.map((page, pageIndex) =>
          pageIndex === index
            ? { ...page, uri: newUri, extension: extensionFromUri(newUri) }
            : page,
        ),
      );
    } catch (error) {
      Alert.alert(
        "Retake failed",
        "Unable to retake the page. Please try again.",
      );
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
    dragAnimationRef.current?.stop();
    dragPosition.setValue({ x: 0, y: 0 });
    dragScale.setValue(1);
    dragOpacity.setValue(1);
    dragStartIndexRef.current = null;
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

  const movePage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
    return Math.min(pagesRef.current.length - 1, Math.max(0, index));
  };

  const getIndexOffset = (index: number) => ({
    x: (index % columnCount) * itemWidth,
    y: Math.floor(index / columnCount) * itemHeight,
  });

  const setDragPositionForGesture = (index: number, dx: number, dy: number) => {
    const startIndex = dragStartIndexRef.current ?? index;
    const startOffset = getIndexOffset(startIndex);
    const currentOffset = getIndexOffset(index);
    dragPosition.setValue({
      x: dx + startOffset.x - currentOffset.x,
      y: dy + startOffset.y - currentOffset.y,
    });
  };

  const settleDrag = () => {
    dragAnimationRef.current?.stop();
    dragAnimationRef.current = Animated.parallel([
      Animated.spring(dragPosition, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
        tension: 70,
        friction: 9,
      }),
      Animated.spring(dragScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 9,
      }),
      Animated.timing(dragOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]);
    dragAnimationRef.current.start(() => {
      setDraggedItemId(null);
      draggedItemIdRef.current = null;
      draggedIndexRef.current = null;
      dragStartIndexRef.current = null;
      dragAnimationRef.current = null;
    });
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
        dragAnimationRef.current?.stop();
        dragPosition.setValue({ x: 0, y: 0 });
        dragScale.setValue(1);
        dragOpacity.setValue(1);
        draggedItemIdRef.current = pageId;
        setDraggedItemId(pageId);
        const startIndex = pagesRef.current.findIndex((p) => p.id === pageId);
        dragStartIndexRef.current = startIndex === -1 ? null : startIndex;
        draggedIndexRef.current = startIndex === -1 ? null : startIndex;
        Animated.parallel([
          Animated.spring(dragScale, {
            toValue: 1.06,
            useNativeDriver: true,
            tension: 120,
            friction: 8,
          }),
          Animated.timing(dragOpacity, {
            toValue: 0.96,
            duration: 100,
            useNativeDriver: true,
          }),
        ]).start();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!isReorderingRef.current) return;
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
        }
        setDragPositionForGesture(
          targetIndex,
          gestureState.dx,
          gestureState.dy,
        );
      },
      onPanResponderRelease: () => {
        settleDrag();
      },
      onPanResponderTerminate: () => {
        settleDrag();
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

      {isLoadingDraft ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={styles.emptyTitle}>Loading draft…</Text>
          <Text style={styles.emptySubtitle}>
            Restoring your scanned page securely.
          </Text>
        </View>
      ) : hasPages ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.pagesGridContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isReordering}
        >
          <View
            ref={gridRef}
            onLayout={updateGridOrigin}
            style={[styles.pagesGrid, { width }]}
          >
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
                <Animated.View
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
                          { translateX: dragPosition.x },
                          { translateY: dragPosition.y },
                          { scale: dragScale },
                        ],
                        opacity: dragOpacity,
                      },
                    ],
                  ]}
                  {...panHandlers}
                >
                  {/* When not reordering, a full-area Pressable owns tap / long-press.
                      When reordering, it's unmounted so the PanResponder owns the gesture. */}
                  <Image
                    source={{ uri: page.uri }}
                    style={styles.pageImage}
                    resizeMethod="resize"
                    fadeDuration={0}
                  />
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
                        <Feather
                          name="check-circle"
                          size={20}
                          color={colors.background}
                        />
                      </View>
                    </>
                  ) : null}
                  {isReordering ? (
                    <View style={styles.dragHandle}>
                      <Feather
                        name="move"
                        size={12}
                        color={colors.background}
                      />
                    </View>
                  ) : null}
                  <Text style={styles.pageNumberBadge}>{index + 1}</Text>
                </Animated.View>
              );
            })}
            {!isReordering ? (
              <TouchableOpacity
                style={[
                  styles.addPageCard,
                  {
                    flexBasis: `${100 / columnCount}%`,
                    maxWidth: `${100 / columnCount}%`,
                    marginBottom: 0,
                    borderLeftWidth: pages.length % columnCount === 0 ? 0 : 1,
                    borderTopWidth: pages.length < columnCount ? 0 : 1,
                  },
                ]}
                onPress={addPages}
                activeOpacity={0.8}
              >
                <View style={styles.addPageInner}>
                  <View style={styles.addPageIconContainer}>
                    <Feather name="plus" size={28} color={colors.text} />
                  </View>
                </View>
              </TouchableOpacity>
            ) : null}
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

      {!isLoadingDraft ? (
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
      ) : null}

      <Modal
        visible={isAddingPages}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.progressOverlay}>
          <View style={styles.progressCard}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={styles.progressTitle}>Saving pages…</Text>
            <Text style={styles.progressMessage}>
              Encrypting and adding your scanned pages securely.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <View
            style={[
              styles.menuContainer,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity style={styles.menuItem} onPress={openInfo}>
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                Info
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={openDeleteSelect}
            >
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Info modal */}
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={[styles.alertContainer, { maxWidth: 420 }]}>
            <Text style={styles.alertTitle}>Images info</Text>
            {infoLoading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Text style={styles.alertMessage}>
                  Total images:{" "}
                  {selectedPageIds.length
                    ? selectedPageIds.length
                    : pages.length}
                </Text>
                <Text style={styles.alertMessage}>
                  Total size:{" "}
                  {infoTotalSize !== null ? formatBytes(infoTotalSize) : "—"}
                </Text>
                <Text style={styles.alertMessage}>
                  Estimated PDF size:{" "}
                  {infoEstimatedPdfSize !== null
                    ? formatBytes(infoEstimatedPdfSize)
                    : "—"}
                </Text>
              </>
            )}
            <View style={styles.alertActions}>
              <TouchableOpacity
                style={[styles.alertButton, styles.alertCancelButton]}
                onPress={() => setInfoModalVisible(false)}
              >
                <Text style={styles.alertCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete select modal */}
      <Modal
        visible={deleteSelectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteSelectModalVisible(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={[styles.alertContainer, { maxWidth: 640 }]}>
            <Text style={styles.alertTitle}>Select images to delete</Text>
            <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {pages.map((p, i) => {
                  const sel = selectedForDeletion.includes(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setSelectedForDeletion((cur) =>
                          cur.includes(p.id)
                            ? cur.filter((id) => id !== p.id)
                            : [...cur, p.id],
                        );
                      }}
                      style={{
                        width: itemWidth,
                        height: itemHeight,
                        padding: 6,
                      }}
                    >
                      <Image
                        source={{ uri: p.uri }}
                        style={{
                          width: "100%",
                          height: "100%",
                          opacity: sel ? 0.5 : 1,
                        }}
                        resizeMethod="resize"
                        fadeDuration={0}
                      />
                      {sel && (
                        <View
                          style={{
                            position: "absolute",
                            right: 8,
                            top: 8,
                            backgroundColor: withAlpha(colors.text, 0.6),
                            padding: 4,
                            borderRadius: 12,
                          }}
                        >
                          <Feather
                            name="check"
                            size={14}
                            color={colors.background}
                          />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.alertActions}>
              <TouchableOpacity
                style={[styles.alertButton, styles.alertCancelButton]}
                onPress={() => setDeleteSelectModalVisible(false)}
              >
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.alertButton, styles.alertDeleteButton]}
                onPress={confirmDeleteSelectedFromModal}
              >
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
                imageUrls={[
                  { url: normalizeUri(pages[selectedImageIndex].uri) },
                ]}
                enableSwipeDown={false}
                renderIndicator={() => <View />}
                saveToLocalByLongPress={false}
                backgroundColor={colors.background}
                enableImageZoom
                enablePreload={false}
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
      top: 8,
      left: 8,
      minWidth: 24,
      minHeight: 24,
      borderRadius: 12,
      paddingHorizontal: 8,
      backgroundColor: withAlpha(c.text, 0.72),
      color: c.background,
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
    progressOverlay: {
      flex: 1,
      backgroundColor: withAlpha(c.text, 0.45),
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    progressCard: {
      width: "100%",
      maxWidth: 360,
      padding: 28,
      borderRadius: 24,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      shadowColor: withAlpha(c.text, 1),
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 12,
    },
    progressTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 18,
      marginBottom: 8,
    },
    progressMessage: {
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
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
      backgroundColor: withAlpha(c.text, 0.3),
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
    addPageCard: {
      position: "relative",
      borderRadius: 0,
      overflow: "hidden",
      backgroundColor: c.surface,
      borderColor: c.border,
      height: itemHeight,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: withAlpha(c.text, 0.12),
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 25,
      elevation: 6,
    },
    addPageInner: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      padding: 8,
    },
    addPageIconContainer: {
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(c.background, 0.1),
    },
    addPageText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 13,
      textAlign: "center",
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
      backgroundColor: c.background,
    },
    previewScrollContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
  });
