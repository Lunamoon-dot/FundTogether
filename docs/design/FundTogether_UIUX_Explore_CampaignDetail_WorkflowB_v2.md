# FundTogether — UI/UX Specification v2.0

> **Phạm vi:** Explore & Campaign Detail — Desktop / Mobile — Workflow B  
> **Định hướng:** Hybrid · Charity Experience × Financial Transparency  
> **Ngày biên soạn:** 10/10/2026  
> **Trạng thái:** Design proposal / implementation blueprint; **chưa** phải UI đã triển khai, kết quả usability test, hay đặc tả tài chính thay thế các quy tắc đã duyệt.  
> **Repository đối chiếu:** [Lunamoon-dot/FundTogether](https://github.com/Lunamoon-dot/FundTogether), `main`; tài liệu tiến độ được ghi nhận cập nhật đến 09/10/2026.

---

## Mục lục

1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Cơ sở từ dự án hiện tại](#2-cơ-sở-từ-dự-án-hiện-tại)
3. [Nguyên tắc trải nghiệm và nhận diện Hybrid](#3-nguyên-tắc-trải-nghiệm-và-nhận-diện-hybrid)
4. [Kiến trúc thông tin và navigation](#4-kiến-trúc-thông-tin-và-navigation)
5. [Explore — Đặc tả giao diện](#5-explore--đặc-tả-giao-diện)
6. [Campaign Detail — Đặc tả giao diện](#6-campaign-detail--đặc-tả-giao-diện)
7. [Wireframe desktop và mobile](#7-wireframe-desktop-và-mobile)
8. [Trạng thái và hành vi theo Workflow B](#8-trạng-thái-và-hành-vi-theo-workflow-b)
9. [Các luồng tương tác trọng yếu](#9-các-luồng-tương-tác-trọng-yếu)
10. [Component architecture](#10-component-architecture)
11. [Mapping frontend ↔ API ↔ contract/indexer](#11-mapping-frontend--api--contractindexer)
12. [Design system & responsive](#12-design-system--responsive)
13. [Lỗi, bảo mật, minh bạch và accessibility](#13-lỗi-bảo-mật-minh-bạch-và-accessibility)
14. [Kế hoạch refactor và tiêu chí nghiệm thu](#14-kế-hoạch-refactor-và-tiêu-chí-nghiệm-thu)
15. [Giá trị nghiên cứu khoa học và UX testing](#15-giá-trị-nghiên-cứu-khoa-học-và-ux-testing)
16. [Các quyết định, ranh giới và câu hỏi còn mở](#16-các-quyết-định-ranh-giới-và-câu-hỏi-còn-mở)
17. [Nguồn trong repository](#17-nguồn-trong-repository)

---

## 1. Tóm tắt điều hành

### 1.1. Product positioning

**FundTogether là một nền tảng gây quỹ từ thiện lấy minh bạch làm trọng tâm (Transparency-First Charity Platform).** Blockchain được sử dụng để quản lý điều kiện giao dịch, escrow, quyền và lịch sử sự kiện; trải nghiệm dành cho donor vẫn phải tự nhiên như một sản phẩm từ thiện chứ không giống bảng điều khiển crypto.

**Thứ tự các câu hỏi mà UI phải giải đáp:**

1. **Tôi đang giúp ai?** — Câu chuyện, tổ chức, đối tượng thụ hưởng.
2. **Tiền sẽ được dùng như thế nào?** — Kế hoạch, ngân sách theo đợt, cam kết và tiêu chí.
3. **Dự án đã làm được gì?** — Tiến độ thực hiện, hồ sơ và kết quả nghiệm thu.
4. **Tiền đang ở đâu?** — Tổng đóng góp, đã cấp, thực hoàn về escrow, đã trả donor, số dư.
5. **Tôi có thể kiểm chứng không?** — Hồ sơ công khai, quyết định resolver, hash, event và transaction.

### 1.2. Quyết định thiết kế chủ đạo

- **Public-first:** cho phép khám phá, đọc campaign và xem dữ liệu minh bạch mà không cần kết nối ví.
- **Charity-first, blockchain-second:** ẩn chi tiết quá kỹ thuật ở lớp mở rộng có chủ đích; không che các rủi ro tài chính thực tế.
- **Một campaign, nhiều góc nhìn:** Funding Progress, Execution Progress, Evidence/Verification và Financial Transparency **là các khối khác nhau**.
- **State-driven:** nhãn, thông báo và CTA phụ thuộc snapshot/permission hiện tại; không tự suy quyền on-chain từ UI.
- **Tối ưu MVP B:** giữ các logic giao dịch, bằng chứng, refund hiện có; refactor presentation trước khi mở rộng các workflow chưa được duyệt.

### 1.3. Out of scope cho UI MVP B

Chưa đưa vào thiết kế đang triển khai: ba **phương án ngân sách thay thế** từ ý tưởng cũ, quadratic voting, MDP, AI verification, zkVerify, quorum/committee, verifier tách rời, appeals, slashing, danh tiếng/reputation và cơ chế funding đa loại hình có nghiệp vụ chưa được duyệt. Đây có thể là hướng nghiên cứu/post-MVP, **không** được mô tả là đã tồn tại.

---

## 2. Cơ sở từ dự án hiện tại

### 2.1. Tech stack và phân lớp

| Lớp | Công nghệ/thành phần đang có | Vai trò |
|---|---|---|
| Frontend | React, TypeScript, Vite | Page, component, form, UI state |
| Data fetching | TanStack Query | Fetch/cache/refetch API |
| Web3 frontend | Wagmi, RainbowKit, Viem | Wallet, ký và theo dõi giao dịch |
| Backend | NestJS | Auth, public/private APIs, review/action preparation |
| DB | PostgreSQL, Drizzle | Metadata, hồ sơ, projection, workflow |
| Storage | MinIO | Evidence original/private và bản công khai đã che thông tin |
| Blockchain | Solidity, Foundry, Anvil, ERC-20 test token | Escrow, workflow, điều kiện quyền/tài chính |
| Indexer | Thành phần nằm trong backend | Contract event → projection → public/API UI |

### 2.2. Luồng A so với luồng B

| | Luồng A (baseline) | Luồng B (pilot hiện được ưu tiên) |
|---|---|---|
| Cấp vốn | Tổ chức thực hiện trước; settlement sau nghiệm thu | **Cấp vốn trước cho từng đợt** khi đủ điều kiện |
| Bond | Có cơ chế bond của A | **Không bond** cho local pilot B |
| Chuyển tiền khi nghiệm thu | Có đường settlement/payout của baseline A | Nghiệm thu **không tự chuyển thêm tiền** cho đợt vừa thực hiện |
| Tiến hành đợt tiếp | Theo chính sách A | Chỉ sau nghiệm thu đạt, qua thời hạn phản đối/case và xử lý tiền dư đúng quy tắc |
| Refund | Theo accounting A | Base snapshot + supplement từ return muộn, quyền claim theo ví |

**Ranh giới:** UI không được trộn semantics A và B; deployment B riêng và không làm thay đổi nghĩa vụ campaign A. Không dùng chữ “hoàn thành” thay cho “đủ vốn”.

### 2.3. Workflow B đã duyệt cho local/pilot

Từ `docs/workflow-b-spec.md` và `docs/workflow-b-financial-rules.md`:

- Campaign mẫu đầu tiên: `GIFT_DISTRIBUTION`, gồm kênh `INSTITUTION` (qua đơn vị) và `DIRECT` (trực tiếp). Số đợt là thuộc tính độc lập, có thể 1 hoặc nhiều đợt.
- **Goal = tổng các stage budgets**, đóng góp không vượt goal; đủ goal mới có khả năng xét cấp vốn.
- Resolver xác nhận eligibility lần đầu; sau đó organizer claim đúng ngân sách đợt đầu; mỗi đợt chỉ claim một lần.
- Organizer thực hiện hoạt động, nộp evidence có version; resolver đánh giá từng criterion: `MET`, `NEEDS_INFORMATION`, `NOT_MET`, `INCONCLUSIVE`.
- Donor đủ quyền có thể mở phản đối khi `CHALLENGE_WINDOW` còn hạn. Mỗi version tối đa một case theo rule pilot; không có appeals.
- Đợt cuối **vẫn phải nghiệm thu**; hoàn tất không đồng nghĩa hoàn tất các nghĩa vụ refund/return còn tồn tại.
- Tiền đã cấp ra ví tổ chức **không thể tự động thu hồi**. Refund được tính từ custody thực và return thực nhận, theo entitlement.
- Base refund được chốt tại snapshot; các return muộn tạo quyền supplement tích lũy, không sửa âm thầm quyền base đã chốt.
- Không có expiration/sweep đối với quyền refund theo đặc tả pilot.

**Không nên diễn giải hash/on-chain proof là chứng minh sự thật ngoài đời.** Hash giúp xác minh tính toàn vẹn và liên kết đúng nội dung đã commitment; sự thật cần nguồn/tác nhân review đáng tin cậy.

### 2.4. Frontend/API đã có liên quan

- `frontend/src/app/App.tsx`: hash-routing và điều hướng `PublicArea` / `OrganizationWorkspace` / `InternalArea`.
- `frontend/src/features/explore/PublicArea.tsx`: sidebar public, feed, detail, contributions, account, review link; chọn mode bằng `isAdvance`.
- `frontend/src/features/explore/PublicCampaigns.tsx`: feed/detail cho baseline A, giữ nguyên khi refactor B.
- `frontend/src/features/explore/AdvanceCampaignDetail.tsx`: `AdvanceCampaignFeed`, `AdvanceCampaignDetail`, donation, plans, evidence, case, refunds, events.
- `frontend/src/features/explore/AdvanceRefundPanel.tsx`: base/supplement rights và claim theo ví.
- `frontend/src/features/campaigns/advance/AdvanceWalletAction.tsx`: xử lý chuẩn bị giao dịch, SIWE, đúng deployment/wallet, approve, receipt, indexer tracking.
- `frontend/src/features/campaigns/advance/AdvanceCaseActions.tsx`: phản đối, material, response.
- `frontend/src/features/campaigns/advance/advance-journey.ts`: label state, checkpoint, financial invariant, action-input và case gating.
- `backend/src/advance/advance-public.controller.ts`: API public campaigns, detail, events, records.
- `backend/src/advance/advance-workflow.service.ts`: dựng public feed/detail và workflow snapshot từ indexer.
- `backend/src/advance/advance.types.ts`: contract-facing state/type definitions.

### 2.5. Mức độ kiểm chứng

Theo `docs/workflow-b-acceptance.md` ngày 09/10/2026, code và các journey tự động đã có bằng chứng PASS; việc nghiệm thu bằng MetaMask của người dùng và quyết định reviewer độc lập vẫn còn thiếu. **Không dùng những báo cáo đó để tuyên bố production-ready hoặc tiền thật-ready.** Tài liệu UI này là đề xuất, không phải biên bản test UI đã chạy.

---

## 3. Nguyên tắc trải nghiệm và nhận diện Hybrid

### 3.1. Five UX principles

1. **Empathy first:** tên campaign, câu chuyện và tác động xuất hiện trước event/contract hash.
2. **Transparency without overload:** minh bạch thể hiện bằng câu trả lời rõ ràng về tiền và nghiệm thu; có thể mở sâu để xem chứng cứ kỹ thuật.
3. **State clarity:** mỗi bước có nhãn đơn nghĩa; không nhập nhằng giữa đã gửi hồ sơ, được kết luận `MET` và đợt đã `FINALIZED`.
4. **Action explainability:** hiển thị hành động được phép, người thực hiện, deadline và lý do bị khóa.
5. **Auditability:** dữ liệu công khai và log/sự kiện phải có checkpoint; hồ sơ version cũ và quyết định cũ vẫn truy vết được.

### 3.2. Tone of voice

| Tránh | Nên dùng |
|---|---|
| “Execute transaction” | “Xác nhận giao dịch trong ví” |
| “Milestone activated” | “Đợt 2 đã đủ điều kiện nhận vốn” *(chỉ khi đúng trạng thái)* |
| “Funds released = success” | “Đã cấp vốn cho tổ chức; đang chờ kết quả thực hiện” |
| “Proof verified on-chain” | “Hash/tính toàn vẹn hồ sơ đã được đối chiếu; nội dung được resolver đánh giá...” |
| “100% funded = completed” | “Đã đủ ngân sách gây quỹ; đang chờ các bước triển khai” |
| “Refund 100% guaranteed” | “Khoản hoàn có thể nhận từ quỹ thực tế theo quyền của ví đóng góp” |

### 3.3. Thứ tự phân cấp thông tin

- **Lớp 1 — Tác động và hành động:** title, short story, phạm vi hỗ trợ, trạng thái hiện tại, progress, CTA.
- **Lớp 2 — Điều kiện và kết quả:** timeline đợt, ngân sách, criteria, evidence version và review.
- **Lớp 3 — Technical audit:** contract address, chain ID, plan/evidence hash, block, tx hash, event, checkpoint, accounting invariant.

Không giấu các cảnh báo rủi ro tài chính quan trọng ở lớp 3.

---

## 4. Kiến trúc thông tin và navigation

### 4.1. Public sitemap mục tiêu

```text
FundTogether — Public Website
├── Explore / Campaign Feed             #/  (route hiện tại)
│   └── Campaign Detail                 #/campaigns/:id  (route hiện tại)
│       ├── Tổng quan / Giới thiệu
│       ├── Kế hoạch & các đợt
│       ├── Bằng chứng & nghiệm thu
│       ├── Dòng tiền & hoàn tiền
│       └── Lịch sử on-chain
├── Đóng góp của tôi                    #/contributions  (route hiện tại)
├── Tài khoản                           #/account (route hiện tại)
├── Cách hoạt động                      (route mở rộng, chưa có)
└── Minh bạch toàn hệ thống             (route mở rộng, chưa có)

Separate workspaces (đã có tuyến riêng; KHÔNG đặt vào top nav public)
├── Organization Workspace              #/workspace, #/organizations/...
└── Internal / Resolver                 #/internal..., #/review...
```

**Thực hiện bước đầu:** giữ hash-router `#/` và `#/campaigns/:id` để giảm regression, chưa cần đổi URL strategy.

### 4.2. Navigation desktop

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ ♥ FundTogether       Khám phá    Cách hoạt động    Minh bạch     Tài khoản│
└───────────────────────────────────────────────────────────────────────────┘
```

- Top navbar công khai. Khám phá là primary nav.
- Không hiển thị Resolver/Admin như điều hướng consumer thông thường.
- Organizer entry có thể trong account menu/CTA “Dành cho tổ chức”, không đồng nghĩa quyền đã được cấp.
- Không yêu cầu kết nối ví để đọc Explore/Campaign Detail.

### 4.3. Navigation mobile

```text
┌────────────────────────────┐
│ ♥ FundTogether      ☰      │
└────────────────────────────┘
```

- Menu drawer cho account/explore/how-it-works (chỉ những mục đã có route hoặc được bật).
- Nội dung Campaign Detail theo một cột.
- Sticky bottom CTA chỉ khi có hành động chính thực sự phù hợp state/quyền; tránh che nội dung/keyboard.

### 4.4. Vai trò và quyền

Đăng nhập web2/account và liên kết ví SIWE **không** tự tạo quyền on-chain. Một người có thể vừa là donor vừa đại diện tổ chức; giao diện chuyển workspace theo quyền được cấp, nhưng backend và contract vẫn kiểm quyền riêng.

---

## 5. Explore — Đặc tả giao diện

### 5.1. Mục tiêu

Người xem cần tìm thấy dự án đáng quan tâm, hiểu được chiến dịch đang ở giai đoạn nào và quyết định mở Campaign Detail. **Không** biến Explore thành bảng transaction explorer.

### 5.2. Cấu trúc nội dung

1. **Public Navbar**.
2. **Hero ngắn**: nêu lý do tin tưởng vào cơ chế minh bạch; không dùng slogan cam kết tuyệt đối về sử dụng tiền.
3. **Explore Heading** + mô tả ngắn.
4. **Search / filter**: tìm tên (nếu dataset/API hỗ trợ), lọc state ở mức consumer.
5. **Campaign Grid**: card ưu tiên hình ảnh/thông tin tác động.
6. **Pagination / load more / empty/error state**.
7. **Footer**: mô hình hoạt động, điều khoản/rủi ro và liên kết nguồn mở (nếu được xây dựng).

### 5.3. Campaign Card — content spec

| Trường | Nguồn/ý nghĩa | Mức ưu tiên |
|---|---|---|
| Cover | Metadata public đã kiểm tra hoặc placeholder | P1; **không** gọi là bằng chứng |
| Title | `title` | P0 |
| Short description | `description`, giới hạn 2–3 dòng | P0 |
| Organizer name | Public organization metadata nếu được trả về | P1; không bịa hoặc đánh dấu verified nếu chưa có căn cứ |
| Activity type | `GIFT_DISTRIBUTION` nếu plan hợp lệ | P1; chưa tạo bộ lọc đa loại hình chưa triển khai |
| Status | Mapping `workflow.state` → consumer label | P0 |
| Funding | `contributed / goal` | P0 |
| Execution | Số đợt đã `FINALIZED` / tổng đợt; hoặc current stage | P1; cần snapshot/DTO tương ứng |
| CTA | “Xem chiến dịch” | P0 |

Không hiển thị bond (B không có bond), plan hash, ví tổ chức, full C/A/R/F/E hay technical transaction list ngay trên card.

### 5.4. Search & filter

**P0:** nhóm trạng thái theo workflow, ví dụ:

- **Đang gây quỹ**: `FUNDING`.
- **Đang triển khai/kiểm tra**: `FIRST_REVIEW`, `ADVANCE_AVAILABLE`, `EXECUTING`, `EVIDENCE_REVIEW`, `SUPPLEMENT_DUE`, `CHALLENGE_WINDOW`, `CASE_OPEN` (có nhãn chi tiết bên trong card).
- **Hoàn thành**: `COMPLETED`.
- **Đã dừng**: `STOPPED`.

`DRAFT`/`APPROVED` chỉ xuất hiện trong public feed nếu thực sự đã publish và được endpoint public trả về; theo business UI nên giấu campaign chưa công bố.

**P1:** tìm title/organization, sắp xếp theo ngày đăng, deadline hoặc hoạt động. Chỉ triển khai sort/filter theo field và API thực có; nếu chưa có backend search, chỉ gọi là tìm kiếm **trong kết quả đã tải**, tránh ngụ ý tìm toàn bộ dữ liệu.

### 5.5. Empty/loading/error states

- **Loading:** skeleton 3 card, announce trạng thái bằng accessible status.
- **Empty platform:** “Chưa có chiến dịch công khai” + giải thích campaign chỉ xuất hiện sau publish & index.
- **Empty filter:** “Không có chiến dịch phù hợp” + reset filter.
- **Indexer not ready:** hiển thị thông báo trạng thái dữ liệu; không dùng số liệu không biết freshness để khẳng định kết quả mới.
- **API error:** thông điệp ngắn + “Thử lại”; không giả danh danh sách rỗng.

---

## 6. Campaign Detail — Đặc tả giao diện

### 6.1. Information architecture

**Desktop:** 2 cột — nội dung ~65%, cột action/summary ~35%.  
**Mobile:** 1 cột — cover → title → funding card → giải thích cơ chế → các đợt → evidence → finance/history → CTA thích hợp.

| Thứ tự | Module | Nội dung |
|---|---|---|
| 1 | Breadcrumb / Back | Trở về Explore |
| 2 | Hero | Cover (nếu có), tên chiến dịch, tổ chức và trạng thái |
| 3 | Funding Summary | Goal, contributed, deadline khi còn funding, CTA/hành động phù hợp |
| 4 | Campaign Story | Câu chuyện, đối tượng thụ hưởng, phạm vi, kênh trao |
| 5 | Execution Timeline | Stage 1…N, budget, stage state, tiêu chí, trạng thái nghiệm thu |
| 6 | Evidence & Verification | Version, public redacted bundle, review report, case, lý do và thời hạn |
| 7 | Financial Transparency | C, A, R, F, E, cảnh báo ý nghĩa custody/advance, refund |
| 8 | On-chain History | Indexed events, transaction hash, block, checkpoint và technical detail |

**Nguyên tắc:** campaign không phải chỉ có 1 progress bar. Funding = raised/goal; Execution = actual stage progress; Verification = evidence/review/case; Money = current movement and rights.

### 6.2. Funding Summary card

**Các dữ liệu chính:**

- Tổng `contributed` và `goal` (USDC token units được format an toàn).
- Funding percent: `contributed * 100 / goal`, chỉ là tỷ lệ **gây quỹ**, không phải tỷ lệ tác động hoặc đã thực hiện.
- Trạng thái nghiệp vụ dạng consumer label; thời hạn lấy từ checkpoint/chain state.
- CTA chỉ xuất hiện khi state và actor cho phép, căn cứ vào action preparation/contract checks.

**Trong `FUNDING`:** CTA “Ủng hộ chiến dịch”; hiển thị phần goal còn thiếu, hạn gây quỹ và thông điệp “không nhận vượt goal”. **Sau `FUNDING`:** thay bằng action/insight của state mới, không để nút Donate hoạt động.

### 6.3. Execution Timeline

Mỗi `StageCard` có:

- “Đợt N / tổng số đợt”, tiêu đề, ngân sách.
- Tác vụ thực hiện, checklist/acceptance criteria đã cam kết.
- Trạng thái đợt: chưa cấp, đã cấp/đang làm, đang review, cần bổ sung, cửa sổ phản đối, case mở, đã finalized hoặc stopped.
- Số tiền đã cấp cho **đợt** (không đồng nhất với “đã được nghiệm thu”).
- Hạn liên quan nếu state hiện tại có deadline có nghĩa.
- Expand để xem document requirement/criterion; state hiện tại nên tự mở.

**Quan trọng:** `MET` là kết luận review trên một version và dẫn tới cửa sổ phản đối; `FINALIZED` là trạng thái đợt đã chốt đủ điều kiện. Không dùng chung “đã hoàn tất” cho hai việc.

### 6.4. Evidence & Verification

Cấu trúc theo **đợt → version → kết luận/case**:

```text
Đợt 1
├── Submission v1 — hash bản gốc, public bundle
│   ├── Checklist + bằng chứng công khai đã che PII
│   └── Review: NEEDS_INFORMATION + báo cáo/lý do
├── Submission v2 — parent = v1, hash riêng
│   ├── Checklist + bằng chứng public version 2
│   └── Review: MET + kết luận resolver
├── CHALLENGE_WINDOW (nếu còn hạn)
│   ├── Donor mở phản đối nếu đủ quyền
│   └── Case (nếu mở): reason, response, decision
└── STAGE_FINALIZED (sau đủ điều kiện)
```

- Version cũ bất biến và có thể đọc lại.
- Chỉ công khai bản đã redacted; original/PII không được lộ cho donor.
- Có thể tải bản public nếu storage và hash check thành công.
- Khi storage unavailable hoặc hash không khớp, báo lỗi rõ ràng; không tự suy “đã hoàn thành” chỉ từ số event.
- Kết luận resolver phải phân biệt `MET`, `NEEDS_INFORMATION`, `NOT_MET`, `INCONCLUSIVE`.
- Không diễn giải `MET` là toàn bộ campaign đã hoàn thành; không diễn giải donor im lặng là proof.

### 6.5. Financial Transparency

Các đại lượng thật của Workflow B:

| Ký hiệu | Ý nghĩa | UI label đề xuất |
|---|---|---|
| `Goal` | Tổng ngân sách các đợt | Mục tiêu gây quỹ |
| `C` / `contributed` | Token donor đã góp | Tổng đóng góp |
| `A` / `advanced` | Token đã cấp cho tổ chức | Đã cấp cho tổ chức |
| `R` / `returned` | Token tổ chức đã thực trả về | Tổ chức đã trả về |
| `F` / `refunded` | Token đã hoàn trả donor | Đã hoàn cho người ủng hộ |
| `E` / `custody` | Token escrow còn giữ | Escrow đang giữ |

**Bất biến kế toán cần đối chiếu:**

```text
C + R = A + F + E
```

- Hiển thị **đã cấp** riêng với **đã được nghiệm thu**.
- `E` không phải toàn bộ “tiền chưa dùng được phép trả lại”; nó có thể gồm nghĩa vụ claim chưa nhận và rounding dust. Không quét/sweep theo UI.
- Nếu tính toán/canonical projection không nhất quán, thông báo đối chiếu và chặn hành động liên quan; không hiển thị sai số rồi dùng số đó làm căn cứ CTA.
- Sau snapshot hoàn tiền, cho thấy `basePool` và `supplementPool` riêng; quyền cá nhân theo ví đã link, không public entitlement mỗi người.

### 6.6. Refund section

- Hiện khi `refundSnapshotted` và điều kiện tương ứng; campaign `STOPPED` **không có nghĩa** donor sẽ nhận lại toàn bộ contribution.
- Người chưa đăng nhập chỉ thấy mô tả cơ chế/pool công khai, không thấy claimable cá nhân.
- Donor đăng nhập và sử dụng ví đã góp: xem contribution, base entitlement, base đã claim/consume, supplement đã nhận, **claimable hiện tại**.
- Claim theo đúng wallet; khi return muộn tăng supplement, có thể phát sinh quyền claim mới.
- Khi base entitlement bằng 0 nhưng cần consume right, phải giải thích rõ giao dịch có thể tiêu phí gas nhưng không nhận token.
- Claim failed không được tự xoá right; refresh theo checkpoint.

### 6.7. Event history & verification panel

Mặc định hiển thị diễn giải người dùng: “Tổ chức nhận ngân sách đợt 1”, “Nộp hồ sơ v2”, “Resolver yêu cầu bổ sung”, “Đã hoàn refund”. Mở rộng hiển thị event name, block, tx hash, chain/deployment, checkpoint.

**Không** lấy request HTTP/upload/tx hash chưa confirmed làm hoàn thành nghiệp vụ. Canonical pipeline: contract receipt/event → indexer → DB/API → UI.

---

## 7. Wireframe desktop và mobile

> Wireframe dưới đây là **sơ đồ bố cục text**, không phải screenshot hoặc giao diện production. Content mẫu để chứng minh thứ tự khối. Nếu đưa ví dụ financial demo vào FE, đảm bảo invariant kế toán và gắn nhãn “minh hoạ”.

### 7.1. Explore — Desktop (≥1024px)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ♥ FundTogether            Khám phá     Cách hoạt động     ...    Tài khoản │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   Mỗi đóng góp, một hành trình có thể kiểm chứng                           │
│   Khám phá chiến dịch từ thiện và theo dõi thực hiện từng đợt               │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ Khám phá chiến dịch                                                        │
│ [ Tìm kiếm chiến dịch...                     ]  [Lọc trạng thái v]          │
│ [Tất cả] [Đang gây quỹ] [Đang triển khai] [Hoàn thành] [Đã dừng]           │
│                                                                            │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐  │
│ │ Cover / placeholder  │ │ Cover / placeholder  │ │ Cover / placeholder │  │
│ │ Đang gây quỹ         │ │ Đang thực hiện       │ │ Đã dừng             │  │
│ │ Campaign title       │ │ Campaign title       │ │ Campaign title      │  │
│ │ Mô tả 2–3 dòng       │ │ Mô tả 2–3 dòng       │ │ Mô tả 2–3 dòng      │  │
│ │ C / Goal             │ │ C / Goal             │ │ C / Goal            │  │
│ │ [funding bar]        │ │ [funding bar]        │ │ [funding bar]       │  │
│ │ Đợt / status         │ │ Đợt / status         │ │ Dừng / refund info  │  │
│ │ [Xem chiến dịch]     │ │ [Xem chiến dịch]     │ │ [Xem chiến dịch]    │  │
│ └──────────────────────┘ └──────────────────────┘ └─────────────────────┘  │
│                                                                            │
│                              [Trang trước] 1 [Trang tiếp]                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.2. Explore — Mobile (360–390px)

```text
┌───────────────────────────────────┐
│ ♥ FundTogether              [☰]  │
├───────────────────────────────────┤
│ Cùng tạo nên những thay đổi       │
│ Minh bạch theo từng đợt thực hiện │
├───────────────────────────────────┤
│ Khám phá                     [☷] │
│ [ 🔍 Tìm chiến dịch...          ] │
│                                   │
│ ┌───────────────────────────────┐ │
│ │ Campaign cover                │ │
│ │ [Đang gây quỹ]                │ │
│ │ Title                         │ │
│ │ Mua & trao quà                 │ │
│ │ C / Goal                      │ │
│ │ ███████░░░                    │ │
│ │ Đang ở bước nào?              │ │
│ │ [Xem chiến dịch →]            │ │
│ └───────────────────────────────┘ │
│               ...                 │
└───────────────────────────────────┘
```

### 7.3. Campaign Detail — Desktop

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ♥ FundTogether          Khám phá                  ...          Tài khoản  │
├────────────────────────────────────────────────────────────────────────────┤
│ ← Khám phá / Chiến dịch                                                    │
│ ┌──────────────────────────────────────────────────────────────────────┐   │
│ │ HERO IMAGE / CAMPAIGN COVER                                          │   │
│ └──────────────────────────────────────────────────────────────────────┘   │
│ [Campaign status] Title                                                    │
│ Organizer · Activity type · Kênh trao                                      │
│                                                                            │
│ ┌──────────────────────────────────────────┐ ┌────────────────────────┐ │
│ │ CÂU CHUYỆN & PHẠM VI                     │ │ ĐÃ ĐÓNG GÓP            │ │
│ │ - Đối tượng thụ hưởng                    │ │ C USDC / Goal          │ │
│ │ - Mục tiêu và cam kết                     │ │ ███████░░░             │ │
│ │ - Cách trao / phạm vi                     │ │ Deadline, state        │ │
│ ├──────────────────────────────────────────┤ │ [Donate / State CTA]   │ │
│ │ HÀNH TRÌNH CÁC ĐỢT                        │ ├────────────────────────┤ │
│ │ [Đợt 1] [state] budget; mở để xem         │ │ TÌNH TRẠNG HIỆN TẠI   │ │
│ │ [Đợt 2] [state] budget; mở để xem         │ │ Đã cấp A              │ │
│ │ [Đợt 3] [state] budget; mở để xem         │ │ Escrow E              │ │
│ ├──────────────────────────────────────────┤ │ Next action / deadline │ │
│ │ [Kế hoạch] [Bằng chứng] [Dòng tiền] ...   │ └────────────────────────┘ │
│ │ DOCUMENTS / REVIEWS / EVENT TIMELINE     │                            │
│ └──────────────────────────────────────────┘                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.4. Campaign Detail — Mobile

```text
┌───────────────────────────────────┐
│ ← Chi tiết chiến dịch       [↗]  │
│ [Cover 16:9]                      │
│ [Đang gây quỹ]                    │
│ Campaign title                    │
│ Organizer / activity              │
├───────────────────────────────────┤
│ C / Goal                          │
│ ███████░░░  66,7%                │
│ Deadline / còn thiếu              │
├───────────────────────────────────┤
│ Cơ chế: đủ goal rồi xét điều kiện │
│ cấp trước từng đợt; nghiệm thu    │
│ trước cấp tiếp.                   │
├───────────────────────────────────┤
│ Câu chuyện / Phạm vi hỗ trợ       │
├───────────────────────────────────┤
│ Kế hoạch triển khai               │
│ ○ Đợt 1  [Mở chi tiết]             │
│ ○ Đợt 2  [Mở chi tiết]             │
│ ○ Đợt 3  [Mở chi tiết]             │
├───────────────────────────────────┤
│ Bằng chứng / Xác minh             │
│ Dòng tiền / Refund                │
│ Lịch sử on-chain                  │
├───────────────────────────────────┤
│ Sticky CTA (chỉ khi phù hợp):     │
│ Còn thiếu X       [Ủng hộ ngay]   │
└───────────────────────────────────┘
```

### 7.5. Ví dụ số liệu demo (không phải dữ liệu chain)

Campaign tổng 3.300 USDC, 3 đợt × 1.100 USDC:

| State minh họa | C | A | R | F | E | Diễn giải |
|---|---:|---:|---:|---:|---:|---|
| `FUNDING` | 2.200 | 0 | 0 | 0 | 2.200 | Chưa đủ goal |
| `EVIDENCE_REVIEW` | 3.300 | 1.100 | 0 | 0 | 2.200 | Đã cấp đợt 1; chờ kết luận |
| `STOPPED` sau đợt 1 | 3.300 | 1.100 | 50 | 0 | 2.250 | Đã nhận return 50; có refund snapshot theo policy |

Cả ba dòng đều thỏa **C + R = A + F + E**. State demo không thay thế transition test và không xác định quyền hoàn tiền từng ví.

---

## 8. Trạng thái và hành vi theo Workflow B

### 8.1. Contract-level state → UI label → CTA

| State | Nhãn công khai | Thông tin ưu tiên | CTA công khai / hành động |
|---|---|---|---|
| `DRAFT` | Đang thẩm định kế hoạch | Không hiển thị public nếu chưa publish | Không có |
| `APPROVED` | Đã duyệt kế hoạch | Không hiển thị public nếu chưa publish | Không có |
| `FUNDING` | Đang gây quỹ | Goal, contributed, fundingEnd | Donate nếu eligible |
| `FIRST_REVIEW` | Chờ xác nhận điều kiện cấp vốn | Đủ vốn chưa đồng nghĩa được nhận vốn | Xem kế hoạch/điều kiện |
| `ADVANCE_AVAILABLE` | Tổ chức có thể nhận vốn đợt N | Số tiền, hạn claim, ai thực hiện | Public: theo dõi; owner: claim trong workspace |
| `EXECUTING` | Đang thực hiện đợt N | Budget đã cấp, thời hạn nộp evidence | Xem kế hoạch/tiến độ |
| `EVIDENCE_REVIEW` | Resolver đang xét hồ sơ | Version đang review, report chưa final | Xem hồ sơ public |
| `SUPPLEMENT_DUE` | Tổ chức cần bổ sung hồ sơ | Nội dung cần bổ sung, số version/hạn | Public: xem; owner: bổ sung |
| `CHALLENGE_WINDOW` | Đang trong thời hạn phản đối | MET chưa phải finalized, challengeEnd | Donor eligible: phản đối |
| `CASE_OPEN` | Đang xử lý phản đối | Nội dung/case response/deadlines | Actor đủ quyền: cung cấp material/phản hồi |
| `COMPLETED` | Đã nghiệm thu tất cả đợt | Final acceptance và nghĩa vụ tài chính | Xem kết quả, refund nếu có |
| `STOPPED` | Chiến dịch đã dừng | Reason, escrow/refund, lịch sử | Xem quyền hoàn nếu có |

**Public CTA không được tự cấp quyền:** hệ thống phải kiểm tra session, wallet, SIWE link, chain, state, checkpoint, deadline, deployment và action preparation. Có thể show disabled CTA kèm lý do thay vì giấu hoàn toàn.

### 8.2. Review outcomes (khác campaign state)

| Review outcome | Cách hiển thị |
|---|---|
| `MET` | “Resolver kết luận đạt tiêu chí — đang chờ điều kiện phản đối/finalize” |
| `NEEDS_INFORMATION` | “Cần bổ sung bằng chứng”; show request/reason/version deadline |
| `NOT_MET` | “Không đạt tiêu chí”; nêu quyết định và trạng thái dừng theo chain |
| `INCONCLUSIVE` | “Chưa đủ cơ sở kết luận”; không tự coi là `MET` |

### 8.3. State timeline tổng quan

```text
DRAFT → APPROVED → FUNDING
                      ├─ Thiếu goal/hết hạn → STOPPED + refund snapshot
                      └─ Đủ goal → FIRST_REVIEW
                                      ├─ STOP / timeout
                                      └─ ADVANCE_AVAILABLE
                                              └─ organizer claim advance
                                                    → EXECUTING
                                                        → EVIDENCE_REVIEW
                                                            ├─ NEEDS_INFORMATION → SUPPLEMENT_DUE → version mới
                                                            ├─ NOT_MET / timeout → STOPPED
                                                            ├─ INCONCLUSIVE → bổ sung/STOPPED
                                                            └─ MET → CHALLENGE_WINDOW
                                                                        ├─ CASE_OPEN → CONTINUE / RESUBMIT / STOP
                                                                        └─ đủ điều kiện, return unused → stage FINALIZED
                                                                                                       ├─ đợt sau
                                                                                                       └─ COMPLETED

Sau COMPLETED/STOPPED: có thể còn refund chưa claim và return muộn theo policy.
```

### 8.4. Deadline hiển thị

- Funding end, eligibility review end, advance claim end, evidence submit/review end, supplement deadline, challenge end, case response/resolution end, finalize/hard stop.
- UI dùng timestamp/checkpoint từ chain; đồng hồ client có thể làm countdown **tham khảo**, không được mở quyền chỉ vì đồng hồ local còn hạn.
- Ghi deadline chính xác và timezone minh bạch; khi checkpoint cũ phải cảnh báo.

---

## 9. Các luồng tương tác trọng yếu

### 9.1. Flow A — Donate

```text
Campaign Detail (FUNDING)
  ↓ Nhập số USDC
Validate amount > 0, decimals đúng token, amount <= goal còn thiếu tại checkpoint
  ↓
Kiểm tra account session, ví SIWE-linked, chain/deployment
  ↓
Prepare action / kiểm tra canonical checkpoint & preflight
  ↓
ERC-20 approve (nếu allowance thiếu) — KHÔNG phải đã Donate
  ↓
Ký Donate trong wallet
  ↓
Submitted hash → receipt/confirmations → indexer canonical projection
  ↓
UI hiển thị Đã ghi nhận đóng góp
```

**Transaction UX states:** `idle` → `awaiting_wallet` → `submitted` → `confirmed` → `indexed` / `failed`. Có nhánh approve riêng. Nếu user dismiss/reject transaction, không hiển thị là lỗi contract hoặc khoản đóng góp thành công. Nếu receipt có nhưng indexer chưa theo kịp, nói “Giao dịch đã xác nhận, đang đồng bộ dữ liệu” và hỗ trợ retry/reconcile.

**Microcopy:** “Bạn sẽ cần xác nhận tối đa hai giao dịch: cấp quyền chi tiêu USDC (khi cần), sau đó quyên góp. Chỉ giao dịch quyên góp thành công mới được tính vào quỹ.”

### 9.2. Flow B — Bằng chứng và nghiệm thu

```text
Campaign Detail → Execution Timeline → Đợt N
  ↓
Xem tiêu chí cam kết và hồ sơ công khai
  ↓
Xem version, evidenceHash/publicHash và tính toàn vẹn bản công khai
  ↓
Xem báo cáo resolver với criterion-level reasoning
  ↓
Nếu MET: CHALLENGE_WINDOW → donor eligible phản đối nếu còn hạn
  ↓
Nếu có case: xem reason / organizer response / resolution
  ↓
Khi đủ điều kiện: FINALIZED → mở khả năng cấp đợt sau
```

- Không lộ original PII; không suy “hash khớp = bằng chứng đúng sự thật”.
- Bản công khai sai hash/context/campaign/stage/version: cảnh báo lỗi nghiêm trọng và không gắn “đã xác minh”.
- `SUBMIT_EVIDENCE`, review, case và finalize cần được thực hiện bởi actor/authority phù hợp; donor không được vô tình thấy nút reviewer trong public view.
- Challenge window hết hạn thì nút phản đối mới phải bị disable với lý do cụ thể.

### 9.3. Flow C — Refund

```text
Campaign đã refundSnapshotted
  ↓
Public: xem base pool, supplement pool và giải thích
  ↓
Donor đăng nhập + đúng ví đã góp
  ↓
Tải account-linked refund right tại canonical checkpoint
  ↓
Hiển thị base entitlement, base paid/consumed, supplement paid, claimable
  ↓
Wallet claim → receipt → indexed
  ↓
Nếu sau này có return muộn: supplement tăng → có thể claim tiếp
```

**Không hứa** `refund = contribution`, không gán toàn bộ `custody` thành “quỹ hoàn tiền đang rảnh”. Không làm tròn bằng floating point; dùng base units + `bigint` như source.

### 9.4. Flow D — On-chain audit

- Click “Xem lịch sử”: render các event đã index theo thứ tự blockchain.
- Mỗi sự kiện: ngôn ngữ nghiệp vụ, actor nếu public, block, tx hash, thời điểm chain, liên kết record nếu có.
- Chi tiết kỹ thuật mở bằng accordion/drawer.
- Cảnh báo khi indexer không ready, checkpoint không đồng nhất hoặc deployment sai.

---

## 10. Component architecture

### 10.1. Đề xuất cây thư mục

```text
frontend/src/features/explore/
├── components/
│   ├── PublicHeader.tsx
│   ├── CampaignCard.tsx
│   ├── CampaignFilters.tsx
│   ├── FundingProgress.tsx
│   ├── CampaignStatusBadge.tsx
│   ├── ExecutionTimeline.tsx
│   ├── StageCard.tsx
│   ├── EvidenceTimeline.tsx
│   ├── FinancialSummary.tsx
│   ├── IndexerStatusNotice.tsx
│   └── CampaignActionPanel.tsx
├── AdvanceCampaignFeed.tsx
├── AdvanceCampaignDetail.tsx
├── AdvanceRefundPanel.tsx
└── PublicArea.tsx
```

**Đây là target structure**, chưa phải danh mục file hiện tại. Không cần tạo tất cả cùng lúc; tách component khi hữu ích và có owner dữ liệu rõ ràng.

### 10.2. Contract cho các component UI

| Component | Input đề xuất | Trách nhiệm chính | Không được làm |
|---|---|---|---|
| `CampaignCard` | Public list item / normalized view model | Title, state, C/Goal, CTA | Tự bịa org verification/rating |
| `CampaignStatusBadge` | Canonical campaign state | Human-readable label | Đổi semantics của state |
| `FundingProgress` | `contributed`, `goal` | Tỷ lệ gây quỹ | Coi tỷ lệ này là tỷ lệ hoàn thành công việc |
| `ExecutionTimeline` | `stages`, `currentStage`, plan | Từng đợt và trạng thái | Dùng `MET` thay cho finalized |
| `StageCard` | Stage snapshot + criteria | Budget, nhiệm vụ, version | Suy nghiệm thu từ amount đã cấp |
| `EvidenceTimeline` | submissions, records/cases | Version/review/case | Công khai original/PII |
| `FinancialSummary` | workflow/snapshot | C/A/R/F/E và cảnh báo | “Tổng hoàn tiền” = escrow tùy tiện |
| `IndexerStatusNotice` | status/checkpoint | Data freshness và unavailable UX | Che lỗi consistency |
| `CampaignActionPanel` | actor, prepared eligibility, snapshot | Donate/challenge/refund CTA | Quyết định on-chain permission ở client |

### 10.3. Thành phần phải **tái sử dụng**, tránh viết lại logic

- `AdvanceWalletAction.tsx`: wallet flow, SIWE, approval, preflight, receipt/indexed reconciliation.
- `AdvanceCaseActions.tsx`: phản đối/material/response.
- `AdvanceRecord.tsx`: public record/hash.
- `AdvanceRefundPanel.tsx` + `advance-refund.ts`: quyền base/supplement.
- `advance-journey.ts`: state labels và financial invariant/checkpoint helper (có thể refactor presentation wrappers, không thay rule tài chính).

---

## 11. Mapping frontend ↔ API ↔ contract/indexer

### 11.1. API public B đang có

| UI block | Hiện có endpoint/nguồn | Ghi chú |
|---|---|---|
| Explore | `GET /v1/advance/public/campaigns` | Chỉ trả published campaigns qua indexer; title/description/workflow |
| Detail | `GET /v1/advance/public/campaigns/:id` | Trả metadata, plan khi có, snapshot, workflow |
| On-chain events | `GET /v1/advance/public/campaigns/:id/events` | Indexed canonical events |
| Public records | `GET /v1/advance/public/records/:hash` | Report/statement đã disclosed và bound vào canonical event |
| Public evidence manifest/download | API generated `advanceGetPublicManifest`, `advanceDownloadPublic` | Kiểm tra content/hash/context/version trước khi tin |
| Refund theo account | API generated `advanceGetRefunds`, `advanceListRefunds` | Yêu cầu session/account-linked wallet |
| Prepare actions | `POST /v1/advance/campaigns/:id/actions/prepare` | Private, kiểm tra authority/context trước khi ký |

### 11.2. Data contract normalization khuyến nghị

Thêm selector/view-model layer không mutate dữ liệu chain:

```ts
// Minh họa thiết kế type — không phải type đã tồn tại trong repository.
type CampaignPublicView = {
  title: string;
  description: string | null;
  state: AdvanceCampaignState;
  goalUnits: bigint;
  contributedUnits: bigint;
  advancedUnits: bigint;
  returnedUnits: bigint;
  refundedUnits: bigint;
  custodyUnits: bigint;
  currentStageIndex: number;
  stageCount: number;
  finalizedStageCount: number;
  checkpointBlock: bigint;
  chainTimestamp: bigint;
  // Field metadata công khai chỉ optional nếu backend thật có:
  organizationName?: string;
  coverUrl?: string;
};
```

Các trị tiền tính bằng bigint; không sử dụng floating point khi phân bổ refund, chỉ format trên UI.

### 11.3. Field chưa đủ từ feed public hiện tại

`advanceListPublic()` hiện tập trung trả `metadataId`, `campaignId`, `title`, `description`, `workflow`. Muốn hiển thị cover, organization name/status có căn cứ, stage count/progress chi tiết tại card cần cân nhắc:

- Mở rộng DTO **có kiểm soát** từ metadata/plan đã xác minh và public-safe.
- Hoặc chỉ hiển thị trường thật có; placeholders đủ tốt cho MVP.
- Không N+1 fetch toàn bộ detail cho hàng trăm card nếu có thể trả summary từ projection.
- Nếu search/filter chạy client-side trên subset, nói rõ phạm vi; cần backend query khi quy mô dữ liệu lớn.

### 11.4. Data integrity UX

`financialPosition()` trong source kiểm tra **`C + R = A + F + E`**; dữ liệu mismatch phải gây thông báo lỗi và không bật hành động tài chính. FE nên phân biệt:

1. Transaction chưa được gửi.
2. Đã gửi (hash), chưa có receipt.
3. Receipt/confirmations đã thành công.
4. Sự kiện đã được index vào checkpoint canonical.

Không coi bước 2 hoặc HTTP upload là hoàn thành on-chain.

---

## 12. Design system & responsive

### 12.1. Brand palette đề xuất

| Token | Hex | Dùng cho |
|---|---|---|
| `brand.primary` | `#087F68` | Primary CTA, interactive focus, links |
| `text.primary` | `#18343B` | Heading, body trọng tâm |
| `surface.subtle` | `#F6F9F7` | Sections, cards background |
| `status.success` | `#2E946F` | Status success/finalized khi đúng |
| `status.warning` | `#D79635` | Deadline, pending review, stop/caution tùy semantic |

Màu sắc **không** là dấu hiệu trạng thái duy nhất: phải có label/icon/text. Cần đo contrast trước khi triển khai production.

### 12.2. Typography/layout

- Font: ưu tiên **Be Vietnam Pro** hoặc **Inter** với fallback sans-serif.
- Max content width desktop: khoảng `1160–1200px`.
- Grid desktop: 12 cột; Campaign Detail main/sidebar khoảng `8/4` hoặc `7/5` theo kiểm thử thực tế.
- Mobile: thiết kế chính cho 360–390px, vẫn hỗ trợ 320px và zoom lớn.
- Base spacing: 4/8px; card radius ~12–16px; generous whitespace ở public pages.
- Interactive touch target khoảng 44×44px hoặc lớn hơn khi có thể.
- Sticky CTA mobile: có safe-area, không che nội dung, không gây nhảy khi keyboard mở.

### 12.3. Breakpoints (gợi ý, có thể hiệu chỉnh)

| Khổ | Layout |
|---|---|
| `< 640px` | 1 cột; navigation drawer; full-width card; sticky CTA có điều kiện |
| `640–1023px` | 1–2 cột cho Explore tùy không gian; Campaign Detail ưu tiên 1 cột nếu sidebar chật |
| `≥ 1024px` | Explore 3 cột hoặc auto-fit; Campaign Detail 2 cột có action summary sticky giới hạn |

---

## 13. Lỗi, bảo mật, minh bạch và accessibility

### 13.1. Error/edge-state matrix

| Tình huống | Hành vi UI bắt buộc |
|---|---|
| Public API error | Retry, không hiển thị như “không có campaign” |
| Indexer syncing/rebuilding/error | Thông báo checkpoint/freshness; không phán đoán tx đã index |
| Chain/deployment mismatch | Chặn hành động ký, hướng dẫn đổi mạng/xem deployment |
| Chưa đăng nhập | Vẫn đọc campaign; yêu cầu đăng nhập khi action cần |
| Wallet chưa SIWE-linked | Hướng dẫn liên kết đúng wallet vào account |
| Từ chối popup | Quay lại trước bước ký; không hứa transaction thành công |
| Approve đã thành công, Donate chưa gửi | “Đã cấp quyền token; chưa quyên góp” |
| Receipt xong, indexer lag | “Đã xác nhận trên chain, đang đồng bộ trên ứng dụng” |
| Amount quá goal còn thiếu | Validation và giải thích giới hạn funding |
| Funding hết hạn | Không mở donate mới, cập nhật state/checkpoint |
| Evidence missing/hash mismatch | Cảnh báo kiểm chứng; không đánh dấu verified |
| Donor không đủ quyền phản đối | Disabled action + cụ thể reason |
| Challenge window đã đóng | Giải thích deadline và quyền đã kết thúc |
| Case đang mở | Hiển thị cấp tiếp bị khóa; theo dõi case |
| `STOPPED` | Không có Donate; xem refund và lý do dừng |
| Refund transfer failure | Giữ quyền, retry khi hợp lệ và kiểm tra projection |
| Return muộn | Supplement tăng; donor có thể claim thêm nếu có entitlement |
| Dữ liệu kế toán không cân | Chặn/đưa vào error state; yêu cầu đối chiếu |

### 13.2. PII & privacy

- Evidence original là private, redacted là public object riêng; không render pre-signed URL/secret hoặc bản gốc chứa thông tin cá nhân trên public UI.
- Tránh logging PII/secret ở frontend console, error tracking hoặc URL.
- Donor refund quyền cá nhân lấy qua account-linked API, không đưa danh sách entitlement riêng tư lên public.

### 13.3. Accessibility

- Semantic heading levels hợp lý: `h1` title duy nhất, `h2` các section, `h3` từng stage.
- Status/live regions chỉ announce thay đổi cần thiết, tránh spam mỗi polling interval.
- Keyboard navigation tốt cho accordion, tabs, modal wallet explanation; focus visible.
- Không phụ thuộc vào color-only status, bar-only progress. Luôn hiển thị số và label.
- Deadline và số tiền có định dạng dễ đọc; tương phản màu đạt mức phù hợp với WCAG 2.2.
- Retry/Error rõ ràng, không xóa form input khi giao dịch bị từ chối.

### 13.4. Trust disclosure

Mọi trạng thái “đã xác minh tổ chức”, “đã đạt”, “đã nghiệm thu”, “đã ghi nhận quyên góp” phải có **nguồn và cấp độ xác nhận** phù hợp. Cần làm rõ sự khác nhau giữa:

- Tổ chức đã được staff kiểm tra hồ sơ.
- Campaign/plan đã được resolver chấp thuận.
- Evidence bytes/hash đúng commitment.
- Nội dung evidence được resolver đánh giá đạt tiêu chí.
- Stage được finalized trên chain.

---

## 14. Kế hoạch refactor và tiêu chí nghiệm thu

### 14.1. Các giai đoạn theo dependency

**P0 — Explore:**

1. Tách public top navbar khỏi sidebar nội bộ của `PublicArea`.
2. Thực hiện `CampaignCard`, status mapping, funding progress và responsive grid.
3. Empty/loading/error/indexer states.
4. Giữ route và API B hiện tại, không thay quyền.

**P0 — Campaign Detail / FUNDING:**

1. Hero + story + summary và `FundingProgress`.
2. Gắn Donate Panel hiện có vào layout mới; không chạm logic `AdvanceWalletAction` ngoài mục đích UI adapter.
3. Test đúng state/chain/amount/receipt/indexer lag.

**P0 — Execution & Verification:**

1. `ExecutionTimeline`, `StageCard`, tiêu chí nghiệm thu.
2. `EvidenceTimeline` cho version/report/case.
3. Giữ public manifest/hash/storage checks và các action gate đã có.

**P0 — Finance & Refund:**

1. `FinancialSummary` C/A/R/F/E và explanation.
2. `AdvanceRefundPanel` trong layout rõ ràng, claimable personal sau auth.
3. Phân biệt base vs supplement; test return muộn/retry/zero-base.

**P1 — Polish/Research:**

1. Cover/org metadata public-safe nếu thực sự cần.
2. Search/filter/sort backend nếu có đủ campaign và UX evidence.
3. Accessibility/usability study, performance optimization dựa trên đo đạc.

### 14.2. Acceptance criteria cho UI

- [ ] Không thể Donate khi state khác `FUNDING`, hết hạn hoặc amount vượt phần goal còn thiếu.
- [ ] Thanh funding 100% không gán nhãn “campaign completed”.
- [ ] `advanced` và `FINALIZED` không trộn thành một chỉ số.
- [ ] Evidence `NEEDS_INFORMATION` không hiển thị là đã nghiệm thu.
- [ ] Version trước vẫn xem được; linked hash/document/record đúng campaign-stage-version.
- [ ] Case đang mở có cảnh báo chặn cấp tiếp; hết challenge window không mở case mới.
- [ ] Refund tính đúng theo linked wallet, base/supplement, không hứa 100% contribution.
- [ ] Return muộn hiển thị claimable supplement mới khi backend/indexer đã xác nhận.
- [ ] Receipt vs indexed state có UI riêng và xử lý reload/đổi ví.
- [ ] Indexer lỗi, RPC mismatch, stale data hoặc financial mismatch đều không được làm UI khẳng định sai.
- [ ] Viewport mobile 320/360/390px không overflow, CTA không che content.
- [ ] Các hành động keyboard, status, error được gắn semantic/accessible label.
- [ ] Giữ regression baseline A và isolation B khi thay public presentation.

### 14.3. Không thay tài chính do UI

Refactor UI/DTO không được sửa B-D01–B-D10, accounting, stage conditions, authority, evidence freeze, refund logic hay deployment binding. Nếu muốn thay quyền/tiền do yêu cầu UX mới, lập đặc tả mới và duyệt riêng.

---

## 15. Giá trị nghiên cứu khoa học và UX testing

**Câu hỏi nghiên cứu phụ trợ có thể kiểm chứng:**

> Một giao diện phân tách Funding, Execution, Verification và Financial Transparency có giúp donor hiểu đúng rủi ro và trạng thái của chiến dịch blockchain staged funding hơn cách hiển thị thông tin dày đặc/technical-first hay không?

Đề xuất usability study **bổ trợ** cho nghiên cứu cơ chế xác minh (không thay thế core technical novelty):

- **Nhiệm vụ 1:** xác định một campaign đã đạt goal nhưng chưa nghiệm thu đợt nào.
- **Nhiệm vụ 2:** trả lời “đã cấp bao nhiêu tiền, còn trong escrow bao nhiêu?”.
- **Nhiệm vụ 3:** tìm hồ sơ v2 và nhận biết v1 từng bị yêu cầu bổ sung.
- **Nhiệm vụ 4:** xác định donor có thể phản đối kết luận nào và deadline.
- **Nhiệm vụ 5:** nhận biết refund không nhất thiết bằng toàn bộ khoản đã quyên góp.

**Chỉ số:** task success rate, thời gian thực hiện, tỷ lệ hiểu sai “funded vs completed”, tỷ lệ phân biệt advance vs accepted, số lỗi quyên góp, SUS/SEQ hoặc chỉ số tương đương. Cần participant thật, kịch bản, dữ liệu mẫu có đáp án, baseline UI và quy trình quan sát; không suy kết quả nghiên cứu từ test kỹ thuật/fixture synthetic.

---

## 16. Các quyết định, ranh giới và câu hỏi còn mở

### 16.1. Đề xuất chốt cho bản thiết kế

- **Chọn Hybrid**: hình ảnh/câu chuyện ấm áp + dashboard minh bạch ở lớp sâu.
- **Public Top Navbar** thay sidebar nội bộ trên Explore/Detail.
- **Campaign Detail 2 cột desktop / 1 cột mobile**.
- **ExecutionTimeline và EvidenceTimeline** là thành phần nhận diện chủ đạo.
- **Donate, verify, refund, on-chain history** bám state và action hiện có.
- **Không đưa multi-plan alternative model** vào pilot B.
- **Không rebuild Web3 financial logic** chỉ để làm UI đẹp.

### 16.2. Các dữ liệu/đề xuất cần kiểm tra khi code

- Public organization name và verification badge có field/authority đủ rõ chưa?
- Ảnh cover được nhập/lưu như thế nào, policy file public và moderation ra sao?
- Feed có cần stageCount/finalizedStages server-side hay detail-only là đủ cho MVP?
- Search/filter có đủ data volume để cần backend paging/filter hay không?
- Sticky CTA đã làm rõ “Donate” vs “View refund” theo role/state chưa?
- Trường hợp checkpoint cũ và link wallet mismatch có đường phục hồi rõ chưa?

Không câu hỏi nào ở trên cho phép tự chốt quy tắc on-chain mới.

---

## 17. Nguồn trong repository

**Project & rules:**

- [Repository — Lunamoon-dot/FundTogether](https://github.com/Lunamoon-dot/FundTogether)
- [README.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/README.md)
- [GOAL.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/GOAL.md)
- [docs/PROJECT_OVERVIEW.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/docs/PROJECT_OVERVIEW.md)
- [docs/PROJECT_PROGRESS.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/docs/PROJECT_PROGRESS.md)
- [docs/research-direction.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/docs/research-direction.md)
- [docs/workflow-b-spec.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/docs/workflow-b-spec.md)
- [docs/workflow-b-financial-rules.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/docs/workflow-b-financial-rules.md)
- [docs/workflow-b-acceptance.md](https://github.com/Lunamoon-dot/FundTogether/blob/main/docs/workflow-b-acceptance.md)

**Frontend:**

- [frontend/src/app/App.tsx](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/app/App.tsx)
- [frontend/src/features/explore/PublicArea.tsx](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/explore/PublicArea.tsx)
- [frontend/src/features/explore/PublicArea.css](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/explore/PublicArea.css)
- [frontend/src/features/explore/PublicCampaigns.tsx](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/explore/PublicCampaigns.tsx)
- [frontend/src/features/explore/AdvanceCampaignDetail.tsx](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/explore/AdvanceCampaignDetail.tsx)
- [frontend/src/features/explore/AdvanceRefundPanel.tsx](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/explore/AdvanceRefundPanel.tsx)
- [frontend/src/features/campaigns/advance/AdvanceWalletAction.tsx](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/campaigns/advance/AdvanceWalletAction.tsx)
- [frontend/src/features/campaigns/advance/AdvanceCaseActions.tsx](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/campaigns/advance/AdvanceCaseActions.tsx)
- [frontend/src/features/campaigns/advance/advance-journey.ts](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/campaigns/advance/advance-journey.ts)
- [frontend/src/features/explore/advance-refund.ts](https://github.com/Lunamoon-dot/FundTogether/blob/main/frontend/src/features/explore/advance-refund.ts)

**Backend / workflow:**

- [backend/src/advance/advance-public.controller.ts](https://github.com/Lunamoon-dot/FundTogether/blob/main/backend/src/advance/advance-public.controller.ts)
- [backend/src/advance/advance-workflow.service.ts](https://github.com/Lunamoon-dot/FundTogether/blob/main/backend/src/advance/advance-workflow.service.ts)
- [backend/src/advance/advance.types.ts](https://github.com/Lunamoon-dot/FundTogether/blob/main/backend/src/advance/advance.types.ts)
- [backend/src/advance/advance-workflow.schema.ts](https://github.com/Lunamoon-dot/FundTogether/blob/main/backend/src/advance/advance-workflow.schema.ts)

---

**Cách sử dụng tài liệu:**

1. Dùng các mục 1–9 để chốt UX và wireframe.
2. Dùng mục 10–11 để chia task frontend/backend và mapping data.
3. Dùng mục 12–14 làm design tokens, error/edge cases và acceptance checklist.
4. Dùng mục 15 để lên kế hoạch đánh giá UX có dữ liệu người dùng thật.
5. Đối chiếu `docs/workflow-b-spec.md` và source hiện tại trước khi sửa transaction, quyền hoặc trạng thái.

**Kết luận:** FundTogether nên trông thân thiện như một nền tảng từ thiện nhưng vận hành minh bạch như một hệ thống tài chính có thể kiểm chứng. Giao diện phải phản ánh đúng Workflow B: **đủ vốn ≠ đã cấp vốn; đã cấp vốn ≠ đã nghiệm thu; đã nghiệm thu đợt ≠ campaign hoàn tất; campaign kết thúc ≠ nghĩa vụ refund tự động biến mất.**
