# Eksara — Business Requirements Document (BRD)

> **Version:** 1.0 (Draft) | **Date:** 24 Oktober 2026 | **Scope:** Monad Blitz Jogja Vol. 2
> **Document status:** Specification only; does not assert a deployed product, signed partnerships, or verified revenue.
> **Keputusan produk terbaru:** Nama produk Eksara. Pelanggan login Google **dan wajib menautkan wallet sebelum upload**. Wallet menandatangani izin one-time print di Monad; relayer server membayar transaksi. Web pelanggan dan Station terpisah. SumoPod dipakai untuk **langganan paket platform**, bukan biaya cetak. Detail implementasi ada di [backend-implementation.md](backend-implementation.md). Bagian di bawah yang menyebut wallet opsional atau billing fase lanjut adalah asumsi lama yang digantikan keputusan ini.

---

| DOCUMENT CONTROL | DETAIL |
| --- | --- |
| Product | Eksara — Secure Document Sharing & One-Time Printing Protocol |
| Document type | BUSINESS REQUIREMENTS DOCUMENT (BRD) |
| Version / status | 1.0 / draft for Monad Blitz Jogja Vol. 2 |
| Date | 24 Oktober 2026 |
| Initial market | Indonesia (Yogyakarta campus print shops); India as expansion hypothesis |
| Network / MVP | Monad Testnet — chain ID 10143 |
| Purpose | Hackathon MVP specification and post-hackathon product roadmap |

> **NORTH STAR:** Satu protokol izin digital untuk dua tindakan: SHARE (akses dokumen) dan PRINT (otorisasi pelepasan job cetak). Konten tetap off-chain; bukti otorisasi tetap on-chain.

Draft keputusan produk. Semua harga, target pasar, kapasitas sistem, dan metrik komersial adalah hipotesis hingga tervalidasi. Tidak ada klaim deployment atau kemitraan yang sudah terjadi.

## 1. Ringkasan eksekutif

Eksara adalah konsep platform B2C dan B2B2C/B2B untuk berbagi dokumen digital secara terbatas, serta mengotorisasi pekerjaan cetak melalui satu kali penebusan izin. Eksara menggabungkan penyimpanan dokumen privat (off-chain) dengan smart contract Monad untuk mencatat pembuatan, penebusan, dan pencabutan izin tanpa mempublikasikan isi file.

Tesis bisnis: kebutuhan berbagi dokumen bersifat universal, sementara print shop lokal menyediakan jalur masuk pasar yang spesifik dan dapat diuji. Posisi Eksara bukan “menghilangkan kebocoran dokumen secara total”, melainkan mengurangi ketergantungan pada pengiriman file ke chat pribadi, membatasi akses ulang, dan menghasilkan bukti otorisasi yang dapat diverifikasi independen.

> **KEPUTUSAN INTI:** Produk utama = Eksara Share; vertikal awal = Eksara Print untuk print shop kampus; layer bersama = Eksara Verify. B2B enterprise adalah tahap lanjutan, bukan keseluruhan MVP.

## 2. Latar belakang dan masalah bisnis

| Persona / segmen | Masalah aktual yang diuji | Hasil yang diinginkan |
| --- | --- | --- |
| Individu (B2C) | Tautan/file tersebar di grup, email, atau pesan pribadi; sulit mengendalikan akses ulang. | Penerima spesifik, izin satu kali, kedaluwarsa dan bukti status. |
| Print shop (B2B2C) | File cetak datang di chat operator, sulit melacak antrean, dan file dapat tertinggal di perangkat. | QR intake, daftar job, satu kali print-release, status operasional. |
| Perusahaan (B2B) | Pengiriman dokumen lintas organisasi memerlukan bukti keputusan akses dan kontrol proses. | Workflow persetujuan, auditable grant/consume, API/workspace (lanjutan). |

Masalah ini perlu divalidasi melalui wawancara pengguna. Eksara tidak mengklaim bahwa semua usaha print shop menggunakan WhatsApp atau bahwa seluruh pelanggan menginginkan bukti blockchain.

## 3. Visi, proposisi nilai, dan diferensiasi

### 3.1 Visi

“Secure document exchange for everyday people and local businesses, with verifiable permissions powered by Monad.”

### 3.2 Value proposition per segmen

| Segmen | Value proposition | Alasan memakai Monad |
| --- | --- | --- |
| B2C | Unggah dokumen contoh, tentukan penerima, bagikan izin sekali pakai, lihat status. | Bukti grant/redeem/revoke dapat diverifikasi di luar database Eksara. |
| Print shop | Scan QR toko, terima order, antrean rapi, release hanya ke operator terotorisasi. | Jejak otorisasi print-release yang independen sebagai trust layer. |
| Enterprise | Workspace, audit, dan integration API (roadmap). | Verifiable cross-party authorization ketika organisasi tidak menggunakan database yang sama. |

### 3.3 Diferensiasi yang jujur

- Bukan yang pertama menawarkan link kedaluwarsa, kode QR, atau fitur hapus otomatis; fitur serupa sudah ada di pasar.

- Diferensiasi yang diuji: izin on-chain yang disetujui pengguna, bukti penggunaan izin lintas pihak, dan workflow print shop lokal yang sederhana.

- Eksara tidak menjamin anti-screenshot, anti-copy di komputer operator, atau keberhasilan cetak fisik hanya dari transaksi blockchain.

## 4. Segmentasi pelanggan dan persona

| Prioritas | Customer / buyer | Pengguna dan pekerjaan utama | Channel awal |
| --- | --- | --- | --- |
| P0 (validasi) | Print shop kecil sekitar kampus | Owner bayar; kasir/operator menerima order; mahasiswa mengirim PDF | Kunjungan lapangan 5-10 toko di Yogyakarta |
| P0 (adopsi) | Individu/mahasiswa (B2C) | Pengirim/penerima berkas berizin | QR toko dan tautan berbagi |
| P1 | Kampus, UKM, konsultan | Admin tim dan anggota organisasi | Pilot institusi dan direct sales |
| P2 | Print shop India / jaringan | Operator lokal dan owner multi-toko | Kemitraan lokal setelah validasi Indonesia |

### 4.1 Jobs to be done

- Sebagai mahasiswa, saya ingin menyerahkan file untuk dicetak tanpa mengirimkannya ke nomor pribadi operator, agar proses lebih rapi dan akses tidak berlangsung terus-menerus.

- Sebagai owner print shop, saya ingin melihat antrean dan menandai job yang sudah diproses, agar staf tidak perlu mencari berkas di banyak chat.

- Sebagai individu, saya ingin mengirim dokumen kepada satu penerima dengan batas penggunaan, agar saya tahu kapan izinnya digunakan.

- Sebagai admin perusahaan (fase lanjut), saya ingin ada bukti penggunaan izin yang dapat diperiksa secara independen oleh kedua pihak.

## 5. Business Model Canvas (ringkas)

| Elemen | Rancangan |
| --- | --- |
| Customer segments | Print shop kampus (B2B2C), individual senders/recipients (B2C), tim/perusahaan (B2B pasca-MVP). |
| Value proposition | Limited document access + one-time print release + independently verifiable authorization receipts. |
| Channels | QR di konter print shop, distribusi web, integrasi organisasi/API di fase lanjut. |
| Customer relationships | Self-service B2C; assisted onboarding print shop; account support untuk enterprise. |
| Revenue streams | Berlangganan per toko, batas volume transaksi/izin, fitur tim/API di fase lanjut. |
| Key resources | Smart contract Monad, tim software, object storage privat, backend, pengujian keamanan. |
| Key activities | Product engineering, security, onboarding toko, reliability, edukasi operator. |
| Key partners | Print shop pilot, penyedia hosting/storage/RPC, komunitas builder Monad; belum dianggap mitra resmi. |
| Cost structure | Storage/bandwidth, RPC/gas, hosting, monitoring, customer support, security and compliance. |

## 6. Model pendapatan dan asumsi ekonomi

> **PENTING:** Harga berikut adalah hipotesis wawancara, bukan pricing final maupun pendapatan yang sudah terjadi.

| Paket | Indonesia — contoh | India — contoh | Termasuk |
| --- | --- | --- | --- |
| Personal Free | Rp0 | ₹0 | Kuota kecil untuk share; tanpa SLA. |
| Print Shop Pro | Rp99.000/toko/bulan | ₹499/toko/bulan | Antrean, QR intake, batas kuota release, ringkasan job. |
| Business Team | Rp299.000/organisasi/bulan | ₹1.499/organisasi/bulan | Tim, izin tingkat lanjut, ekspor audit (fase 2). |
| Enterprise | Penawaran khusus | Penawaran khusus | API, SSO, kepatuhan dan SLA setelah kesiapan. |

### 6.1 Simulasi ekonomi (murni ilustratif)

| Asumsi hipotetis | Nilai |
| --- | --- |
| Toko berbayar | 30 toko |
| Harga Print Shop Pro | Rp99.000/toko/bulan |
| MRR bruto teoretis | Rp2.970.000/bulan |
| Biaya infrastruktur + dukungan (asumsi) | Rp1.500.000/bulan |
| Margin sebelum gaji, pajak dan akuisisi (ilustrasi) | Rp1.470.000/bulan |

Nilai ilustrasi tidak dapat digunakan sebagai forecast pasar. Belum termasuk CAC, pembayaran, churn, keamanan, legal, biaya founder, dan gas per transaksi nyata. Biaya harus diukur pada pilot.

## 7. Strategi go-to-market dan validasi

| Fase | Kegiatan | Kriteria lolos |
| --- | --- | --- |
| 0 — Monad Blitz | Demo dua workflow berbagi dan cetak dengan on-chain receipt | Transaksi testnet nyata; viewer/release bekerja; demo <=3 menit. |
| 1 — Jogja discovery | Wawancara 10 print shop + 15 pengguna B2C; uji alur QR | Masalah berulang terkonfirmasi; minimum 3 toko bersedia pilot (bukan klaim aktual). |
| 2 — Pilot lokal | Operasional terbatas 3-5 toko; rekam waktu proses dan error | Adopsi berulang, keluhan dapat ditangani, tidak ada isu keamanan kritis. |
| 3 — B2B expansion | Workspace tim, API, billing, integrasi vendor | Konversi ke langganan setelah kebutuhan terbukti. |
| 4 — India hypothesis | Discovery dengan operator/mitra India | Aturan lokal, willingness-to-pay dan distribusi lolos validasi. |

## 8. Kebutuhan bisnis (BR) dan penerimaan

| ID | Business requirement | Bukti penerimaan |
| --- | --- | --- |
| BR-01 | B2C dapat membagikan dokumen contoh dengan izin yang dibatasi. | Alur create -> claim -> receipt tampil tanpa kesalahan kritis. |
| BR-02 | Print shop bisa menerima pekerjaan melalui QR dan daftar order. | Owner/operator login, QR valid, item masuk antrean. |
| BR-03 | Satu izin tidak dapat ditebus dua kali oleh aktor berbeda. | Percobaan kedua ditolak oleh smart contract/backend. |
| BR-04 | Pelanggan dapat memeriksa status izin independen. | Tx hash dan contract link di explorer. |
| BR-05 | Konten file dan PII tidak masuk on-chain. | Pemeriksaan calldata/log dan struktur data. |
| BR-06 | Produk dapat diuji tanpa payment integration. | Tidak memerlukan pembayaran nyata untuk demo. |
| BR-07 | Dokumen layak diaudit dan dikloning. | Repo publik, README, reproducible steps. |
| BR-08 | Bisnis memiliki narasi segmen dan pendapatan terukur. | Hypothesis pricing, pilot metrics dan GTM tercantum. |
| BR-09 | Upload nyata mensyaratkan Google session dan wallet yang telah diverifikasi. | API menolak upload tanpa kedua kredensial; grant ditandatangani wallet. |
| BR-10 | SumoPod menagih langganan platform dengan nominal dari server. | Webhook valid dan cocok invoice mengaktifkan paket; redirect saja tidak. |
| BR-11 | Penghapusan file memiliki atestasi terbatas dan tidak dilebih-lebihkan. | Hash evidence dicatat di Monad setelah object saat ini dihapus; UI menyebut batas salinan eksternal. |

## 9. KPI, asumsi, dan aturan keputusan

| Indikator | Target uji (hipotesis) | Cara ukur |
| --- | --- | --- |
| Technical demo success | >= 95% dari 20 dry-run lokal | Runbook demonstrasi dan logs |
| Time-to-submit order | < 90 detik pada skenario sederhana | User testing dengan stopwatch |
| Shops willing to pilot | >=3 dari 10 yang diwawancara | Pernyataan minat pilot secara eksplisit |
| Repeat use | >=30% customer uji melakukan job kedua selama pilot | Event operasional, consented analytics |
| Paid conversion | Belum ditargetkan sebelum pilot | Pricing interviews dan invoice nyata |
| Privacy incidents | 0 insiden kritis untuk melanjutkan pilot | Issue tracking, incident reviews |

Go/no-go pasca-hackathon: lanjut ke pilot hanya setelah alur release benar, penyimpanan aman, syarat privasi disusun, dan minimal tiga print shop setuju uji coba. Jangan menyimpulkan product-market fit dari skor hackathon.

## 10. Risiko dan batasan bisnis

| Risiko | Dampak | Mitigasi / keputusan |
| --- | --- | --- |
| “One-time” disalahpahami sebagai mustahil disalin | Janji berlebihan dan risiko kepercayaan | Komunikasi produk menyebut izin dibatasi, bukan anti-copy absolut. |
| Operator tidak mau mengubah kebiasaan chat | Adopsi B2B rendah | Onboarding QR < 5 menit, nilai antrean cepat terlihat. |
| Tidak ada alasan cukup kuat untuk blockchain | Kesulitan diferensiasi/biaya gas | Validasi nilai third-party verification dan bandingkan workflow Web2. |
| Data pribadi/kontak bocor | Risiko konsumen dan regulasi | Enkripsi, minimisasi data, retention dan privacy review. |
| Wallet dan biaya gas menyulitkan | Friksi adopsi massal | Google login untuk akun; wallet wajib untuk upload dan tanda tangan izin; relayer server menanggung transaksi. Uji friksi onboarding. |
| Pengembangan terlalu luas | MVP tidak selesai | P0 hanya share + print-release + verification. |

## 11. Peta prioritas dan keputusan produk

| MVP Monad Blitz (P0) | Pasca-hackathon (P1/P2) |
| --- | --- |
| Google login, wallet verification, doc upload, 1-time share grant, print shop QR, operator print release, verify receipt, SumoPod subscription sandbox, Github/README | Encryption/KMS, native printer and spooler integration, team workspace, SSO, multi-shop, internationalization |
| Sandbox sample documents; integrasi EVM yang nyata | Sensitive real-world docs after security/legal gate |

## 12. Rubrik penyelenggara dan strategi bisnis

| Kelompok | Poin maksimum | Implikasi Eksara |
| --- | --- | --- |
| Basic: repo, README, testnet, hosted app | 100 | Empat deliverable masing-masing 25. |
| Advance — working project | 100 | Semua fitur demo bekerja, live tx, verified contract, reproducibility. |
| Advance — build in public | 100 | Dua publikasi video, post, dan target kolektif >=5.000 views; views bukan hal yang dijamin. |
| Bonus | 100 | Mainnet 25, domain 15, product-market fit 20, revenue 20, originality 20. |

Narasi bonus juri: print shop Indonesia sebagai wedge pasar, B2C berbagi dokumen sebagai distribusi, perusahaan sebagai future upsell, Monad sebagai izin/receipt yang dapat diaudit bersama. Menargetkan skor bukan berarti dijanjikan mendapatkannya.

## 13. Pertanyaan yang masih perlu divalidasi

- Apakah pihak toko bersedia menggunakan dashboard terpisah dari WhatsApp? Apa yang membuatnya lebih cepat?

- Seberapa besar friksi wallet wajib saat pelanggan pertama kali upload, dan onboarding apa yang dibutuhkan?

- Siapa yang benar-benar memperoleh manfaat ekonomi dari catatan verifikasi on-chain?

- Apakah biaya storage + transaction + support cocok dengan ARPU toko kecil?

- Berapa waktu retensi minimum yang sesuai alur cetak dan kewajiban privasi setempat?

## Sumber dan referensi

- Monad Docs — Current Facts for AI Agents: https://docs.monad.xyz/ai/current-facts

- Monad Docs — Deployment Summary for Developers: https://docs.monad.xyz/developer-essentials/summary

- Monad Docs — Testnet Network Information: https://docs.monad.xyz/developer-essentials/testnet

- Monad Docs — Foundry Deploy/Verify Guides: https://docs.monad.xyz/guides/deploy-smart-contract/foundry dan https://docs.monad.xyz/guides/verify-smart-contract/foundry

- Monad Blitz Jogja Vol. 2 event: https://luma.com/blitz-jogja-okt-2026

- Official Monad Blitz Jogja fork/submission repository: https://github.com/monad-developers/monad-blitz-jogja

- Rubrik Basic/Advance/Bonus dan aturan demo 3 menit: foto slide briefing Monad Blitz Jogja Vol. 2 yang disediakan pengguna pada 24 Oktober 2026.

> **CATATAN SUMBER:** Jika ada perbedaan antara rencana ini dan instruksi langsung panitia di lokasi atau Blitz Portal, instruksi terakhir panitia yang harus diikuti.
