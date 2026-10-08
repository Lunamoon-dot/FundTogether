pragma solidity 0.8.24;

import { FundTogether } from "./FundTogether.sol";

/// @dev Deployment boundary for the configured exact-transfer ERC20.
contract FundTogetherConfigured is FundTogether {
    address public immutable supportedToken;
    // ID plus one distinguishes campaign zero from an unused draft key.
    mapping(address organizer => mapping(bytes32 draftKey => uint256)) public campaignForDraft;

    constructor(address token) {
        require(token.code.length > 0, "token contract required");
        supportedToken = token;
    }

    function createCampaign(string calldata name, address token, uint256 deadline, uint256[] calldata budgets)
        public override returns (uint256 campaignId)
    {
        require(token == supportedToken, "unsupported token");
        return super.createCampaign(name, token, deadline, budgets);
    }

    function createCampaignForDraft(bytes32 draftKey, string calldata name, uint256 deadline, uint256[] calldata budgets)
        public returns (uint256 campaignId)
    {
        require(draftKey != bytes32(0), "draft key required");
        require(campaignForDraft[msg.sender][draftKey] == 0, "draft already created");
        campaignId = createCampaign(name, supportedToken, deadline, budgets);
        campaignForDraft[msg.sender][draftKey] = campaignId + 1;
    }

    /// @dev A failed bond transfer rolls back creation, criteria and draft-key consumption.
    function submitCampaignForDraft(
        bytes32 draftKey,
        string calldata name,
        uint256 deadline,
        uint256[] calldata budgets,
        bytes32[] calldata criteriaHashes
    ) external nonReentrant returns (uint256 campaignId) {
        require(criteriaHashes.length == budgets.length, "criteria length mismatch");
        campaignId = createCampaignForDraft(draftKey, name, deadline, budgets);
        for (uint256 i; i < criteriaHashes.length; ++i) {
            configureMilestoneCriteria(campaignId, i, criteriaHashes[i]);
        }
        _lockBond(campaignId);
    }
}
