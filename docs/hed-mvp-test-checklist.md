# HED MVP — checklist cần test

> Phạm vi: HED-MVP-1 local với MockUSDC, chain `31339`, direct vendor payment.
> Không áp dụng cho Workflow B, milestone, organizer advance, fiat hay chain/deployment cũ.
> Tick ô chỉ khi có bằng chứng: log, transaction hash, API response hoặc ảnh màn hình.

## 0. Chuẩn bị môi trường

- [ ] Docker Desktop đang chạy.
- [ ] Tại thư mục gốc, chạy:

  ```powershell
  & .\backend\scripts\hed\start-services.ps1
  ```

- [ ] Mở `http://localhost:5175`; UI hiển thị, không có lỗi manifest/RPC trong Console.
- [ ] `http://localhost:3002/health` trả `status: ready`.
- [ ] Chain có `eth_chainId = 0x7a6b` (`31339`).
- [ ] PostgreSQL HED (`5435`) và MinIO HED (`9200` / `9201`) đang healthy.

## 1. Kiểm thử tự động trước khi test tay

- [ ] Frontend unit/cutover test:

  ```powershell
  npm.cmd --prefix frontend test
  ```

- [ ] Backend HED test:

  ```powershell
  npm.cmd --prefix backend run test:hed
  ```

- [ ] Full local acceptance (contract, artifact, backend, frontend, journey, reorg):

  ```powershell
  npm.cmd --prefix backend run acceptance:hed
  ```

- [ ] Lưu output có `"status":"local_acceptance_passed"`.

## 2. Quyền và định danh

- [ ] USER chỉ xem campaign công khai, góp tiền, mở case/refund trong phạm vi của mình.
- [ ] OWNER chỉ tạo/sửa draft của tổ chức mình và nộp hồ sơ; không tự duyệt request/payout.
- [ ] ADMIN chỉ làm tác vụ kiểm hồ sơ tổ chức/vendor; không có quyền payout vì global role.
- [ ] Resolver chính duyệt đúng campaign/request được gán.
- [ ] Resolver dự phòng không thể quyết định song song khi resolver chính còn hạn; chỉ takeover khi đúng điều kiện.
- [ ] Ví vendor dùng để acknowledge phải đúng ví recipient đã được khóa trong request.

## 3. Campaign và funding

- [ ] OWNER tạo campaign với goal, mục đích, deadline và policy HED; dữ liệu thiếu bị chặn.
- [ ] Resolver duyệt campaign trước khi bắt đầu funding.
- [ ] Donor góp MockUSDC; contribution chỉ hiện hoàn tất sau tx được index.
- [ ] Không thể góp vượt goal.
- [ ] Chưa đủ goal đến hạn: campaign dừng và donor chỉ claim phần refund được phép.
- [ ] Đủ goal: campaign chuyển sang trạng thái có thể ACTIVE sau eligibility quyết định.
- [ ] Không thể thay purpose, goal hoặc organizer wallet trên campaign đã publish/funded.

## 4. Activity và Funding Request

- [ ] OWNER tạo activity với outcome criteria, beneficiary scope, quantity, ceiling và deadline.
- [ ] Draft request có vendor, line items, Q, D, terms/evidence hashes và deadline hợp lệ.
- [ ] Tổng line item bằng requested amount Q.
- [ ] D không vượt 20% Q và không vượt campaign deposit cap.
- [ ] Resolver approval reserve đủ Q; approval không chỉ reserve mỗi deposit.
- [ ] Không thể có hai request tài chính đang mở đồng thời trong một campaign.
- [ ] Không thể duyệt vượt activity gross cap hoặc outcome exposure cap.
- [ ] Sửa amount/vendor/terms sau approval bị chặn; phải tạo version/request mới theo flow.

## 5. Vendor acknowledgement và payout

- [ ] Vendor acknowledge đúng request version và terms; ví khác bị chặn.
- [ ] Trước acknowledgement không có deposit/final payout.
- [ ] Deposit chuyển đúng D (hoặc không tạo transfer khi D = 0).
- [ ] Không thể trả deposit lần hai.
- [ ] Payout chỉ gửi tới recipient đã khóa, không phải ví do executor nhập.
- [ ] Token transfer fail thì state/reserve không bị thay đổi một phần.
- [ ] Request hết hạn acknowledgement hoặc deposit xử lý theo timeout, không để reserve bị kẹt vô hạn.

## 6. Delivery, evidence, dispute và final payment

- [ ] OWNER/vendor nộp evidence delivery; file/hash/version gắn đúng campaign/activity/request.
- [ ] Resolver chỉ tạo delivery candidate khi có hồ sơ; candidate không đồng nghĩa tự trả final.
- [ ] Trong challenge window, final payout bị chặn.
- [ ] Donor mở case hợp lệ thì final payout và residual release bị khóa.
- [ ] Resolver quyết định case đúng authority; resolver backup chỉ takeover sau deadline/recusal.
- [ ] Sau delivery final, payout P tính đúng theo accepted value, gross paid, returned và reserve.
- [ ] P = 0 chuyển `NO_FINAL_DUE`, không gọi ERC-20 transfer.
- [ ] Không thể trả final lần hai hoặc vượt Q/reserve.
- [ ] Vendor return phải là token inflow thực và không vượt gross paid.

## 7. Outcome, wind-down và refund

- [ ] Sau purchase/transport đã settled, nộp evidence outcome cho activity.
- [ ] Outcome challenge/case khóa verification cuối.
- [ ] Chỉ outcome VERIFIED mới mở activity kế tiếp.
- [ ] Loss/case chưa xử lý dẫn đến wind-down, không cho deposit/request mới.
- [ ] Wind-down không xóa nghĩa vụ vendor đã valid/finalized.
- [ ] Refund base snapshot chỉ tạo một lần; donor claim được đúng entitlement.
- [ ] Return/recovery sau snapshot tạo supplement hợp lệ, không cấp refund hai lần.
- [ ] Không action nào làm custody âm hoặc làm tổng accounting sai.

## 8. Đồng bộ chain và phục hồi

- [ ] Mỗi tx UI hiển thị tách biệt: wallet request → submitted → mined → indexed.
- [ ] Refresh trang sau tx vẫn lấy trạng thái tài chính từ projection đã index, không chỉ state frontend.
- [ ] Restart backend giữ projection/idempotency; event cũ không tạo payout/refund/contribution lần hai.
- [ ] Reorg smoke pass:

  ```powershell
  npm.cmd --prefix backend run smoke:hed:reorg
  ```

- [ ] Event bị orphan được gỡ khỏi projection; state on-chain/DB không còn hiển thị dữ liệu mồ côi.

## 9. Ghi nhận kết quả test tay

| Ngày | Người test | Case ID / mục | Ví / campaign | Tx hash hoặc bằng chứng | Kết quả | Ghi chú |
|---|---|---|---|---|---|---|
| | | | | | PASS / FAIL | |

## Tiêu chí hoàn thành local MVP

- Tất cả mục bắt buộc ở phần 0, 1, 3–8 đều PASS hoặc có issue đã được phân loại.
- Không có payout/refund sai recipient, sai amount, lặp giao dịch hoặc bypass authority.
- `acceptance:hed` pass lại sau mọi thay đổi ảnh hưởng contract, indexer, API hoặc flow UI.
- Kết quả local không phải bằng chứng về tiền thật, KYC/vendor ngoài đời hoặc outcome thiện nguyện ngoài đời.
