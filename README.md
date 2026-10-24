# Eksara

Eksara adalah aplikasi untuk menyiapkan dokumen cetak dari web pelanggan dan menyerahkannya ke aplikasi desktop percetakan (**Eksara Station**) melalui tautan dan PIN. Izin cetak sekali pakai dicatat di Monad; isi dokumen tetap berada di penyimpanan privat milik server API, bukan di blockchain.

**Coba versi live:** [ekasra.web.id](https://ekasra.web.id/) · [Masuk ke aplikasi](https://ekasra.web.id/login)

Repositori ini berisi web Next.js, API NestJS, aplikasi Electron, kontrak Solidity, dan database PostgreSQL. Ada dua cara mencobanya:

| Mode | Untuk siapa | Yang dibutuhkan |
| --- | --- | --- |
| **Demo lokal** | Ingin melihat web dan mencoba antarmuka secepatnya | Node.js dan pnpm; **tanpa akun atau secret** |
| **Terhubung end-to-end** | Ingin menguji upload, wallet, Monad, PIN, dan Station | PostgreSQL serta kredensial development untuk integrasi terkait |

> Situs live dapat dibuka, tetapi jangan menganggap pembayaran, login eksternal, atau cetak fisik sudah teruji end-to-end hanya karena halaman dapat diakses. Batas implementasi dijelaskan di bawah.

## Mulai cepat: demo lokal

Siapkan [Git](https://git-scm.com/), Node.js **22.12+** (atau 24), dan pnpm **10.19.0**. Jika pnpm belum ada, jalankan `npm install -g pnpm@10.19.0`.

```bash
git clone https://github.com/Diannurwahid1/eksara-print.git
cd eksara-print
pnpm install
pnpm dev
```

Buka [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login), lalu pilih **Enter demo workspace**. Tidak perlu membuat `.env` untuk langkah ini. Data demo hanya tersimpan di `localStorage` browser; dokumen tidak diunggah ke server dan tidak benar-benar dicetak. Untuk menghentikan server, tekan `Ctrl+C` di terminal.

Ingin melihat aplikasi desktopnya juga? Buka terminal kedua di folder repo dan jalankan `pnpm dev:station`. Tanpa koneksi API, antrean Station memang kosong—bukan data contoh yang dibuat-buat.

## Menjalankan alur terhubung di lokal

Mode ini memerlukan layanan dan kredensial milik Anda. **Jangan commit `.env`, private key, token perangkat, atau dokumen pelanggan.** Penyimpanan berkas memakai direktori privat lokal pada mesin API; S3 tidak diperlukan.

1. Jalankan PostgreSQL, lalu buat database dan pengguna sesuai `DATABASE_URL` yang akan dipakai. Salin `apps/api/.env.example` menjadi `apps/api/.env` dan `apps/web/.env.example` menjadi `apps/web/.env.local`. Di PowerShell, gunakan:

   ```powershell
   Copy-Item apps/api/.env.example apps/api/.env
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

   Di macOS/Linux, gunakan `cp` dengan path yang sama.

2. Isi `DATABASE_URL` di env API. Untuk login Google, isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan daftarkan redirect URI lokal `http://127.0.0.1:4000/v1/auth/google/callback` pada Google OAuth. Untuk alur izin cetak nyata, isi RPC/chain ID Monad, alamat kontrak terdeploy, relayer, `PIN_PEPPER`, dan `LOCAL_STORAGE_URL_SECRET`. `NEXT_PUBLIC_API_BASE_URL` pada env web harus menunjuk ke `http://127.0.0.1:4000`. Lihat [panduan backend](docs/backend-implementation.md) untuk arti setiap konfigurasi dan batas keamanannya.

3. Jalankan migrasi sekali untuk database **baru**, lalu hidupkan API dan web di terminal terpisah:

   ```bash
   pnpm --filter @eksara/api migrate
   pnpm dev:api
   ```

   ```bash
   pnpm dev
   ```

   Periksa [http://127.0.0.1:4000/health](http://127.0.0.1:4000/health). Nilai `configured: true` berarti prasyarat konfigurasi API telah terisi; itu belum menggantikan pengujian tiap layanan eksternal.

4. Untuk menerima handoff di Electron, set `EKSARA_API_BASE_URL=http://127.0.0.1:4000` dan `EKSARA_STATION_DEVICE_TOKEN` yang cocok dengan env API di terminal Station, lalu jalankan `pnpm dev:station`. Lihat [panduan Station](apps/station/README.md) untuk koneksi perangkat dan paket Windows.

Alur pelanggan: masuk dengan Google → verifikasi wallet → unggah dokumen → pilih opsi cetak → tanda tangani izin Monad → bagikan tautan dan PIN → buka di Station → otorisasi cetak virtual → konfirmasi penghapusan. Untuk uji lokal, gunakan dokumen percobaan dan **Eksara Virtual PDF**, bukan dokumen pelanggan atau printer fisik.

### Integrasi tambahan

- **SumoPod** dipakai untuk langganan platform, bukan biaya cetak toko. Isi konfigurasi SumoPod hanya bila ingin menguji checkout. Webhook produksi diarahkan ke `https://ekasra.web.id/api/v1/billing/webhook/sumopod`; callback lokal memerlukan URL publik/tunnel. Redirect kembali dari halaman bayar tidak otomatis mengaktifkan paket—status bergantung pada webhook tervalidasi. Transaksi nyata belum diverifikasi end-to-end.
- **Google OAuth** hanya dapat dipakai oleh akun yang diizinkan pada consent screen development. Mode demo tidak memakai OAuth.
- **Monad** menyimpan izin dan hash atestasi, **bukan** isi, nama file, PIN, atau email dokumen. Untuk uji jaringan gunakan kredensial dan dana testnet, bukan private key produksi.

## Yang sudah ada dan batasnya

Web pelanggan menyediakan login, wallet, upload, pengaturan cetak, tautan/PIN/QR, riwayat, dan halaman langganan. API menangani sesi, penyimpanan privat lokal, order, billing, dan relayer. Station menangani antrean, klaim tiket, unduh terotorisasi, serta uji PDF virtual.

Adaptor cetak fisik dan verifikasi spooler **belum** diimplementasikan. Pada printer fisik, Station membuka dokumen di penampil desktop dan operator mengonfirmasi hasilnya secara manual. Atestasi penghapusan hanya mencakup berkas aktif yang dikelola aplikasi, bukan seluruh backup, cache, spooler, atau kertas. Detail status serta pekerjaan sebelum produksi ada di [backend implementation](docs/backend-implementation.md).

## Struktur repo dan perintah berguna

```text
apps/web/       Web pelanggan (Next.js)
apps/api/       API, skema database, storage, billing, relayer (NestJS)
apps/station/   Aplikasi desktop percetakan (Electron)
apps/showcase/  Komposisi showcase Remotion (opsional)
contracts/      Kontrak izin cetak sekali pakai (Solidity)
docs/           PRD, BRD, dan catatan implementasi
```

```bash
pnpm typecheck
pnpm test:api
pnpm build
pnpm build:api
pnpm build:station
pnpm build:contracts
```

Dokumentasi lanjutan: [panduan backend](docs/backend-implementation.md) · [panduan Station](apps/station/README.md) · [PRD](docs/Eksara_PRD_Monad_Blitz_v1.md) · [BRD](docs/Eksara_BRD_Monad_Blitz_v1.md).
