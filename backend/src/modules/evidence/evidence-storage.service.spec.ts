import { EvidenceStorageService } from "./evidence-storage.service";

function serviceFor(send: (command: { input?: { Key?: string } }) => Promise<unknown>) {
  const service = new EvidenceStorageService({
    get: (key: string) => ({
      s3Endpoint: "http://minio.local",
      s3Region: "us-east-1",
      s3Bucket: "private-evidence",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
    }[key]),
  } as never);
  const state = service as unknown as { client: { send: typeof send }; ready: Promise<void> };
  state.client = { send };
  state.ready = Promise.resolve();
  return service;
}

describe("EvidenceStorageService availability", () => {
  it("reports an existing private object as available", async () => {
    const service = serviceFor(async command => {
      expect(command.input?.Key).toBe("originals/object-1");
      return {};
    });
    await expect(service.availability("object-1")).resolves.toBe("AVAILABLE");
  });

  it("reports a missing object without treating storage as unavailable", async () => {
    const service = serviceFor(async () => {
      throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
    });
    await expect(service.availability("object-2")).resolves.toBe("MISSING");
  });

  it("reports infrastructure errors as unavailable", async () => {
    const service = serviceFor(async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    });
    await expect(service.availability("object-3")).resolves.toBe("UNAVAILABLE");
  });
});
