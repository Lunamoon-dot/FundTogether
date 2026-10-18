# Architecture

- [Campaign H1 blueprint](CAMPAIGNS_H1_BLUEPRINT.md) — kiến trúc hiện hành đã hiệu chỉnh về đúng scope một PDF.
- [Project overview](../PROJECT_OVERVIEW.md) — tổng quan runtime và source-of-truth boundaries.

Kiến trúc hiện tại dùng một namespace kỹ thuật thống nhất: `fundtogether` cho
runtime và `campaigns` cho domain. Không có API, module, bảng, env, manifest,
contract artifact hay compatibility route đang chạy dưới namespace `reward`.

