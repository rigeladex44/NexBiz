# Checkpoint dan roadmap

Repository awal kosong. Tidak ada kode/data lama untuk dimigrasikan. Tidak ada AGENTS.md dalam repository.

| Fase | Checkpoint sesi ini                                                                                                                                     | Belum selesai                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1    | Monorepo, Prisma/PostgreSQL, auth sesi, isolasi tenant, tiga role, layout responsif dan komponen dasar                                                  | Onboarding, reset password, MFA, role/permission kustom, desain komponen lengkap                                |
| 2    | Katalog barang, pencarian nama/SKU, adjustment + ledger, POS decimal atomik/idempotent, pembayaran manual/split, shift buka/tutup, struk cetak, riwayat | Varian, barcode khusus, units, warehouse terpisah, tax/discount, hold/resume, refund/void, cash-in/out, gateway |
| 3    | Ringkasan owner/supervisor berdasarkan transaksi dan HPP snapshot                                                                                       | Customer, supplier, purchasing/PO, expense, laporan tanggal/outlet/karyawan, export data                        |
| 4    | Empat tenant seed berlabel industri, semua menggunakan core barang yang sama                                                                            | FnB/KDS/BOM/meja, workshop/vehicle/WO, wholesale/credit/picking, retail promo/expiry, booking jasa              |
| 5    | Tidak diimplementasikan                                                                                                                                 | Plan/trial/billing/invoice/entitlements, super admin terpisah, support, SaaS monitoring                         |
| 6    | Migrasi constraints, unit/API/E2E, CI config, build, Compose, panduan backup/deploy                                                                     | Audit keamanan lengkap, load/performance tests, observability/alerts, DR drill, deployment cloud aktual, PWA    |

## Langkah berikutnya

1. Tambahkan warehouse, category/variant dan unit conversion dengan ledger yang sama, beserta pengujian.
2. Tambahkan customer dan supplier, purchase receiving yang menghitung biaya persediaan secara eksplisit.
3. Implementasikan refund/void dengan approval, ledger pembalik dan audit; tidak mengedit sale final.
4. Tambahkan konfigurasi pajak/diskon dan permission granular; versi aturan harga disnapshot.
5. Buat subscription/entitlement server-side sebelum mengaktifkan UI modul industri.
6. Lanjutkan satu workflow industri per checkpoint (FnB terlebih dahulu), kemudian platform admin dengan mekanisme support access beraudit.
7. Keraskan deployment (limiter terdistribusi, secrets manager, pemantauan error, backup teruji, PWA).

Tidak ada halaman placeholder atau notifikasi sukses palsu untuk fitur yang belum tersedia. Tabel ini tidak menyatakan fase 1–6 selesai secara penuh.
