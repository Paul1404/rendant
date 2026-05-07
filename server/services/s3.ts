import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (cachedClient) return cachedClient;
  const region = process.env.AWS_DEFAULT_REGION ?? "auto";
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  cachedClient = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
  });
  return cachedClient;
}

function bucket(): string {
  const name = process.env.S3_BUCKET_NAME;
  if (!name) throw new Error("S3_BUCKET_NAME ist nicht gesetzt");
  return name;
}

export async function uploadPdf(key: string, body: Buffer): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    }),
  );
}

export async function downloadPdf(key: string): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
  if (!res.Body) throw new Error("Leere S3-Antwort");
  const arr = await res.Body.transformToByteArray();
  return Buffer.from(arr);
}

export async function deletePdf(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
}
