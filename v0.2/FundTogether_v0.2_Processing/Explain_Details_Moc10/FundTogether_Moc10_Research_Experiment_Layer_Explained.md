# FundTogether — Giải thích Mốc 10: Research / Experiment Layer

> Mốc nghiên cứu bắt đầu sau khi hành vi hệ thống ổn định. Ví dụ bên dưới mô tả cách lập thí nghiệm; không phải kết quả đã có hay bằng chứng protocol hiệu quả.

## 1. Nghiên cứu lớp experiment là gì?

Sau MVP, có thể dùng trace/mô phỏng để nghiên cứu quan hệ giữa tham số thiết kế và outcomes: milestone granularity với bond requirement, tỷ lệ bond với exposure, governance kiểu challenge với mandatory voting, review-window duration với liveness/risk, evidence strength với false acceptance.

Mục tiêu là trả lời câu hỏi đo được, không chỉ thêm nhiều thuật ngữ/biểu đồ vào báo cáo.

## 2. Biến đầu vào và outcome

Ví dụ nghiên cứu bond ratio:

- **Independent variable — yếu tố thay đổi:** alpha trong `RequiredBond = alpha × MaxExposure`.
- **Controls — yếu tố giữ ổn định:** tổng funding, distribution budgets, xác suất/default model, challenge policy.
- **Outcomes:** exposure được che phủ, collateral efficiency, capital bị khóa, liveness.

Nếu cùng lúc thay alpha, milestone size, review window và số verifier, không biết thay đổi nào gây outcome.

## 3. Tạo research question cụ thể

Mơ hồ: “Bond có tốt không?”

Cụ thể hơn:

> Với các cấu hình campaign và failure assumptions đã định, khi alpha tăng từ 0.5 lên 1.0, collateral efficiency đổi thế nào trong khi residual donor loss exposure giảm bao nhiêu?

Trước khi chạy cần định nghĩa mỗi metric, dataset, range, baseline và tiêu chí loại scenario.

## 4. Metrics trong Process nên được định nghĩa thế nào?

| Metric | Định nghĩa làm việc minh họa | Cảnh báo |
|---|---|---|
| Maximum Exposure Ratio | max outstanding unverified exposure / total raised (nếu raised > 0) | Không chia khi raised = 0; phải xác định exposure window |
| Collateral Efficiency | covered exposure / locked bond; hoặc secured exposure per unit bond, chọn một cách diễn đạt | Nếu bond = 0 phải quy ước; tỷ lệ >1 có thể báo thiếu coverage tùy chiều công thức |
| False Acceptance Rate | Evidence gian dối theo ground-truth của dataset nhưng protocol accepted / tổng evidence gian dối được đánh giá | Ground truth ngoài đời khó xác định; nêu nguồn nhãn |
| False Rejection Rate | Evidence hợp lệ theo ground truth nhưng protocol rejected / tổng evidence hợp lệ được đánh giá | Cần có review độc lập/nhãn đáng tin |
| Governance Overhead | Số challenge/resolution calls, thời gian resolver, phí/gas hoặc số hành động trên campaign | Không gộp nhiều đại lượng không cùng đơn vị vào một số |
| Gas Cost | Gas used và/hoặc phí quy đổi theo chain/giá tại thời điểm | Giữ riêng usage và market price; phí đổi theo block |
| Refund Accuracy | Sai số giữa entitlement dự kiến theo financial rules và refund thực tế; có thể xét tổng conservation | Định nghĩa tolerance/rounding trước |
| Campaign Liveness | Thời gian/ tỷ lệ campaign đạt terminal hoặc tiến state hợp lệ trong mốc nghiên cứu | Terminal có thể là canceled; đừng gọi mọi completion là thành công |

Các định nghĩa ở bảng cần được nhóm nghiên cứu chốt. Chúng không phải công thức bắt buộc trong Process.

## 5. Một thử nghiệm bond có thể chạy ra sao?

1. Chọn cohort/scenario: ba milestone tuần tự với budgets 2k/5k/3k.
2. Khai báo failure, honest failure, dispute delay và recovery assumptions.
3. Chạy alpha = 0.5, 0.75, 1.0; giữ các tham số khác nguyên.
4. Tính bond required và max outstanding exposure mỗi scenario.
5. Ghi outcome gồm donor loss exposure, amount collateral locked, liveness.
6. Dùng cùng bộ seed/scenario cho các cấu hình hoặc công bố randomness để người khác lặp lại.
7. So kết quả với baseline; lưu code, config, data và phiên bản.

Nếu chỉ chạy smart-contract simulation, kết quả phản ánh logic model, không dự đoán trực tiếp con người thật sẽ hành xử thế nào.

## 6. Granularity milestone và bond

So sánh hai thiết kế có cùng goal:

```text
A: 2 milestone lớn
B: 10 milestone nhỏ
```

Cần giữ tổng ngân sách bằng nhau, xác định có được nhiều milestone exposure đồng thời, chi phí đánh giá mỗi mốc và khả năng fragmentation abuse. Nếu chia mốc nhỏ nhưng campaign được activate nhiều mốc cùng lúc, max exposure có thể tăng chứ không giảm.

Metrics phù hợp gồm max exposure, bond requirement, số lần review, gas, thời gian và failure probability theo giả định.

## 7. Challenge governance và mandatory voting

Chạy cùng scenario với:

- Challenge window, không challenge thì settle.
- Bắt buộc vote ở mọi milestone.
- Có thể thêm nhiều verifier nếu scope yêu cầu.

Đo participation rate, thời gian tới quyết định, phần trăm dispute quá hạn, chi phí transaction và outcome error trên bộ test.

Một người không vote có thể vì không thấy notification; turnout thấp không tự chứng minh voter không đồng ý evidence.

## 8. Evidence strength và error rate

Tạo evidence cases có nhãn độc lập/được review, phân tầng từ self declaration tới outcome evidence. Sau đó so kết quả acceptance của policy với nhãn.

Khó khăn chính là “ground truth”: ảnh, invoice và attestation có thể cùng sai hoặc thông đồng. Phải nêu người gán nhãn, tiêu chí, disagreement và bias. Không tuyên bố false acceptance thấp nếu dataset chỉ chứa trường hợp dễ.

## 9. Công cụ và nơi lưu

Research script/notebook có thể đọc event exports/database snapshot, chạy simulations, rồi tạo CSV/plots. Contract tests vẫn ở repo contracts; script nghiên cứu nên tách khỏi runtime production.

Cấu trúc tham khảo nếu dự án có thư mục nghiên cứu:

```text
research/
    scenarios/
    scripts/
    results/<experiment-id>/
    README.md
```

Không tạo cấu trúc này nếu repo đã có chuẩn khác. Kết quả cần ghi source commit, config, seed, timestamp, metric definitions và dataset/version. Tránh commit dữ liệu cá nhân/private evidence.

### Một lần chạy thử có thể tổ chức thế nào?

1. Tạo câu hỏi và protocol note trước, ví dụ so sánh ba giá trị alpha; chốt công thức exposure và collateral efficiency.
2. Lưu scenario đầu vào dạng CSV/JSON hoặc cấu trúc mà script hiện có đọc được: budgets, thứ tự milestone, outcome giả định, review delay. Dùng dữ liệu tổng hợp, không lấy hồ sơ cá nhân.
3. Chọn baseline và danh sách alpha. Cố định version code, config, seed và cách sinh tình huống ngẫu nhiên.
4. Chạy script từ terminal trong môi trường nghiên cứu; ghi stdout/lỗi và xuất kết quả có experiment ID. Notebook phù hợp để khám phá/plot; script phù hợp chạy lặp có tham số rõ.
5. Tính metric bằng định nghĩa đã ghi, kiểm tra mẫu số bằng 0/đơn vị/token, rồi tạo bảng/plot. Đối chiếu vài scenario bằng tay để bắt lỗi công thức.
6. Lưu kết quả cùng commit/config/seed và README cách chạy lại. Một teammate dùng đúng version phải tái tạo được bảng chính.

Tên lệnh, thư mục và file thực tế phải theo repo. Nếu chưa có research tooling, đây là quy trình đề xuất, không có nghĩa project đã có script `run_experiment` hay folder `research/`. Dừng ở mô phỏng khi kết luận chỉ dựa vào giả định; không gọi nó là kết quả người dùng thực tế.

## 10. Threat Model nghiên cứu

Mỗi experiment cần scope:

- Threat/assumption nào đang được mô hình hóa?
- Attack nào bị bỏ qua?
- Điều kiện nào lý tưởng hóa?
- Kết quả phụ thuộc tham số nào?
- Scenario nào làm kết quả đổi chiều?

Không dùng kết quả một parameter sweep để khẳng định protocol “an toàn”; mô phỏng kiểm tra giả định đã lập trình.

## 11. Đầu ra của Mốc 10

- RQ rõ và metric dictionary.
- Protocol/system version và config đóng băng cho run.
- Dataset/simulation assumptions và cách tái lập.
- Baseline/comparison, kết quả kèm giới hạn.
- Kết luận trả lời research question và câu hỏi tiếp theo.

**Mốc nghiên cứu hoàn thành khi người khác có thể hiểu cách tạo kết quả và biết kết quả không chứng minh điều gì.**

Nguồn: [Process — Mốc 10: Research / Experiment Layer và Metrics](../FundTogether_v0.2_Development_Process_and_MVP_Roadmap.md), [Threat Model — Research Questions/Metrics](<../../FundTogether Threat Model v0.2 — Charitable Crowdfunding.md>).

## MVP baseline alignment

Các thí nghiệm nên so sánh baseline giải ngân toàn bộ, milestone không bond và milestone có bond/challenge sau khi MVP có dữ liệu. Không thêm NFT, token riêng hoặc cross-chain chỉ để tăng số lượng thành phần blockchain; ưu tiên đo exposure, collateral efficiency, refund accuracy, governance overhead và campaign liveness.
