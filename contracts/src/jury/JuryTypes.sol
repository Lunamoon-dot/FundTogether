// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Shared Judge/court primitives for the VNext review protocol.
/// @dev This library contains no stake custody or settlement behavior.
library JuryTypes {
    enum Vote {
        NONE,
        PASS,
        FAIL
    }

    enum CourtResult {
        NONE,
        PASS,
        FAIL,
        TIED,
        INVALID
    }

    enum SeatState {
        AVAILABLE,
        CASE_LOCKED,
        ASSIGNED,
        COMMITTED,
        REVEALED,
        FINAL_SETTLEMENT,
        REWARD,
        SLASH,
        UNLOCK
    }

    /// @notice Commit preimage specified by the VNext protocol. Plaintext vote
    /// and salt are included only in the hash, never in the commit event.
    function voteCommitment(
        uint256 chainId,
        uint256 protocolVersion,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 evidenceRevision,
        uint256 reviewCaseId,
        uint256 roundId,
        uint256 courtId,
        address judgeAddress,
        Vote vote,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                chainId,
                protocolVersion,
                campaignId,
                milestoneId,
                evidenceRevision,
                reviewCaseId,
                roundId,
                courtId,
                judgeAddress,
                vote,
                salt
            )
        );
    }

    /// @notice V1 court validity: exactly three unique non-zero Judges and all
    /// three assigned Judges reveal before aggregation.
    function validCourt(address[3] memory judges, bool[3] memory revealed)
        internal
        pure
        returns (bool)
    {
        if (judges[0] == address(0) || judges[1] == address(0) || judges[2] == address(0)) {
            return false;
        }
        if (judges[0] == judges[1] || judges[0] == judges[2] || judges[1] == judges[2]) {
            return false;
        }
        return revealed[0] && revealed[1] && revealed[2];
    }
}
