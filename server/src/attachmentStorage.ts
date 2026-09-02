import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import multer, { FileFilterCallback } from "multer";
import type { Request } from "express";

// BR-17 — files live under server/uploads/ (gitignored), named
// <uuid>.<validated-ext>. The client-supplied filename is never used on disk.
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

export class UnsupportedFileTypeError extends Error {}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] ?? path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// Strict validation on both extension and MIME type (BR-15) — neither alone
// is trusted.
function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = Object.prototype.hasOwnProperty.call(MIME_TO_EXT, file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.has(ext);
  if (!mimeOk || !extOk) {
    cb(new UnsupportedFileTypeError(`Unsupported file type: ${file.mimetype || ext}`));
    return;
  }
  cb(null, true);
}

export const uploadAttachments = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES, files: MAX_ACTIVE_ATTACHMENTS },
});

export async function deleteFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
}
