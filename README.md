# NEXALID SmartBiz Cloud

Aplikasi bisnis multi-tenant. Checkpoint ini mengimplementasikan alur **login → katalog → stok → shift → POS → pembayaran tercatat → struk → rekonsiliasi** dengan Next.js, NestJS, Prisma, dan PostgreSQL. Repository GitHub awal kosong.

**Batas cakupan:** ini fondasi dan vertical slice core, belum keseluruhan SaaS komersial. Lihat [roadmap](docs/ROADMAP.md) dan [arsitektur](docs/ARCHITECTURE.md). Modul industri belum aktif; tenant FnB/bengkel/grosir memakai core katalog barang, bukan workflow industri.

## Jalankan lokal

Prasyarat: Node.js 22+, npm, Docker Compose. Port 3000, 4000, 5432, 6379 tersedia.

```bash
cp .env.example .env
npm ci
npm run db:generate
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
```

Buka **http://localhost:3000**. API: http://localhost:4000/api/health. Next.js memproksi `/api` ke NestJS agar cookie tetap same-origin. Jika password PostgreSQL diubah, sinkronkan `POSTGRES_PASSWORD` dan `DATABASE_URL` (URL-encode karakter khusus).

Alternatif seluruh aplikasi melalui container:

```bash
docker compose --profile app up -d --build
# Seed development saja setelah migrasi selesai:
docker compose --profile app run --rm -e NODE_ENV=development -e DEMO_PASSWORD='LocalDemo-2026!' api node --import tsx apps/api/prisma/seed.ts
```

Perintah seed container menggunakan environment service, tanpa memerlukan file `.env` dalam image. Compose menjalankan migrasi sebelum API. Untuk development host, `npm run dev` membaca `.env` root. Dockerfile menetapkan upstream web `http://api:4000` saat build; build lokal npm memakai `http://127.0.0.1:4000`.

## Akun development

Password seluruh akun baru berasal dari `DEMO_PASSWORD` pada `.env`; contoh lokal **LocalDemo-2026!**. Seed dilarang pada `NODE_ENV=production`. Seed ulang tidak mengganti password, saldo, atau transaksi yang sudah ada.

| Workspace   | Tenant               | Owner                | Supervisor                | Cashier                |
| ----------- | -------------------- | -------------------- | ------------------------- | ---------------------- |
| `retail`    | Sentosa Mart         | owner@retail.demo    | supervisor@retail.demo    | cashier@retail.demo    |
| `fnb`       | Kopi Ruang Senja     | owner@fnb.demo       | supervisor@fnb.demo       | cashier@fnb.demo       |
| `workshop`  | Prima Motor Garage   | owner@workshop.demo  | supervisor@workshop.demo  | cashier@workshop.demo  |
| `wholesale` | Nusantara Distribusi | owner@wholesale.demo | supervisor@wholesale.demo | cashier@wholesale.demo |

Setiap tenant mempunyai outlet, tiga pengguna, katalog barang, saldo dan ledger persediaan, serta tiga penjualan seed melalui service checkout yang sama dengan aplikasi. Pelanggan, supplier, kendaraan, resep, dan harga grosir belum diimplementasikan. Nilai laporan dihitung dari transaksi yang tersimpan.

## Menguji alur

1. Login owner; buka Katalog produk, tambah produk dan sesuaikan stok beserta alasan.
2. Buka POS, pilih outlet, buka shift dengan modal awal.
3. Cari nama atau SKU (scanner keyboard dapat memasukkan SKU), masukkan produk ke keranjang.
4. Bayar tunai jumlah pas, non-tunai manual, atau split; server menghitung ulang harga dan mengecek stok.
5. Cetak struk / simpan PDF melalui browser, periksa riwayat dan ledger.
6. Tutup shift dengan uang fisik. Server menyimpan kas seharusnya dan selisih.

Jika request pembayaran terputus, ulangi tanpa mengubah keranjang/metode pembayaran agar key tetap sama. Reload halaman menghilangkan keranjang; periksa riwayat sebelum membuat transaksi baru. Keranjang belum memiliki persistensi/hold. Belum ada pajak, diskon, kembalian otomatis, refund, void, atau gateway pembayaran.

## Pemeriksaan otomatis

```bash
npm run typecheck
npm run lint
npm test
npm run build
# Database pengujian TERPISAH, nama wajib berakhiran _test:
docker compose exec postgres createdb -U smartbiz smartbiz_test
DATABASE_URL=postgresql://smartbiz:development-only@localhost:5432/smartbiz_test npm run db:migrate
DATABASE_URL=postgresql://smartbiz:development-only@localhost:5432/smartbiz_test npm run test:api
npx playwright install --with-deps chromium
npm run test:e2e
```

API tests menyalakan server sendiri pada 4100 dan membuat tenant fixture unik di database test. E2E memakai **database development seed**, menyalakan API pada 4000 dan production web pada 3000; kedua port harus kosong. E2E menambah produk/transaksi nyata. Gunakan database development sekali pakai, bukan production. Jalankan build dan seed sebelum E2E. Browser screenshot/trace ada di `test-results/` dan report di `playwright-report/`.

CI menjalankan migrasi bersih, seed, lint, typecheck, unit, API, dan E2E. Keberadaan workflow bukan bukti CI GitHub sudah berjalan. Hasil sesi lokal dicatat di [VALIDATION.md](docs/VALIDATION.md).

## Struktur

- `apps/web`: Next.js App Router, React Query, RHF/Zod, Tailwind, Lucide.
- `apps/api`: NestJS, guard sesi, otorisasi, service POS dan Prisma.
- `packages/ui`: fondasi Button pola shadcn/ui (Radix Slot + CVA).
- `packages/validation`: kontrak input bersama dan validasi server.
- `apps/api/prisma`: schema, migrasi SQL, seed.
- `tests`: unit, API/PostgreSQL, Playwright.

Redis disediakan Compose untuk tahap queue/cache, belum dipakai alur transaksi. BullMQ, S3, error monitoring eksternal, PWA, subscription dan Super Admin belum diimplementasikan. Tidak ada tombol menuju fitur tersebut.
