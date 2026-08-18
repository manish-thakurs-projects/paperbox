import { create } from "zustand";
import { Folder, VaultFile } from "../types";
import {
  deleteVaultFile,
  loadVault,
  saveVault,
} from "../services/vaultStorage";
import { getFolderIdsForFile, sanitizeVaultName } from "../utils/files";

type State = {
  files: VaultFile[];
  folders: Folder[];
  ready: boolean;
  hydrate: () => Promise<void>;
  addFiles: (items: VaultFile[]) => void;
  addConvertedPdf: (sourceId: string, pdf: VaultFile) => void;
  addFolder: (name: string, parentId?: string) => void;
  addFolders: (items: Folder[]) => void;
  toggleFavorite: (id: string) => void;
  togglePin: (id: string) => void;
  renameFile: (id: string, name: string) => void;
  moveFileToFolder: (id: string, folderId?: string) => void;
  setFileFolderMembership: (id: string, folderIds: string[]) => void;
  assignFilesToFolder: (ids: string[], folderId: string) => void;
  addFilesToFolder: (items: VaultFile[], folderId: string) => void;
  removeFile: (id: string) => void;
  removeFileFromFolder: (id: string, folderId: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  togglePinFolder: (id: string) => void;
};

const normalizeFolderIds = (folderIds: string[] = []) =>
  folderIds.filter(
    (folderId, index, list) => folderId && list.indexOf(folderId) === index,
  );

const normalizeFile = (file: VaultFile): VaultFile => {
  const folderIds = normalizeFolderIds(getFolderIdsForFile(file));
  return {
    ...file,
    folderIds: folderIds.length ? folderIds : undefined,
    folderId: folderIds[0],
  };
};

const normalizeFiles = (files: VaultFile[]) => files.map(normalizeFile);

const persist = (files: VaultFile[], folders: Folder[]) =>
  void saveVault({ files: normalizeFiles(files), folders });

export const useVaultStore = create<State>((set, get) => ({
  files: [],
  folders: [],
  ready: false,
  hydrate: async () => {
    // Migrate any files that were accidentally persisted in cache into the vault first
    try {
      const { migrateCacheFilesToVault } =
        await import("../services/vaultStorage");
      await migrateCacheFilesToVault();
    } catch (err) {
      // Migration is best-effort; log and continue
    }

    const data = await loadVault();
    const files = normalizeFiles(data.files ?? []);
    set({ files, folders: data.folders ?? [], ready: true });
  },
  addFiles: (items) => {
    const sanitizedItems = items.map((item) => ({
      ...item,
      name: sanitizeVaultName(item.name, "Untitled"),
    }));
    const files = normalizeFiles([...sanitizedItems, ...get().files]);
    set({ files });
    persist(files, get().folders);
  },
  addFolder: (name, parentId) => {
    const folders = [
      ...get().folders,
      {
        id: Date.now().toString(),
        name: sanitizeVaultName(name, "Untitled folder"),
        parentId,
        createdAt: new Date().toISOString(),
        isFavorite: false,
        isPinned: false,
      },
    ];
    set({ folders });
    persist(get().files, folders);
  },
  addFolders: (items) => {
    const folders = [...get().folders, ...items];
    set({ folders });
    persist(get().files, folders);
  },
  toggleFavorite: (id) => {
    const files = normalizeFiles(
      get().files.map((f) =>
        f.id === id ? { ...f, isFavorite: !f.isFavorite } : f,
      ),
    );
    set({ files });
    persist(files, get().folders);
  },
  togglePin: (id) => {
    const files = normalizeFiles(
      get().files.map((f) =>
        f.id === id ? { ...f, isPinned: !f.isPinned } : f,
      ),
    );
    set({ files });
    persist(files, get().folders);
  },
  moveFileToFolder: (id, folderId) => {
    const nextFolderIds = folderId ? [folderId] : [];
    const files = normalizeFiles(
      get().files.map((f) =>
        f.id === id
          ? {
              ...f,
              folderId: nextFolderIds[0],
              folderIds: nextFolderIds.length ? nextFolderIds : undefined,
            }
          : f,
      ),
    );
    set({ files });
    persist(files, get().folders);
  },
  setFileFolderMembership: (id, folderIds) => {
    const normalizedFolderIds = normalizeFolderIds(folderIds);
    const files = normalizeFiles(
      get().files.map((f) =>
        f.id === id
          ? {
              ...f,
              folderId: normalizedFolderIds[0],
              folderIds: normalizedFolderIds.length
                ? normalizedFolderIds
                : undefined,
            }
          : f,
      ),
    );
    set({ files });
    persist(files, get().folders);
  },
  assignFilesToFolder: (ids, folderId) => {
    const files = normalizeFiles(
      get().files.map((f) => {
        if (!ids.includes(f.id)) return f;
        const currentFolderIds = getFolderIdsForFile(f);
        const nextFolderIds = currentFolderIds.includes(folderId)
          ? currentFolderIds
          : [...currentFolderIds, folderId];
        return {
          ...f,
          folderId: nextFolderIds[0],
          folderIds: nextFolderIds.length ? nextFolderIds : undefined,
        };
      }),
    );
    set({ files });
    persist(files, get().folders);
  },
  renameFile: (id, name) => {
    const files = normalizeFiles(
      get().files.map((f) =>
        f.id === id ? { ...f, name: sanitizeVaultName(name, "Untitled") } : f,
      ),
    );
    set({ files });
    persist(files, get().folders);
  },
  addFilesToFolder: (items, folderId) => {
    const files = normalizeFiles([
      ...items.map((item) => ({ ...item, folderId, folderIds: [folderId] })),
      ...get().files,
    ]);
    set({ files });
    persist(files, get().folders);
  },
  removeFile: async (id) => {
    const file = get().files.find((entry) => entry.id === id);
    if (file) {
      try {
        await deleteVaultFile(file.uri);
      } catch (error) {
      }
    }
    const files = normalizeFiles(get().files.filter((f) => f.id !== id));
    set({ files });
    persist(files, get().folders);
  },
  addConvertedPdf: (sourceId, pdf) => {
    const files = normalizeFiles([
      pdf,
      ...get().files.map((file) =>
        file.id === sourceId ? { ...file, convertedPdfId: pdf.id } : file,
      ),
    ]);
    set({ files });
    persist(files, get().folders);
  },
  removeFileFromFolder: (id, folderId) => {
    const files = normalizeFiles(
      get().files.map((f) => {
        if (f.id !== id) return f;
        const currentFolderIds = normalizeFolderIds(getFolderIdsForFile(f));
        const nextFolderIds = currentFolderIds.filter(
          (currentId) => currentId !== folderId,
        );
        return {
          ...f,
          folderId: nextFolderIds[0],
          folderIds: nextFolderIds.length ? nextFolderIds : undefined,
        };
      }),
    );
    set({ files });
    persist(files, get().folders);
  },
  renameFolder: (id, name) => {
    const folders = get().folders.map((folder) =>
      folder.id === id
        ? { ...folder, name: sanitizeVaultName(name, "Untitled folder") }
        : folder,
    );
    set({ folders });
    persist(get().files, folders);
  },
  deleteFolder: (id) => {
    const folders = get().folders.filter((folder) => folder.id !== id);
    const files = normalizeFiles(
      get().files.map((f) => {
        const currentFolderIds = normalizeFolderIds(getFolderIdsForFile(f));
        const nextFolderIds = currentFolderIds.filter(
          (folderId) => folderId !== id,
        );
        return {
          ...f,
          folderId: nextFolderIds[0],
          folderIds: nextFolderIds.length ? nextFolderIds : undefined,
        };
      }),
    );
    set({ files, folders });
    persist(files, folders);
  },
  togglePinFolder: (id) => {
    const folders = get().folders.map((folder) =>
      folder.id === id ? { ...folder, isPinned: !folder.isPinned } : folder,
    );
    set({ folders });
    persist(get().files, folders);
  },
}));
