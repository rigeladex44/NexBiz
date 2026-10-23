import { test, expect } from '@playwright/test';
test('owner: real catalog → stock → shift → split checkout → receipt → ledger', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Kata sandi').fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: /Masuk ke workspace/ }).click();
  await expect(page.getByRole('heading', { name: /Selamat datang/ })).toBeVisible();
  await page.getByRole('button', { name: 'Katalog produk', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah produk', exact: true }).click();
  const name = 'E2E Kopi ' + Date.now();
  await page.getByLabel('Nama produk', { exact: true }).fill(name);
  await page.getByLabel('SKU / barcode').fill('E2E-' + Date.now());
  await page.getByLabel('Harga jual (IDR)').fill('25000');
  await page.getByLabel('Biaya per unit (IDR)').fill('10000');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Cari nama produk atau SKU').fill(name);
  await page.getByRole('button', { name: 'Sesuaikan stok' }).click();
  await page.getByLabel('Perubahan unit').fill('7');
  await page.getByLabel('Alasan penyesuaian').fill('E2E opening stock');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('7 unit', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Point of Sale', exact: true }).click();
  await page.getByRole('button', { name: 'Buka shift', exact: true }).click();
  await page.getByLabel('Modal kas awal').fill('100000');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tutup shift', exact: true })).toBeVisible();
  await page.getByLabel('Cari nama produk atau SKU').fill(name);
  await page
    .getByRole('button')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await page.getByRole('button', { name: /Lanjut pembayaran/ }).click();
  await page.getByLabel('Metode', { exact: true }).selectOption('SPLIT');
  await page.getByLabel('Bagian tunai').fill('10000');
  await page.getByRole('button', { name: 'Catat pembayaran', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Struk transaksi' })).toBeVisible();
  await expect(page.locator('#receipt')).toContainText(name);
  await expect(page.locator('#receipt')).toContainText('Non-tunai (manual)');
  await page.getByRole('button', { name: 'Tutup dialog' }).click();
  await page.getByRole('button', { name: 'Tutup shift', exact: true }).click();
  await page.getByLabel('Uang fisik').fill('110000');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Buka shift', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pergerakan stok', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: name }).filter({ hasText: 'SALE' }),
  ).toContainText('-1');
  await page.getByRole('button', { name: 'Riwayat transaksi', exact: true }).click();
  await page.getByRole('button', { name: 'Lihat struk' }).first().click();
  await expect(page.locator('#receipt')).toContainText(name);
  await page.getByRole('button', { name: 'Tutup dialog' }).click();
  await page.getByRole('button', { name: 'Ringkasan bisnis', exact: true }).click();
  await page.screenshot({
    path: 'test-results/dashboard.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masuk ke workspace' })).toBeVisible();
});
test('mobile cashier sees permitted navigation and API rejects catalog writes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Alamat email').fill('cashier@retail.demo');
  await page.getByLabel('Kata sandi').fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: /Masuk ke workspace/ }).click();
  await expect(page.getByRole('heading', { name: 'Point of Sale', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ringkasan bisnis', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pergerakan stok', exact: true })).toHaveCount(0);
  const response = await page.request.post('/api/products', {
    headers: { 'X-Requested-With': 'SmartBiz' },
    data: { name: 'Forbidden mobile', sku: 'MOB', price: '1', cost: '0' },
  });
  expect(response.status()).toBe(403);
  await page.screenshot({
    path: 'test-results/mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
