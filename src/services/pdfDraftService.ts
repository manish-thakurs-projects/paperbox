import * as FileSystem from "expo-file-system/legacy";
import {
  deleteVaultFile,
  decryptVaultFileForUse,
  persistVaultFile,
} from "./vaultStorage";
import { PdfDraft, PdfDraftPage, VaultFile } from "../types";
import { extensionOf } from "../utils/files";

const normalizeExtension = (uri: string) => {
  const extension = extensionOf(uri.split("?")[0]);
  return extension || "jpg";
};

const makePageFile = (page: PdfDraftPage): VaultFile => ({
  id: page.id,
  name: page.name,
  uri: page.uri,
  mimeType: page.extension === "png" ? "image/png" : "image/jpeg",
  size: page.size,
  extension: page.extension,
  kind: "image",
  createdAt: page.createdAt,
  isFavorite: false,
  isPinned: false,
  tags: [],
});

export async function persistPdfDraftPage(
  sourceUri: string,
  draftId: string,
  index: number,
): Promise<PdfDraftPage> {
  const extension = normalizeExtension(sourceUri);
  const info = await FileSystem.getInfoAsync(sourceUri).catch(() => ({
    exists: false,
    size: 0,
  }));
  const pageId = `${draftId}-page-${index}-${Math.random().toString(36).slice(2)}`;
  const encryptedUri = await persistVaultFile(
    sourceUri,
    pageId,
    extension,
    true,
  );

  // Scanner providers can return a local URI form that persistVaultFile does
  // not remove itself. Keep the cache free of the unencrypted source.
  await FileSystem.deleteAsync(sourceUri, { idempotent: true }).catch(() => {});

  return {
    id: pageId,
    name: `Page ${index + 1}.${extension}`,
    uri: encryptedUri,
    size: info.exists ? info.size ?? 0 : 0,
    extension,
    createdAt: new Date().toISOString(),
  };
}

export async function createPdfDraft(imageUris: string[]): Promise<PdfDraft> {
  const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pages: PdfDraftPage[] = [];

  try {
    for (const [index, uri] of imageUris.entries()) {
      pages.push(await persistPdfDraftPage(uri, id, index));
    }
  } catch (error) {
    await deletePdfDraftPages(pages);
    await Promise.all(
      imageUris.map((uri) =>
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}),
      ),
    );
    throw error;
  }

  const now = new Date().toISOString();
  return {
    id,
    name: `Scan-${Date.now()}`,
    pages,
    createdAt: now,
    updatedAt: now,
  };
}

export async function decryptPdfDraftPage(page: PdfDraftPage) {
  return decryptVaultFileForUse(makePageFile(page));
}

export async function deletePdfDraftPages(pages: PdfDraftPage[]) {
  await Promise.all(
    pages.map((page) => deleteVaultFile(page.uri).catch(() => {})),
  );
}
