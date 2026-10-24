"use client";

import { useState } from "react";
import { ArrowRight, CircleCheck, Copy, ExternalLink, FileText, Fingerprint, LockKeyhole, Printer, ScanFace, ShieldCheck, Trash2, Wallet } from "lucide-react";

const contractAddress = "0x43498edae5e8e508f5236b0d88aeb14e86eaa2a7";
const explorerUrl = `https://testnet.monadexplorer.com/address/${contractAddress}`;

const phases = [
  { label: "Prepare", title: "Store the document privately", detail: "The customer uploads a file and sets print preferences. ID contents, the PIN, and the filename are never sent to the blockchain.", chain: "No transaction yet", local: "File encrypted in transit; API controls access", icon: FileText },
  { label: "Authorize", title: "Sign a one-time permit", detail: "The customer wallet signs an EIP-712 permit. A relayer creates a grant with a document commitment and expiry on the contract.", chain: "GrantCreated(grantId)", local: "Link, PIN, and file remain off-chain", icon: Wallet },
  { label: "Release", title: "Redeem access once", detail: "The Station verifies the request. The contract moves the grant from Active to Consumed and rejects a second redemption.", chain: "GrantConsumed(grantId)", local: "File released to the Station for one print workflow", icon: Printer },
  { label: "Attest", title: "Record a deletion claim", detail: "After the print workflow, the system deletes the copies it manages and records a hash of the deletion evidence.", chain: "DeletionAttested(grantId, hash)", local: "Local deletion claim; not proof every copy is gone", icon: Trash2 }
] as const;

export function IdentityExposure() {
  const [controlled, setControlled] = useState(false);
  return <section id="risk" className="identity-section"><div className="shell identity-inner">
    <div className="identity-heading"><div className="eyebrow">WHY IDENTITY DOCUMENTS NEED A SAFER HANDOFF</div><h2>One identity file can leave <span>many copies behind.</span></h2><p>This illustration uses fully redacted data. Exposure can arise when files move through chats, download folders, and print shop computers without clear access or retention limits.</p></div>
    <div className="identity-grid"><div className={`identity-visual${controlled ? " controlled" : ""}`}>
      <div className="identity-visual-top"><span>IDENTITY DOCUMENT · ILLUSTRATION</span><span className="identity-redacted"><LockKeyhole size={13}/> DATA REDACTED</span></div>
      <div className="identity-card" aria-label="Illustrated identity card with all personal data redacted"><div className="identity-card-watermark">IDENTITY / PRIVATE</div><div className="identity-card-title">IDENTITY CARD <small>VISUAL EXAMPLE</small></div><div className="identity-card-content"><div className="identity-card-lines"><div><small>ID NUMBER</small><strong>•••• •••• •••• ••••</strong></div><div><small>NAME</small><strong>•••••••• •••••••</strong></div><div><small>ADDRESS</small><strong>•••••••••••••••••</strong></div><div><small>DATE OF BIRTH</small><strong>•• / •• / ••••</strong></div></div><div className="identity-photo"><ScanFace size={42}/><small>PHOTO</small></div></div><div className="identity-card-footer">ILLUSTRATION ONLY · NOT A REAL ID</div></div>
      <div className="identity-copy-track"><div className="identity-copy"><FileText size={18}/><span>File sent</span></div><ArrowRight size={17}/><div className="identity-copy"><Copy size={18}/><span>{controlled ? "Limited access" : "Saved in chat"}</span></div><ArrowRight size={17}/><div className={`identity-copy${controlled ? " safe" : " exposed"}`}><span>{controlled ? <ShieldCheck size={18}/> : <Copy size={18}/>}</span><span>{controlled ? "Access expires" : "Copy remains"}</span></div></div>
      <p className="identity-visual-foot">{controlled ? "Eksara limits digital release and records a deletion claim for the files it manages." : "An example exposure path, not a claim about any particular shop."}</p>
    </div><div className="identity-side"><div className="identity-switch" role="group" aria-label="Choose workflow view"><button type="button" className={!controlled ? "active" : ""} onClick={() => setControlled(false)}>Typical workflow</button><button type="button" className={controlled ? "active" : ""} onClick={() => setControlled(true)}>With Eksara</button></div><div className="identity-risk-list"><article><span>01</span><div><h3>Identity is easy to copy</h3><p>ID number, name, address, and photo can appear in one document.</p></div></article><article><span>02</span><div><h3>Access is hard to limit</h3><p>Chat attachments or downloads may remain after a print job ends.</p></div></article><article><span>03</span><div><h3>Use is hard to verify</h3><p>Without one-time authorization, the owner has little visibility into digital access.</p></div></article></div><div className="identity-caveat"><Fingerprint size={19}/><span>The protocol limits repeated digital access; an operator can still make copies outside the system. A blockchain cannot prove physical deletion.</span></div></div></div>
  </div></section>;
}

export function ProtocolExplorer() {
  const [active, setActive] = useState(0);
  const phase = phases[active];
  return <div className="chain-demo" aria-label="One-Time Print Protocol smart contract flow"><div className="chain-demo-head"><div><span className="chain-live-dot"/> LIVE CONTRACT · MONAD TESTNET <small>CHAIN ID 10143</small></div><a href={explorerUrl} target="_blank" rel="noreferrer">View contract on explorer <ExternalLink size={14}/></a></div>
    <div className="chain-phases">{phases.map(({ label, icon: Icon }, index) => <button type="button" key={label} onClick={() => setActive(index)} className={active === index ? "active" : ""} aria-pressed={active === index}><span className="chain-phase-number">{String(index + 1).padStart(2, "0")}</span><Icon size={20}/><strong>{label}</strong></button>)}</div>
    <div className="chain-demo-body"><div className="chain-demo-description"><div className="eyebrow">STEP {String(active + 1).padStart(2, "0")} / 04</div><h3>{phase.title}</h3><p>{phase.detail}</p><span className="chain-contract-address">{contractAddress.slice(0, 8)}…{contractAddress.slice(-6)}</span></div><div className="chain-lanes"><div className="chain-lane offchain"><div className="chain-lane-icon"><LockKeyhole size={20}/></div><div><small>OFF-CHAIN · PRIVATE</small><strong>{phase.local}</strong></div></div><div className="chain-lane-link"><span/><span>commitment / receipt only</span><span/></div><div className="chain-lane onchain"><div className="chain-lane-icon"><Wallet size={20}/></div><div><small>ON-CHAIN · MONAD</small><strong>{phase.chain}</strong></div><CircleCheck size={20}/></div></div></div>
    <div className="chain-demo-foot"><ShieldCheck size={18}/><span>The contract proves authorization state and records an evidence hash. It cannot see the file, guarantee a physical print outcome, or prove that every copy has been deleted.</span></div>
  </div>;
}
