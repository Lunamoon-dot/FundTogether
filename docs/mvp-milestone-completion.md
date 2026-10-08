# Hoàn tất milestone trong MVP

> Ngày: 2026-10-05
> Trạng thái policy: APPROVED — người dùng chọn A: MVP tối thiểu, không slash.
> Đã xác nhận từ người dùng: verifier riêng và hội đồng 2/3 thuộc post-MVP.
> Cập nhật 2026-10-06: contract, BE/storage/indexer/FE đã nối; test tích hợp trên Anvil riêng 9545.
> Cập nhật 2026-10-07: người dùng cho phép bỏ campaign/chain test, giữ tài khoản và tổ chức. Ứng dụng 8545 đã deploy MVP mới; chưa nghiệm thu popup MetaMask trên deployment này. Các mô tả prototype phía dưới là lịch sử.

**Cập nhật mục 4:** [Financial recovery](./financial-recovery.md) tách bond thành
credit organizer tự claim; snapshot refund không gọi chuyển bond. Source mới có
deployment ID và counter dust; prototype giữ nguyên.

## 1. Deployment prototype hiện tại và điểm chưa nối được

| Bước | Code hiện tại | Cần thay đổi cho MVP |
|---|---|---|
| Nộp bằng chứng | Organizer ký `submitEvidence`; bản hiện tại vào `EVIDENCE_PENDING` | Gắn gói donor đọc được và version/hash đã chốt |
| Tiếp nhận | Admin chỉ định ví có `VERIFIER_ROLE`; ví đó ký `verifySubmission` | Resolver hiện có trực tiếp tiếp nhận; không thêm actor/dashboard verifier |
| Cửa sổ donor | `verifySubmission` bắt đầu đúng 72 giờ trên chain | Giữ cửa sổ bắt đầu từ giao dịch tiếp nhận, không từ upload/freeze |
| Phản đối | Donor đã góp ký `openChallenge`, vào `CHALLENGED` | Lưu case/version, chặn giải ngân và có deadline/đường thoát |
| Giải ngân | Bất kỳ ví nào ký `settleMilestone` sau review nếu không bị phản đối | Giữ số tiền/người nhận cố định; bổ sung guard cho case đã xử lý |
| Thoát phản đối | Chưa có | Resolver ra kết quả hữu hạn; permissionless fallback khi quá hạn |

Ẩn nút không sửa được quyền gọi trực tiếp contract. Deployment hiện tại vẫn có
thể mắc ở `CHALLENGED`; không mở tiếp nhận/nộp/phản đối/giải ngân trong giao diện
trước khi đường thoát mới được triển khai và kiểm tra cùng nhau.

## 2. Người thực hiện — đã chốt

- **Organizer:** chuẩn bị, chốt và ký nộp bằng chứng; trả lời phản đối; ký bản
  sửa mới nếu được yêu cầu. Không tự tiếp nhận hồ sơ hay xử lý phản đối của mình.
- **Resolver hiện có:** kiểm tra hồ sơ sau các kiểm tra hệ thống; tiếp nhận hoặc
  yêu cầu sửa; xem phản đối, giải trình và đối chiếu lại tiêu chí; ra kết quả.
  Đây là nhân sự được nền tảng cấp quyền, không phải quy trình verifier độc lập.
- **Donor:** đọc hồ sơ được công bố; chỉ ví đã đóng góp vào chính campaign mới
  ký phản đối đúng milestone/version trong cửa sổ review.
- **Bất kỳ ví:** thực thi chốt quá hạn hoặc giải ngân khi contract đã đủ điều kiện.
  Người thực thi không quyết định sự thật, số tiền, địa chỉ nhận hay tiền thưởng.

App cần `RESOLVER` để vào màn xử lý. Ký quyết định cần đúng ví resolver được
contract quy định và liên kết qua SIWE. Cấp role trong DB không tạo quyền on-chain.
Admin không được đổi verdict, budget, recipient hay bypass một case đang giữ tiền.

**Xung đột lợi ích:** resolver không là organizer/đại diện hay thành viên tổ chức
của campaign, không dùng ví đã đóng góp để tiếp nhận hoặc xử lý campaign đó.
Source `FundTogetherMvp` chặn organizer và ví có contribution; backend kiểm tra
creator/organizer, membership và contributions của các ví liên kết trước khi
cấp kế hoạch ký evidence/dispute. Hai lớp không chứng minh mọi quan hệ ngoài đời.
Resolver tạm làm cả tiếp nhận và xử lý phản đối trong MVP; đây là điểm tin cậy
đơn phương được công khai. Tách người, committee và kháng nghị thuộc post-MVP.
Resolver vắng mặt/xung đột không tạo quyền cho ví khác tự phê duyệt.

## 3. Hồ sơ để donor thực sự có thể phản đối

Hash on-chain không đủ để donor đánh giá. Trước khi mở review, phải có gói đọc
được với báo cáo từng tiêu chí đã khóa, tài liệu đã che thông tin riêng tư và
manifest bất biến. Mỗi gói gắn deployment/campaign/milestone/version/hash.

- File gốc và manifest riêng hiện có giữ quyền truy cập riêng; bổ sung quyền đọc
  của resolver hợp lệ cho case, có ghi nhận truy cập. Không mở nguyên bucket.
- Organizer xem trước và xác nhận bản công khai đã che thông tin riêng tư.
- Bản công khai có manifest/hash riêng và liên kết commitment của gói gốc;
  không công khai đường dẫn object riêng, tên file riêng hay presigned URL lâu dài.
- Donor đọc đúng phiên bản đã được tiếp nhận; cache/indexer/RPC lỗi hiển thị lỗi
  và chặn thao tác mới, không hiển thị hồ sơ mới dưới hash cũ.
- Tiếp nhận không bảo đảm sự thật ngoài đời và chưa chuyển tiền.

Sự cố lưu trữ sau khi mở review là lý do hợp lệ để donor mở case; không tự kéo
dài timer bằng đồng hồ backend. Tính sẵn có của dữ liệu vẫn là một giới hạn
vận hành phải kiểm tra trước khi mở luồng.

## 4. Đường trạng thái — đã chốt

```text
MILESTONE_ACTIVE
  └─ organizer nộp gói bất biến → EVIDENCE_PENDING
       ├─ resolver yêu cầu sửa / admission quá hạn
       │    └─ ACTIVE + 7 ngày sửa, hoặc FAILED khi hết 3 phiên bản
       └─ resolver tiếp nhận đúng version/hash → IN_REVIEW (72 giờ)
            ├─ không có case giữ tiền, hết review → settleMilestone
            │    └─ trả đúng budget → milestone tiếp / COMPLETED + credit bond
            └─ donor phản đối trước reviewEnd → CHALLENGED
                 └─ kiểm tra → organizer giải trình → đối chiếu lại → resolver
                      ├─ CONTINUE → IN_REVIEW với reviewEnd gốc
                      │    └─ đủ điều kiện → settleMilestone
                      ├─ RESUBMIT → ACTIVE + 7 ngày sửa
                      │    └─ version mới → tiếp nhận mới → review mới 72 giờ
                      └─ STOP / hết hạn xử lý → FAILED + snapshot refund
                           └─ từng donor tự claim, bond trả riêng
```

`CONTINUE` chỉ giữ hồ sơ/tiêu chí/budget của version đã được review. Nếu cần
tài liệu thay thế làm thay đổi nội dung chứng minh, phải dùng `RESUBMIT`; bản
mới bắt buộc được tiếp nhận lại và mở đầy đủ 72 giờ review. Không sửa hash cũ.

Một case on-chain cho mỗi evidence version; khi đang giữ tiền, donor khác
được bổ sung phản đối/tài liệu vào case đó, không mở timer mới. Resolver xử lý
toàn bộ phản đối được nộp trong cửa sổ quy định. `CONTINUE` kết thúc case của
version đó, không mở lại cùng version và không tự cấp thêm 72 giờ. Đây là
quyết định cuối cùng trong MVP, không có bước kháng nghị. Material mới cần
`RESUBMIT` và version mới. Người dùng đã xác nhận giới hạn một case/quyết định
cuối cho mỗi version và không kháng nghị trong MVP.

## 5. Thời hạn — giữ mặc định cũ, thêm hai hạn đã duyệt

| Hạn | Thời lượng | Mốc bắt đầu | Hết hạn |
|---|---|---|---|
| Kích hoạt | 7 ngày, đã có | Đủ vốn / settle milestone trước | Bất kỳ ví chốt FAILED |
| Nộp lần đầu | 30 ngày, đã có | Giao dịch kích hoạt | Bất kỳ ví chốt FAILED |
| Tiếp nhận | 72 giờ, đã có | Giao dịch nộp version | Expire; sửa hoặc FAILED khi hết version |
| Sửa hồ sơ | 7 ngày, đã có | Rejection/expiry hoặc RESUBMIT | FAILED nếu không nộp kịp |
| Donor review | 72 giờ, đã có | Giao dịch tiếp nhận version | Settle nếu không có case giữ tiền |
| Giải trình và bổ sung case | **7 ngày, mới** | Giao dịch mở case | Chuyển quyền xử lý cho resolver; chưa tự kết luận lỗi |
| Resolver xử lý | **7 ngày, mới** | Mốc hết hạn giải trình đã ghi khi mở case | Bất kỳ ví chốt FAILED theo fallback |

Hai deadline mới được cố định trong giao dịch mở case; không cần giao dịch
chuyển giai đoạn để bắt đầu hạn resolver. Resolver chỉ ký quyết định sau khi
đủ hạn giải trình và trước hạn xử lý, sau các kiểm tra/giải trình/đối chiếu lại.
Chậm gửi câu trả lời, vắng mặt, sửa draft hay admin thao tác không reset hạn.
Nếu organizer không trả lời, resolver xem phần thiếu cùng hồ sơ; không mặc
định đó là bằng chứng gian lận. Khi resolver vắng mặt, fallback vẫn thực thi được.
Tất cả dùng `block.timestamp`: thao tác trước hạn (`<`), timeout tại/sau hạn (`>=`).

Tối đa **3 evidence versions** cho mỗi milestone, dùng cùng giới hạn hiện có.
Version bị reject/expire vẫn tính; `RESUBMIT` không được cấp lượt thứ tư.
Nếu đã hết lượt, resolver phải chọn CONTINUE hoặc STOP; không quay lại ACTIVE.

## 6. Tiền — dừng không phạt đã duyệt

Khi chốt STOP hoặc hết hạn xử lý, dùng cùng quy tắc **dừng không phạt**
đã có ở nhánh evidence/activation timeout:

```text
C = tổng donation đã nhận
R = tổng budget đã giải ngân
P = C - R
refund_i = floor(contribution_i * P / C)
```

- Không giải ngân budget đang bị phản đối; tiền đã trả của milestone trước
  không thu hồi bằng trạng thái backend.
- Quỹ refund chỉ gồm donor escrow chưa giải ngân; bond còn lại trả riêng cho
  organizer. Không có slash, fee hay caller reward ở nhánh này.
- Resolver không nhập số tiền/recipient; contract tính pool và giữ quyền claim
  một lần về chính ví donor. Không loop donor; dust giữ trong escrow như policy cũ.
- Dừng vì quá hạn không xác định MISCONDUCT. Phạt bond/thu hồi tiền đã trả chưa
  thuộc post-MVP cùng các verdict tài chính có chế tài.
- `CONTINUE` không chuyển token; `settleMilestone` riêng trả đúng budget cho
  organizer một lần, giữ thứ tự milestone, tạo credit bond khi campaign hoàn tất.
- Nếu token transfer thất bại, transaction revert cả trạng thái/counter/snapshot;
  retry không nhân đôi khoản trả. Bản mới chốt credit bond không gọi token;
  claim bond thất bại giữ credit, không khóa refund donor. Token khóa toàn bộ
  escrow/beneficiary vẫn cần issuer cho phép chuyển, không bypass bằng admin.

Quy tắc này ưu tiên không giữ donor escrow vô hạn khi resolver mất hoạt động.
Đổi lại, donor phản đối thiếu căn cứ vẫn có thể làm chậm luồng; resolver offline
có thể dẫn tới dừng không phạt. MVP chưa có stake/Sybil protection/appeal và
không được mô tả là phân xử độc lập hoặc bảo đảm phát hiện gian lận.

## 7. Triển khai theo policy đã xác nhận

1. **Contract:** admission chỉ resolver của MVP; bỏ đường legacy assignment
   verifier khỏi quyền tiếp nhận của deployment MVP; case gắn version/hash,
   deadline cố định, response hash, verdict/reason hash bất biến; CONTINUE,
   RESUBMIT, STOP và permissionless timeout; mọi financial transition giữ guard
   và accounting. Append enum/event mới, không đổi nghĩa numeric state hiện có.
2. **ABI/deployment:** sinh ABI từ artifact duy nhất, ghi phiên bản policy và
   capability của contract. Prototype cũ không upgrade được: contract resolver
   immutable và không có dispute exit. Kiểm tra trên deployment riêng trước;
   không redeploy/reset/migrate campaign hiện tại trong lượt này.
3. **BE/storage:** public redacted package và resolver access; record findings,
   phản đối/bổ sung/giải trình, version/actor/reason; authorize theo account/SIWE
   và relationship; chặn dữ liệu stale. Mọi verdict off-chain chỉ là ý kiến chờ ký.
4. **Indexer:** canonical events admission/case/response/resolution/settlement;
   khóa stream, transaction + checkpoint, replay/reorg idempotent. Tiền và trạng
   thái ứng dụng chỉ hoàn tất sau receipt hợp lệ và event tương ứng đã index.
5. **FE:** dùng khu nội bộ resolver hiện có; trạng thái ai làm gì, hạn chain,
   ví cần dùng và blocker. Mở nộp/phản đối/giải ngân cùng capability có đường thoát;
   không bật chỉ bằng flag UI hay role DB.
6. **Test gộp sau bốn mục:** happy path nhiều milestone; reviewer/caller/version
   sai; donor chưa góp; deadline bằng nhau; hồ sơ không đọc được; reject/expire;
   ba verdict và timeout; hết lượt; mọi case phản đối/bổ sung; duplicate/replay/
   reorg; transfer failure/reentrancy; conservation/refund bounds; reload pending
   hash; đúng receipt và index; extension signing thủ công.

## 8. Quyết định và tình trạng triển khai

**Đã chọn A — MVP tối thiểu:** resolver hiện có tiếp nhận và xử lý, một case
quyết định cuối cho mỗi version; 7 ngày giải trình + 7 ngày xử lý; CONTINUE /
RESUBMIT / STOP; STOP hoặc timeout hoàn donor escrow chưa giải ngân và trả
bond không phạt. Verifier riêng, appeal, committee và misconduct slash post-MVP.

Quyết định này thay thế đề xuất verifier độc lập và verdict/slash còn mở trong
tài liệu cũ cho MVP. Những đoạn đó là hướng post-MVP, không phải quyền đang mở.

- Source mới: `contracts/src/FundTogetherMvp.sol`, deployment riêng, policy marker
  `keccak256("FundTogether.MVP.milestone.no-slash.v1")`. Không upgrade prototype.
- `admitEvidence` / `rejectEvidence` chỉ resolver độc lập với ví organizer/donor;
  các entrypoint assigned verifier legacy luôn revert, kể cả đã cấp role.
- Case, material hash, response và verdict gắn campaign/milestone/version/hash.
  Material donor gửi trong 7 ngày; organizer chốt một response hash trong 7 ngày.
  Bổ sung material không reset hạn hoặc thay response đã chốt. Findings và file
  đọc được phải nằm ở BE/storage; hash không chứng minh resolver đã xem nội dung.
- `CONTINUE` không chuyển tiền và giữ reviewEnd cũ. Do giải trình kéo dài 7 ngày,
  review 72 giờ đã hết khi resolver ra quyết định; lúc đó có thể settle ngay bằng
  giao dịch riêng. Đây là verdict cuối được tin cậy của MVP, không có appeal.
- `STOP` / timeout append FailureReason mới (4/5); số enum state cũ giữ nguyên.
  Events mới đi cùng `SubmissionVerified` / `ChallengeOpened` tương thích cũ.
  Indexer phải ghi theo log identity và không tạo hai hành động nghiệp vụ từ
  hai event mô tả cùng transition.
- Contract regression đạt 200 test, gồm 31 test MVP, fuzz 1024 lần và invariant
  128 runs x 128 calls. BE đạt 96 test; FE đạt 88 test và build/lint.
- Đã nối gói donor đọc được với xác nhận che thông tin, SHA-256 bất biến, file
  gốc riêng tư và audit resolver; records gắn hash/version, ABI sinh từ artifact,
  kiểm tra policy/instance trên chain, canonical case events và UI ký theo quyền.
  Migration 0012 thêm publication/record/access log, không xóa dữ liệu cũ.
- Kiểm thử tích hợp HTTP/SIWE/MinIO/receipt/indexer trên chain riêng gồm nhiều
  milestone, ba verdict, timeout, hoàn phần còn lại, dust, claim bond, sai quyền,
  file/manifest hỏng và replay/reorg. Xem [milestone lifecycle](./milestone-lifecycle.md).
- Worker đã kiểm tra RPC outage/unknown-send/restart trên chain riêng; TODO:
  kiểm tra MetaMask (từ chối ký, đổi ví, reload khi pending), vận hành liên tục
  và đưa deployment MVP mới vào ứng dụng
  sau khi xác định phạm vi dữ liệu/escrow. Không reset/redeploy trong lượt này.
- Campaign hiện tại dùng prototype, không tự nhận các quyền mới. Resolver cũng
  đã đóng góp vào campaign đó: fixtures MVP mới cần resolver và donor khác ví.
