import { FileKind, VaultFile } from "../types";
export const extensionOf = (name: string) => {
  const p = name.split(".");
  return p.length > 1 ? p.pop()!.toLowerCase() : "";
};
export function kindOf(x: string): FileKind {
  if (x === 'pdf') return 'pdf';
  if (['doc', 'docx', 'rtf'].includes(x)) return 'document';
  if (['xls', 'xlsx', 'csv'].includes(x)) return 'spreadsheet';
  if (['ppt', 'pptx'].includes(x)) return 'presentation';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(x)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'm4v', '3gp'].includes(x)) return 'video';
  if (['zip', 'rar', '7z'].includes(x)) return 'archive';
  if (['txt', 'md'].includes(x)) return 'text';
  return 'other';
}
export function fileSize(n: number) {
  if (!n) return "0 KB";
  const u = ["B", "KB", "MB", "GB"],
    i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 3);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}
export function relativeDate(v: string) {
  const d = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
}
export function getFolderIdsForFile(file: VaultFile) {
  const ids = Array.isArray(file.folderIds)
    ? file.folderIds
    : file.folderId
      ? [file.folderId]
      : [];
  return ids.filter((folderId, index, list) => folderId && list.indexOf(folderId) === index);
}
export function isFileInFolder(file: VaultFile, folderId?: string) {
  return getFolderIdsForFile(file).includes(folderId ?? "");
}
