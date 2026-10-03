# FundTogether v0.2 — Mục lục giải thích các Mốc

> Giữ cấu trúc theo `Explain_Details_MocN` để bạn có thể mở từng phần độc lập. File gốc [Development Process & MVP Roadmap](./FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md) vẫn là nguồn tiến trình; các file dưới đây giải nghĩa để học và thực hiện, không thay thế quyết định protocol đã được team chốt.

## Mục lục

### Cập nhật thiết kế ngày 2026-10-03

Đọc [Kiểm tra evidence và xử lý tranh chấp theo tầng](../FundTogether_Verification_and_Dispute_Design_2026-10-03.md)
cùng Mốc 1 và Mốc 6. Bản cập nhật phân biệt hướng thiết kế với code hiện có,
giữ review 72 giờ và ghi rõ quyền verifier, phản hồi organizer, arbitration,
timeout và các quyết định còn mở. Nội dung tiếp theo người dùng chọn 2/3 cho MVP:
đọc [Dispute Policy và hội đồng resolver](../FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md).
Đã chọn hướng thiết kế; committee và các nhánh tài chính chưa được triển khai.

Quyền verifier đã chốt tiếp trong [Verifier Specification v0.1](../FundTogether_Verifier_Specification_v0.1.md):
admissibility + objective validation, năm action procedural, không chuyển tiền,
không sửa hồ sơ và không thay resolver xử lý tranh chấp chưa rõ.

| Mốc | Thư mục và hướng dẫn | Nội dung |
|---|---|---|
| 1 | [Protocol & MVP Definition](./Explain_Details_Moc1/FundTogether_Moc1_Protocol_MVP_Explained.md) | Actors, on-chain/off-chain, state machine, bond, refund, evidence/challenge và invariants |
| 2 | [Smart Contract Core](./Explain_Details_Moc2/FundTogether_Moc2_Reading_Guide.md) | Single Campaign prototype, thứ tự feature, test theo từng bước |
| 3 | [Contract Hardening](./Explain_Details_Moc3/FundTogether_Moc3_Contract_Hardening_Explained.md) | Access control, fuzz/invariant, reentrancy, gas và Slither |
| 4 | [Backend Foundation](./Explain_Details_Moc4/FundTogether_Moc4_Backend_Foundation_Explained.md) | API, NestJS, database, SIWE, metadata, upload và worker |
| 5 | [Blockchain Indexing & Sync](./Explain_Details_Moc5/FundTogether_Moc5_Blockchain_Indexing_and_Sync_Explained.md) | Event, checkpoint, retry, confirmation, reorg, PostgreSQL |
| 6 | [Evidence Pipeline](./Explain_Details_Moc6/FundTogether_Moc6_Evidence_Pipeline_Explained.md) | Upload, storage, hash, commit, sync và trạng thái UI |
| 7 | [Frontend Vertical MVP](./Explain_Details_Moc7/FundTogether_Moc7_Frontend_Vertical_MVP_Explained.md) | Bốn journey Organizer, Donor, Milestone, Failure |
| 8 | [MVP Definition](./Explain_Details_Moc8/FundTogether_Moc8_MVP_Definition_Explained.md) | In/out of scope và tiêu chí end-to-end |
| 9 | [Reputation Layer](./Explain_Details_Moc9/FundTogether_Moc9_Reputation_Layer_Explained.md) | Nguồn metric, profile và giới hạn của reputation |
| 10 | [Research / Experiment Layer](./Explain_Details_Moc10/FundTogether_Moc10_Research_Experiment_Layer_Explained.md) | Research question, thiết kế thí nghiệm, metrics và reproducibility |

## Thứ tự đọc

Đọc tuần tự Mốc 1→10 theo [Process](./FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md). Mốc 4–7 phụ thuộc contract/ABI/events đủ ổn định; Mốc 6 phụ thuộc backend và sync; Reputation/Research đến sau khi có hành vi MVP và dữ liệu đáng tin.

Mỗi tài liệu chỉ ra giả định minh họa, nơi làm việc, quy trình, cách quan sát kết quả và tiêu chí Done. Ví dụ cấu trúc file, endpoint, schema hay code không khẳng định chúng đã tồn tại trong repo.

## Phân biệt các mức hoàn thành

```text
Đã giải thích tài liệu
    ≠ spec đã được team phê duyệt
    ≠ feature đã viết code
    ≠ feature đã được kiểm thử
    ≠ hệ thống sẵn sàng production
```

Các file hiện tại là tài liệu giải thích Process. Chúng không tự tạo contract/backend/frontend và không đánh dấu implementation milestone hoàn thành.

## Tài liệu gốc để tham chiếu

- [Development Process & MVP Roadmap](./FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md)
- [Tech Stack & Learning Roadmap](../FundTogether_v0.2_Tech_Stack_and_Learning_Roadmap.md)
- [Threat Model v0.2](<../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>)

## Cách thêm một mốc giải thích sau này

1. Tạo folder `Explain_Details_MocN` cùng cấp các folder mốc trước.
2. Thêm file `FundTogether_MocN_<Topic>_Explained.md` trong folder.
3. Link lại từ bảng mục lục này.
4. Giữ link về Process/Tech Stack/Threat Model bằng đường dẫn tương đối.
5. Ghi rõ điểm nào là lựa chọn minh họa, đề xuất hoặc đã chốt.

## Đặc tả evidence mới — 2026-10-03

Bộ tài liệu đã chuyển vào `FundTogether/v0.2` theo xác nhận người dùng.
Đọc [Evidence Schema v0.1](../FundTogether_Evidence_Schema_v0.1.md),
[Verification Report v0.1](../FundTogether_Verification_Report_v0.1.md) và
[hồ sơ mẫu](../FundTogether_Evidence_Example_v0.1.md) trước khi triển khai Mốc 6.
Các addenda này phân biệt package cố định và report có thể chạy lại; đây là
đặc tả, không phải upload/AI feature đã hoạt động.


## Trạng thái 10 mốc — cập nhật 2026-10-03

Đọc [bảng rà soát](../FundTogether_Milestone_Review_2026-10-03.md) trước khi dùng
ví dụ cũ làm implementation plan. Các mốc đã cập nhật network/runtime/indexer/UX
theo [Arc priority plan](../FundTogether_Arc_Evaluation_v0.1.md).
Local Anvil giữ nguyên; Arc trial ưu tiên, chưa deploy; production gate còn mở.
