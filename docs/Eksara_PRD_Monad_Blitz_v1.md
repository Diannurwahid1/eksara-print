# Eksara — Product Requirements & Architecture Draft (PRD)

> **Versi 1.1 (draft), 24 Oktober 2026.** Dokumen ini diadaptasi dari PRD yang diberikan untuk proyek Eksara. Keputusan terbaru: pelanggan login Google **dan wajib menautkan wallet sebelum upload**; wallet menandatangani grant Monad. Web pelanggan dan Station adalah aplikasi terpisah; tautan/PIN/QR membuka Station melalui tiket sekali pakai. SumoPod hanya membayar **langganan paket platform**. Dokumen disimpan di direktori lokal privat pada host API, bukan S3. Rincian implementasi dan batas kesiapan ada di [backend-implementation.md](backend-implementation.md). Pernyataan lama di bawah yang menempatkan wallet atau billing sebagai opsi fase lanjut digantikan oleh keputusan ini.

Eksara memakai arsitektur API-first supaya web pelanggan, dashboard toko, dan aplikasi desktop menggunakan satu backend yang sama. Permukaan produk dipisahkan dalam satu monorepo.

# 1. Final Tech Stack Eksara

ARCHITECTURE

## Eksara — API-First SaaS

Web Applications (terpisah)

Next.js + React

Customer Web • Shop Dashboard • Admin

Desktop Application

Electron + React

Print Shop Station

Central Backend API

## NestJS + TypeScript

REST API • WebSocket • Authentication • Business Logic

Print Orders

Shop & Billing

Monad Service

PostgreSQL

Business Data

Private Storage

Encrypted Documents

Redis + BullMQ

Background Jobs

Monad

Authorization & Receipt

Web dan Desktop berkomunikasi melalui API yang sama. Desktop menjadi satu-satunya client yang terhubung langsung ke printer fisik.

## 2. Stack yang saya rekomendasikan

| Layer          | Stack final                                | Tanggung jawab                                    |
| -------------- | ------------------------------------------ | ------------------------------------------------- |
| Web Frontend   | Next.js + TypeScript                       | Web pelanggan, dashboard toko, dan admin sebagai aplikasi terpisah |
| UI Component   | Tailwind CSS + shadcn/ui                   | Design system konsisten                           |
| Backend API    | NestJS + TypeScript                        | Semua business logic dan akses data               |
| API Contract   | OpenAPI + generated TypeScript client      | Web dan desktop menggunakan kontrak API yang sama |
| Desktop App    | Electron + React + TypeScript              | Print Station untuk Windows                       |
| Printer Engine | Electron printing + Windows-native adapter | Printer discovery, print job, spooler monitoring  |
| Database       | PostgreSQL + Drizzle ORM                   | Multi-tenant SaaS                                 |
| Cache / Queue  | Redis + BullMQ                             | Pemrosesan asinkron dan background worker         |
| Storage        | Direktori lokal privat pada host API        | Dokumen disimpan off-chain; enkripsi volume diperlukan sebelum data nyata |
| Realtime       | WebSocket / Socket.IO                      | Notifikasi order dan status perangkat             |
| Blockchain     | Monad + Solidity + Foundry + viem          | Single-use authorization                          |
| Monorepo       | pnpm workspaces + Turborepo                | Satu repository untuk seluruh aplikasi            |

Mengapa NestJS? Karena NestJS memiliki dukungan terdokumentasi untuk OpenAPI, WebSocket Gateway, dan BullMQ sehingga cocok untuk satu backend yang melayani beberapa jenis client.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.nestjs.com\&sz=32)

NestJS - A progressive Node.js framework

+2



## 3. Struktur aplikasi dan subdomain

| Aplikasi       | Contoh endpoint                          |
| -------------- | ---------------------------------------- |
| Public Website | `eksara.example`                         |
| Customer App   | `eksara.example/app`                     |
| Share Handoff  | `eksara.example/p/:token`                |
| Shop Dashboard | `shop.eksara.example`                    |
| Admin Platform | `admin.eksara.example`                   |
| Central API    | `api.eksara.example/v1`                  |
| Desktop        | Eksara Station `.exe` yang terinstal |

Seluruh alamat ini merupakan rancangan, belum berarti domainnya aktif.

Aturan arsitektur: Next.js tidak perlu memiliki backend bisnis tersendiri. Next.js menjadi presentation layer yang memanggil NestJS API. Pengelolaan database, izin akses, penetapan harga, subscription, dan transaksi blockchain berada pada backend NestJS.

## 4. Cara Web dan Desktop menggunakan API yang sama

Misalnya seorang pelanggan mengunggah dokumen untuk dicetak.

1. Customer Web → API

   Pelanggan mengisi form cetak. Web mengirim data order ke `POST /v1/print-orders`, kemudian mengunggah file melalui jalur storage privat yang diotorisasi.
2. API → Database & Storage

   NestJS membuat order, menyimpan metadata PDF, menghitung estimasi harga, dan mengaitkannya dengan tenant print shop.
3. API → Desktop Station

   Desktop menerima notifikasi bahwa pesanan baru tersedia melalui WebSocket, lalu mengambil detail pesanan dari REST API.
4. Desktop → API → Monad

   Ketika operator meminta cetak, backend memvalidasi perangkat, order, dan izin, kemudian memproses otorisasi one-time melalui Monad.
5. Desktop → Physical Printer

   Setelah otorisasi dikonfirmasi, Desktop mengambil file secara terbatas dan mengirim satu pekerjaan cetak ke printer sesuai parameter yang disetujui.
6. Desktop → API → Customer Web

   Status pekerjaan dilaporkan ke backend. Pelanggan melihat status order dan bukti on-chain.

Contoh REST API utama:

| Method | Endpoint                     | Digunakan oleh |
| ------ | ---------------------------- | -------------- |
| `POST` | `/v1/print-orders`           | Customer Web   |
| `GET`  | `/v1/print-orders/:id`       | Web & Desktop  |
| `GET`  | `/v1/station/jobs`           | Desktop        |
| `POST` | `/v1/station/devices/pair`   | Desktop        |
| `POST` | `/v1/print-jobs/:id/claim`   | Desktop        |
| `POST` | `/v1/print-jobs/:id/status`  | Desktop        |
| `GET`  | `/v1/print-jobs/:id/receipt` | Web & Desktop  |
| `GET`  | `/v1/shops/:slug/services`   | Customer Web   |
| `GET`  | `/v1/shops/:id/reports`      | Shop Dashboard |

Walaupun menggunakan API yang sama, hak akses tetap berbeda. Customer tidak boleh memanggil API release printer. Desktop hanya boleh menerima pekerjaan milik toko dan perangkat yang sudah dipasangkan.

## 5. Struktur Monorepo

Ini struktur yang bisa langsung kamu gunakan untuk memulai proyek dengan Codex.

```
eksara/
│
├── apps/
│   ├── web/                # Next.js: landing + customer app
│   ├── shop-web/           # Next.js: manajemen print shop (rencana)
│   ├── admin-web/          # Next.js: admin (rencana)
│   │
│   ├── api/                # NestJS
│   │   └── src/
│   │       ├── auth/
│   │       ├── tenants/
│   │       ├── shops/
│   │       ├── orders/
│   │       ├── documents/
│   │       ├── print-jobs/
│   │       ├── devices/
│   │       ├── payments/
│   │       ├── subscriptions/
│   │       └── blockchain/
│   │
│   ├── desktop/            # Electron + React
│   │   ├── main/
│   │   ├── preload/
│   │   ├── renderer/
│   │   └── printer-adapters/
│   │
│   └── worker/             # BullMQ jobs
│
├── packages/
│   ├── api-client/         # Generated API client
│   ├── contracts/          # Shared DTO/schema types
│   ├── database/           # Drizzle schema
│   ├── blockchain/         # viem + ABI
│   └── ui/                 # Shared React UI components
│
├── contracts/
│   └── solidity/           # Foundry
│
├── infra/
│   └── docker/
│
├── docs/
├── AGENTS.md
├── pnpm-workspace.yaml
└── turbo.json
```

Keuntungan monorepo adalah frontend web, API, dan desktop menggunakan tipe data yang konsisten. Tetapi jangan import service backend secara langsung ke desktop. Desktop harus berinteraksi melalui API seperti client eksternal agar keamanan dan pemisahan tanggung jawab tetap terjaga.

## 6. Khusus Desktop Printing: jangan hanya mengandalkan UI Electron

Saya menyarankan desktop memiliki dua bagian:

Electron Renderer (React) menangani tampilan: antrean, detail order, pemilihan printer, log aktivitas, dan pengaturan.

Electron Main Process + Native Printer Adapter menangani pemrosesan file, komunikasi dengan OS, printer, dan pengiriman status yang aman.

Dokumentasi Electron memang menyediakan `getPrintersAsync()` dan `webContents.print()` dengan opsi printer, salinan, ukuran kertas, dan silent printing. Tetapi untuk PDF dengan driver printer yang beragam, kita tetap perlu uji end-to-end serta kemungkinan adapter native khusus.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.electronjs.org\&sz=32)

Electron



Untuk keamanan, gunakan `contextIsolation: true`, `nodeIntegration: false`, sandbox, IPC terbatas, dan jangan menampilkan PDF tidak tepercaya dengan akses Node.js.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.electronjs.org\&sz=32)

Electron



## 7. Sistem autentikasi yang berbeda

| Client             | Autentikasi                                               |
| ------------------ | --------------------------------------------------------- |
| Customer Web       | Google OAuth + sesi server; tautan berbagi tetap dilindungi token dan PIN |
| Shop Dashboard     | Email/password atau passkey + session                     |
| Desktop Station    | Device pairing + kredensial perangkat yang bisa dirotasi  |
| Admin              | Admin account + MFA                                       |
| Blockchain Relayer | Key signing khusus server, tidak pernah dikirim ke client |

Alur pairing desktop:

1. Pemilik toko login ke dashboard web.
2. Membuka menu Devices → Add Print Station.
3. Desktop menampilkan kode pairing sementara.
4. Owner menyetujui pairing.
5. Backend menerbitkan identitas perangkat dan kredensial khusus.
6. Desktop mulai menerima order toko tersebut.

Desktop harus mempunyai kemampuan reconnect otomatis, device heartbeat, dan revoke access jika komputer toko hilang atau tidak lagi digunakan.

## 8. Monad tetap dikendalikan dari backend

Untuk MVP, kontrak Solidity menangani status izin cetak sekali pakai.

```
createAuthorization(...)
consumeAuthorization(...)
revokeAuthorization(...)
getAuthorization(...)
```

Flow: Desktop meminta otorisasi → API memvalidasi order → blockchain relayer mengirim transaksi → API memastikan konfirmasi → Desktop mendapat izin mengambil file → desktop mengirim print job ke printer.

Monad Testnet menggunakan Chain ID `10143`, sedangkan Mainnet `143`.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.alchemy.com\&sz=32)

Alchemy

+1



Perhatikan bahwa single-use di smart contract tidak otomatis berarti satu cetakan fisik. Harus ada state machine untuk menangani kegagalan printer dan mencegah retry yang menghasilkan cetakan ganda. Pada alur terbaru, pelanggan wajib menautkan wallet dan menandatangani grant; atestasi penghapusan tetap merupakan klaim terbatas atas current object storage, bukan bukti semua salinan musnah.

## 9. Deployment yang saya sarankan

Frontend Next.js

Vercel

Landing page, customer portal, shop dashboard, admin.

NestJS API + Worker

Docker VPS

Service API long-running, WebSocket, BullMQ, blockchain relayer.

PostgreSQL + Redis

Managed / VPS

Database dan queue dengan autentikasi, backup, serta akses jaringan privat.

Local Document Storage

Private API-host directory

Izin akses terbatas dan masa retensi pendek; enkripsi volume belum dikonfigurasi.

Eksara Station

Windows Installer

Electron app pada komputer toko, terhubung ke API melalui HTTPS/WSS.

Untuk menghemat biaya awal, API, worker, PostgreSQL, dan Redis bisa dijalankan dengan Docker Compose pada satu VPS berkapasitas memadai. Saat mulai menerima dokumen pelanggan nyata, hardening, backup, pemisahan layanan, dan pemantauan keamanan perlu diprioritaskan.

## 10. Keputusan teknologi final

| Keputusan           | Pilihan                      |
| ------------------- | ---------------------------- |
| Arsitektur          | API-first, multi-tenant SaaS |
| Repository          | TypeScript monorepo          |
| Frontend            | Next.js                      |
| Backend terpisah    | NestJS REST API + WebSocket  |
| Desktop             | Electron + React             |
| Native printing     | Windows printer adapter      |
| Database            | PostgreSQL                   |
| ORM                 | Drizzle                      |
| Shared API contract | OpenAPI-generated client     |
| Blockchain          | Monad + Solidity             |
| Worker              | Redis + BullMQ               |

Saya akan mengunci stack ini sebagai baseline Eksara v1. Hindari mengembangkan API Next.js terpisah dari NestJS, karena itu akan menduplikasi logika dan menyulitkan desktop.

Urutan implementasi keputusan terbaru adalah NestJS API + Database → Customer Web + wallet → Electron Station → Monad Authorization → SumoPod subscription → hardening printer dan multi-tenant. Kode MVP awal sudah dibuat; deployment, layanan eksternal, dan pengujian printer nyata masih dibutuhkan sebelum produksi.

Dengan pendekatan ini, Eksara mempunyai fondasi yang bisa dikembangkan dari satu toko pilot menjadi SaaS untuk banyak print shop tanpa harus membangun ulang arsitektur intinya.
