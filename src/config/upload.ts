export const uploadConfig = {
  extensions: ["pdf", "docx", "txt", "md", "png", "jpg", "jpeg"],
  maxFileBytes: 20 * 1024 * 1024,
  maxFiles: 30,
  maxContentCharacters: 250_000,
  maxPdfPages: 200,
  mimeTypes: {
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    txt: ["text/plain"], md: ["text/markdown", "text/plain", "text/x-markdown"],
    png: ["image/png"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"],
  } as Record<string, string[]>,
};
export const uploadAccept = uploadConfig.extensions.map((extension) => `.${extension}`).join(",");
export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
