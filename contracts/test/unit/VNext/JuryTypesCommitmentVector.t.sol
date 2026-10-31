// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { JuryTypes } from "../../../src/jury/JuryTypes.sol";

contract JuryTypesCommitmentVectorTest is Test {
    function test_voteCommitmentMatchesFrontendVector() public pure {
        bytes32 commitment = JuryTypes.voteCommitment(
            31339,
            1,
            7,
            2,
            3,
            11,
            4,
            1,
            0x1111111111111111111111111111111111111111,
            JuryTypes.Vote.FAIL,
            bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222))
        );

        assertEq(
            commitment,
            0x4f6ff2d767079cdb54f6b3a36f73d20969a6ec7ab35dfd8868f75c6e5e7e2449
        );
    }
}
