// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice One authorization permits one release. File bytes and personal data stay off-chain.
/// @dev A deletion attestation is an auditable claim, not a proof that every copy disappeared.
contract OneTimePrintProtocol {
    enum Status { None, Active, Consumed, Revoked }

    struct Grant {
        address customer;
        bytes32 documentCommitment;
        bytes32 shopCommitment;
        uint64 expiresAt;
        Status status;
        bytes32 deletionEvidenceHash;
    }

    struct GrantPermit {
        bytes32 grantId;
        address customer;
        bytes32 documentCommitment;
        bytes32 shopCommitment;
        uint64 expiresAt;
        uint256 nonce;
    }

    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PERMIT_TYPEHASH = keccak256("GrantPermit(bytes32 grantId,address customer,bytes32 documentCommitment,bytes32 shopCommitment,uint64 expiresAt,uint256 nonce)");
    bytes32 private constant NAME_HASH = keccak256("Eksara One-Time Print");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_N_HALF = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public owner;
    address public relayer;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => Grant) public grants;

    event GrantCreated(bytes32 indexed grantId, address indexed customer, bytes32 documentCommitment, bytes32 shopCommitment, uint64 expiresAt);
    event GrantConsumed(bytes32 indexed grantId, address indexed relayer);
    event GrantRevoked(bytes32 indexed grantId, address indexed actor);
    event DeletionAttested(bytes32 indexed grantId, bytes32 evidenceHash);
    event RelayerChanged(address indexed oldRelayer, address indexed newRelayer);

    error Unauthorized();
    error InvalidPermit();
    error InvalidGrant();
    error Expired();
    error AlreadyUsed();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert Unauthorized();
        _;
    }

    constructor(address initialRelayer) {
        if (initialRelayer == address(0)) revert InvalidGrant();
        owner = msg.sender;
        relayer = initialRelayer;
    }

    function setRelayer(address nextRelayer) external {
        if (msg.sender != owner) revert Unauthorized();
        if (nextRelayer == address(0)) revert InvalidGrant();
        emit RelayerChanged(relayer, nextRelayer);
        relayer = nextRelayer;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function permitDigest(GrantPermit calldata permit) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            PERMIT_TYPEHASH, permit.grantId, permit.customer, permit.documentCommitment,
            permit.shopCommitment, permit.expiresAt, permit.nonce
        ));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function createGrant(GrantPermit calldata permit, bytes calldata signature) external onlyRelayer {
        if (permit.grantId == bytes32(0) || permit.customer == address(0) || permit.documentCommitment == bytes32(0)
            || permit.shopCommitment == bytes32(0) || permit.expiresAt <= block.timestamp) revert InvalidGrant();
        if (grants[permit.grantId].status != Status.None || permit.nonce != nonces[permit.customer]) revert InvalidPermit();
        if (_recover(permitDigest(permit), signature) != permit.customer) revert InvalidPermit();

        unchecked { nonces[permit.customer]++; }
        grants[permit.grantId] = Grant({
            customer: permit.customer,
            documentCommitment: permit.documentCommitment,
            shopCommitment: permit.shopCommitment,
            expiresAt: permit.expiresAt,
            status: Status.Active,
            deletionEvidenceHash: bytes32(0)
        });
        emit GrantCreated(permit.grantId, permit.customer, permit.documentCommitment, permit.shopCommitment, permit.expiresAt);
    }

    function consumeGrant(bytes32 grantId) external onlyRelayer {
        Grant storage grant = grants[grantId];
        if (grant.status != Status.Active) revert AlreadyUsed();
        if (grant.expiresAt <= block.timestamp) revert Expired();
        grant.status = Status.Consumed;
        emit GrantConsumed(grantId, msg.sender);
    }

    function revokeGrant(bytes32 grantId) external {
        Grant storage grant = grants[grantId];
        if (grant.status != Status.Active) revert AlreadyUsed();
        if (msg.sender != grant.customer && msg.sender != relayer) revert Unauthorized();
        grant.status = Status.Revoked;
        emit GrantRevoked(grantId, msg.sender);
    }

    /// @notice Records a hash of signed off-chain deletion evidence, never a claim of absolute deletion.
    function attestDeletion(bytes32 grantId, bytes32 evidenceHash) external onlyRelayer {
        Grant storage grant = grants[grantId];
        if (grant.status != Status.Consumed || evidenceHash == bytes32(0)) revert InvalidGrant();
        if (grant.deletionEvidenceHash != bytes32(0)) revert AlreadyUsed();
        grant.deletionEvidenceHash = evidenceHash;
        emit DeletionAttested(grantId, evidenceHash);
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidPermit();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1_N_HALF || (v != 27 && v != 28)) revert InvalidPermit();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidPermit();
        return signer;
    }
}
