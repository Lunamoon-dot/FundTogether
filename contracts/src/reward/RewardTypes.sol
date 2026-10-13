pragma solidity 0.8.24;

library RewardTypes {
    enum CampaignState { FUNDING, ACTIVE, PRODUCTION_VERIFIED, FULFILLMENT_COMPLETE, COMPLETED, STOPPED }
    enum RequestState { SUBMITTED, APPROVED_DISBURSED, EXPENDITURE_CANDIDATE, FINANCIALLY_SETTLED, CANCELLED }

    struct TierView {
        uint256 price;
        uint256 maxQuantity;
        uint256 pledgedQuantity;
        bool isDigital;
    }

    struct CampaignView {
        address creator;
        bytes32 commitmentHash;
        uint256 goal;
        uint256 fundingEnd;
        uint256 fullyFundedAt;
        uint256 activeAt;
        uint256 executionEnd;
        CampaignState state;
        uint256 contributed;
        uint256 available;
        uint256 grossPaid;
        uint256 basePool;
        uint256 supplementPool;
        uint256 refunded;
        bool refundSnapshotted;
        bytes32 productionReportHash;
        bytes32 fulfillmentReportHash;
    }

    struct RequestView {
        bytes32 requestHash;
        address recipient;
        uint256 approvedAmount;
        uint256 grossPaid;
        uint256 returned;
        uint256 acceptedExpenditure;
        bytes32 expenditureReportHash;
        uint256 submittedAt;
        uint256 approvedAt;
        uint256 challengeEnd;
        RequestState state;
    }
}
