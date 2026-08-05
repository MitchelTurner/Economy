import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';

function isLocalOnlyS3Endpoint(endpoint: string | undefined): boolean {
  if (!endpoint?.trim()) return true;
  try {
    const u = new URL(endpoint);
    return (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '::1' ||
      u.hostname === 'host.docker.internal'
    );
  } catch {
    return true;
  }
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly localFallback = new Map<string, Buffer>();
  /** When true, never hand the browser a presigned URL (localhost MinIO is unreachable from clients). */
  private readonly memoryUploadsOnly: boolean;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    this.memoryUploadsOnly = isLocalOnlyS3Endpoint(endpoint);
    this.bucket = config.get('S3_BUCKET') ?? 'island-ledger-receipts';
    this.client = new S3Client({
      region: config.get('S3_REGION') ?? 'us-east-1',
      endpoint,
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE') === 'true' || Boolean(endpoint),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID') ?? 'minioadmin',
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY') ?? 'minioadmin',
      },
    });
  }

  newImageKey(householdId: string, ext = 'jpg') {
    return `receipts/${householdId}/${randomUUID()}.${ext}`;
  }

  async createUploadUrl(imageKey: string, contentType = 'image/jpeg') {
    // Railway/prod often still has compose MinIO defaults — browsers cannot PUT to localhost:9000.
    if (this.memoryUploadsOnly) {
      return { uploadUrl: `memory://${imageKey}`, imageKey };
    }
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: imageKey,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 });
      return { uploadUrl, imageKey };
    } catch {
      // Dev fallback when MinIO is down: client POSTs bytes to API later via register.
      return {
        uploadUrl: `memory://${imageKey}`,
        imageKey,
      };
    }
  }

  async putObject(imageKey: string, body: Buffer, contentType = 'image/jpeg') {
    // Always keep a process-local copy when S3 is localhost-only so reads survive
    // failed MinIO PUTs and match createUploadUrl()'s memory:// mode.
    if (this.memoryUploadsOnly) {
      this.localFallback.set(imageKey, body);
      return;
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: imageKey,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch {
      this.localFallback.set(imageKey, body);
    }
  }

  async getObjectBuffer(imageKey: string): Promise<Buffer> {
    if (this.localFallback.has(imageKey)) {
      return this.localFallback.get(imageKey)!;
    }
    // Demo/Railway with localhost MinIO: objects only live in process memory.
    // Hitting S3 here throws opaque SDK errors that Nest surfaces as 500.
    if (this.memoryUploadsOnly) {
      throw new Error(
        'Receipt image is no longer available (demo storage was cleared on restart). Re-upload the photo.',
      );
    }
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: imageKey }),
      );
      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        detail?.trim()
          ? `Could not read receipt image from storage: ${detail}`
          : 'Could not read receipt image from storage',
      );
    }
  }

  async deleteObject(imageKey: string) {
    this.localFallback.delete(imageKey);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: imageKey }),
      );
    } catch {
      // ignore missing keys
    }
  }

  /** List object keys under a prefix (S3). Includes in-memory fallback keys. */
  async listKeys(prefix = 'receipts/'): Promise<string[]> {
    const keys = new Set<string>();
    for (const k of this.localFallback.keys()) {
      if (k.startsWith(prefix)) keys.add(k);
    }
    try {
      let token: string | undefined;
      do {
        const res = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const obj of res.Contents ?? []) {
          if (obj.Key) keys.add(obj.Key);
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
    } catch {
      // MinIO/S3 unavailable — memory keys only
    }
    return [...keys];
  }

  /** Test/dev helper to seed memory fallback without S3. */
  putLocal(imageKey: string, body: Buffer) {
    this.localFallback.set(imageKey, body);
  }

  /** Presigned GET when S3 works; null when object is only in memory / localhost MinIO. */
  async createDownloadUrl(imageKey: string, expiresIn = 900): Promise<string | null> {
    // Browsers cannot fetch localhost:9000 signed URLs from Railway — use /receipts/:id/image.
    if (this.memoryUploadsOnly) return null;
    if (this.localFallback.has(imageKey)) return null;
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: imageKey,
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch {
      return null;
    }
  }

  hasLocal(imageKey: string) {
    return this.localFallback.has(imageKey);
  }

  hashBytes(buf: Buffer) {
    return createHash('sha256').update(buf).digest('hex');
  }
}
