pragma solidity 0.8.24;

library DisbursementTypes {
    enum CampaignState { FUNDING, ACTIVE, WIND_DOWN, COMPLETED, STOPPED }
    enum RequestState { DRAFT, SUBMITTED, APPROVED_RESERVED, VENDOR_COMMITTED, DELIVERY_CANDIDATE, FINANCIALLY_SETTLED, CANCELLED }
    enum ActivityState { OPEN, OUTCOME_CANDIDATE, VERIFIED, CANCELLED_NO_SPEND, FAILED }

    struct CampaignView {
        address organizer;
        bytes32 commitmentHash;
        uint256 goal;
        uint256 fundingEnd;
        uint256 fullyFundedAt;
        uint256 activeAt;
        uint256 executionEnd;
        CampaignState state;
        uint256 contributed;
        uint256 available;
        uint256 reserved;
        uint256 grossPaid;
        uint256 basePool;
        uint256 supplementPool;
        uint256 refunded;
        bool refundSnapshotted;
    }

    struct RequestView {
        uint256 activityId;
        bytes32 requestHash;
        address vendor;
        bytes32 termsHash;
        uint256 approvedAmount;
        uint256 depositAmount;
        uint256 grossPaid;
        uint256 returned;
        uint256 acceptedDeliveryValue;
        uint256 challengeEnd;
        uint256 approvedAt;
        uint256 committedAt;
        uint256 submittedAt;
        RequestState state;
    }

    struct ActivityView {
        bytes32 commitmentHash;
        uint256 ceiling;
        uint256 approved;
        uint256 challengeEnd;
        ActivityState state;
    }
}
