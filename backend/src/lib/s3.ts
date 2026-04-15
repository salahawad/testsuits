import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function getDownloadUrl(key: string, filename?: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
  });
  const signed = await getSignedUrl(s3, command, { expiresIn: 60 * 10 });
  return signed.replace(endpoint, publicEndpoint);
}
