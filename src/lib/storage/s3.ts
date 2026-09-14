import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { PutFileInput, StorageDriver } from "./index";

export function s3Storage(): StorageDriver {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET ontbreekt (vereist wanneer STORAGE_DRIVER=s3)");
  }

  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: process.env.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
        }
      : undefined,
  });

  const publicBase = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

  const driver: StorageDriver = {
    async put({ key, data, contentType }: PutFileInput) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        })
      );
      return { url: driver.urlFor(key), key };
    },
    async get(key: string) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return Buffer.from(bytes ?? []);
    },
    async delete(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    urlFor(key: string) {
      if (publicBase) return `${publicBase}/${key}`;
      return `${process.env.S3_ENDPOINT ?? ""}/${bucket}/${key}`;
    },
  };

  return driver;
}
