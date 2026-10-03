# FundTogether — Verifier Specification v0.1

> Cập nhật: 2026-10-03
> Trạng thái: Quyền đã chốt; evidence admission/versioning đã triển khai và kiểm thử; các action challenge/remediation chưa triển khai
> Liên quan: [Verification/dispute](./FundTogether_Verification_and_Dispute_Design_2026-10-03.md), [Dispute Policy/2-of-3](./FundTogether_Dispute_Policy_and_Resolver_Committee_2026-10-03.md)

## 1. Định nghĩa đã chốt

Verifier là trusted procedural reviewer: kiểm tra admissibility và objective
validation theo tiêu chí định trước. Resolver phân xử tranh chấp chưa giải quyết
được. Organizer tạo hồ sơ/claim; verifier đánh giá hồ sơ/claim, không sửa chúng.

MVP dùng một loại quyền VERIFIER_ROLE cho kiểm tra evidence, challenge và
remediation. Cùng người có thể thực hiện ba bước. Chưa cần tách registry hoặc
EVIDENCE_VERIFIER/CHALLENGE_VERIFIER. Người đã verify vụ việc không làm resolver
vụ đó. Người dùng đã chốt nhiều ví cùng VERIFIER_ROLE, ban đầu hai ví do nền tảng
cấp quyền. Mỗi hồ sơ giao một verifier xử lý, không biểu quyết 2/3 ở bước này.
Nhiều ví hỗ trợ phân công/dự phòng, không tự chứng minh tính đúng hoặc độc lập.
Cấp/thu hồi dùng OpenZeppelin AccessControl; deployer giữ DEFAULT_ADMIN_ROLE
ban đầu. Quản trị phân công lại chỉ khi phiên bản hiện hành còn SUBMITTED;
event giữ previous/new verifier. Ví bị thu hồi quyền không quyết định được nữa.

## 2. Quyền được phép và bị cấm

| Được phép | Không được phép |
|---|---|
| Kiểm tra format/schema đã định nghĩa | Sửa amount, claim, evidence hoặc ngân sách milestone |
| Kiểm tra đủ loại bằng chứng bắt buộc | Thay hash/phiên bản đã commit hoặc tiêu chí đã khóa |
| Kiểm tra hash, file và version khớp | Tự kết luận organizer gian lận |
| Đối chiếu amount của invoice và claim khi cùng ngữ cảnh | Tự slash bond hoặc chuyển tiền |
| Phát hiện và ghi nhận tài liệu trùng | Tự cancel vì tranh chấp chủ quan |
| Nhận challenge đủ điều kiện để xem xét | Tự quyết bên nào đúng khi evidence mâu thuẫn/chưa rõ |
| Yêu cầu organizer bổ sung qua lý do từ chối | Tự đánh giá vendor đáng tin khi có dispute chưa giải quyết |
| Xác nhận lỗi khách quan đã được khắc phục | Đưa evidence mới thẳng tới giải ngân mà bỏ review |

ADMISSIBLE/VALID chỉ nghĩa là được xem xét, không chứng minh nội dung thật.
REMEDIATED chỉ nghĩa là đã sửa lỗi khách quan; không phải verdict PASS cuối cùng.

## 3. Hai loại remediation

```text
Lỗi khách quan:
  missing required invoice / amount mismatch /
  missing required beneficiary receipt / wrong version
    -> organizer nộp bản mới
    -> verifier xác nhận đáp ứng tiêu chí
    -> REVIEW AGAIN 72 giờ

Tranh chấp chưa rõ:
  forged invoice / related-party vendor /
  inflated pricing / fabricated delivery
    -> organizer giải trình
    -> chưa thể kết luận khách quan hoặc donor vẫn phản đối
    -> UNRESOLVED -> hội đồng resolver 2/3
```

Không dùng verifyRemediation để xóa một dispute về sự thật chỉ vì organizer
bổ sung giấy tờ đủ trường. Donor phải có đường tiếp tục phản đối/escalate.

## 4. Checklist objective validation ban đầu

| Kiểm tra | Căn cứ bắt buộc | Giới hạn |
|---|---|---|
| Format/schema | Schema/checklist version gắn tiêu chí trước review | File đọc được không chứng minh dữ liệu đúng |
| Required documents | Loại evidence đã yêu cầu trong acceptance criteria | Không tự thêm điều kiện hồi tố |
| Hash/version | Bytes/manifest, committed hash và submissionVersion | File đổi thì phải nộp version mới |
| Amount match | Claim và invoice cùng tiền tệ, đơn vị, kỳ/phạm vi chi phí | Tổng budget không phải claim; khác currency, partial payment, thuế cần quy tắc rõ |
| Duplicate | Hash hoặc định danh hóa đơn cùng hồ sơ tham chiếu | Cùng file/receipt có thể hợp lệ; phát hiện trùng chưa chứng minh nhận tiền hai lần |
| Challenge admission | Donor của campaign, đúng hạn/version/phạm vi, nội dung hỗ trợ | Không yêu cầu donor chứng minh hết vụ việc chỉ để được xem xét |

Checklist này là bản cụ thể hóa để chuẩn bị implementation; schema invoice/claim,
định danh tài liệu và chuẩn xác minh nguồn chưa có trong prototype hiện tại.
Không tự thêm expense claim hoặc partial withdrawal vào contract chỉ để kiểm tra
amount. Nghi ngờ từ AI hoặc file hash khác nhau chưa đủ kết luận forged/unique invoice.

## 5. Năm action của verifier trong MVP

| Action | Guard/đối tượng | Thay đổi procedural | Tiền |
|---|---|---|---|
| verifySubmission | Submission hiện hành, hash/version khớp, SUBMITTED | ADMISSIBLE/REVIEWABLE; bắt đầu review 72 giờ | Không chuyển |
| rejectSubmission | Submission hiện hành đang chờ kiểm tra; reasonHash | REJECTED; organizer tự sửa bằng bản mới | Không chuyển |
| verifyChallenge | Challenge đang pending; case/version đúng; đủ điều kiện | CHALLENGE_ACCEPTED; chờ organizer response | Không chuyển |
| rejectChallenge | Challenge pending; lý do khách quan và reasonHash | Ghi dismissal; hold/appeal xử lý theo policy cần chốt | Không chuyển |
| verifyRemediation | Remediation mới đã được organizer commit; lỗi khách quan đã sửa | REMEDIATION_ACCEPTED; review mới 72 giờ | Không chuyển |

Yêu cầu thêm bằng chứng được thể hiện qua lý do/checklist của rejectSubmission,
không tự thêm một action có quyền tài chính. Remediation vẫn không đạt có thể
bị reject như một submission mới; case chủ quan/chưa rõ phải giữ UNRESOLVED.
Action/API escalation và quyền gọi cần chốt cùng hold/appeal policy.

Các tên trên là ranh giới API dự kiến, chưa phải ABI đã sinh. Mọi action kiểm tra
role, campaign/milestone, đúng case, version/hash, trạng thái và chống gọi lặp.
Verification của v1 không có hiệu lực cho v2. Một quyết định không được tự sửa
thành ngược lại sau khi review đã bắt đầu; phiên bản/vòng mới có lịch sử riêng.

## 6. Hồ sơ theo phiên bản

```text
campaignId, milestoneId, submissionVersion
evidenceHash / manifestRoot, criteriaHash, checklistVersion
submissionKind: ORIGINAL / REMEDIATION
parentSubmissionVersion, relatedChallengeId
verificationStatus, verifiedBy, verifiedAt, reasonHash
```

Organizer được quyền tạo hồ sơ mới; verifier chỉ tạo kết quả kiểm tra tham chiếu
hồ sơ đó. Không overwrite bản cũ. Hồ sơ đầy đủ và reason/checklist ở storage/backend;
commitment, quyết định cho phép review/hold và quyền thực thi ở contract.
Database là projection cho các quyết định on-chain, không tự mở khóa escrow.

## 7. Các invariant phải kiểm thử khi triển khai

```text
Verifier action -> không thay đổi số dư token, bond hoặc totalReleased
Sai role / sai case / sai version / sai hash / sai state -> revert
Verifier không sửa được hồ sơ của organizer hoặc acceptance criteria
Approval v1 không dùng cho v2; decision không gọi lặp
verifyRemediation -> review mới, không settlement trực tiếp
Pending/accepted challenge -> không settlement
Ambiguous/contested claim -> không dùng remediation để bypass resolver
Lỗi giao dịch -> không để procedural/on-chain state cập nhật một nửa
```

Tiền tiếp tục nằm trong escrow; settlement hợp lệ mới giải ngân cho organizer.
Việc giữ tiền chờ verifier tạo thêm rủi ro inactivity: cần deadline/fallback
trước khi coi luồng mới đủ an toàn để dùng thực tế.

## 8. Thông tin còn cần để triển khai

- Danh sách ví thật chỉ cần khi triển khai; prototype dùng tài khoản test.
  Prototype đã có grantRole/revokeRole và assignVerifier cho pending submission.
  Thành viên resolver và xung đột lợi ích ngoài đời vẫn cần hồ sơ xác minh.
- Hold/appeal sau rejectChallenge, quyền escalation và giới hạn resubmission.
- Deadline từng stage và fallback; không đổi 72 giờ review đã chốt.
- Exact checklist/schema được cam kết cho campaign/milestone.
- Financial effects của verdict resolver được chốt riêng; verifier không có quyền đó.

## 9. Implementation checkpoint — 2026-10-03

Trong C:\Users\dell\Desktop\FundTogether\contracts\src\FundTogether.sol:

- submitEvidence tạo version mới, lưu hash và SUBMITTED; reviewEnd = 0.
- assignVerifier chỉ cho admin, reviewer có role, không phải organizer; chỉ pending
  version hiện hành. Event ghi người cũ/mới khi phân công lại.
- verifySubmission kiểm tra role, người được giao, version/hash; ghi ACCEPTED,
  verifiedBy/verifiedAt và bắt đầu review 72 giờ tại thời điểm quyết định.
- rejectSubmission ghi REJECTED + reasonHash; organizer được nộp version mới.
  Không overwrite lịch sử hoặc sửa quyết định cũ. Các action này không chuyển tiền.
- submissionVersion và evidenceSubmissions cho phép đọc từng bản; latest
  milestoneEvidence giữ hash/reviewEnd cho settlement.
- Event EvidenceSubmitted cũ được thay bằng EvidenceSubmissionCreated,
  VerifierAssigned, SubmissionVerified và SubmissionRejected. ABI/event đang phát triển.
- 22 verifier tests và regression settlement: full suite 129 passed, 0 failed,
  11 suites, 4 fuzz tests mỗi test 256 runs. Build/formatting được kiểm tra.

Chưa triển khai verifyChallenge/rejectChallenge/verifyRemediation, resolver 2/3,
upload/checklist engine, deadline/fallback, post-funded refund hoặc slash. Verifier
vẫn là bên kiểm tra off-chain; contract xác thực quyết định, không tự đọc hóa đơn.
Không giới hạn số vòng resubmit và chưa có admission timeout recovery; đây vẫn
là prototype và có thể giữ tiền nếu verifier/admin không hoạt động.

## 10. Evidence và analysis pipeline — 2026-10-03

[Evidence Schema](./FundTogether_Evidence_Schema_v0.1.md),
[Verification Report](./FundTogether_Verification_Report_v0.1.md) và
[hồ sơ mẫu](./FundTogether_Evidence_Example_v0.1.md) chuẩn bị bước backend tiếp theo.
Pipeline có thể nâng cấp; report mới không sửa evidence commitment, tiêu chí đã
khóa hoặc quyết định on-chain. AI/OCR hỗ trợ verifier, không có quyền tài chính.
Lỗi analysis tùy chọn có manual fallback; mandatory checks vẫn phải đạt.
Public redacted evidence và restricted originals có quyền/hash riêng.
Các tài liệu này chưa đánh dấu upload/checklist/report engine DONE.
