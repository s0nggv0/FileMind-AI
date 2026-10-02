import "server-only";
import { PrivateFileStorage } from "@/lib/workspace/private-file-storage";
export function getFileStorage() { return new PrivateFileStorage(process.env.FILE_STORAGE_ROOT?.trim() || ".filemind/storage"); }
