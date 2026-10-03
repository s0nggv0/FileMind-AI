import sharp from "sharp";
import { uploadConfig } from "../../config/upload";
import type { ImageInput } from "./provider";
export async function validateImage(bytes: Uint8Array, filename: string, mimeType: string) {
  if (!bytes.length || bytes.length > uploadConfig.maxFileBytes) throw new Error("Invalid image size");
  const extension = filename.split(".").at(-1)?.toLowerCase();
  const png = bytes[0] === 137 && Buffer.from(bytes.slice(1, 8)).equals(Buffer.from([80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!(png && extension === "png" && mimeType === "image/png") && !(jpeg && ["jpg", "jpeg"].includes(extension ?? "") && mimeType === "image/jpeg")) throw new Error("Image MIME, extension and signature must match");
  const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || !["png", "jpeg"].includes(metadata.format ?? "")) throw new Error("Unsupported image data");
  // Decode the complete image to reject a valid header with a corrupt payload.
  await sharp(bytes, { limitInputPixels: 40_000_000 }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).toBuffer();
  return { width: metadata.width, height: metadata.height, mimeType: (png ? "image/png" : "image/jpeg") as ImageInput["mimeType"] };
}
