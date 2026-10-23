# Deployment, backup, dan operasi

## Batas rilis

Checkpoint development ini belum layak diklaim SaaS production lengkap. Belum ada registrasi/onboarding production, reset password, billing/entitlement, S3, BullMQ worker, monitoring eksternal, distributed throttler, PWA, atau disaster-recovery drill. Tidak menggunakan kredensial production untuk pengujian. Akun demo dan data seed tidak boleh masuk database production.

## Build dan deploy

`npm ci`, `npm run db:generate`, `npm run build`. API compiled entry: `apps/api/dist/apps/api/src/main.js`; jalankan dari root repository. Web: `npm run start -w @nexalid/web`. Gunakan satu replika API pada checkpoint ini karena limiter masih in-memory.

Docker Compose tersedia untuk lokal dan staging. Jalankan migrasi dengan job sekali jalan sebelum memperbarui API. Dockerfile menyimpan dev tooling untuk migration/seed; pisahkan image migrator dan prune runtime pada tahap hardening. API hanya diekspos ke jaringan internal Compose; PostgreSQL/Redis dibind ke loopback host untuk development. Hilangkan port database pada production dan gunakan jaringan privat.

Untuk managed proxy yang membutuhkan CA:

```bash
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t nexalid:local .
```

Secret CA hanya terpasang saat npm install/Prisma generate, tidak disalin ke image. Build biasa tidak memerlukan secret. Jangan mematikan TLS verification. `API_INTERNAL_URL` dikompilasi ke rewrite Next.js saat build; sesuaikan build arg jika alamat API berubah.

Production membutuhkan `NODE_ENV=production`, `APP_ORIGIN=https://domain-anda`, database unik, HTTPS reverse proxy, secrets manager, serta konfigurasi networking dan domain. Secure cookie memerlukan HTTPS. Hanya web yang menerima traffic publik. Set CSP dengan nonce di tahap hardening Next.js, jangan menyalin CSP API ke HTML secara membabi buta. Header API memakai Helmet; web memiliki nosniff, frame deny, referrer policy. Tidak ada integrasi monitoring error eksternal; log JSON tersedia untuk collector.

Health API `/api/health` memeriksa PostgreSQL. Redis di Compose baru infrastructure dependency, belum bagian proses transaksi. Tidak ada kesiapan worker/object storage yang diklaim.

## Backup

Contoh development/staging, sesuaikan otorisasi dan secret pada provider:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U smartbiz -d smartbiz -Fc > backups/smartbiz.dump
# Restore ke database BARU, jangan menimpa database aktif:
docker compose exec postgres createdb -U smartbiz smartbiz_restore
docker compose exec -T postgres pg_restore -U smartbiz -d smartbiz_restore --no-owner < backups/smartbiz.dump
```

Enkripsi dan simpan backup di storage terpisah dengan lifecycle/retensi. Jadwalkan backup harian, aktifkan PITR pada PostgreSQL managed, dan uji restore berkala. RPO/RTO belum diukur; contoh command bukan bukti strategi recovery sudah diuji. Directory `backups/` harus diabaikan git. Jangan mengunggah dump berisi data tenant ke repository.

## Operasi keamanan berikutnya

- Provision akun production melalui workflow undangan/onboarding yang belum dibuat, bukan seed demo.
- Simpan DATABASE_URL di secret manager; batasi role database aplikasi dan akses backup.
- Tambahkan pembersihan sesi kedaluwarsa dan kebijakan revokasi seluruh perangkat.
- Tambahkan limiter terdistribusi, alert autentikasi gagal, dependency scanning, dan audit penetrasi.
- Jalankan E2E dan API test di database disposable; test API menolak nama database yang tidak berakhiran `_test`.

## Catatan kapasitas environment validasi

Docker vfs menyalin filesystem per layer/container. Pada workspace 32 GB, build image berhasil tetapi startup ketiga container aplikasi sekaligus menghabiskan disk. Gunakan host Docker dengan overlay2 atau kapasitas lebih besar untuk pengujian stack Compose penuh. Startup penuh Compose belum terverifikasi pada sesi ini; penggunaan host Node + PostgreSQL Docker sudah diuji melalui Playwright.
