# Goal — Chuyển đổi sang Reward Crowdfunding (Tài trợ nhận phần thưởng)

> Cập nhật: 2026-10-13 · Trạng thái: VERIFIED_READY (Đã hoàn thiện toàn bộ chu trình `chain action → receipt → canonical indexer → DB/UI`, background block worker `syncFromChain()`, bắt buộc cấu hình deployment/RPC trước `registerOnchain`, và kiểm chứng end-to-end với live node Anvil + live PostgreSQL DB + NestJS HTTP Supertest Acceptance Suite 27/27 PASS).  
> Căn cứ: Quyết định chuyển hướng sản phẩm mới sang Reward Crowdfunding cho Creator (Tác giả) và Backer (Người ủng hộ). Pilot vertical: Xuất bản truyện tranh độc lập (Independent Comics) & Sách nghệ thuật (Artbooks).  
> Nguyên tắc: Bảo toàn nguyên vẹn 100% dữ liệu, hợp đồng và bộ test của các hệ thống từ thiện trước đây (Workflow A, B, HED P1).

---

## 1. Kết quả kiểm chứng thực tế (Concrete Verification Evidence)

1. **Foundry Smart Contract Test Suite (WSL Ubuntu 24.04):** 34/34 PASS
   - `RewardFundingAndFulfillmentTest`: 9/9 PASS (gồm custody conservation fuzzing 256 runs).
   - `HedFundingAndReservationTest`: 22/22 PASS (hạ tầng từ thiện HED cũ bảo toàn 100%).
   - `MockUSDCTest`: 3/3 PASS.
2. **Backend Unit, HTTP Acceptance & Integration Tests:**
   - `npm run test:reward`: 4 suites, 17 tests PASS (`reward-campaign.schema`, `reward-pledge.schema`, `reward-crypto.service`, `reward-indexer.service`).
   - `reward-http-acceptance.spec.ts` (Supertest HTTP Acceptance): 27/27 tests PASS (kiểm chứng RBAC 401/403, V1/V2, fail-closed `registerOnchain` khi thiếu RPC/contract address, receipt-driven `activateCampaignOnchain` / `recordProductionVerifiedOnchain` / `attestFulfillmentComplete` / `completeCampaignOnchain` / `claimRefund`, unified `POST /v1/reward/public/sync-receipt`, và background block worker `RewardIndexerService.runOnce()`).
   - `npm run test:hed`: 9 suites, 17 tests PASS (toàn bộ suite HED cũ bảo toàn).
   - `npm run build`: NestJS build thành công 0 lỗi.
3. **Frontend Tests & Build:**
   - `npm run lint`: Oxlint 0 errors, 0 warnings trên 46 files (gồm `RewardResolverConsole.tsx`).
   - `npm run build`: Vite build thành công (`dist/index.html` xuất bản sạch sẽ).
4. **Reward Contract Scenarios Suite (`reward-scenarios-e2e.cjs`):** 6/6 PASS
   - Scenario 1: Happy path full vertical (Tiers -> Pledge 100% -> 37.5% Print Deposit Disbursal -> Settle -> Sample Proof Verify -> Fulfillment Complete -> Campaign Complete).
   - Scenario 2: Tier supply limit enforcement (Revert khi sold-out).
   - Scenario 3: Underfunded 100% refund claimable.
   - Scenario 4: Surplus return (`returnFunds`) tăng custody escrow.
   - Scenario 5: Dispute during challenge window blocks settlement cho đến khi Resolver giải quyết.
   - Scenario 6: Force majeure mid-production wind-down proportional custody refund.
5. **Reward Full-Stack Live Integration Suite (`reward-live-e2e.cjs`):** 9/9 PHASES PASS
   - Chạy trên live Anvil (RPC 9548) + live PostgreSQL (Port 5432) + live NestJS Domain Services.
   - Phase 1 (Flow V1): Admin review và xác thực Creator identity & IP rights; Creator chưa verify bị từ chối tạo draft.
   - Phase 2 (Flow V2): Frozen commitment hash deterministically computed; Resolver review & approve ngân sách.
   - Phase 3: Contract deployment & onchain registration verified bằng cryptographic hash matching, bytecode check và creator wallet check.
   - Phase 4 (Flow V3): Backer pledge on-chain -> Indexer phân tích receipt -> DB ghi nhận entitlement ACTIVE; **Digital access code bị gated nghiêm ngặt (NULL)**; Anti-spoofing từ chối txHash giả.
   - Phase 5: Thông tin vận chuyển Backer mã hóa AES-256-GCM tại rest; DB chỉ chứa ciphertext/IV/tag; plaintext masked; ACL kiểm soát chỉ Backer sở hữu và Creator được phép giải mã.
   - Phase 6 (Flow V3/V4): Giải ngân cọc in 37.5% (<= 50% cap), quyết toán hóa đơn, Resolver xác nhận mẫu in vật lý qua `recordProductionVerifiedOnchain` -> Indexer đồng bộ event -> **Tự động mở khóa và sinh mã đọc số (`COMIC-READ-...`)**.
   - Phase 7 (Flow V4): Tạo đợt giao hàng fulfillment batch ràng buộc vào bảng nối `reward_batch_entitlements` kèm mã bưu điện; Carrier giao và Backer xác nhận nhận hàng.
   - Phase 8: Backer khiếu nại hàng lỗi -> Resolver thụ lý `RESOLVED_BACKER` -> Entitlement chuyển trạng thái `REFUND_ELIGIBLE` ngăn giao hàng trùng lặp.
   - Phase 9: Wind-down sau horizon 181 ngày -> Indexer chuyển trạng thái `REFUND_ELIGIBLE` -> Backer rút hoàn tiền tỷ lệ còn lại và đồng bộ qua `claimRefund(txHash)` -> Indexer đánh dấu `REFUNDED` ngăn rút kép.

---

## 2. Danh mục các điểm kiến trúc hoàn thiện (Remediation Status)

| STT | Hạng mục kiến trúc | Cơ chế thực thi & Vị trí code | Trạng thái |
| :---: | :--- | :--- | :---: |
| 1 | Chống spoofing entitlement qua API | `RewardIndexerService.processReceipt(txHash)` phân tích receipt và logs canonical từ contract đã đăng ký, không tin client input | **ĐÃ GIẢI QUYẾT** |
| 2 | Khóa digital access code tại pledge time | Entitlement khởi tạo với `digitalAccessCode = null`; chỉ được unlock và generate key khi event `ProductionVerified` được index | **ĐÃ GIẢI QUYẾT** |
| 3 | Idempotent Reward Event Indexer & Background Worker | `RewardIndexerService` bao phủ toàn bộ 22 event của `FundTogetherReward.sol`, kèm background block polling worker `syncFromChain()` (checkpoint + reorg detection trên `indexerStreams`) và endpoint `POST /v1/reward/public/sync-receipt` | **ĐÃ GIẢI QUYẾT** |
| 4 | Bắt buộc cấu hình deployment/RPC trước `registerOnchain` | `RewardCampaignService.registerOnchain` fail-closed nếu thiếu RPC URL, thiếu/sai `REWARD_CONTRACT_ADDRESS`, không có bytecode tại địa chỉ contract, hoặc ví Creator không khớp on-chain | **ĐÃ GIẢI QUYẾT** |
| 5 | Nối transaction on-chain vào toàn bộ endpoint Resolver / Fulfillment / Refund / UI | Các endpoint `activate-onchain`, `verify-production`, `fulfillment-complete`, `complete`, `refund` đều bắt buộc `txHash`, xác thực qua `RewardIndexerService.processReceipt(txHash)` và đối chiếu trạng thái canonical; Frontend nối ví đầy đủ trong `RewardResolverConsole.tsx`, `RewardCreatorStudio.tsx`, `RewardPublicCampaign.tsx`, `RewardBackerEntitlements.tsx` | **ĐÃ GIẢI QUYẾT** |
| 6 | Quy trình thẩm định V1 & V2 kèm RBAC Guard | `RewardAdminGuard` & `RewardResolverGuard` bảo vệ chặt chẽ `RewardAdminController` và `RewardResolverController` | **ĐÃ GIẢI QUYẾT** |
| 7 | Fulfillment & Dispute chuẩn hóa | Gating `PRODUCTION_VERIFIED` trước khi tạo batch; bảng nối `reward_batch_entitlements`; tách biệt trạng thái `FULFILLMENT_COMPLETE` trước `COMPLETED`; Resolver xử lý tranh chấp chuyển trạng thái `REFUND_ELIGIBLE` | **ĐÃ GIẢI QUYẾT** |
| 8 | Bảo vệ PII vận chuyển bằng AES-256-GCM fail-fast | Bắt buộc `REWARD_PII_ENCRYPTION_KEY` hợp lệ ($\ge 32$ bytes) khi khởi động; lưu `shippingEncrypted`, `shippingIv`, `shippingTag`; ACL nghiêm ngặt | **ĐÃ GIẢI QUYẾT** |
| 9 | Tách biệt hoàn toàn Migration 0026 | `0026_massive_rick_jones.sql` chỉ chứa các bảng `reward_*`, bảo toàn 100% schema và dữ liệu của các bảng từ thiện HED | **ĐÃ GIẢI QUYẾT** |
| 10 | Kiểm chứng Live E2E & Supertest HTTP Acceptance | `npm run test:reward:e2e` chạy 6 kịch bản contract + 27 bài test HTTP Supertest; `reward-live-e2e.cjs` chạy 9 phase tích hợp thật với live Anvil RPC và live PostgreSQL | **ĐÃ GIẢI QUYẾT** |

