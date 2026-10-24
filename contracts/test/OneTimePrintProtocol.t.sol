// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../src/OneTimePrintProtocol.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract OneTimePrintProtocolTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant CUSTOMER_KEY = 0xA11CE;

    function _permit(OneTimePrintProtocol protocol, bytes32 grantId, uint64 expiresAt)
        private returns (OneTimePrintProtocol.GrantPermit memory permit, bytes memory signature)
    {
        permit = OneTimePrintProtocol.GrantPermit({
            grantId: grantId,
            customer: vm.addr(CUSTOMER_KEY),
            documentCommitment: keccak256("private document and salt"),
            shopCommitment: keccak256("authorized station"),
            expiresAt: expiresAt,
            nonce: protocol.nonces(vm.addr(CUSTOMER_KEY))
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(CUSTOMER_KEY, protocol.permitDigest(permit));
        signature = abi.encodePacked(r, s, v);
    }

    function testGrantCannotBeConsumedTwice() public {
        OneTimePrintProtocol protocol = new OneTimePrintProtocol(address(this));
        (OneTimePrintProtocol.GrantPermit memory permit, bytes memory signature) =
            _permit(protocol, keccak256("grant-1"), uint64(block.timestamp + 1 hours));
        protocol.createGrant(permit, signature);
        protocol.consumeGrant(permit.grantId);
        bool reverted;
        try protocol.consumeGrant(permit.grantId) { reverted = false; } catch { reverted = true; }
        require(reverted, "grant was consumed twice");
        protocol.attestDeletion(permit.grantId, keccak256("deletion evidence"));
    }

    function testSignedPermitCannotBeReplayed() public {
        OneTimePrintProtocol protocol = new OneTimePrintProtocol(address(this));
        (OneTimePrintProtocol.GrantPermit memory permit, bytes memory signature) =
            _permit(protocol, keccak256("grant-2"), uint64(block.timestamp + 1 hours));
        protocol.createGrant(permit, signature);
        bool reverted;
        try protocol.createGrant(permit, signature) { reverted = false; } catch { reverted = true; }
        require(reverted, "permit replayed");
    }

    function testDeletionAttestationRequiresConsumption() public {
        OneTimePrintProtocol protocol = new OneTimePrintProtocol(address(this));
        (OneTimePrintProtocol.GrantPermit memory permit, bytes memory signature) =
            _permit(protocol, keccak256("grant-3"), uint64(block.timestamp + 1 hours));
        protocol.createGrant(permit, signature);
        bool reverted;
        try protocol.attestDeletion(permit.grantId, keccak256("evidence")) { reverted = false; } catch { reverted = true; }
        require(reverted, "deletion was attested before consume");
    }

    function testExpiredGrantCannotBeConsumed() public {
        OneTimePrintProtocol protocol = new OneTimePrintProtocol(address(this));
        (OneTimePrintProtocol.GrantPermit memory permit, bytes memory signature) =
            _permit(protocol, keccak256("grant-4"), uint64(block.timestamp + 1));
        protocol.createGrant(permit, signature);
        vm.warp(block.timestamp + 2);
        bool reverted;
        try protocol.consumeGrant(permit.grantId) { reverted = false; } catch { reverted = true; }
        require(reverted, "expired grant consumed");
    }
}
