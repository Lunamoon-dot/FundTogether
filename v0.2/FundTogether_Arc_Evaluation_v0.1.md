# FundTogether — Đánh giá và kế hoạch thử Arc v0.1

> Ngày: 2026-10-03
> Trạng thái: Arc testnet là hướng tích hợp ưu tiên; Arc là ứng viên production ưu tiên; chưa tích hợp/deploy FundTogether trên Arc; chưa chốt production.
> Liên quan: [Mạng dev và gas](./FundTogether_Development_Network_and_Gas_v0.1.md), [Web3/TypeScript](../docs/web3-conventions.md).

## 1. Quyết định và phạm vi

Giữ Anvil + MockUSDC cho local dev. Bổ sung thử nghiệm Arc testnet trước khi
quyết định có cần relayer chỉ để donor không phải mua ETH/AVAX. Arc testnet được
ưu tiên theo định hướng mới của người dùng; Sepolia là phương án đối chiếu/dự phòng.
Production ưu tiên đánh giá Arc nhưng chỉ chốt sau khi đạt cổng kiểm chứng.
Không coi bất kỳ mạng nào là đã deploy FundTogether.

Arc dùng USDC cho native gas và có giao diện ERC20; theo thông báo chính thức,
public mainnet ra mắt 16/09/2026. Mạng mới cần đánh giá vận hành và mô hình
validator được cấp quyền. [Thông báo Circle](https://www.arc.io/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet)

## 2. Dữ liệu tham chiếu testnet

| Trường | Giá trị tham chiếu, chưa phải deployment artifact của dự án |
|---|---|
| Chain ID | 5042002 |
| RPC HTTP | https://rpc.testnet.arc.io |
| Explorer | https://explorer.testnet.arc.io |
| Faucet | https://faucet.circle.com |
| Native currency | USDC, 18 decimals |
| ERC20 USDC | 0x3600000000000000000000000000000000000000, 6 decimals |
| FundTogether address / deploymentBlock | Chưa có |

Đối chiếu lại chain ID, token interface/decimals và compiler/runtime trước khi
triển khai. Không dùng mainnet khi đang thử nghiệm.
[RPC/network reference](https://docs.arc.io/arc/references/rpc-endpoints),
[USDC interfaces](https://www.arc.io/blog/building-with-usdc-on-arc-one-token-two-interfaces).

## 3. Một tài sản, hai đơn vị

Native USDC dùng 18 decimals cho gas/value; ERC20 dùng 6 decimals cho
balanceOf/allowance/transfer. Hai interface đọc cùng số dư, không phải hai token
hoặc hai pool độc lập. Không cộng hai balance để hiển thị tổng.
[Giải thích chính thức](https://www.arc.io/blog/building-with-usdc-on-arc-one-token-two-interfaces)

Quy ước tích hợp dự kiến của FundTogether:

```text
Donation / bond / refund accounting → ERC20 USDC units (6 decimals)
Native balance / gas estimate       → native USDC units (18 decimals)
1 token unit (10^-6 USDC)           → 10^12 native base units
```

TypeScript giữ tất cả amount/fee ở bigint, gắn đơn vị rõ. JSON dùng chuỗi số.
Chỉ chuyển đơn vị ở boundary xác định, không dùng Number/parseFloat. Để tính
donation tối đa, trừ ngân sách gas dự phòng trong native units trước rồi chuyển
phần có thể chi sang ERC20 units bằng làm tròn xuống. Không coi việc round fee
xuống thành ngân sách đủ trả gas. Không lấy maxFeePerGas đơn lẻ làm tổng phí.

Gas và donation cùng rút từ balance nên FE phải reserve cả approve nếu cần và
donate; cập nhật quote/balance sau approve. Max donation còn bị giới hạn bởi
remaining goal và allowance. Donor có đúng 100 USDC không mặc định donate đủ
100 qua giao dịch tự trả phí. Native gas bằng USDC không có nghĩa miễn phí.
Đây là quy tắc ứng dụng đề xuất; chưa có fee quote/balance adapter thực thi.

## 4. Contract, escrow và sponsorship

Hướng thử đầu tiên giữ giao diện ERC20 của contract hiện tại, chưa đổi donate
sang payable/msg.value. Không tự tin rằng EVM-compatible nghĩa là mọi hành vi
runtime giống Ethereum; kiểm tra compiler, tooling, transfer failure và event.

Refund trả đúng khoản donor có quyền; phí donor tự trả là chi phí riêng, không
khấu trừ vào refund amount. Vì refund và phí có thể cùng một địa chỉ nhận/trả,
UI phân biệt gross refund và thay đổi số dư ròng. Native transfer trực tiếp vào
escrow không tự tạo quyền đóng góp; phải theo action/event protocol.

Arc không yêu cầu paymaster chỉ để người dùng tránh mua đồng gas thứ hai.
Muốn nền tảng tài trợ phí vẫn cần policy/cơ chế riêng, chưa chọn nhà cung cấp.
Giữ ví vận hành/sponsor tách khỏi escrow và bond; không dùng chung khoản dự trữ.
MockUSDC + ETH trên Anvil chưa tái tạo mô hình shared balance của Arc, nên cần
integration validation trên mạng đích trước khi nói journey tương thích.

## 5. Indexer và transaction state

Theo reference hiện hành, một ERC20 USDC transfer có log ở cả ERC20 emitter
(6 decimals) và native system emitter (18 decimals); native send có system log.
Chọn stream/filter rõ, không đếm cùng chuyển động hai lần. Gas được đối soát
từ receipt, không suy ra từ Transfer logs.
[USDC system events](https://docs.arc.io/arc/references/usdc-system-events)

Đóng góp/refund/bond/milestone projection dùng event FundTogether đã xác thực
đúng chain + contract + ABI; generic USDC Transfer không thay protocol event.
Native/ERC20 logs chỉ phục vụ kiểm tra balance/movement. Job idempotent theo
chainId + txHash + logIndex; idempotency này không tự loại semantic duplicate
giữa hai stream khác logIndex, nên vẫn cần lựa chọn nguồn.

Receipt success, finality theo chain policy và indexed state vẫn riêng biệt.
Arc final ở committed block theo consensus, không cần tích lũy N confirmations
kiểu Ethereum. Receipt final vẫn có thể status=0; chỉ status=1 mới execution
success. Finality không chứng minh indexer đã xử lý event hoặc evidence đúng.

## 6. Checklist thử nghiệm — TODO

1. Kiểm tra chain/token/tooling, deploy prototype testnet; lưu ABI/address/block.
2. Chạy create, criteria, approve, bond, publish và donate qua wallet.
3. Chạy evidence admission, unchallenged settlement và completion/bond return.
4. Chạy pre-funded cancellation/failure và refund; quan sát fee/gross/net riêng.
5. Kiểm tra thiếu phí, balance sát ngưỡng, approve làm giảm balance và conversion.
6. Kiểm tra indexer không đếm hai stream thành hai donation và không suy quyền
   từ chuyển token ngoài luồng. Giữ nguyên limitation challenge chưa có exit.
7. Đo tổng phí từng journey, wallet/RPC reliability và cách đưa/rút USDC khỏi Arc.

Chỉ chốt production sau khi có kết quả. Không hứa mức phí cố định hoặc lấy
phí testnet làm dự báo mainnet. Chuyển mạng không migrate campaign đang giữ tiền.

Tài liệu này không cài SDK/toolchain, sửa source, tạo ví hay broadcast transaction.

## 7. Runtime, tooling và RPC — kiểm tra web 2026-10-03

| Chủ đề | Hệ quả cho FundTogether | Trạng thái |
|---|---|---|
| Arc Foundry | arc-forge/arc-cast/arc-anvil; WSL dùng Linux binary; regular Anvil không tái tạo runtime Arc | TODO install/validate |
| EVM | Arc mô tả Osaka baseline; kiểm tra build/compiler target của Solidity 0.8.24 hiện tại | TODO compatibility |
| USDC transfer failure | Blocklist/recipient policy có thể làm payout revert; cần recovery policy không lấy tiền donor tùy ý | OPEN |
| Timestamp | Không giảm nhưng có thể bằng nhau giữa các block; deadline theo timestamp, event order theo block/tx/log | TODO integration |
| Pending without receipt | Có thể do phí dưới floor; reconcile hash/nonce trước retry | TODO UX/RPC |
| Log query | Public span limit 10.000 blocks, khuyến nghị ≤9.999; -32012 → giảm batch; -32014 → bounded backoff | TODO indexer |
| Shared balance/dust | ERC20 truncates phần nhỏ hơn 10^-6 USDC; native fee giữ 18 decimals; không suy quyền từ raw balance | TODO accounting checks |

Theo [gas reference](https://docs.arc.io/arc/references/gas-and-fees), floor
maxFeePerGas hiện được mô tả là 20 Gwei. Đây là reference theo ngày, không phải
phí cố định: query fee estimate và kiểm tra lại network/provider trước triển khai.
Không promise chi phí một journey từ giá một token transfer.

### Lưu ý khi dùng ví dụ chính thức

Gas reference có ví dụ native value dùng parseUnits("1", 6) nhưng mô tả là
1 USDC. Điều này mâu thuẫn với native unit 18 decimals: dùng 18 cho tx.value,
6 cho ERC20 amount; không sao chép nguyên ví dụ.

Phần introductory agent text có câu blocklist revert không receipt; detailed
transaction lifecycle lại mô tả runtime revert được included với status=0 và phí.
Baseline ở đây dựa vào detailed lifecycle; drop trước inclusion không receipt
khác runtime revert. Cần kiểm chứng trên Arc testnet trước làm UX lỗi.

### Cổng chốt production

- DONE (docs): research và mapping requirement theo milestone.
- TODO: Arc Foundry/compiler validation, testnet deployment với ABI/address/start block,
  fee/balance/USDC runtime checks, wallet/RPC reliability và indexing.
- TODO: success/refund journey; BLOCKED for real-fund readiness: unresolved challenge
  exit, abandonment/timeouts, post-funded refunds/slash, no-quorum/appeals.
- OPEN: production approval, issuer/blocklist recovery và sponsor policy.
  Mạng Arc không tự giải quyết các quyết định protocol này.

## 8. Nguồn chính thức và thứ tự đối chiếu

Đọc reference hiện hành trước các snippets cũ; kiểm tra lại khi pin tool/deploy:

- [Stablecoin native model](https://docs.arc.io/arc/concepts/stablecoin-native-model)
- [EVM differences](https://docs.arc.io/arc/references/evm-differences)
- [Arc Foundry install](https://docs.arc.io/arc/tutorials/install-arc-foundry)
- [Porting contracts](https://docs.arc.io/arc/tutorials/porting-contracts-to-arc)
- [Gas and fees](https://docs.arc.io/arc/references/gas-and-fees)
- [Transaction lifecycle](https://docs.arc.io/integrate/wallets/transaction-lifecycle)
- [Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality)
- [USDC system events](https://docs.arc.io/arc/references/usdc-system-events)
- [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints)

Ngày đọc: 2026-10-03. Không probe uptime RPC/deploy hoặc chạy Arc tooling trong
lần cập nhật tài liệu; parameter tham chiếu chưa là deployment artifacts.
