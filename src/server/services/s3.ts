import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

export function getS3Client(): S3Client {
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

export function getS3BucketName(): string {
	const name = process.env.S3_BUCKET_NAME;
	if (!name) throw new Error("S3_BUCKET_NAME ist nicht gesetzt");
	return name;
}

export async function uploadPdf(key: string, body: Buffer): Promise<void> {
	return uploadObject(key, body, "application/pdf");
}

export async function uploadObject(
	key: string,
	body: Buffer | Uint8Array,
	contentType: string,
): Promise<void> {
	await getS3Client().send(
		new PutObjectCommand({
			Bucket: getS3BucketName(),
			Key: key,
			Body: body,
			ContentType: contentType,
		}),
	);
}

export async function downloadPdf(key: string): Promise<Buffer> {
	return downloadObject(key);
}

export async function downloadObject(key: string): Promise<Buffer> {
	const res = await getS3Client().send(
		new GetObjectCommand({
			Bucket: getS3BucketName(),
			Key: key,
		}),
	);
	if (!res.Body) throw new Error("Leere S3-Antwort");
	const arr = await res.Body.transformToByteArray();
	return Buffer.from(arr);
}

export async function deletePdf(key: string): Promise<void> {
	return deleteObject(key);
}

export async function deleteObject(key: string): Promise<void> {
	await getS3Client().send(
		new DeleteObjectCommand({
			Bucket: getS3BucketName(),
			Key: key,
		}),
	);
}
