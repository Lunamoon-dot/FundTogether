pragma solidity 0.8.24;

import { FundTogetherFunding } from "./modules/FundTogetherFunding.sol";
import { FundTogetherMilestones } from "./modules/FundTogetherMilestones.sol";
import { FundTogetherEvidence } from "./modules/FundTogetherEvidence.sol";

/// @dev One deployed contract owns all campaign state and token custody.
/// Modules share a single FundTogetherBase through Solidity inheritance.
contract FundTogether is FundTogetherFunding, FundTogetherMilestones, FundTogetherEvidence {
    constructor() { }
}
