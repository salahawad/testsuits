import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

const endpoint = process.env.S3_ENDPOINT ?? "http://minio:9000";
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? "http://localhost:9000";

export const BUCKET = process.env.S3_BUCKET ?? "testsuits";

export const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
});

export async function putObject(key: string, body: Buffer, contentType: string) {
  logger.info({ bucket: BUCKET, key, contentType }, "s3 putObject requested");
  try {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
    logger.info({ bucket: BUCKET, key }, "s3 putObject succeeded");
  } catch (err) {
    logger.error({ err, bucket: BUCKET, key }, "s3 putObject failed");
    throw err;
  }
}

export async function deleteObject(key: string) {
  logger.info({ bucket: BUCKET, key }, "s3 deleteObject requested");
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    logger.info({ bucket: BUCKET, key }, "s3 deleteObject succeeded");
  } catch (err) {
    logger.error({ err, bucket: BUCKET, key }, "s3 deleteObject failed");
    throw err;
  }
}

export async function getDownloadUrl(key: string, filename?: string) {
  logger.info({ bucket: BUCKET, key, filename }, "s3 getDownloadUrl requested");
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
    });
    const signed = await getSignedUrl(s3, command, { expiresIn: 60 * 10 });
    logger.info({ bucket: BUCKET, key }, "s3 getDownloadUrl succeeded");
    return signed.replace(endpoint, publicEndpoint);
  } catch (err) {
    logger.error({ err, bucket: BUCKET, key }, "s3 getDownloadUrl failed");
    throw err;
  }
}
