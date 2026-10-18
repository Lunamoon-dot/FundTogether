# FundTogether research direction

> **Status:** Current source of truth for product scope.

Current product is **FundTogether**, a deliberately narrow Reward Crowdfunding pilot for independent digital comics and artbooks. It evaluates evidence-backed creator/IP review, one frozen digital-download benefit, escrowed pledges, production-evidence review, private PDF release, disputes and refunds. Physical fulfilment, shipping and logistics are outside the MVP.

Blockchain holds financial transitions. PostgreSQL stores application records and indexed projections. Object storage holds private final-PDF and evidence material. A transaction is not complete merely because a wallet submitted it; the canonical receipt and indexer projection are required.

The current repository does not retain active legacy charity workflow implementation. Archived local state is outside the running product and must not be started, migrated, or treated as current evidence.
