# FundTogether research direction

> **Status:** Current source of truth for product scope.

Current product is **FundTogether**, a deliberately narrow Reward Crowdfunding pilot for independent digital comics and artbooks. It evaluates evidence-backed creator/IP review, one frozen digital-download benefit, escrowed pledges, production-evidence review, private PDF release, disputes and refunds. Physical fulfilment, shipping and logistics are outside the MVP.

Blockchain holds financial transitions. PostgreSQL stores application records and indexed projections. Object storage holds private final-PDF and evidence material. A transaction is not complete merely because a wallet submitted it; the canonical receipt and indexer projection are required.

## Research boundary

The current Campaign implementation is a permissioned review workflow with
on-chain financial settlement. Admin/Resolver roles and the Primary/Backup
Resolver pair remain trusted human authorities for identity, publication,
production/release, completion and dispute decisions; Community Review is
advisory. The contract enforces custody and the consequences of an authorized
decision, but it does not independently determine whether off-chain evidence
is truthful.

Therefore the current product must not be described as decentralized
verification, trustless governance, or review-to-earn. A reviewer/juror pool,
voting, staking or reviewer rewards, commit–reveal, challenge and dispute
mechanisms are deferred research candidates only. Before any such mechanism is
implemented, its threat model, Sybil and collusion assumptions, incentives,
quorum/liveness rules, no-reviewer behavior and comparison with centralized
review and simple majority voting must be specified and evaluated.

The current repository does not retain active legacy charity workflow implementation. Archived local state is outside the running product and must not be started, migrated, or treated as current evidence.
