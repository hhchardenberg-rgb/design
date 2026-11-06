import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { del, head, list, put } from "@vercel/blob";

/**
 * Waar back-ups heen gaan.
 *
 *  - "s3" (aanbevolen): een aparte, S3-compatibele bucket buiten Vercel, bv. Cloudflare R2 (EU),
 *    Backblaze B2 of AWS S3. Zet BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID,
 *    BACKUP_S3_SECRET_ACCESS_KEY en (behalve bij AWS) BACKUP_S3_ENDPOINT. Alleen hier worden ook
 *    de bestanden (uploads) gekopieerd: een kopie bij dezelfde aanbieder beschermt daar niet tegen.
 *  - "blob" (terugval): dezelfde Vercel Blob-opslag als de app, onder backups/ met een
 *    onvoorspelbare naam. Beschermt tegen fouten in de database (verkeerd verwijderd, mislukte
 *    update), niet tegen het wegvallen van het Vercel-account.
 */
export interface BackupObject {
  key: string;
  size: number;
  lastModified: Date;
}

export interface BackupTarget {
  kind: "s3" | "blob";
  label: string;
  /** Mogen de bestanden (uploads) hierheen gekopieerd worden? */
  mirrorsFiles: boolean;
  put(key: string, data: Buffer): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<BackupObject[]>;
  /** Tijdelijke downloadlink voor een beheerder. */
  downloadUrl(key: string, fileName: string): Promise<string>;
}

export function backupTargetKind(): "s3" | "blob" | null {
  if (process.env.BACKUP_S3_BUCKET) return "s3";
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return null;
}

function s3Target(): BackupTarget {
  const bucket = process.env.BACKUP_S3_BUCKET!;
  const endpoint = process.env.BACKUP_S3_ENDPOINT || undefined;
  const client = new S3Client({
    region: process.env.BACKUP_S3_REGION || "auto",
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  const host = endpoint ? new URL(endpoint).hostname : "AWS S3";
  return {
    kind: "s3",
    label: `${bucket} (${host})`,
    mirrorsFiles: true,
    async put(key, data) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: "application/octet-stream" }));
      return { key };
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from((await res.Body?.transformToByteArray()) ?? []);
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async list(prefix) {
      const out: BackupObject[] = [];
      let token: string | undefined;
      do {
        const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of res.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) });
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    async downloadUrl(key, fileName) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `attachment; filename="${fileName}"` }),
        { expiresIn: 300 },
      );
    },
  };
}

function blobOptions() {
  const storeId = process.env.BLOB_STORE_ID;
  return storeId ? { storeId } : {};
}

function blobTarget(): BackupTarget {
  return {
    kind: "blob",
    label: "Vercel Blob (zelfde opslag als de app)",
    mirrorsFiles: false,
    async put(key, data) {
      const blob = await put(key, data, { access: "public", addRandomSuffix: true, contentType: "application/octet-stream", ...blobOptions() });
      return { key: blob.pathname };
    },
    async get(key) {
      const info = await head(key, blobOptions());
      const res = await fetch(info.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Back-up niet op te halen (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key) {
      await del(key, blobOptions());
    },
    async list(prefix) {
      const out: BackupObject[] = [];
      let cursor: string | undefined;
      do {
        const res = await list({ prefix, cursor, limit: 1000, ...blobOptions() });
        for (const b of res.blobs) out.push({ key: b.pathname, size: b.size, lastModified: new Date(b.uploadedAt) });
        cursor = res.hasMore ? res.cursor : undefined;
      } while (cursor);
      return out;
    },
    async downloadUrl(key) {
      const info = await head(key, blobOptions());
      return info.downloadUrl;
    },
  };
}

export function getBackupTarget(): BackupTarget | null {
  const kind = backupTargetKind();
  if (kind === "s3") return s3Target();
  if (kind === "blob") return blobTarget();
  return null;
}
