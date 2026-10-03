// src/lib/file-validation.ts
// Server-side validation of uploaded files checking both content signature (magic bytes)
// and file size limits, as required by AGENTS.md.
import { config } from "../config";

export type DetectedFileType =
  | { kind: "pdf"; mimeType: "application/pdf"; ext: ".pdf" }
  | { kind: "image"; mimeType: "image/png"; ext: ".png" }
  | { kind: "image"; mimeType: "image/jpeg"; ext: ".jpg" }
  | { kind: "image"; mimeType: "image/webp"; ext: ".webp" }
  | { kind: "text"; mimeType: "text/plain"; ext: ".txt" };

export type FileValidationResult =
  | { valid: true; fileType: DetectedFileType }
  | { valid: false; error: string };

export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (buffer.length < 4) return null;

  // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return { kind: "pdf", mimeType: "application/pdf", ext: ".pdf" };
  }

  // PNG: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { kind: "image", mimeType: "image/png", ext: ".png" };
  }

  // JPEG: \xFF\xD8\xFF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { kind: "image", mimeType: "image/jpeg", ext: ".jpg" };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { kind: "image", mimeType: "image/webp", ext: ".webp" };
  }

  // Text: verify UTF-8 decode without excessive binary/control bytes
  try {
    const textSample = buffer.slice(0, Math.min(buffer.length, 1024)).toString("utf-8");
    // Check for null bytes or illegal control characters that signify binary data
    let isBinary = false;
    for (let i = 0; i < textSample.length; i++) {
      const code = textSample.charCodeAt(i);
      if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
        isBinary = true;
        break;
      }
    }
    if (!isBinary) {
      return { kind: "text", mimeType: "text/plain", ext: ".txt" };
    }
  } catch {
    // not valid utf-8 text
  }

  return null;
}

export function validateUploadedFile(buffer: Buffer): FileValidationResult {
  if (buffer.length === 0) {
    return { valid: false, error: "Uploaded file is empty." };
  }

  if (buffer.length > config.upload.maxSizeBytes) {
    const maxMb = Math.round(config.upload.maxSizeBytes / (1024 * 1024));
    return { valid: false, error: `File size exceeds the limit of ${maxMb}MB.` };
  }

  const detected = detectFileType(buffer);
  if (!detected) {
    return {
      valid: false,
      error: "Unsupported file format. Please upload a plain text, PDF, or image (PNG, JPEG, WebP) job description.",
    };
  }

  return { valid: true, fileType: detected };
}
