// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IFundTogetherRefundVault
/// @notice Shared multi-campaign Refund Vault with O(1) gas sweep, pull-based claims, and indefinite backer rights
interface IFundTogetherRefundVault {
    struct CampaignVaultRecord {
        address sourceEscrow;
        address paymentToken;
        uint256 campaignId;
        uint256 roundId;
        uint256 totalSwept;
        uint256 totalSupplements;
        uint256 totalClaimed;
        uint256 totalRaisedSnapshot;
        uint256 mainRoundClaimedSnapshot;
        uint256 sweepTimestamp;
        uint256 dustBalance;
        bool isSwept;
    }

    struct BackerVaultClaim {
        uint256 totalEntitled;
        uint256 claimedInMain;
        uint256 claimedInVault;
        uint256 claimableNow;
    }

    // --- Audit & Canonical Events ---
    event VaultFundsSwept(
        bytes32 indexed campaignKey,
        address indexed sourceEscrow,
        uint256 indexed campaignId,
        uint256 amount,
        uint256 sweepTimestamp
    );
    event SupplementDeposited(bytes32 indexed campaignKey, uint256 amount, address indexed sender);
    event VaultRefundClaimed(bytes32 indexed campaignKey, address indexed backer, uint256 amount);
    event DustRecorded(bytes32 indexed campaignKey, uint256 dustAmount);
    event SourceEscrowRegistered(address indexed sourceEscrow, address indexed paymentToken);

    // Registration is owner/admin controlled in the implementation. An unregistered
    // escrow must never be able to create or supplement a campaign vault record.
    function registerSourceEscrow(address sourceEscrow, address paymentToken) external;
    function registeredPaymentToken(address sourceEscrow) external view returns (address);

    // --- Core Vault Functions ---
    /// @notice O(1) gas sweep of unclaimed main round escrow.
    /// @dev The implementation must validate all supplied snapshots against the
    /// canonical getRefundSweepData() view of the registered msg.sender escrow.
    function sweepFromEscrow(
        uint256 campaignId,
        uint256 roundId,
        uint256 amountToSweep,
        uint256 totalRaisedSnapshot,
        uint256 mainRoundClaimedSnapshot
    ) external returns (bytes32 campaignKey);

    /// @notice Receive late voluntary token returns from creator / payer
    function receiveSupplement(bytes32 campaignKey, uint256 amount) external;

    /// @notice Pull-based claim for individual backer (indefinite entitlement)
    function claimFromVault(bytes32 campaignKey) external returns (uint256 amountClaimed);

    // --- View Functions ---
    function getCampaignKey(address sourceEscrow, address paymentToken, uint256 campaignId, uint256 roundId)
        external
        pure
        returns (bytes32);

    function getBackerVaultAllocation(bytes32 campaignKey, address backer)
        external
        view
        returns (BackerVaultClaim memory);
    function getCampaignVaultRecord(bytes32 campaignKey) external view returns (CampaignVaultRecord memory);
    function getIsolatedBalance(bytes32 campaignKey) external view returns (uint256);
}
