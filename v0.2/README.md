# FundTogether — Design corpus v0.2

> **Hướng phát triển hiện tại (2026-10-06):** ưu tiên củng cố MVP và kiểm chứng
> nghiệp vụ thực tế; tạm hoãn mở rộng post-MVP và public-network integration.
> Đọc [kế hoạch hiện tại](../docs/business-validation-and-mvp-hardening.md) trước
> roadmap cũ. Verifier/committee/slash/reputation là tư liệu để sau, không phải
> các bước mặc định tiếp theo. Baseline resolver/no-slash mới nhất nằm trong
> [milestone policy](../docs/mvp-milestone-completion.md).

> **Quyết định phạm vi mới nhất (2026-10-04):** MVP dùng resolver được cấp quyền,
> sau các bước kiểm tra hệ thống. Hội đồng 2/3 và ResolverManager để post-MVP.
> Các đoạn chọn 2/3 cho MVP bên dưới thuộc quyết định cũ, đã được thay thế;
> phần cơ chế hội đồng chỉ còn là tài liệu tham khảo cho post-MVP.

> Location confirmed: repository `v0.2/`, 2026-10-03.

This folder contains original learning/design material and dated protocol
updates. Older examples are proposals, not proof of implementation or overrides
of later approved decisions. For current code and verified status, read
[project overview](../docs/PROJECT_OVERVIEW.md) and
[progress](../docs/PROJECT_PROGRESS.md).

## Current specifications and addenda

Workflow confirmed 2026-10-04: campaign system checks/corrections precede
mandatory resolver approval before publication. Evidence and challenge checks,
organizer response and re-verification precede arbitration of unresolved or
deadline-escalated disputes. Authorized staff may be resolvers in MVP. The
earlier 2-of-3 direction concerns dispute arbitration, not campaign admission.
Read [the updated workflow](./FundTogether_Verification_and_Dispute_Design_2026-10-03.md);
older learning examples must be interpreted against this clarification.

- [Verifier authority and implemented admission](./FundTogether_Verifier_Specification_v0.1.md)
- [Layered verification and disputes](./FundTogether_Verification_and_Dispute_Design_2026-10-03.md)
- [Resolver committee and draft financial policy](./FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md)
- [Evidence Schema v0.1](./FundTogether_Evidence_Schema_v0.1.md)
- [Verification Report v0.1](./FundTogether_Verification_Report_v0.1.md)
- [Synthetic evidence example](./FundTogether_Evidence_Example_v0.1.md)
- [Development network, gas and TypeScript](./FundTogether_Development_Network_and_Gas_v0.1.md)
- [Arc evaluation and shared USDC balance](./FundTogether_Arc_Evaluation_v0.1.md)
- [Processing reading guide](./FundTogether_v0.2_Processing/FundTogether_Processing_Reading_Guide.md)

Evidence packages are frozen; analysis reports may be rerun with a versioned
pipeline. Optional AI assists review and does not authorize funds movement.
Private source documents and public redacted files require different access.
These evidence specifications prepare backend implementation; they do not claim
an upload service, OCR/AI provider or report engine is running.


## Rà soát 10 mốc và hướng Arc

[Bảng rà soát 2026-10-03](./FundTogether_Milestone_Review_2026-10-03.md)
ghi các nội dung đã rà tại thời điểm đó; không phải trạng thái triển khai mới nhất.
Arc giữ vị trí ứng viên trong kế hoạch đánh giá về sau, đang hoãn khi củng cố MVP;
production vẫn cần cổng kiểm chứng riêng.
