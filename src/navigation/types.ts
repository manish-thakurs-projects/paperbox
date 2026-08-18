export type RootStackParams = {
  Vault: undefined;
  Search: undefined;
  FileDetail: { fileId: string };
  FolderDetail: { folderId: string };
  Preview: { fileId: string };
  PdfReview: { imageUris: string[] };
  AllFiles: undefined;
  CapturedFiles: undefined;
  Privacy: undefined;
};

export type BottomTabParams = {
  Home: undefined;
  Folders: undefined;
  Camera: undefined;
  Favorites: undefined;
  Settings: undefined;
};
