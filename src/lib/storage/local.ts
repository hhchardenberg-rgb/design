import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { PutFileInput, StorageDriver } from "./index";

const ROOT = path.join(process.cwd(), "storage");

function resolvePath(key: string) {
  const safeKey = key.replace(/\.\.+/g, "");
  return path.join(ROOT, safeKey);
}

export function localStorage(): StorageDriver {
  return {
    async put({ key, data }: PutFileInput) {
      const filePath = resolvePath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
      return { url: this.urlFor(key), key };
    },
    async get(key: string) {
      return readFile(resolvePath(key));
    },
    async delete(key: string) {
      await rm(resolvePath(key), { force: true });
    },
    urlFor(key: string) {
      return `/api/files/${key.replace(/^\/+/, "")}`;
    },
  };
}
