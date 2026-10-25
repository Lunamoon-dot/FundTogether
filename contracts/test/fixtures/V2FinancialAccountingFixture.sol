pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { V2FundingFixture } from "./V2FundingFixture.sol";

/// @notice Isolated, test-only PR2 accounting fixture. It is not deployment code.
contract V2FinancialAccountingFixture is V2FundingFixture {
    bytes32 public constant ACCOUNTING_DEPLOYMENT_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10_000;
    uint256 public constant REFERENCE_COURT_SIZE = 3;
    uint256 public constant MAX_VALID_COURTS = 2;

    bytes32 public immutable accountingDeploymentIdentity;
    address public immutable outcomeSource;

    error InvalidFinancialTerms();
    error InvalidFixtureIdentity();

    constructor(IERC20 token_, bytes32 accountingDeploymentIdentity_, address outcomeSource_)
        V2FundingFixture(token_, keccak256("fundtogether-vnext-v2-pr1-funding-fixture"))
    {
        if (
            accountingDeploymentIdentity_ != ACCOUNTING_DEPLOYMENT_IDENTITY
                || outcomeSource_ == address(0)
        ) revert InvalidFixtureIdentity();

        accountingDeploymentIdentity = accountingDeploymentIdentity_;
        outcomeSource = outcomeSource_;
    }

    function deriveFinancialTerms(uint256 fundingTarget, uint256 rewardRateBps)
        public
        pure
        returns (uint256 rewardUnit, uint256 maxReviewReserve, uint256 creatorPayoutBudget)
    {
        if (
            fundingTarget == 0 || rewardRateBps == 0
                || fundingTarget > type(uint256).max / rewardRateBps
        ) revert InvalidFinancialTerms();

        rewardUnit = fundingTarget * rewardRateBps / BASIS_POINTS_DENOMINATOR;
        if (rewardUnit == 0 || rewardUnit > type(uint256).max / REFERENCE_COURT_SIZE) {
            revert InvalidFinancialTerms();
        }

        maxReviewReserve = rewardUnit * REFERENCE_COURT_SIZE;
        if (maxReviewReserve > type(uint256).max / MAX_VALID_COURTS) {
            revert InvalidFinancialTerms();
        }
        maxReviewReserve *= MAX_VALID_COURTS;

        if (maxReviewReserve >= fundingTarget) revert InvalidFinancialTerms();
        creatorPayoutBudget = fundingTarget - maxReviewReserve;
        if (creatorPayoutBudget == 0) revert InvalidFinancialTerms();
    }
}
