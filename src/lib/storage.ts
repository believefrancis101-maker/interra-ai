// src/lib/storage.ts
// Storage abstraction for uploaded job description files.
// Files are stored outside the database on the local filesystem in development
// (designed to be replaceable with S3/GCS object storage in production).
// Only the generated storage key is stored in PostgreSQL.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config";

export interface StorageProvider {
  save(buffer: Buffer, extension: string): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  readText(storageKey: string): Promise<string>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

export class LocalFileStorage implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string = config.upload.storageDir) {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private resolvePath(storageKey: string): string {
    // Prevent directory traversal
    const safeKey = path.basename(storageKey);
    return path.join(this.baseDir, safeKey);
  }

  /**
   * Saves a file buffer to storage using a server-generated random UUID key.
   * NEVER uses the user's original filename in the storage path.
   */
  async save(buffer: Buffer, extension: string): Promise<string> {
    await this.ensureBaseDir();
    const cleanExt = extension.startsWith(".") ? extension : `.${extension}`;
    const storageKey = `${crypto.randomUUID()}${cleanExt}`;
    const targetPath = this.resolvePath(storageKey);
    await fs.writeFile(targetPath, buffer);
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    const targetPath = this.resolvePath(storageKey);
    return await fs.readFile(targetPath);
  }

  async readText(storageKey: string): Promise<string> {
    const buf = await this.read(storageKey);
    return buf.toString("utf-8");
  }

  async delete(storageKey: string): Promise<void> {
    const targetPath = this.resolvePath(storageKey);
    try {
      await fs.unlink(targetPath);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const targetPath = this.resolvePath(storageKey);
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const storage = new LocalFileStorage();
