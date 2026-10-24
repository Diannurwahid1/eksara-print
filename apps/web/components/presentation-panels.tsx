"use client";

import { useState } from "react";
import { ArrowRight, CircleCheck, Copy, ExternalLink, FileText, Fingerprint, LockKeyhole, Printer, ScanFace, ShieldCheck, Trash2, Wallet } from "lucide-react";

const contractAddress = "0x43498edae5e8e508f5236b0d88aeb14e86eaa2a7";
const explorerUrl = `https://testnet.monadexplorer.com/address/${contractAddress}`;

const phases = [
  { label: "Prepare", title: "Dokumen masuk ke penyimpanan privat", detail: "Pelanggan mengunggah berkas dan mengatur preferensi cetak. Isi KTP, PIN, dan nama file tidak dikirim ke blockchain.", chain: "Belum ada transaksi", local: "File terenkripsi saat transit; akses dikendalikan API", icon: FileText },
  { label: "Authorize", title: "Pelanggan menandatangani izin sekali pakai", detail: "Wallet menandatangani permit EIP-712. Relayer membuat grant pada smart contract dengan komitmen dokumen dan masa berlaku.", chain: "GrantCreated(grantId)", local: "Link, PIN, dan file tetap di luar chain", icon: Wallet },
  { label: "Release", title: "Station menebus izin satu kali", detail: "Station memverifikasi permintaan. Kontrak mengubah grant dari Active menjadi Consumed; percobaan kedua ditolak.", chain: "GrantConsumed(grantId)", local: "File dirilis ke Station untuk satu alur cetak", icon: Printer },
  { label: "Attest", title: "Jejak penghapusan dicatat", detail: "Setelah operator menyelesaikan alur, sistem menghapus salinan yang dikelolanya dan mencatat hash bukti penghapusan.", chain: "DeletionAttested(grantId, hash)", local: "Klaim penghapusan lokal; bukan bukti semua salinan fisik hilang", icon: Trash2 }
] as const;

export function IdentityExposure() {
  const [controlled, setControlled] = useState(false);
  return <section id="risk" className="identity-section"><div className="shell identity-inner">
    <div className="identity-heading"><div className="eyebrow">WHY IDENTITY DOCUMENTS NEED A SAFER HANDOFF</div><h2>Satu file KTP dapat meninggalkan <span>banyak salinan.</span></h2><p>Ilustrasi ini memakai data yang disamarkan. Risiko muncul ketika berkas berpindah lewat chat, folder unduhan, dan komputer percetakan tanpa batas akses atau masa simpan yang jelas.</p></div>
    <div className="identity-grid"><div className={`identity-visual${controlled ? " controlled" : ""}`}>
      <div className="identity-visual-top"><span>IDENTITY DOCUMENT · ILLUSTRATION</span><span className="identity-redacted"><LockKeyhole size={13}/> DATA DISAMARKAN</span></div>
      <div className="identity-card" aria-label="Ilustrasi KTP dengan seluruh data pribadi disamarkan"><div className="identity-card-watermark">IDENTITY / PRIVATE</div><div className="identity-card-title">KARTU IDENTITAS <small>CONTOH VISUAL</small></div><div className="identity-card-content"><div className="identity-card-lines"><div><small>NIK</small><strong>•••• •••• •••• ••••</strong></div><div><small>NAMA</small><strong>•••••••• •••••••</strong></div><div><small>ALAMAT</small><strong>•••••••••••••••••</strong></div><div><small>TANGGAL LAHIR</small><strong>•• / •• / ••••</strong></div></div><div className="identity-photo"><ScanFace size={42}/><small>FOTO</small></div></div><div className="identity-card-footer">HANYA ILUSTRASI · BUKAN DOKUMEN ASLI</div></div>
      <div className="identity-copy-track"><div className="identity-copy"><FileText size={18}/><span>File dikirim</span></div><ArrowRight size={17}/><div className="identity-copy"><Copy size={18}/><span>{controlled ? "Akses singkat" : "Tersimpan di chat"}</span></div><ArrowRight size={17}/><div className={`identity-copy${controlled ? " safe" : " exposed"}`}><span>{controlled ? <ShieldCheck size={18}/> : <Copy size={18}/>}</span><span>{controlled ? "Izin habis" : "Salinan tersisa"}</span></div></div>
      <p className="identity-visual-foot">{controlled ? "Eksara membatasi pelepasan digital dan mencatat klaim penghapusan file yang dikelolanya." : "Contoh jalur paparan, bukan klaim insiden pada sebuah toko tertentu."}</p>
    </div><div className="identity-side"><div className="identity-switch" role="group" aria-label="Pilih alur visual"><button type="button" className={!controlled ? "active" : ""} onClick={() => setControlled(false)}>Alur biasa</button><button type="button" className={controlled ? "active" : ""} onClick={() => setControlled(true)}>Dengan Eksara</button></div><div className="identity-risk-list"><article><span>01</span><div><h3>Identitas mudah disalin</h3><p>NIK, nama, alamat, dan foto berada dalam satu dokumen yang sama.</p></div></article><article><span>02</span><div><h3>Akses sulit dibatasi</h3><p>Lampiran chat atau unduhan dapat bertahan setelah pekerjaan cetak selesai.</p></div></article><article><span>03</span><div><h3>Jejak sulit diverifikasi</h3><p>Tanpa izin sekali pakai, pemilik file sulit menilai kapan akses digital dipakai.</p></div></article></div><div className="identity-caveat"><Fingerprint size={19}/><span>Protokol mengurangi akses digital berulang; operator tetap dapat membuat salinan di luar sistem. Penghapusan fisik tidak bisa dibuktikan oleh blockchain.</span></div></div></div>
  </div></section>;
}

export function ProtocolExplorer() {
  const [active, setActive] = useState(0);
  const phase = phases[active];
  return <div className="chain-demo" aria-label="Visual alur smart contract One-Time Print Protocol"><div className="chain-demo-head"><div><span className="chain-live-dot"/> LIVE CONTRACT · MONAD TESTNET <small>CHAIN ID 10143</small></div><a href={explorerUrl} target="_blank" rel="noreferrer">Lihat kontrak di explorer <ExternalLink size={14}/></a></div>
    <div className="chain-phases">{phases.map(({ label, icon: Icon }, index) => <button type="button" key={label} onClick={() => setActive(index)} className={active === index ? "active" : ""} aria-pressed={active === index}><span className="chain-phase-number">{String(index + 1).padStart(2, "0")}</span><Icon size={20}/><strong>{label}</strong></button>)}</div>
    <div className="chain-demo-body"><div className="chain-demo-description"><div className="eyebrow">STEP {String(active + 1).padStart(2, "0")} / 04</div><h3>{phase.title}</h3><p>{phase.detail}</p><span className="chain-contract-address">{contractAddress.slice(0, 8)}…{contractAddress.slice(-6)}</span></div><div className="chain-lanes"><div className="chain-lane offchain"><div className="chain-lane-icon"><LockKeyhole size={20}/></div><div><small>OFF-CHAIN · PRIVATE</small><strong>{phase.local}</strong></div></div><div className="chain-lane-link"><span/><span>commitment / receipt only</span><span/></div><div className="chain-lane onchain"><div className="chain-lane-icon"><Wallet size={20}/></div><div><small>ON-CHAIN · MONAD</small><strong>{phase.chain}</strong></div><CircleCheck size={20}/></div></div></div>
    <div className="chain-demo-foot"><ShieldCheck size={18}/><span>Kontrak membuktikan status izin dan pencatatan hash bukti. Kontrak tidak melihat isi file, tidak menjamin hasil cetak fisik, dan tidak membuktikan semua salinan telah hilang.</span></div>
  </div>;
}
