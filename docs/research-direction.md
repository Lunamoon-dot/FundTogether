# FundTogether research direction

Current product scope is a Reward Crowdfunding pilot for independent comics and artbooks. The system evaluates evidence-backed production and fulfillment controls: Creator identity/IP review, campaign/tier review, escrowed pledges, capped production payments, evidence review, fulfillment, disputes, and refunds.

Blockchain holds financial transitions. PostgreSQL stores application records and indexed projections. Object storage holds private shipping/evidence material. A transaction is not complete merely because a wallet submitted it; the canonical receipt and indexer projection are required.

The current repository does not retain active legacy charity workflow implementation. Archived local state is outside the running product and must not be started, migrated, or treated as current evidence.
