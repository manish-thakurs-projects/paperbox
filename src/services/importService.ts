import * as DocumentPicker from "expo-document-picker";
import { VaultFile } from "../types";
import { extensionOf, kindOf } from "../utils/files";
export async function pickFiles(): Promise<VaultFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) return [];
  return result.assets.map((a) => {
    const extension = extensionOf(a.name);
    return {
      id: `${Date.now()}-${Math.random()}`,
      name: a.name,
      uri: a.uri,
      mimeType: a.mimeType,
      size: a.size ?? 0,
      extension,
      kind: kindOf(extension),
      createdAt: new Date().toISOString(),
      isFavorite: false,
      isPinned: false,
      tags: [],
    };
  });
}
