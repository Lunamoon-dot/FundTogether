# FundTogether — Dispute Policy và hội đồng resolver post-MVP

> Cập nhật: 2026-10-04
> Nguồn: Lựa chọn 2/3 và mô hình ResolverManager trong nội dung người dùng gửi
> Trạng thái: Quyết định mới nhất 2026-10-04 hoãn 2/3 đến post-MVP. MVP dùng resolver được cấp quyền; policy tài chính tranh chấp chưa chốt.

## 1. Lựa chọn thiết kế

Xác nhận workflow 2026-10-04: resolver thuộc MVP, có thể là nhân viên nền tảng
được cấp quyền. Campaign luôn qua hệ thống kiểm tra hồ sơ/toàn vẹn/tiêu chí và
organizer sửa trước khi nộp cho resolver duyệt; đạt xác thực mới được publish
khi đủ bond và điều kiện contract. Evidence/challenge đều qua kiểm tra, giải
trình và kiểm tra lại; chỉ vụ việc vẫn chưa giải quyết hoặc cần escalation theo
deadline mới tới resolver phân xử.

Hướng hội đồng 2/3 trong tài liệu này dành cho phân xử tranh chấp được chuyển lên,
không áp mặc định vào duyệt campaign và không bỏ các lớp kiểm tra trước đó.
Quyết định mới nhất hoãn threshold 2/3 đến post-MVP. Hai nhiệm vụ có
checklist/quyền/kết quả riêng trong cùng vai trò resolver được cấp quyền ở MVP.

Thiết kế post-MVP dùng hội đồng có ba resolver được xác minh danh tính và xét xung đột lợi ích.
Cần hai phiếu cùng verdict cho cùng case/version/round để hoàn tất phân xử.
Ghi từng phiếu và reasonHash để truy vết. Đây là threshold voting cho verdict;
không dùng một giao dịch Safe làm toàn bộ hồ sơ phân xử.

```text
Case + evidence version + resolution round + policy version
                         ↓
             R1          R2          R3
                         ↓
       Hai phiếu cùng verdict → kết luận một lần
                         ↓
    Contract áp quy tắc tài chính đã định nghĩa trước
```

Không thêm dynamic registry, marketplace, staking, resolver token, reputation
on-chain, random selection hoặc hệ thống jury lớn vào MVP.
Safe có thể là lựa chọn khác cho quản trị sau này; chưa thêm phụ thuộc Safe.

## 2. Giới hạn hiệu quả

Hai resolver hợp lệ cùng đồng ý có thể hoàn tất dù người thứ ba offline hoặc
bỏ phiếu khác. Nếu hai người còn lại bất đồng, hệ thống vẫn cần timeout.
Ba phiếu khác verdict không tạo kết luận. Hai người thông đồng có thể kiểm soát
quyết định; ba địa chỉ ví không chứng minh ba người độc lập.

Trong mô hình hai kết quả, với ba đánh giá độc lập có cùng xác suất đúng p:

```text
P(majority correct) = 3p²(1-p) + p³ = 3p² - 2p³
p = 0.6 -> 0.648
p = 0.7 -> 0.784
p = 0.8 -> 0.896
```

Đây là ví dụ toán học theo giả định, không phải kết quả đo FundTogether.
Verdict thực tế có nhiều loại: các lỗi khác nhau có thể không đạt hai phiếu
cùng kết luận, nên không áp nguyên xi mô hình nhị phân vào cơ chế đa verdict.

Mô tả nghiên cứu phù hợp: hội đồng permissioned 2/3 giảm quyền quyết định đơn
phương và rủi ro từ một resolver. Không khẳng định unbiased hoặc trustless.

## 3. Dispute Policy — bảng dự thảo

| Tình huống | Verdict dự thảo | Điều kiện cần kiểm tra |
|---|---|---|
| Thiếu hóa đơn bắt buộc | RESUBMIT | Thiếu trường/tài liệu thật sự bắt buộc theo tiêu chí đã khóa |
| Sai lệch số tiền có thể giải thích/sửa | RESUBMIT | Chưa đủ chứng cứ cố tình gian lận; lưu giải trình |
| Không thể tiếp tục vì lý do khách quan | CANCEL_WITHOUT_FAULT | Có lý do và bằng chứng; không chỉ dựa vào lời tự khai |
| Không nộp evidence sau deadline thực hiện | DEFAULT | Deadline đã được cam kết; phân biệt sự cố/ngoại lệ với vi phạm nghĩa vụ |
| Cố tình dùng cùng hóa đơn để nhận thanh toán hai lần | MISCONDUCT | Chứng minh lần dùng trước và ý định/claim trùng; cùng file không tự chứng minh gian lận |
| Evidence giả được xác nhận | MISCONDUCT | Ghi nguồn xác minh và lập luận; điểm AI nghi ngờ không đủ |
| Phản đối không có căn cứ sau đánh giá | PASS | Evidence đáp ứng tiêu chí và lập luận phản đối đã được xử lý |

DEFAULT mô tả không hoàn thành nghĩa vụ sau deadline; không tự đồng nghĩa gian lận.
Chưa duyệt mức slash cho DEFAULT/MISCONDUCT hoặc tự động phạt vì không phản hồi.
Thời hạn nộp lại, số vòng, kháng nghị và policy precedence cần chốt.
Phiên bản policy áp dụng phải cố định trước khi donor đóng góp; không đổi hồi tố
rulebook cho campaign đang chạy hoặc case đã mở.

## 4. Ràng buộc ResolverManager

Giao diện trong bài gửi là ý tưởng. disputeId phải gắn được tới đầy đủ ngữ cảnh;
evidenceVersion đơn lẻ chưa đủ khi có nhiều response hoặc resolution round.

```text
Context:
  campaignId, milestoneId, disputeId
  evidenceVersion / evidenceHash
  responseVersion / responseHash
  resolutionRound, policyVersion

Vote:
  resolver, verdict, reasonHash, votedAt
```

- Chỉ thành viên hợp lệ của hội đồng case được vote; ba địa chỉ phải khác nhau,
  khác zero. Danh tính và quan hệ tổ chức vẫn phải kiểm tra off-chain.
- Đóng băng thành viên cho case; thay người hoặc mở vòng mới cần quy tắc riêng.
  Nếu ba người cố định không đủ điều kiện độc lập, không được bỏ qua conflict check.
- Một resolver chỉ vote một lần mỗi case/round; không dùng hai phiếu từ cùng ví.
- Đếm theo cùng verdict và toàn bộ context; không dùng tổng số phiếu làm quorum.
- Phiếu của evidence v3 không áp dụng cho v4. Giữ lịch sử cũ để audit.
- reasonHash bắt buộc và có hồ sơ off-chain; hai người có thể có lý do khác nhau
  nhưng phải cùng verdict/context để đạt ngưỡng.
- Finalize một lần; vote sau kết luận, quá hạn hoặc sai vòng bị từ chối.
- Ngữ cảnh được ràng buộc bởi contract; nếu sau này dùng chữ ký off-chain phải
  thêm domain/chain/contract binding và primitive chuẩn, không tự tạo mật mã.
- ResolverManager ghi kết luận, không nhận quyền gọi tùy ý hoặc chuyển escrow.
  FundTogether kiểm tra nguồn kết luận và áp outcome đã định nghĩa. Lỗi thực thi
  tài chính không được để hệ thống đánh dấu hoàn tất một nửa; thiết kế retry phải rõ.
- Emit event với case/version/round, voter/verdict/reasonHash và kết luận cuối;
  indexer xử lý idempotent, database không thay thế quyết định chain.

## 5. Các quyết định vẫn còn mở

Quyền verifier đã được người dùng chốt trong [Verifier Specification v0.1](./FundTogether_Verifier_Specification_v0.1.md).
MVP dùng cùng VERIFIER_ROLE cho ba bước; chỉ kiểm tra điều kiện/lỗi khách quan,
không phán quyết dispute hoặc áp hậu quả tài chính. Việc cấp quyền vẫn cần xác định.

1. Ai có quyền mở/escalate case; admission verifier được xác thực như thế nào?
2. Deadline screening/response/re-verify/voting và fallback khi không đạt 2 phiếu.
3. Chính sách kháng nghị, giới hạn resubmit và cách xử lý resolver có conflict/offline.
4. Hệ quả tiền cho từng verdict: pool refund, slash, bond return, rounding và retry.

Chọn 2/3 chưa giải quyết các điểm trên. Chưa triển khai ResolverManager hay nối
verdict với giải ngân trong contract. Tài liệu này bổ sung
[thiết kế verification/dispute](./FundTogether_Verification_and_Dispute_Design_2026-10-03.md).
