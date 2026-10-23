# Arsitektur dan konsistensi data

## Keputusan

Modular monolith NestJS dengan Next.js App Router sebagai klien same-origin. PostgreSQL adalah sumber kebenaran transaksi; Redis bukan sumber saldo. Kontrak input dipusatkan di `packages/validation`. API saat ini dikelompokkan menurut public/auth dan operasi bisnis; pemecahan controller ke modul domain dilakukan saat cakupan purchasing/finance tumbuh.

Autentikasi: Argon2id, token acak 256-bit, hash SHA-256 token disimpan di `UserSession`, masa berlaku 8 jam, HttpOnly, SameSite=Strict, Secure pada production. Logout mencabut sesi server. Semua perubahan membutuhkan header `X-Requested-With: SmartBiz`; Origin browser harus sama dengan APP_ORIGIN. API tidak mengaktifkan CORS. Pembatasan request dan login memakai throttler in-memory; deployment beberapa replika memerlukan shared storage limiter.

Sesi merujuk Membership. Tenant dan role selalu dibaca server; body tidak boleh memilih tenant. Tenant yang dinonaktifkan kehilangan akses pada permintaan berikutnya. Role minimum: owner/supervisor mengelola katalog dan stok; cashier membaca katalog serta mengoperasikan shift dan penjualannya sendiri. Super Admin tidak disamakan dengan OWNER dan belum dibuat. Harga biaya disembunyikan dari pembacaan katalog/riwayat/checkout kasir.

## Hubungan entity / ERD tekstual

| Induk      | Relasi | Anak                                                              |
| ---------- | ------ | ----------------------------------------------------------------- |
| Tenant     | 1:N    | Membership, Outlet, Product, Shift, Sale, StockMovement, AuditLog |
| User       | 1:N    | Membership                                                        |
| Membership | 1:N    | UserSession, Shift                                                |
| Outlet     | 1:N    | Shift, Sale, StockBalance, StockMovement                          |
| Product    | 1:N    | StockBalance, StockMovement, SaleLine                             |
| Shift      | 1:N    | Sale                                                              |
| Sale       | 1:N    | SaleLine, Payment, StockMovement                                  |

ID utama UUID. Membership unik pada `(tenantId,userId)`, SKU unik pada `(tenantId,sku)`. Saldo unik pada `(tenantId,outletId,productId)`. Relasi produk/outlet/shift/sale memakai composite foreign key yang memasukkan tenant; database menolak penyambungan entity dari tenant lain. RLS PostgreSQL belum diterapkan: isolasi pembacaan bergantung pada guard dan predicate eksplisit setiap query, dengan pengujian API. Role database aplikasi bukan role platform admin.

Partial unique index memastikan satu shift terbuka per membership. SQL CHECK mencegah stok negatif, kuantitas baris tidak positif, uang negatif, dan pembayaran nol/negatif. Indeks tenant/waktu mendukung riwayat dan ledger.

## Checkout

1. Validasi input Zod: UUID, kuantitas integer positif, produk tidak duplikat, uang sebagai string decimal.
2. Ambil row lock shift; cek tenant dan pemilik shift.
3. Periksa `(tenantId,idempotencyKey)` dan hash payload. Replay identik mengembalikan sale yang sama, termasuk setelah shift ditutup; payload/key berbeda ditolak.
4. Baca harga dan biaya dari database. Hitung total dan HPP memakai Prisma.Decimal; pembayaran diterapkan harus sama persis total.
5. Kurangi saldo memakai update bersyarat `quantity >= requested`, dalam urutan ID produk stabil.
6. Simpan snapshot nama/harga/biaya, pembayaran RECORDED, ledger negatif, audit SALE_COMPLETED.
7. Commit atomik pada isolation SERIALIZABLE. Konflik serialization/unique diulang maksimal empat upaya. Semua kegagalan rollback keseluruhan transaksi.

Penjualan final tidak mempunyai endpoint edit/delete. Payment RECORDED berarti catatan pembayaran diterima petugas, bukan settlement gateway. Struk diturunkan dari snapshot sale, bukan harga produk terbaru. IDR ditampilkan dalam format Indonesia; database Decimal(18,2), kuantitas integer. Satuan pecahan/unit conversion belum tersedia.

Adjustment menyimpan perubahan dan alasan beserta audit dalam transaksi yang sama. Balance dapat direkonsiliasi dengan SUM(delta) ledger. Penutupan shift memakai row lock yang sama dengan checkout untuk mencegah transaksi menyelinap setelah rekonsiliasi. Expected cash = opening cash + pembayaran CASH; variance = counted cash − expected cash. Belum ada cash-in/out selain modal dan penjualan.

## Pelaporan

Omzet = SUM(Sale.total), HPP = SUM(Sale.cost), laba kotor = omzet − HPP. Nilai persediaan memakai biaya produk saat ini, belum FIFO/weighted-average. Dashboard seluruh periode, tanpa filter tanggal. Grafik menunjukkan hingga tujuh transaksi terakhir, bukan agregat harian. Beban operasional, pajak, retur, piutang, dan hutang belum tersedia; aplikasi tidak mengklaim laba bersih atau arus kas.

## Frontend

Layout responsif, sidebar dapat diciutkan, navigasi sesuai role, pencarian katalog/SKU, pagination produk/penjualan, dialog dengan focus trap dan Escape, toast hanya setelah respons server, loading/error/empty states. React Query menginvalidasi data setelah mutasi. Komponen Button memakai pola shadcn/ui; komponen kompleks lain belum berupa library reusable lengkap. Aksesibilitas dan perangkat touchscreen perlu audit lebih luas sebelum rilis.

## Infrastruktur tahap ini

Dockerfile multi-stage, pengguna runtime non-root, Compose PostgreSQL/Redis/API/web/migration runner, health database, log request JSON tanpa body/header autentikasi, GitHub Actions. Belum ada queue/job consumer, upload object storage, distributed sessions cache, monitoring eksternal, atau provision cloud. Lihat deployment untuk batas production.

## Dependensi

Next.js diperbarui ke 16.4.2 untuk menghindari PostCSS transitif rentan pada versi 15. Prisma tetap 6.19.0; override khusus @prisma/config menaikkan effect ke seri 3 yang sudah diperbaiki dan deepmerge-ts ke seri 8. CLI generate/migrate dan build image diuji dengan lockfile tersebut. Tinjau ulang override saat upgrade Prisma berikutnya.
