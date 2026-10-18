# Archived proposal — Core V2 Progressive Funding

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


> **Status:** `DEFERRED / NOT CURRENT CAMPAIGNS DIRECTION`
>
> **Archived on:** 2026-10-14

This document is retained for historical traceability only. It described a
separate progressive-advance model with creator disbursements, funding requests,
expense reconciliation, outcome-exposure caps, continuous spending challenges,
and proportional refund handling.

That model is not the current FundTogether product direction. The active product
is FundTogether Campaign: one fixed-price digital-download pledge, no creator
advance, accepted final PDF before payout, a 7-day release challenge window, and
full refund from intact escrow when the campaign becomes refund-eligible.

Use these documents for current decisions and implementation:

- [Research direction](../../research-direction.md)
- [Project overview](../../PROJECT_OVERVIEW.md)
- [Campaign local financial policy v1](../../campaigns/FINANCIAL_POLICY_V1.md)
- [Corrected H1 technical blueprint](../../architecture/CAMPAIGNS_H1_BLUEPRINT.md)

The archived proposal does not authorize:

- a new progressive escrow contract;
- `FundingRequest` or `returnUnused` transfers;
- a 50% outcome-exposure gate;
- a shared refund vault;
- continuous challenge for spending or milestones;
- schema, deployment, or runtime changes.

Existing V1 financial obligations and historical records remain governed by their
versioned contracts and policies. If progressive funding is reconsidered later,
it requires a new explicit product decision, a separate policy version, an
isolated deployment, and a new acceptance plan.
