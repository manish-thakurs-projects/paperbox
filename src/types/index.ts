export type FileKind =
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "video"
  | "archive"
  | "text"
  | "other";
export type VaultFile = {
  id: string;
  name: string;
  uri: string;
  mimeType?: string;
  size: number;
  extension: string;
  kind: FileKind;
  folderId?: string;
  folderIds?: string[];
  createdAt: string;
  viewedAt?: string;
  isFavorite: boolean;
  isPinned: boolean;
  tags: string[];
  source?: "camera" | "import";
  /** ID of the PDF created from this Office file, if one has been saved. */
  convertedPdfId?: string;
  /** ID of the Office file this saved PDF was converted from. */
  convertedFromId?: string;
};
export type Folder = {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  isFavorite: boolean;
  isPinned: boolean;
};
export type Settings = {
  theme: "light" | "dark";
  hidePreviews: boolean;
  lockEnabled: boolean;
};
