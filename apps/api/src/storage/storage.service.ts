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

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly localFallback = new Map<string, Buffer>();

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
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
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: imageKey }),
    );
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
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

  /** Presigned GET when S3 works; null when object is only in memory fallback. */
  async createDownloadUrl(imageKey: string, expiresIn = 900): Promise<string | null> {
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
