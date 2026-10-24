# Eksara backend: implementasi dan handoff

**24 Oktober 2026.** Kode untuk API NestJS, kontrak Monad, web pelanggan, dan Eksara Station sudah ada. Alur nyata membutuhkan konfigurasi Google, PostgreSQL, penyimpanan lokal API, SumoPod, RPC Monad, kontrak terdeploy, dan relayer. Adaptor printer fisik belum ada; jangan memakai dokumen pelanggan atau pembayaran nyata hingga integrasi sandbox dan cetak Windows selesai diuji.

| Komponen | Lokasi | Peran |
| --- | --- | --- |
| Web pelanggan | `apps/web` | Google login, wallet, upload, pengaturan, tanda tangan izin, link/PIN/QR, langganan |
| API | `apps/api` | Session, wallet, storage, order, handoff, billing, relayer |
| Station | `apps/station` | Electron, klaim tiket, antrean, pilih printer |
| Kontrak | `contracts/src/OneTimePrintProtocol.sol` | EIP-712 grant, consume sekali, revoke, atestasi hash penghapusan |

## Menjalankan

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
# Isi .env dengan layanan dan rahasia development.
pnpm --filter @eksara/api migrate
pnpm dev:api
pnpm dev
pnpm dev:station
```

Web: salin `apps/web/.env.example` ke `apps/web/.env.local`. `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000` mengaktifkan API dan `NEXT_PUBLIC_MONAD_RPC_URL` opsional untuk menambahkan jaringan Monad ke wallet yang belum mengenalnya. Tanpa API URL web berada di mode demo lokal dan tidak mengunggah file. Station membutuhkan `EKSARA_API_BASE_URL` dan `EKSARA_STATION_DEVICE_TOKEN`; tanpa keduanya, antrean kosong dan UI menampilkan status belum terkonfigurasi. API menyimpan file di `LOCAL_STORAGE_DIR` (default relatif terhadap proses API: `./data/private-files`). Direktori ini harus berada di volume persisten pada mesin API, di luar web root, dengan akses hanya untuk proses API. Bila API dijalankan di beberapa mesin, semuanya memerlukan volume bersama dengan kebijakan penghapusan yang sama; MVP ini lebih sederhana dijalankan pada satu host API. Set `LOCAL_STORAGE_URL_SECRET` acak minimal 32 karakter untuk tiket unduh singkat. Jangan simpan secret di Git, frontend env, atau renderer Electron. File lokal saat ini **belum dienkripsi oleh aplikasi**; bila butuh enkripsi saat tersimpan, aktifkan enkripsi volume/OS dan kelola kuncinya di luar repo.

## Alur nyata

1. OAuth Google code + PKCE/state membuat session cookie HttpOnly. `GET /v1/me` mengembalikan profil dan wallet terkait.
2. `POST /v1/wallet/challenge` dan `/verify` menautkan wallet EVM lewat pesan bertanda tangan, nonce, dan expiry. Upload API menolak akun tanpa wallet terverifikasi.
3. Browser menghitung SHA-256 dan meminta `POST /v1/documents/upload-intents`; lalu mengirim PUT terautentikasi ke `/v1/documents/{id}/content` dan memanggil `/complete`. API menulis ke direktori lokal privat, membatasi 50 MB, dan membandingkan panjang serta SHA-256. Header MIME harus cocok dengan intent, tetapi inspeksi tipe dari isi file belum ada. Format yang diterima: PDF, DOCX, PPTX, JPEG, PNG.
4. `POST /v1/print-orders/prepare` menghasilkan token, PIN, dan EIP-712 `GrantPermit`. Wallet menandatangani; `/activate` memverifikasi tanda tangan/nonce, mengirim `createGrant`, menunggu receipt sukses, lalu mengembalikan tautan/PIN. Token dan PIN hanya tampil sekali.
5. Toko membuka `/p/{token}`, memasukkan PIN di `/v1/share-grants/{token}/handoff`, lalu browser mencoba `eksara-station://claim?ticket=...`. Tiket hanya berlaku lima menit dan sekali klaim. PIN dibatasi lima kegagalan per token/IP per 15 menit.
6. Station mengklaim tiket dan memilih printer. `/v1/station/jobs/{id}/authorize-release` mengirim `consumeGrant` di Monad, menunggu receipt sukses, lalu menyediakan URL unduh bertanda tangan yang berlaku 60 detik. Endpoint API memeriksa signature, expiry, dan status order sebelum men-stream file lokal; kontrak menolak consume ulang. URL ini masih dapat dipakai ulang dalam 60 detik, sehingga jangan menyebutnya tiket unduh sekali pakai.
7. Station mengunduh file ke folder sementara aplikasi. Printer virtual merender PDF atau gambar menjadi PDF terverifikasi; untuk printer fisik file dibuka di desktop viewer. Operator mencetak secara manual, menutup viewer, lalu menekan **Confirm printed & delete file**. Station menghapus salinan sementara dan memanggil `/v1/station/jobs/{id}/complete`; API menghapus file lokal, mengecek path tidak ditemukan, menyimpan evidence hash, dan mengirim `attestDeletion`. Ini adalah **atestasi operator**, bukan verifikasi otomatis spooler atau kertas. Jika aplikasi berhenti, folder sementara dibersihkan saat startup berikutnya, tetapi cleanup saat OS crash tidak dapat dijamin seketika.

Worker ringan di proses API setiap menit menandai grant draft/shared/opened yang kedaluwarsa, menghapus object untuk order expired/revoked/failed, serta membersihkan upload pending dan dokumen tanpa order yang melewati TTL. Penghapusan karena expiry belum mempunyai event atestasi Monad; `DeletionAttested` khusus grant yang sudah dikonsumsi. Untuk deployment multi-instance, pindahkan pekerjaan ini ke worker terkoordinasi agar retensi dan retry dapat diaudit.

Kontrak dikompilasi dengan `pnpm build:contracts`. Deploy pada Monad environment yang dipilih, lalu isi `MONAD_RPC_URL`, `MONAD_CHAIN_ID`, `MONAD_CONTRACT_ADDRESS`, dan `MONAD_RELAYER_PRIVATE_KEY`. Verifikasi chain ID, alamat, bytecode, dan hak relayer sebelum menerima dokumen. Tidak ada dokumen, PIN, email, atau nama file di chain.

## SumoPod: langganan platform

SumoPod dipakai hanya untuk **langganan paket platform**, sesuai keputusan produk. Biaya cetak toko berada di luar gateway ini. Harga draft dalam kode: Pro Rp99.000/bulan; Team Rp299.000/bulan. `POST /v1/billing/checkout` membuat invoice lalu memanggil `POST {SUMOPOD_BASE_URL}/payments` dengan `X-Api-Key`, `order_id=EXS-{invoiceId}`, nominal IDR dari server, QRIS, dan expiry satu jam. Browser membuka payment URL HTTPS SumoPod. Redirect balik **tidak** mengaktifkan paket.

Webhook `POST /v1/billing/webhook/sumopod` membaca raw body, memeriksa HMAC-SHA256 `svix-id`, `svix-timestamp`, dan `svix-signature` dengan toleransi lima menit. Event ID dibuat idempotent. `payment.completed` mengaktifkan paket sebulan hanya bila `payment_id`, `order_id`, nominal, dan status cocok dengan invoice. Gunakan kunci SumoPod baru dan `whsec_...` dari pengaturan gateway. Kunci yang pernah ditempel di chat harus dirotasi; jangan salin ke repo.

## Batas “proof file deleted”

Event Monad membuktikan relayer mencatat suatu hash evidence; evidence backend memverifikasi path file lokal aktif tidak ditemukan setelah delete. Ini **bukan** bukti semua salinan, backup/snapshot volume, cache, spooler, file yang sempat diunduh, atau kertas fisik telah musnah. Atestasi hanya boleh ditampilkan sebagai klaim terukur ini. Retensi backup, worker, dan spooler perlu kebijakan dan pengujian tersendiri.

## Wajib sebelum produksi

- Shop account/role, pairing kredensial **per perangkat**, tiket terikat shop, rotasi/revokasi, dan isolasi antrean per tenant. Token Station bersama dari env hanya jembatan development.
- Worker terisolasi untuk magic-byte/type validation, malware scan, konversi DOCX/PPTX, preview/page count, dan penghapusan artefak. API sekarang memeriksa metadata/checksum, belum scan konten.
- Adaptor printer Windows, download lease yang benar-benar sekali pakai, konfirmasi spooler, serta kebijakan retry tanpa risiko cetak ganda. Alur sekarang memakai desktop viewer dan konfirmasi operator, bukan bukti otomatis kertas tercetak. Jika download gagal setelah `consumeGrant`, recovery harus diputuskan sebelum menerima job nyata.
- Rekonsiliasi chain/database sesudah crash. Bila transaksi chain sukses tetapi update database gagal, status harus dipulihkan dari chain, bukan mengirim transaksi kedua secara buta.
- Uji Google/SumoPod/Monad sandbox dan printer Windows, audit keamanan kontrak, CORS/cookie, pembayaran webhook, PIN brute force, checksum, izin akses direktori lokal, pemulihan disk, backup/snapshot, dan retensi penghapusan.

Verifikasi kode saat ini: `pnpm typecheck`, `pnpm build:api`, `pnpm build:contracts`, `pnpm test:api`, `pnpm build`. Migrasi `apps/api/sql/001_initial.sql` hanya untuk database baru; database berisi data membutuhkan migrasi inkremental tersendiri.
