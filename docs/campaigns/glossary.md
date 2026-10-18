# FundTogether glossary

| Thuật ngữ | Nghĩa và cách dùng |
| --- | --- |
| FundTogether | Sản phẩm hiện tại cho comic/artbook số. Dùng trong UI và product docs. |
| Campaign / Ấn phẩm | Một dự án comic hoặc artbook độc lập. |
| Reward Crowdfunding | Mô hình tài trợ và họ giao thức; không phải tên một sản phẩm UI song song. |
| PDF reward | Quyền tải một PDF riêng tư từ pledge canonical hợp lệ. |
| Creator | Tác giả/studio có hồ sơ và ví nhận tiền đã xác minh. |
| Backer | Người pledge MockUSDC và nhận entitlement theo event canonical. |
| Resolver | Bên thẩm định campaign, bằng chứng, PDF và dispute theo policy. |
| Community Review | Giai đoạn góp ý công khai do Resolver chủ động mở; không phải bỏ phiếu hay pledge. |
| Commitment | Snapshot/hash bất biến của terms và evidence được gửi review. |
| Entitlement | Quyền phiên bản hóa sinh từ pledge event canonical đã index; receipt đơn lẻ chưa đủ. |
| Historical campaign | Record hoặc tài liệu lịch sử được giữ để đối soát; không phải Campaign hiện hành. |
| `historical` | Namespace dành cho dữ liệu/ABI/indexer lịch sử; không dùng trong wire route của Campaign hiện hành. |

Không dùng “Reward” để đặt tên component, folder, schema, env hoặc deployment
của sản phẩm hiện hành. Trong UI dùng “quyền lợi” cho PDF; trong code dùng
`benefit`/`entitlement` tùy ý nghĩa dữ liệu.

