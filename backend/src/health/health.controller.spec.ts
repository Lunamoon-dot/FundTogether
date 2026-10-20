import { HealthController } from "./health.controller";

describe("HealthController protocol identity", () => {
  const originalProtocol = process.env.FUNDTOGETHER_PROTOCOL;

  afterEach(() => {
    if (originalProtocol === undefined) delete process.env.FUNDTOGETHER_PROTOCOL;
    else process.env.FUNDTOGETHER_PROTOCOL = originalProtocol;
  });

  it("reports the VNext campaign escrow identity when VNext is active", () => {
    process.env.FUNDTOGETHER_PROTOCOL = "FUNDTOGETHER_VNEXT";
    const controller = new HealthController({
      manifest: {
        protocolKind: "FUNDTOGETHER_VNEXT",
        chainId: 31339,
        campaignEscrow: "0x1111111111111111111111111111111111111111",
      },
    } as never);

    expect(controller.getHealth()).toEqual({
      status: "ok",
      protocolKind: "FUNDTOGETHER_VNEXT",
      chainId: 31339,
      contractAddress: "0x1111111111111111111111111111111111111111",
    });
  });
});
