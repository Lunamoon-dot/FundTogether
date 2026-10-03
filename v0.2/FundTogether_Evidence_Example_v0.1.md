# FundTogether — Hồ sơ bằng chứng mẫu v0.1

> Dữ liệu giả để giải thích schema; không phải tài liệu thật, bằng chứng đã
> xác thực, địa chỉ triển khai hoặc transaction đã chạy.
> [Schema](./FundTogether_Evidence_Schema_v0.1.md) · [Report](./FundTogether_Verification_Report_v0.1.md)

## 1. Milestone giả định

Milestone 0: bàn giao 100 suất quà tại xã A. Ngân sách 1.000 MockUSDC.
Tiêu chí C1: đủ 100 suất; C2: báo cáo chi và biên nhận; C3: biên bản bàn giao
đã che thông tin người nhận khi công khai. Các tiêu chí phải được duyệt trước.

Chi phí minh họa ghi VND. Không kết luận tổng VND bằng ngân sách MockUSDC;
không tự đưa quy đổi tiền tệ hoặc reimbursement vào contract.

## 2. Payload organizer (rút gọn)

Các giá trị <...> là placeholder, không phải payload vượt qua validator hoặc
digest đã tính. Khi triển khai phải thay bằng địa chỉ/hash/context thật.
Đây không phải JSON Schema máy thực thi.

```json
{
  "schemaVersion": "0.1",
  "packageId": "demo-package-001",
  "chainId": "31337",
  "contractAddress": "<deployed-contract-address>",
  "campaignId": "0",
  "milestoneIndex": "0",
  "submissionVersion": "1",
  "organizerAddress": "<authenticated-organizer>",
  "criteriaHash": "<committed-criteria-digest>",
  "checklistVersion": "gift-delivery-0.1",
  "parentPackageId": null,
  "createdAt": "2026-10-03T02:00:00Z",
  "report": {
    "summary": "Đã bàn giao 100 suất quà theo tiêu chí C1.",
    "performedFrom": "2026-10-01",
    "performedTo": "2026-10-02",
    "outcomes": [
      {
        "criterionId": "C1",
        "description": "100 suất quà",
        "documentIds": ["D2", "D3"]
      }
    ]
  },
  "expenses": [
    {
      "expenseId": "E1",
      "description": "Mua 100 suất quà",
      "amountMinor": "25000000",
      "currency": "VND",
      "minorUnit": 0,
      "incurredAt": "2026-10-01",
      "vendorName": "Nhà cung cấp mẫu",
      "documentIds": ["D1"],
      "fundingSource": "CAMPAIGN"
    }
  ],
  "documents": [
    {
      "documentId": "D1",
      "kind": "RECEIPT",
      "originalName": "receipt.pdf",
      "mediaType": "application/pdf",
      "byteSize": 120000,
      "sha256": "<actual-file-digest>",
      "storageObjectId": "demo-object-receipt",
      "visibility": "RESTRICTED_ORIGINAL",
      "relatesToExpenseIds": ["E1"],
      "relatesToCriterionIds": ["C2"]
    },
    {
      "documentId": "D2",
      "kind": "DELIVERY_RECORD",
      "originalName": "handover-redacted.pdf",
      "mediaType": "application/pdf",
      "byteSize": 80000,
      "sha256": "<actual-file-digest>",
      "storageObjectId": "demo-object-handover",
      "visibility": "PUBLIC_REDACTED",
      "relatesToExpenseIds": [],
      "relatesToCriterionIds": ["C1", "C3"]
    },
    {
      "documentId": "D3",
      "kind": "PHOTO",
      "originalName": "delivery.jpg",
      "mediaType": "image/jpeg",
      "byteSize": 200000,
      "sha256": "<actual-file-digest>",
      "storageObjectId": "demo-object-photo",
      "visibility": "PUBLIC_REDACTED",
      "relatesToExpenseIds": [],
      "relatesToCriterionIds": ["C1"]
    }
  ]
}
```

## 3. Report giả định khi OCR/AI lỗi

```json
{
  "schemaVersion": "0.1",
  "reportId": "demo-report-001",
  "packageId": "demo-package-001",
  "evidenceHash": "<frozen-manifest-digest>",
  "context": {
    "chainId": "31337",
    "contractAddress": "<deployed-contract-address>",
    "campaignId": "0",
    "milestoneIndex": "0",
    "submissionVersion": "1",
    "criteriaHash": "<committed-criteria-digest>"
  },
  "pipelineVersion": "0.1",
  "checklistVersion": "gift-delivery-0.1",
  "createdAt": "2026-10-03T02:01:00Z",
  "completedAt": "2026-10-03T02:02:00Z",
  "status": "PARTIAL",
  "steps": [
    {
      "name": "file-validation",
      "status": "SUCCEEDED",
      "engineVersion": "rules-0.1",
      "startedAt": "2026-10-03T02:01:00Z",
      "completedAt": "2026-10-03T02:01:05Z",
      "errorCode": null
    },
    {
      "name": "document-extraction",
      "status": "FAILED",
      "engineVersion": "demo-ocr-0.1",
      "startedAt": "2026-10-03T02:01:05Z",
      "completedAt": "2026-10-03T02:02:00Z",
      "errorCode": "PROVIDER_TIMEOUT"
    }
  ],
  "findings": [
    {
      "code": "POSSIBLE_DUPLICATE",
      "severity": "WARNING",
      "source": "RULE",
      "description": "D2 có cùng hash với tài liệu được tham chiếu ở hồ sơ mẫu khác; cần xem phạm vi.",
      "references": [{"documentId": "D2", "criterionId": "C3"}],
      "observedValues": {"relatedPackageId": "demo-package-previous"},
      "uncertainty": "Một biên bản chung có thể được dùng hợp lệ ở nhiều hạng mục."
    }
  ],
  "extractedFields": [],
  "summary": "Kiểm tra file đạt trong ví dụ; OCR lỗi. Cần verifier đọc bản gốc và kiểm tra cảnh báo.",
  "supersedesReportId": null
}
```

## 4. Các nhánh cần kiểm thử khi xây backend

| Tình huống | Kết quả mong đợi |
|---|---|
| Đủ tài liệu, hash khớp, không có lỗi cấu trúc | Có thể freeze; verifier vẫn phải quyết định |
| D1 thiếu trong khi checklist bắt buộc biên nhận | BLOCKER, yêu cầu bổ sung trước freeze |
| D2 trùng hash hồ sơ khác | WARNING; không tự kết luận gian lận |
| OCR đọc 20 triệu, organizer khai 25 triệu | Ghi cả giá trị/nguồn; cần đối chiếu bản gốc |
| AI/OCR timeout, mandatory checks đạt | PARTIAL; manual review có đường tiếp tục |
| Chi phí organizer tự bù ngoài ngân sách | Tách nguồn; không tự reject hoặc tăng payout |
| Nâng pipeline 0.1 lên 0.2 | Report mới, giữ package/hash/report cũ |
| Organizer thay biên nhận sau freeze | Package/version mới; không overwrite |
| Verify transaction revert | Không ghi ACCEPTED trong database |

Không gọi bảng này là test đã chạy. Hiện chỉ contract admission đã có kiểm thử;
upload/checklist/report engine và màn hình verifier là bước triển khai tiếp theo.
