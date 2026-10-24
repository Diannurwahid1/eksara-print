import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createPublicClient, createWalletClient, http, verifyTypedData, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const grantTypes = { GrantPermit: [
  { name: "grantId", type: "bytes32" }, { name: "customer", type: "address" },
  { name: "documentCommitment", type: "bytes32" }, { name: "shopCommitment", type: "bytes32" },
  { name: "expiresAt", type: "uint64" }, { name: "nonce", type: "uint256" }
] } as const;

const abi = [
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "grants", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [
    { name: "customer", type: "address" }, { name: "documentCommitment", type: "bytes32" },
    { name: "shopCommitment", type: "bytes32" }, { name: "expiresAt", type: "uint64" },
    { name: "status", type: "uint8" }, { name: "deletionEvidenceHash", type: "bytes32" }
  ] },
  { type: "function", name: "createGrant", stateMutability: "nonpayable", inputs: [
    { name: "permit", type: "tuple", components: [
      { name: "grantId", type: "bytes32" }, { name: "customer", type: "address" },
      { name: "documentCommitment", type: "bytes32" }, { name: "shopCommitment", type: "bytes32" },
      { name: "expiresAt", type: "uint64" }, { name: "nonce", type: "uint256" }
    ] }, { name: "signature", type: "bytes" }
  ], outputs: [] },
  { type: "function", name: "consumeGrant", stateMutability: "nonpayable", inputs: [{ name: "grantId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "revokeGrant", stateMutability: "nonpayable", inputs: [{ name: "grantId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "attestDeletion", stateMutability: "nonpayable", inputs: [{ name: "grantId", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }], outputs: [] }
] as const;

@Injectable()
export class ChainService {
  private config() {
    const rpc = process.env.MONAD_RPC_URL;
    const contract = process.env.MONAD_CONTRACT_ADDRESS;
    const key = process.env.MONAD_RELAYER_PRIVATE_KEY;
    const chainId = Number(process.env.MONAD_CHAIN_ID);
    if (!rpc || !contract || !key || !chainId || !/^0x[a-fA-F0-9]{40}$/.test(contract) || !/^0x[a-fA-F0-9]{64}$/.test(key))
      throw new ServiceUnavailableException("Monad protocol is not configured");
    const chain = { id: chainId, name: "Monad", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
    return { rpc, contract: contract as `0x${string}`, account: privateKeyToAccount(key as Hex), chain };
  }

  async nonce(customer: `0x${string}`): Promise<bigint> {
    const { rpc, contract, chain } = this.config();
    return createPublicClient({ chain, transport: http(rpc) }).readContract({ address: contract, abi, functionName: "nonces", args: [customer] });
  }

  async grant(grantId: Hex) {
    const { rpc, contract, chain } = this.config();
    const [customer, documentCommitment, shopCommitment, expiresAt, status, deletionEvidenceHash] =
      await createPublicClient({ chain, transport: http(rpc) }).readContract({ address: contract, abi, functionName: "grants", args: [grantId] });
    return { customer, documentCommitment, shopCommitment, expiresAt, status, deletionEvidenceHash };
  }

  domain() {
    const { contract, chain } = this.config();
    return { name: "Eksara One-Time Print", version: "1", chainId: chain.id, verifyingContract: contract } as const;
  }

  async verify(customer: `0x${string}`, permit: { grantId: Hex; customer: `0x${string}`; documentCommitment: Hex; shopCommitment: Hex; expiresAt: bigint; nonce: bigint }, signature: Hex) {
    return verifyTypedData({ address: customer, domain: this.domain(), types: grantTypes, primaryType: "GrantPermit", message: permit, signature });
  }

  private async submit(functionName: "createGrant" | "consumeGrant" | "revokeGrant" | "attestDeletion", args: readonly unknown[]): Promise<Hex> {
    const { rpc, contract, account, chain } = this.config();
    const client = createWalletClient({ account, chain, transport: http(rpc) });
    const publicClient = createPublicClient({ chain, transport: http(rpc) });
    // The ABI is fixed locally; this cast keeps the three mutations behind one receipt check.
    const hash = await client.writeContract({ address: contract, abi, functionName, args, account, chain } as Parameters<typeof client.writeContract>[0]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90000 });
    if (receipt.status !== "success") throw new Error(`Monad transaction reverted: ${hash}`);
    return hash;
  }

  createGrant(permit: { grantId: Hex; customer: `0x${string}`; documentCommitment: Hex; shopCommitment: Hex; expiresAt: bigint; nonce: bigint }, signature: Hex) {
    return this.submit("createGrant", [permit, signature]);
  }
  consumeGrant(grantId: Hex) { return this.submit("consumeGrant", [grantId]); }
  revokeGrant(grantId: Hex) { return this.submit("revokeGrant", [grantId]); }
  attestDeletion(grantId: Hex, evidenceHash: Hex) { return this.submit("attestDeletion", [grantId, evidenceHash]); }
}
