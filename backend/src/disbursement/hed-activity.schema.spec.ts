import { hedActivitySchema } from "./hed-activity.schema";
import { hedActivityHash } from "./hed-activity.service";

const activity = { title: "Trao quà đợt một", beneficiaryScope: "50 hộ dân tại khu vực bị ảnh hưởng", targetQuantity: 50,
  outcomeCriteria: ["Có biên bản trao quà và danh sách đã che dữ liệu cá nhân"], ceiling: "1000000000",
  deliveryDeadline: "2026-11-01T00:00:00.000Z", outcomeDeadline: "2026-11-10T00:00:00.000Z" };

describe("hedActivitySchema", () => {
  it("requires a bounded outcome commitment before purchase requests", () => {
    expect(hedActivitySchema.parse(activity).ceiling).toBe("1000000000");
    expect(hedActivitySchema.safeParse({ ...activity, ceiling: "0" }).success).toBe(false);
    expect(hedActivitySchema.safeParse({ ...activity, outcomeDeadline: activity.deliveryDeadline }).success).toBe(false);
  });
  it("binds activity data to the frozen campaign commitment", () => {
    const campaign = `0x${"1".repeat(64)}`;
    expect(hedActivityHash(campaign, activity)).not.toBe(hedActivityHash(campaign, { ...activity, ceiling: "999999999" }));
  });
});
