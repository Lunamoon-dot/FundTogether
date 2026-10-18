# FundTogether documentation

## Current product

**FundTogether** là tên sản phẩm hiện tại. **Reward Crowdfunding** là mô hình
tài trợ; đây là mô tả sản phẩm, không phải namespace kỹ thuật. Runtime hiện tại
dùng `fundtogether`/`campaigns` cho API, NestJS module, database, deployment và
frontend. Các tài liệu cũ có tên khác chỉ nằm trong archive để truy vết lịch sử.

## Reading order

1. [Research direction](research-direction.md) — mục tiêu nghiên cứu và phạm vi bị khóa.
2. [Project overview](PROJECT_OVERVIEW.md) — kiến trúc và hành vi đang triển khai.
3. [Product surface map](../PRODUCT.md) — toàn bộ bề mặt UX và handoff theo vai trò.
4. [Campaign scope](campaigns/SCOPE.md) — cấu hình MVP được duyệt.
5. [Campaign workflows](campaigns/WORKFLOWS.md) — luồng Creator, Resolver và Backer.
6. [Financial policy V1](campaigns/FINANCIAL_POLICY_V1.md) — quy tắc escrow, payout và refund.
7. [Project progress](PROJECT_PROGRESS.md) — bằng chứng đã chạy và giới hạn còn lại.
8. [Manual test guide](campaigns/MANUAL_TEST_GUIDE.md) — kịch bản nghiệm thu local.

## Documentation map

| Khu vực | Nội dung | Trạng thái |
| --- | --- | --- |
| [Campaign](campaigns/README.md) | Scope, workflow, policy, test guide, glossary | Current |
| [Architecture](architecture/README.md) | Kiến trúc và blueprint phù hợp scope Campaign | Current |
| [Engineering](engineering/README.md) | Quy ước kỹ thuật dùng chung | Current |
| [Plans](plans/README.md) | Chỉ mục implementation plans | Evidence / implementation history |
| [Specs](specs/README.md) | Chỉ mục design specs | Design history |
| [Archive](archive/README.md) | Workflow và schema lịch sử đã retired | Historical only |

## Source-of-truth rule

Khi tài liệu mâu thuẫn, ưu tiên theo thứ tự: quyết định người dùng mới nhất,
`research-direction.md`, `PROJECT_OVERVIEW.md`, policy Campaign đã duyệt, code và
bằng chứng test hiện tại. Implementation plan mô tả cách làm; nó không tự trở
thành policy sản phẩm hoặc bằng chứng runtime.

## Archive policy

Tài liệu archive được giữ để truy vết quyết định và regression. Nó không được
dùng để tái đưa physical fulfilment, shipping, nhiều tier, charity,
organization hoặc milestone-disbursement vào Campaign. Mọi đề xuất khôi phục
phạm vi đó cần một quyết định sản phẩm và policy version riêng.

