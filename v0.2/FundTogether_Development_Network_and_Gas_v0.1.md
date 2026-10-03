# FundTogether — Mạng dev, token và gas v0.1

> Cập nhật: 2026-10-03
> Trạng thái: Đã chốt baseline dev; production và sponsorship chưa chọn/triển khai.
> Quy ước TypeScript: [Web3 conventions](../docs/web3-conventions.md).

## 1. Baseline hiện tại

| Thành phần | Quyết định |
|---|---|
| Chuẩn thực thi | EVM / Solidity |
| Mạng local | Anvil |
| Donation và bond | MockUSDC theo ERC20, 6 decimals |
| Gas local | Native ETH giả; tài khoản Anvil thường được cấp sẵn |
| Public testnet ưu tiên | Arc testnet; chưa tích hợp/deploy |
| Public testnet dự phòng | Sepolia nếu cần đối chiếu EVM; chưa deploy |
| Production | Arc là ứng viên ưu tiên; quyết định triển khai chờ kết quả kiểm chứng |

ERC20 là chuẩn token, không phải tên mạng. Code Solidity có thể triển khai
trên mạng EVM khác sau khi kiểm tra compiler/EVM compatibility và tích hợp.

```text
FE / BE → RPC Anvil → FundTogether escrow ↔ MockUSDC
Wallet gửi transaction → trả native ETH giả cho gas
```

Foundry unit tests chạy trong EVM test runner; test đạt không chứng minh đã
deploy hoặc hoàn thành journey FE/BE trên một node Anvil đang chạy.

## 2. Phân biệt vai trò donation và gas

Donation, bond và refund dùng token đã cấu hình. Ethereum dùng ETH trả gas;
Avalanche C-Chain dùng AVAX. Đổi mạng không tự tạo trải nghiệm chỉ cần USDC.

Đây là mô hình hai tài sản trên Ethereum/Avalanche, không phải quy tắc cho mọi
mạng EVM. Arc là hướng ưu tiên đánh giá: donation và gas có thể cùng là USDC,
native interface 18 decimals và ERC20 interface 6 decimals cùng một balance.
Không cộng hai balance; vẫn cần reserve phí. Xem
[Arc evaluation](./FundTogether_Arc_Evaluation_v0.1.md).

Dev hiện dùng EOA trực tiếp: kiểm tra allowance, approve nếu thiếu, rồi donate.
Mỗi transaction trực tiếp cần native gas, bao gồm refund/challenge và các action
organizer/verifier. Chữ ký off-chain hoặc permit không tự trả gas transaction cuối.

FE kiểm tra đúng chain, token balance, allowance và native balance/fee estimate
cho từng hành động. Estimate chỉ là dự kiến và cần reserve; revert có thể tốn gas.
Không so gas units với số dư ETH, không dùng Number/parseFloat để tính tiền/phí.

Gas vận hành relayer/sponsor phải tách khỏi escrow và bond. Không tự trừ gas
từ donation/refund. Ai chịu phí hoặc thu phí USDC production vẫn cần chốt.

Trên Arc không cần sponsorship chỉ để bỏ yêu cầu mua ETH/AVAX; sponsorship vẫn
là lựa chọn riêng nếu muốn nền tảng trả phí. Chưa thay baseline Anvil hiện tại.

## 3. Sponsorship là hướng mở rộng

USDC authorization + relayer và smart account + paymaster là hai hướng đã
thảo luận; chưa chọn provider và chưa có entrypoint hỗ trợ trong contract.
Contract đang dùng msg.sender cho đóng góp, refund, challenge và quyền organizer.
Không gọi donate bằng ví relayer rồi ghi ví đó thành donor.

Luồng mới phải xác thực đúng actor và ý định với binding campaign, amount,
chain/contract, nonce và deadline theo chuẩn thích hợp; chống replay, sai context
và failure. Claim thay chỉ được triển khai khi tiền luôn trả đúng người có quyền.
Đăng nhập bằng ví không cấp backend quyền gửi transaction thay ví đó.

MockUSDC chỉ mô phỏng ERC20 cơ bản, không có permit/EIP-3009. Khi làm relayer
cần mock tương ứng và test donor có 0 native token. Kiểm tra đúng USDC trên
mạng đích; không giả định USDT hoặc bridged token có cùng authorization API.
Donate, refund và challenge cần xét riêng; tài trợ một action không làm toàn bộ
hệ thống gasless. Smart account có địa chỉ mới cũng cần giải quyết đưa USDC từ
ví cũ vào tài khoản đó, không mặc định tiền đã có ở smart account.

## 4. FE/BE TypeScript và cấu hình

Shared deployment metadata gồm chainId, RPC, nativeCurrency, token/address/decimals,
escrow address, deployment block và ABI version. Không hardcode ETH, USDC hoặc
mainnet address trong feature components. Định danh campaign dùng
chainId + contractAddress + campaignId; đổi mạng không dùng lại ID một cách mơ hồ.

Token units, native balances, gas limit, gas price và fee totals dùng bigint.
JSON dùng decimal strings, không serialize bigint trực tiếp. Decimals và chainId
có thể dùng number khi an toàn và phù hợp SDK; quy tắc bigint cho tiền không
bắt mọi metadata phải là bigint.

Ở EIP-1559, gasLimit × maxFeePerGas là execution fee cap ước tính, không phải
chi phí universal cho mọi chain. Tính cả reserve, transaction value và thành phần
phí riêng của mạng nếu có. Fee quote có thể hết hạn trước khi gửi.

## 5. Chuyển mạng

Trước production: deploy mới, kiểm thử lại và đổi cấu hình tích hợp. Avalanche
C-Chain là ứng viên, chưa được chọn. Sau khi campaign giữ tiền: deploy mới không
tự chuyển token, bond, state hoặc refund rights. Hướng đề xuất là campaign cũ
kết thúc trên mạng cũ, campaign mới mở trên mạng mới. Di chuyển campaign đang
hoạt động cần thiết kế riêng, không tự coi bridge token là migration campaign.

## 6. Yêu cầu kiểm tra khi triển khai (chưa chạy trong lần cập nhật docs)

- Đủ MockUSDC nhưng thiếu native ETH: hiển thị thiếu gas, không báo thành công.
- Allowance thiếu/đủ: approve chỉ khi cần; theo dõi receipt riêng từng transaction.
- Wrong chain/address: chặn trước gửi; không lấy số dư ở mạng khác.
- Amount/fee lớn hơn miền số nguyên an toàn JS: không mất precision.
- Wallet reject, estimate failure, mined revert và indexer delay: phân biệt rõ.
- Sponsorship tương lai: donor 0 native token; ghi đúng donor; replay/sai context bị chặn.

## Nguồn kỹ thuật

- [Ethereum gas](https://ethereum.org/developers/docs/gas/)
- [Avalanche C-Chain và native gas](https://docs.avax.network/docs/avalanche-l1s)
- [ERC-3009](https://eips.ethereum.org/EIPS/eip-3009)
- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)

## 7. Cổng kiểm chứng Arc

Theo [Arc evaluation](./FundTogether_Arc_Evaluation_v0.1.md), thêm bước kiểm tra
Arc Foundry/runtime trước public integration; regular Anvil chỉ chứng minh local
Ethereum-style behavior. Native send dùng 18 decimals, không dùng đơn vị ERC20
6 decimals cho tx.value. Cấu hình finality, log range và retry theo Arc/provider;
không suy ra cùng SDK EVM thì trải nghiệm và accounting tự tương thích.

Các network/deployment metadata vẫn là TODO; cập nhật docs không cấu hình mạng
cho ví/backend, không tạo địa chỉ escrow và không migrate campaign.
