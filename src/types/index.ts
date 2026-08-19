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
  /** Encrypted scan pages retained so a PaperBox PDF can be edited later. */
  pdfPages?: PdfDraftPage[];
  /** True when pdfPages contains only appended pages and the PDF has an
   * unextractable base document that must be preserved when editing. */
  pdfHasUnextractedBase?: boolean;
};

export type PdfDraftPage = {
  id: string;
  name: string;
  uri: string;
  size: number;
  extension: string;
  createdAt: string;
};

export type PdfDraft = {
  id: string;
  name: string;
  pages: PdfDraftPage[];
  createdAt: string;
  updatedAt: string;
  /** Existing PDF being edited, when this draft was opened from a PDF preview. */
  sourcePdfId?: string;
  /** Whether pages contains the complete source PDF or only appended pages. */
  includesSourcePages?: boolean;
  /** Number of already-appended pages that are present in the source PDF. */
  basePageCount?: number;
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
