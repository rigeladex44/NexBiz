# Bukti validasi checkpoint

Tanggal: 23 Oktober 2026. Repository awal kosong; implementasi diuji lokal pada managed workspace, PostgreSQL 16 aktual di Docker. Tidak ada deployment cloud atau hasil GitHub Actions yang diklaim.

| Command / pemeriksaan                                             | Hasil yang diamati                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run db:generate`                                             | Prisma Client 6.19.0 berhasil dibuat                                             |
| `npm run db:migrate`                                              | Dua migrasi SQL berhasil di database development dan database test yang terpisah |
| `prisma migrate status --schema apps/api/prisma/schema.prisma`    | Database schema is up to date; tidak ada migrasi pending                         |
| `npm run db:seed`                                                 | Empat tenant berhasil; seed ulang tidak mereset transaksi/stok                   |
| `npm run lint`                                                    | Exit 0                                                                           |
| `npm run typecheck`                                               | API dan web exit 0, strict TypeScript                                            |
| `npm test`                                                        | 5 unit test lulus                                                                |
| `DATABASE_URL=.../smartbiz_test npm run test:api`                 | 14 skenario lulus; Node melaporkan 15 termasuk parent test, 0 gagal              |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/nexalid-browsers npm run test:e2e` | 2 tes Chromium lulus: owner desktop dan cashier mobile                           |
| `npm run build`                                                   | NestJS tsc dan Next.js 16.4.2 production build berhasil                          |
| `npm audit`                                                       | 0 kerentanan diketahui setelah pembaruan Next dan override dependensi Prisma CLI |
| `docker compose config --quiet`                                   | Exit 0                                                                           |
| Docker build/runtime                                              | Lihat catatan akhir di bawah                                                     |

## Cakupan pengujian nyata

Unit: aritmetika Decimal termasuk pecahan sen; validasi nominal/kuantitas dan field tenant tambahan; matriks akses role; hash token sesi.

API/PostgreSQL: akses anonim, password salah, CSRF Origin/header; scope tenant; penyembunyian biaya kasir; RBAC katalog/stok/dashboard/ledger; create produk dan adjustment beserta audit; foreign outlet; stok negatif; shift kosong JSON, uniqueness shift terbuka; total salah dan produk tenant lain; shift pengguna/tenant lain; request duplikat bersamaan; konflik payload idempotency; rollback transaksi multi-produk; dua sale bersamaan dengan stok terbatas; ledger vs saldo; composite FK antar-tenant dan CHECK nonnegative; rekonsiliasi omzet/HPP; riwayat sesuai pengguna; tutup shift dan kas fisik; sesi kedaluwarsa; tenant suspend; logout.

E2E owner: login → tambah produk melalui form → adjustment 7 unit → buka shift → checkout split cash/noncash → struk tersimpan → tutup shift → ledger -1 → riwayat struk → dashboard → logout. E2E mobile: login kasir pada viewport 390×844, navigasi sesuai permission dan write API ditolak 403.

## Error yang ditemukan dan diperbaiki

1. Prisma nested relation create pada composite FK: field tenant yang diinferensikan parent tidak boleh diduplikasi pada nested create. Perbaikan diuji seed dan API.
2. API shift kosong mengembalikan body kosong ketika NestJS menerima null. Diganti envelope `{shift:null}`; regresi ditutup melalui API test dan E2E.
3. Konfigurasi E2E mewarisi PORT=4000 dari `.env` ke web. Web test sekarang menetapkan PORT=3000 dan NODE_ENV=production secara eksplisit.
4. Selector tes nama produk ambigu dengan search. Diganti selector label exact.
5. Dialog effect mengulang fokus saat callback close berubah. Callback terbaru disimpan dalam ref agar fokus tidak dipindahkan setiap render.
6. Audit dependensi awal: Prisma CLI transitif `effect` dan `deepmerge-ts`, serta PostCSS bawaan Next versi lama. Override CLI diuji dengan generate/migrate; Next diperbarui ke 16.4.2 dan build/unit/API/E2E diulang.

## Batas bukti

Pengujian ini tidak membuktikan audit penetrasi, ketahanan beban, performa banyak outlet, atau keseluruhan enam fase sudah selesai. Subscription entitlement, refund, purchasing, modul industri, S3, BullMQ, dan PWA belum diimplementasikan dan belum memiliki pengujian. Backup/restore terdokumentasi tetapi belum diuji pada sesi ini. Browser sementara boleh dihapus setelah tes; screenshot dan laporan tersedia sampai workspace dibersihkan.

## Catatan Docker

Build image awal berhasil. Build ulang sempat gagal karena storage Docker vfs penuh; cache dan browser sementara sesi dibersihkan tanpa menghapus source atau hasil tes. Dockerfile dikurangi jumlah layer untuk membatasi konsumsi vfs. Build final Next.js 16.4.2 berhasil: image `nexalid:local`, SHA `45edca76dbf3ad4e6537e3b45cefa8c0f6b997bff1fdec22b00adb779a8d7c42`. Runtime host juga merespons HTTP 200 pada web dan proxy `/api/health` dengan database ready.

Uji startup stack Compose penuh (`nexalid-smoke`, port 3300) dicoba tetapi belum lulus: pembuatan container web ditolak karena disk 32 GB penuh pada driver vfs. Container smoke dihentikan/dibersihkan. Tidak ada bukti startup seluruh stack container yang diklaim. Build final image berhasil, sedangkan startup dan alur browser yang lolos berjalan sebagai proses Node host dengan PostgreSQL nyata di container.
