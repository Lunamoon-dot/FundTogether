# FundTogether glossary

> **Current vocabulary:** The protocol reset on 2026-10-20 replaces Resolver
> authority with permissionless Judge courts. Resolver terms below are
> historical unless explicitly marked otherwise.

| Thuật ngữ | Nghĩa và cách dùng |
| --- | --- |
| FundTogether | Sản phẩm permissionless reward-crowdfunding cho comic/artbook số. |
| Campaign | Một dự án comic hoặc artbook độc lập với terms, escrow và milestones. |
| Reward Crowdfunding | Mô hình tài trợ có quyền lợi PDF; không phải tên một sản phẩm UI song song. |
| Creator | Ví tạo campaign, freeze terms và nộp evidence cho milestone. |
| Backer | Ví pledge MockUSDC và nhận entitlement từ event canonical. |
| Judge | Ví lock stake, được gán vào một court và cast một vote cho case. |
| Court | Nhóm Judge xử lý một review case; court tham chiếu có 3 người và quorum 2/3. |
| Eligibility snapshot | Snapshot đóng băng Judge đủ điều kiện, case stake, pool, block/time và randomness trước assignment. |
| Base review | Vòng review đầu tiên của một case trước appeal. |
| Appeal Pool | Tập Judge mới, không trùng Base Pool, dùng cho appeal round. |
| Commit–reveal | Cơ chế commit hash của vote trước, sau đó reveal vote và salt trước deadline. |
| Provisional ruling | Kết quả sau aggregate trước khi appeal window đóng. |
| FINAL_PASS | Substantive PASS đã hết appeal và đủ điều kiện tiếp tục payout/challenge policy. |
| VERDICT_FAIL | Substantive FAIL đã hết appeal; có thể mở correction hữu hạn. |
| PROTOCOL_FAIL | Không đạt được substantive ruling sau retry/timeout; không phải kết luận Creator sai. |
| Correction | Revision evidence có case identity mới, không đổi acceptance criteria hoặc payout amount. |
| Coherence slash | Slash theo vote trái substantive final ruling khi policy đã cho phép; không tự chứng minh misconduct. |
| Refund pool | Escrow còn lại được chụp snapshot để phân phối refund, đặc biệt sau partial payout. |
| Stake | Khoản tài sản bị lock để tham gia review; không tự chứng minh Judge đúng. |
| Case | Một quyết định protocol cho publication, milestone, completion hoặc challenge. |
| Commitment | Snapshot/hash bất biến của terms, deliverable và evidence được review. |
| Milestone | Giai đoạn có deliverable, evidence commitment và budget payout cố định. |
| Challenge window | Khoảng thời gian permissionless để mở challenge trước payout. |
| Entitlement | Quyền phiên bản hóa sinh từ pledge event canonical đã index; receipt đơn lẻ chưa đủ. |
| Resolver | Quyền review tập trung của pre-reset runtime; không phải authority của protocol mới. |
| Community Review | Bề mặt advisory của pre-reset runtime; protocol mới dùng Judge case canonical. |
| Historical campaign | Record hoặc tài liệu lịch sử được giữ để đối soát; không phải Campaign hiện hành. |
| historical | Namespace dành cho dữ liệu/ABI/indexer lịch sử; không dùng trong wire route mới. |

Evidence hash chỉ chứng minh bytes được review không bị thay đổi. Nó không chứng
minh tác giả, chất lượng, tính hợp pháp hoặc sự thật ngoài đời.

Không dùng “Reward” để đặt tên component, folder, schema, env hoặc deployment
của sản phẩm hiện hành. Trong UI dùng “quyền lợi” cho PDF; trong code dùng
benefit/entitlement tùy ý nghĩa dữ liệu.
