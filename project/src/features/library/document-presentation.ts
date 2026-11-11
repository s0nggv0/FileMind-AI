export function formatDocumentDate(value: string) {
  return value.slice(0, 10).replaceAll("-", ".");
}
