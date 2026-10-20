import { Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import {
  CreateBucketCommand, DeleteObjectCommand, GetBucketPolicyCommand,
  GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";

export type EvidenceObjectAvailability = "AVAILABLE" | "MISSING" | "UNAVAILABLE";

@Injectable()
export class EvidenceStorageService implements OnModuleDestroy {
  private client?: S3Client;
  private ready?: Promise<void>;

  constructor(private readonly config: ConfigService) {}

  async initialize() { await this.storage(); }
  async verifyPrivateBucket() { this.ready = undefined; await this.storage(); }
  onModuleDestroy() { this.client?.destroy(); }

  private async storage() {
    const endpoint = this.config.get<string>("s3Endpoint");
    const accessKeyId = this.config.get<string>("s3AccessKeyId");
    const secretAccessKey = this.config.get<string>("s3SecretAccessKey");
    const bucket = this.config.get<string>("s3Bucket");
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new ServiceUnavailableException("Evidence storage is not configured");
    }
    this.client ??= new S3Client({
      endpoint, region: this.config.getOrThrow<string>("s3Region"),
      forcePathStyle: true, credentials: { accessKeyId, secretAccessKey },
    });
    const client = this.client;
    this.ready ??= (async () => {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
        try {
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
        } catch (createError) {
          if ((createError as Error).name !== "BucketAlreadyOwnedByYou") throw createError;
        }
      }
      // Originals must never inherit an anonymous/public bucket policy.
      try {
        const policy = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
        if (policy.Policy) throw new Error("Evidence bucket must have no public policy");
      } catch (error) {
        if ((error as Error).name !== "NoSuchBucketPolicy") throw error;
      }
    })();
    try {
      await this.ready;
    } catch {
      this.ready = undefined;
      throw new ServiceUnavailableException("Private evidence storage is unavailable");
    }
    return { client, bucket };
  }

  async put(objectId: string, buffer: Buffer, mediaType: string) {
    const { client, bucket } = await this.storage();
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: `originals/${objectId}`, Body: buffer, ContentType: mediaType,
    }));
  }

  async get(objectId: string) {
    const { client, bucket } = await this.storage();
    return client.send(new GetObjectCommand({ Bucket: bucket, Key: `originals/${objectId}` }));
  }

  async availability(objectId: string): Promise<EvidenceObjectAvailability> {
    try {
      const { client, bucket } = await this.storage();
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: `originals/${objectId}` }));
      return "AVAILABLE";
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (status === 404 || name === "NotFound" || name === "NoSuchKey") return "MISSING";
      return "UNAVAILABLE";
    }
  }

  async remove(objectId: string) {
    const { client, bucket } = await this.storage();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `originals/${objectId}` }));
  }
}
