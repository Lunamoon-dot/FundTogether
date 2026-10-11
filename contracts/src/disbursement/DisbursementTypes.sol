pragma solidity 0.8.24;

library DisbursementTypes {
    enum CampaignState { FUNDING, ACTIVE, WIND_DOWN, COMPLETED, STOPPED }
    enum RequestState { DRAFT, SUBMITTED, APPROVED_RESERVED, VENDOR_COMMITTED, DELIVERY_CANDIDATE, FINANCIALLY_SETTLED, CANCELLED }

    struct CampaignView {
        address organizer;
        bytes32 commitmentHash;
        uint256 goal;
        uint256 fundingEnd;
        CampaignState state;
        uint256 contributed;
        uint256 available;
        uint256 reserved;
        uint256 grossPaid;
        uint256 basePool;
        uint256 refunded;
        bool refundSnapshotted;
    }

    struct RequestView {
        bytes32 requestHash;
        address vendor;
        bytes32 termsHash;
        uint256 approvedAmount;
        uint256 depositAmount;
        uint256 grossPaid;
        uint256 returned;
        uint256 acceptedDeliveryValue;
        uint256 challengeEnd;
        RequestState state;
    }
}
