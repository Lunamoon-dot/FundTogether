import { evidenceDraftContentSchema } from "./evidence.schema";

describe("evidenceDraftContentSchema", () => {
  const content = {
    report: {
      summary: "Delivery completed",
      performedFrom: "2026-10-01",
      performedTo: "2026-10-02",
      outcomes: [
        {
          criterionId: "C1",
          description: "Delivered items",
          documentIds: [] as string[],
        },
      ],
    },
    expenses: [],
    documents: [],
  };

  it("accepts a draft without documents before upload exists", () => {
    expect(evidenceDraftContentSchema.safeParse(content).success).toBe(true);
  });

  it("rejects an outcome that references a document absent from the draft", () => {
    const invalid = structuredClone(content);
    invalid.report.outcomes[0].documentIds = ["missing-document"];

    expect(evidenceDraftContentSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects unknown fields so clients cannot smuggle package metadata", () => {
    expect(
      evidenceDraftContentSchema.safeParse({
        ...content,
        organizerAddress: "0x",
      }),
    ).toMatchObject({ success: false });
  });
});
