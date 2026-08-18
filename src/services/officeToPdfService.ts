import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import JSZip from "jszip";

const OFFICE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

const OOXML_EXTENSIONS = new Set(["docx", "xlsx", "pptx"]);

export const isOfficeExtension = (extension: string) =>
  OFFICE_EXTENSIONS.has(extension.toLowerCase());

const getExtension = (filename: string) => {
  const value = filename.split("?")[0].split("/").pop() || filename;
  const dot = value.lastIndexOf(".");
  return dot >= 0 ? value.slice(dot + 1).toLowerCase() : "";
};

const getBaseName = (filename: string) => {
  const value = filename.split("?")[0].split("/").pop() || "document";
  const dot = value.lastIndexOf(".");
  const base = dot > 0 ? value.slice(0, dot) : value;
  return base.replace(/[^a-z0-9\-_. ]/gi, "_").trim() || "document";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const decodeXml = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const textFromXml = (value: string) =>
  decodeXml(
    value
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );

const paragraphsFromDocx = (xml: string) => {
  const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gi) || [];
  const result = paragraphs
    .map((paragraph) => {
      const text = Array.from(
        paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi),
      )
        .map((match) => decodeXml(match[1]))
        .join("")
        .trim();
      return text;
    })
    .filter(Boolean);

  if (result.length) return result;
  const fallback = textFromXml(xml);
  return fallback ? [fallback] : [];
};

const convertDocx = async (zip: JSZip): Promise<string> => {
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("This DOCX file does not contain a document body.");

  const paragraphs = paragraphsFromDocx(await entry.async("text"));
  return paragraphs.length
    ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")
    : "<p>This document contains no readable text.</p>";
};

const sharedStringsFromXlsx = async (zip: JSZip) => {
  const entry = zip.file("xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = await entry.async("text");
  const items = xml.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/gi) || [];
  return items.map((item) => {
    const matches = Array.from(
      item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi),
    );
    return matches.map((match) => decodeXml(match[1])).join("");
  });
};

const convertXlsx = async (zip: JSZip): Promise<string> => {
  const sharedStrings = await sharedStringsFromXlsx(zip);
  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!sheetNames.length) {
    throw new Error("This XLSX file does not contain a readable worksheet.");
  }

  const tables: string[] = [];
  for (const sheetName of sheetNames) {
    const entry = zip.file(sheetName);
    if (!entry) continue;
    const xml = await entry.async("text");
    const rows = xml.match(/<row(?:\s[^>]*)?>[\s\S]*?<\/row>/gi) || [];
    const renderedRows = rows.map((row) => {
      const cells = row.match(/<c(?:\s[^>]*)?>[\s\S]*?<\/c>/gi) || [];
      const renderedCells = cells.map((cell) => {
        const type = cell.match(/\bt="([^"]+)"/i)?.[1];
        const value = cell.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1];
        const inline = cell.match(/<is(?:\s[^>]*)?>[\s\S]*?<\/is>/i)?.[0];
        let text = inline ? textFromXml(inline) : value ? decodeXml(value) : "";
        if (type === "s" && value) text = sharedStrings[Number(value)] || "";
        if (type === "b") text = text === "1" ? "TRUE" : "FALSE";
        return `<td>${escapeHtml(text)}</td>`;
      });
      return `<tr>${renderedCells.join("") || "<td></td>"}</tr>`;
    });
    if (renderedRows.length) {
      tables.push(
        `<h2>${escapeHtml(sheetName.replace(/^xl\/worksheets\//i, ""))}</h2><table>${renderedRows.join("")}</table>`,
      );
    }
  }

  return tables.join("") || "<p>This workbook contains no readable cells.</p>";
};

const convertPptx = async (zip: JSZip): Promise<string> => {
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!slideNames.length) {
    throw new Error("This PPTX file does not contain readable slides.");
  }

  const slides: string[] = [];
  for (let index = 0; index < slideNames.length; index += 1) {
    const entry = zip.file(slideNames[index]);
    if (!entry) continue;
    const xml = await entry.async("text");
    const paragraphs = xml.match(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/gi) || [];
    const text = paragraphs
      .map((paragraph) =>
        Array.from(
          paragraph.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi),
        )
          .map((match) => decodeXml(match[1]))
          .join("")
          .trim(),
      )
      .filter(Boolean);
    slides.push(
      `<section class="slide"><h2>Slide ${index + 1}</h2>${
        text.length
          ? text.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
          : "<p>This slide contains no readable text.</p>"
      }</section>`,
    );
  }

  return slides.join("");
};

const buildHtml = (body: string) => `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { margin: 42pt; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 18pt; margin: 0 0 18pt; }
  h2 { font-size: 13pt; margin: 18pt 0 8pt; page-break-after: avoid; }
  p { margin: 0 0 8pt; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 18pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  td { border: 1px solid #999; padding: 5pt; vertical-align: top; }
  .slide { page-break-after: always; min-height: 8.5in; }
  .slide:last-child { page-break-after: auto; }
</style></head><body>${body}</body></html>`;

export async function convertOfficeFileToPdf(
  sourceUri: string,
  sourceFilename: string,
): Promise<{ uri: string; filename: string }> {
  const extension = getExtension(sourceFilename);
  if (!isOfficeExtension(extension)) {
    throw new Error("This file is not an Office document.");
  }
  if (!OOXML_EXTENSIONS.has(extension)) {
    throw new Error(
      `.${extension} files cannot be converted on this device. Please use .docx, .xlsx, or .pptx.`,
    );
  }

  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(base64, { base64: true });
  let body: string;
  if (extension === "docx") body = await convertDocx(zip);
  else if (extension === "xlsx") body = await convertXlsx(zip);
  else body = await convertPptx(zip);

  const filename = `${getBaseName(sourceFilename)}.pdf`;
  const printed = await Print.printToFileAsync({
    html: buildHtml(body),
  });
  const cacheDirectory =
    (FileSystem as any).cacheDirectory ||
    (FileSystem as any).documentDirectory ||
    "";
  if (!cacheDirectory || !printed.uri) {
    throw new Error("Unable to create the converted PDF.");
  }

  const destination = `${cacheDirectory}${filename}`;
  try {
    await FileSystem.deleteAsync(destination, { idempotent: true });
  } catch {
    // The destination may not exist yet.
  }
  await FileSystem.copyAsync({ from: printed.uri, to: destination });
  if (printed.uri !== destination) {
    try {
      await FileSystem.deleteAsync(printed.uri, { idempotent: true });
    } catch {
      // Best-effort cleanup of the print module's temporary output.
    }
  }

  return { uri: destination, filename };
}
