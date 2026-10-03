# FundTogether — Giải thích Mốc 9: Reputation Layer

> Process đặt reputation sau MVP. Các chỉ số ở đây là dữ liệu mô tả lịch sử, chưa phải score hoặc verdict đã được chốt. Reputation không chứng minh chắc chắn người đó sẽ hành xử thế nào trong tương lai.

## 1. Reputation dùng để làm gì?

Reputation layer tóm tắt lịch sử hoạt động đã được hệ thống ghi nhận, giúp người xem tìm context trước khi quyết định đóng góp.

Nó có thể hiển thị: campaign hoàn tất, milestone accepted, dispute, challenge upheld, tổng tiền quản lý, tuổi tài khoản, badge.

Đây không phải cơ chế tiền. Không nên để reputation block campaign lifecycle MVP.

## 2. Vì sao chờ sau MVP?

Score chỉ đáng diễn giải khi nguồn event/state ổn định. Nếu cách định nghĩa “completed”, “verified”, “misconduct” đổi trong lúc xây, score cũ khó so sánh hoặc phải tính lại.

Cần dữ liệu lịch sử thật để biết tín hiệu nào hữu ích; giả lập score trước khi có protocol có thể tạo cảm giác tin cậy sai.

## 3. Event nguồn ở đâu?

```text
Contract event/state
    ↓
Indexer xác nhận/chuẩn hóa
    ↓
Reputation projection/view
    ↓
API read-only
    ↓
Profile campaign/Organizer
```

Database có thể lưu snapshot/cache để truy vấn nhanh, nhưng phải biết sự kiện gốc nào tạo nên số liệu. Sửa nhãn trong database không sửa lịch sử chain.

Thông tin như “tài khoản tạo ngày nào” là Web2 account age; nó khác thời gian ví tồn tại và khác thời gian Organizer hoạt động trên protocol. Ghi nhãn chính xác.

## 4. Định nghĩa metric trước khi tính

| Metric | Câu hỏi phải chốt |
|---|---|
| Campaign completed | Chỉ trạng thái contract COMPLETED hay có thêm tiêu chí ngoài chain? |
| Milestone verified | Theo event/decision nào; “verified” nghĩa protocol accepted hay verifier attested? |
| Dispute count | Dispute mở hay dispute cuối cùng? Dispute rút lại tính sao? |
| Upheld challenge | Kết quả cuối nào được tính là upheld? |
| Total funds managed | Gross donation, net release hay gồm bond? Tính nhiều token thế nào? |
| Account age | Tính từ đăng ký, wallet link hay campaign đầu tiên? |
| Badge | Điều kiện cố định, ngày cấp và cách thu hồi? |

Không cộng tổng token của các asset khác nhau thành một số chung nếu chưa chốt cách quy đổi và thời điểm định giá.

## 5. Ví dụ metric dễ hiểu sai

Lan có 2 campaign hoàn tất, 1 campaign canceled vì bão, 1 challenge bị upheld do hóa đơn sai.

Profile có thể ghi riêng:

```text
Completed: 2
Canceled after external failure: 1
Challenges upheld: 1
```

Nếu chỉ hiển thị `Campaign success 67%`, người xem không biết mẫu số gồm campaign nào, thời điểm cập nhật và trạng thái hủy nói lên điều gì.

Profile cần link tới từng record/campaign để người dùng tự xem nguồn, đồng thời nêu sample size. Không gộp failure khách quan thành misconduct.

## 6. Identity, nhiều ví và Sybil

Một người có thể kiểm soát nhiều wallet hoặc tạo nhiều tài khoản. Một địa chỉ không tự là danh tính pháp lý; việc gộp địa chỉ đòi hỏi bằng chứng/liên kết và privacy policy.

MVP có thể trình bày reputation per wallet/campaign actor như nguồn đã xác nhận, không tuyên bố đây là lịch sử đầy đủ của một cá nhân.

Không dùng account age để cam kết danh tính/uy tín ngoài đời.

## 7. Score hay metrics tách rời?

Process liệt kê thống kê và badge, nhưng không yêu cầu dynamic scoring.

Giữ các metric tách biệt trước giúp đọc được bằng chứng và tránh tạo một con số có trọng số tùy tiện. Nếu nghiên cứu score sau này, công bố:

- Công thức/weight và lý do.
- Nguồn dữ liệu, thời điểm snapshot, giới hạn.
- Tác động của campaign size/duration.
- Cách xử lý dispute đang mở và dữ liệu sai.
- Khả năng sửa sai/appeal.

## 8. Làm ở đâu?

- Contract: phát event tài chính/state cần làm nguồn lịch sử.
- Indexer: chuyển events thành record history.
- Backend/database: endpoint profile, cache và pagination.
- Frontend: hiển thị metric kèm giải nghĩa, trạng thái pending/final.
- Analytics/research: so sánh metric với outcomes; không dùng nhãn tự khai làm ground truth.

Không cần lưu “reputation score” on-chain nếu nó chỉ là projection có thể tái tính và chưa có yêu cầu protocol buộc phải dùng score để quyền/tiền thay đổi.

### Ví dụ lần theo một metric từ event tới profile

Giả sử một milestone được accepted trên contract tại block 1200. Contract phát event kết quả; indexer đọc event, kiểm tra campaign/milestone và lưu record nguồn với `chainId + txHash + logIndex` làm định danh chống xử lý trùng. Sau confirmation policy của dự án, projection cập nhật `acceptedMilestoneCount` cho đúng Organizer. API profile trả số đếm cùng thời điểm/block dữ liệu; frontend ghi rõ đây là “milestones accepted” và cho bấm sang campaign tương ứng.

Thực tế triển khai thường tách thành: mapping/worker indexer để đọc event; bảng history chứa record nguồn; bảng projection hoặc query tổng hợp để đọc nhanh; endpoint GET profile; component frontend. Tên file/bảng/endpoint phụ thuộc repository, nên tìm convention trước khi tạo mới. Không cập nhật metric trực tiếp từ nút UI sau khi Organizer bấm submit: nút chỉ biết ý định/transaction, chưa biết kết quả cuối.

Để kiểm tra, lấy một tx đã thành công và đối chiếu event trên explorer/RPC, record history trong DB, số API và số trên profile. Chạy lại indexer từ checkpoint trước event: kết quả phải vẫn là một milestone, không tăng thành hai. Nếu xảy ra reorg theo policy indexer, projection phải được tính lại từ history canonical. Khi API chậm hơn chain, hiển thị mốc dữ liệu gần nhất thay vì giả vờ số liệu real-time.

## 9. Kiểm tra trước khi ra mắt

- Rebuild projection từ history cho ra cùng metric.
- Dispute open không bị tính như upheld.
- Honest failure không bị gắn fraud.
- Contribution/bond không bị cộng lẫn trong tổng funds.
- Campaign duplicate/migrated không bị đếm hai lần.
- Người dùng hiểu thời điểm và phạm vi của mỗi con số.
- Có đường sửa projection sai mà giữ trace nguồn.

## 10. Đầu ra Mốc 9

Metric dictionary, event source mapping, API/profile design, disclosure/limitation và test tái tạo số liệu. Badge chỉ thêm khi điều kiện và ý nghĩa rõ.

**Reputation là bản tóm tắt lịch sử có giới hạn, không thay thế kiểm tra campaign cụ thể hay bảo đảm hành vi tương lai.**

Nguồn: [Process — Mốc 9](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Threat Model — Reputation Layer](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

## MVP baseline alignment

Reputation không nằm trong critical path của MVP. Giai đoạn đầu dùng off-chain projection từ event đã index; `ReputationRegistry` on-chain và badge/scoring nâng cao chỉ được xem xét sau khi lifecycle và dữ liệu lịch sử đáng tin cậy.


## Rà soát mốc và hướng Arc — 2026-10-03

Vẫn post-MVP. Dùng protocol events và chainId+contract+campaignId; không tính USDC Transfer hoặc biến động ví sau gas thành donation/reputation. Arc finality không chứng minh kết quả từ thiện; địa chỉ ví không tự chứng minh identity.

Arc testnet là hướng tích hợp ưu tiên, chưa deploy/kiểm chứng runtime. Xem
[bảng rà 10 mốc](../../FundTogether_Milestone_Review_2026-10-03.md) và
[Arc sources và checklist](../../FundTogether_Arc_Evaluation_v0.1.md).
Các yêu cầu Arc ở đây là TODO, không phải kết quả test/deploy.
