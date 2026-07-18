import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Modal,
  PanResponder,
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
import { usePaperTheme } from "../theme/usePaperTheme";
import { Feather } from '@expo/vector-icons';
import { useVaultStore } from "../store/useVaultStore";
import { RootStackParams } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParams, "PdfReview">;

export function PdfReviewScreen({ navigation, route }: Props) {
  const { imageUris } = route.params;
  const { width } = useWindowDimensions();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [pages, setPages] = useState(imageUris.map((uri, index) => ({ id: `${index}-${uri}`, uri })));
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [tileLayouts, setTileLayouts] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const columnCount = 3;
  const gap = 8;
  const itemWidth = (width - 40 - gap * (columnCount - 1)) / columnCount;
  const gridRef = useRef<View | null>(null);
  const itemRefs = useRef<Record<string, View | null>>({});

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (isPreviewVisible) {
          setIsPreviewVisible(false);
          return true;
        }
        navigation.goBack();
        return true;
      };

      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [navigation, isPreviewVisible]),
  );
  const addFiles = useVaultStore((s) => s.addFiles);
  const { colors } = usePaperTheme();
  const styles = getStyles(colors, itemWidth);
  const pageUris = pages.map((page) => page.uri);

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

  const updateTileLayout = (id: string, layout: { x: number; y: number; width: number; height: number }) => {
    setTileLayouts((current) => {
      if (current[id]?.x === layout.x && current[id]?.y === layout.y && current[id]?.width === layout.width && current[id]?.height === layout.height) {
        return current;
      }
      return { ...current, [id]: layout };
    });
  };

  const movePage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setPages((current) => {
      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const getTargetIndexFromPoint = (x: number, y: number) => {
    const entries = Object.entries(tileLayouts).map(([id, layout]) => ({ id, layout }));
    if (!entries.length) return null;

    let closestIndex: number | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    entries.forEach(({ id }, index) => {
      const layout = tileLayouts[id];
      if (!layout) return;
      const centerX = layout.x + layout.width / 2;
      const centerY = layout.y + layout.height / 2;
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  };

  const createPanResponder = (pageId: string, index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => isReordering,
      onMoveShouldSetPanResponder: () => isReordering,
      onPanResponderGrant: () => {
        if (!isReordering) return;
        setDraggedItemId(pageId);
        setDraggedIndex(index);
        setDragTargetIndex(index);
      },
      onPanResponderMove: (evt) => {
        if (!isReordering || !gridRef.current) return;
        const currentDraggedIndex = draggedIndex;
        if (currentDraggedIndex === null) return;

        const targetIndex = getTargetIndexFromPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        if (targetIndex === null || targetIndex === currentDraggedIndex) {
          return;
        }

        if (targetIndex !== dragTargetIndex) {
          setDragTargetIndex(targetIndex);
          movePage(currentDraggedIndex, targetIndex);
          setDraggedIndex(targetIndex);
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (!isReordering) {
          if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
            openPreview(index);
          }
        }
        setDraggedItemId(null);
        setDraggedIndex(null);
        setDragTargetIndex(null);
      },
      onPanResponderTerminate: () => {
        setDraggedItemId(null);
        setDraggedIndex(null);
        setDragTargetIndex(null);
      },
    });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Review pages</Text>
      </View>

      <Text style={styles.subtitle}>{pages.length} page{pages.length === 1 ? "" : "s"} captured.</Text>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.pagesGridContent}
        showsVerticalScrollIndicator={false}
      >
        <View ref={gridRef} style={styles.pagesGrid}>
          {pages.map((page, index) => {
            const panHandlers = createPanResponder(page.id, index).panHandlers;
            return (
              <View
                key={page.id}
                ref={(ref) => {
                  itemRefs.current[page.id] = ref;
                }}
                style={[styles.pageCard, { width: itemWidth, marginRight: index % columnCount === columnCount - 1 ? 0 : gap, marginBottom: gap }]}
                onLayout={(event) => updateTileLayout(page.id, event.nativeEvent.layout)}
                {...panHandlers}
              >
                <Image source={{ uri: page.uri }} style={styles.pageImage} />
                <Text style={styles.pageNumberBadge}>{index + 1}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Feather name="trash-2" size={16} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
          onPress={createPdf}
          disabled={isSaving}
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
        <TouchableOpacity style={styles.secondaryButton}>
          <Feather name="edit-3" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>

      <Modal visible={isPreviewVisible} transparent={true} animationType="fade" onRequestClose={closePreview}>
        <View style={styles.previewModalContainer}>
          <View style={styles.previewHeader}>
            <TouchableOpacity style={styles.previewHeaderButton} onPress={closePreview}>
              <Feather name="arrow-left" size={20} color={colors.background} />
            </TouchableOpacity>
            <Text style={styles.previewTitle}>{selectedImageIndex !== null ? `Image ${selectedImageIndex + 1}` : "Preview"}</Text>
            <TouchableOpacity style={styles.previewHeaderButton}>
              <Feather name="more-vertical" size={20} color={colors.background} />
            </TouchableOpacity>
          </View>

          {selectedImageIndex !== null && pages[selectedImageIndex] ? (
            <Image source={{ uri: pages[selectedImageIndex].uri }} style={styles.previewImage} resizeMode="contain" />
          ) : null}

          <View style={styles.previewFooter}>
            <TouchableOpacity style={styles.previewFooterButton}>
              <Feather name="trash-2" size={18} color={colors.background} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewFooterButton}>
              <Feather name="edit-3" size={18} color={colors.background} />
            </TouchableOpacity>
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
) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      padding: 0,
      backgroundColor: c.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
      backgroundColor: c.background,
    },
    title: {
      fontSize: 20,
      fontWeight: "800",
      color: c.text,
      textAlign: "center",
    },
    subtitle: {
      color: c.secondary,
      fontSize: 14,
      lineHeight: 20,
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    scrollArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    pagesGridContent: {
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    pagesGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-start",
    },
    pageCard: {
      position: "relative",
      borderRadius: 0,
      overflow: "hidden",
      backgroundColor: c.background,
      borderWidth: 0,
      aspectRatio: 1,
      height: itemWidth,
    },
    pageImage: {
      width: "100%",
      height: "100%",
      backgroundColor: c.background,
      resizeMode: "contain",
    },
    pageNumberBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 24,
      gap: 10,
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
      opacity: 0.65,
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
    secondaryButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
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
