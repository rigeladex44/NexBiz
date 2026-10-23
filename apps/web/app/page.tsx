'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  ArrowLeftRight,
  ReceiptText,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  Minus,
  X,
  Menu,
  ArrowUpRight,
  Store,
  Check,
  Wallet,
  BarChart3,
  Printer,
  AlertCircle,
  LoaderCircle,
  ShieldCheck,
  Cloud,
  CircleHelp,
} from 'lucide-react';
import { Button } from '@nexalid/ui';
import { loginSchema } from '../../../packages/validation/src';
type Outlet = { id: string; name: string };
type Me = {
  user: { name: string; email: string };
  tenant: { name: string; slug: string; industry: string };
  role: 'OWNER' | 'SUPERVISOR' | 'CASHIER';
  outlets: Outlet[];
};
type Product = {
  id: string;
  name: string;
  sku: string;
  price: string;
  cost?: string;
  balances: { outletId: string; quantity: number }[];
};
type Sale = {
  id: string;
  total: string;
  createdAt: string;
  outlet?: { name: string };
  lines: { id: string; name: string; quantity: number; unitPrice: string }[];
  payments: { method: string; amount: string }[];
};
type Shift = { id: string; outletId: string; openingCash: string };
type Dashboard = {
  revenue: string;
  grossProfit: string;
  saleCount: number;
  productCount: number;
  inventoryValue: string;
  lowStock: { name: string; quantity: number }[];
  recent: { id: string; total: string; createdAt: string }[];
};
type Movement = {
  id: string;
  product: { name: string; sku: string };
  outlet: { name: string };
  delta: number;
  reason: string;
  createdAt: string;
};
type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SmartBiz' },
    credentials: 'same-origin',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new ApiError(data.message || 'Permintaan gagal', r.status);
  return data;
}
const money = (n: string | number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 2,
  }).format(Number(n));
const date = (s: string) =>
  new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const cents = (s: string) => {
  const [a, b = ''] = s.split('.');
  return Number(a) * 100 + Number(b.padEnd(2, '0'));
};
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000, refetchOnWindowFocus: true } },
});
export default function Page() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}
function Loading() {
  return (
    <div role="status" className="space-y-4 p-6">
      <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
      <span className="text-xs text-slate-500">Memuat data…</span>
    </div>
  );
}
function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center gap-3"
    >
      <AlertCircle size={18} />
      <span className="flex-1">{error.message}</span>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="p-12 text-center text-sm text-slate-500">
      <Package className="mx-auto mb-3 text-slate-300" size={32} />
      {text}
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first = root?.querySelector<HTMLElement>('input,button,select');
    first?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && root) {
        const els = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled)',
          ),
        );
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel fade w-full max-w-lg max-h-[90dvh] overflow-auto"
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Tutup dialog" onClick={close}>
            <X size={18} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('me') });
  if (me.isPending) return <Loading />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401)
      return (
        <Login
          onLogin={() => {
            void queryClient.invalidateQueries();
          }}
        />
      );
    return <ErrorBox error={me.error} retry={() => void me.refetch()} />;
  }
  return <Workspace me={me.data} />;
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState('');
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenant: 'retail', email: 'owner@retail.demo', password: '' },
  });
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="hidden lg:flex bg-[#131d36] text-white p-16 flex-col justify-between relative overflow-hidden">
        <div className="absolute size-[620px] rounded-full border border-white/5 -right-64 top-8" />
        <div className="absolute size-[450px] rounded-full border border-white/10 -right-36 top-30" />
        <Brand dark />
        <div className="relative max-w-md">
          <span className="inline-flex gap-2 items-center rounded-full border border-white/15 px-3 py-2 text-xs text-indigo-200">
            <Cloud size={14} /> YOUR BUSINESS, CONNECTED
          </span>
          <h1 className="text-5xl font-semibold leading-[1.15] tracking-tight mt-7">
            Satu kendali.
            <br />
            Banyak kemungkinan.
          </h1>
          <p className="text-slate-400 mt-6 leading-7">
            Kelola transaksi dan persediaan bisnis Anda dengan data yang terhubung, aman, dan dapat
            ditelusuri.
          </p>
          <div className="flex gap-6 mt-10 text-xs text-slate-300">
            <span className="flex gap-2">
              <ShieldCheck size={16} /> Isolasi data tenant
            </span>
            <span className="flex gap-2">
              <ArrowLeftRight size={16} /> Ledger persediaan
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500">NEXALID SmartBiz Cloud · Development checkpoint</p>
      </div>
      <main className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-12">
            <Brand />
          </div>
          <div className="eyebrow mb-3">WELCOME BACK</div>
          <h2 className="text-3xl font-semibold tracking-tight">Masuk ke workspace</h2>
          <p className="text-sm text-slate-500 mt-3 mb-8">
            Lanjutkan mengelola bisnis Anda hari ini.
          </p>
          <form
            onSubmit={form.handleSubmit(async (data) => {
              setError('');
              try {
                await api('auth/login', data);
                onLogin();
              } catch (e) {
                setError((e as Error).message);
              }
            })}
            className="space-y-5"
          >
            {(['tenant', 'email', 'password'] as const).map((key) => (
              <div key={key}>
                <label htmlFor={key}>
                  {key === 'tenant'
                    ? 'ID workspace'
                    : key === 'email'
                      ? 'Alamat email'
                      : 'Kata sandi'}
                </label>
                <input
                  id={key}
                  type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'}
                  autoComplete={
                    key === 'password'
                      ? 'current-password'
                      : key === 'email'
                        ? 'username'
                        : 'organization'
                  }
                  {...form.register(key)}
                />
                {form.formState.errors[key] && (
                  <p className="text-xs text-rose-600 mt-1">
                    {form.formState.errors[key]?.message}
                  </p>
                )}
              </div>
            ))}
            {error && (
              <p role="alert" className="text-sm text-rose-600">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : null}
              Masuk ke workspace <ArrowUpRight size={16} />
            </Button>
          </form>
          <p className="text-xs text-slate-400 mt-8 leading-5">
            Akun development tersedia pada README repository. Gunakan password dari konfigurasi seed
            lokal Anda.
          </p>
        </div>
      </main>
    </div>
  );
}
function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-9 rounded-xl bg-indigo-600 grid place-items-center text-white font-bold text-lg shadow-lg shadow-indigo-600/15">
        N<span className="sr-only">Nexalid</span>
      </div>
      <div>
        <span
          className={`font-bold text-lg tracking-[.12em] ${dark ? 'text-white' : 'text-slate-900'}`}
        >
          NEXALID<span className="text-indigo-400">.</span>
        </span>
        <p className="text-[9px] tracking-[.24em] text-slate-400">SMARTBIZ CLOUD</p>
      </div>
    </div>
  );
}
type Tab = 'dashboard' | 'pos' | 'products' | 'inventory' | 'sales';
const nav = [
  { id: 'dashboard' as const, label: 'Ringkasan bisnis', icon: LayoutDashboard, admin: true },
  { id: 'pos' as const, label: 'Point of Sale', icon: ShoppingBag, admin: false },
  { id: 'products' as const, label: 'Katalog produk', icon: Package, admin: false },
  { id: 'inventory' as const, label: 'Pergerakan stok', icon: ArrowLeftRight, admin: true },
  { id: 'sales' as const, label: 'Riwayat transaksi', icon: ReceiptText, admin: false },
];
function Workspace({ me }: { me: Me }) {
  const admin = me.role !== 'CASHIER';
  const [tab, setTab] = useState<Tab>(admin ? 'dashboard' : 'pos'),
    [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState(''),
    [help, setHelp] = useState(false);
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };
  const notify = (s: string) => {
    setNotice(s);
    refresh();
  };
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(''), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const active = nav.find((n) => n.id === tab)!;
  return (
    <div className="min-h-dvh flex">
      <aside
        className={`${mobile ? 'flex' : 'hidden'} md:flex fixed inset-y-0 left-0 z-40 ${collapsed ? 'w-22' : 'w-64'} flex-col border-r border-slate-200 bg-white px-5 py-7 transition-all`}
      >
        <div className={collapsed ? 'overflow-hidden w-10' : ''}>
          <Brand />
        </div>
        <div className="mt-10 mb-4 eyebrow">{collapsed ? '•••' : 'WORKSPACE'}</div>
        <nav className="space-y-1.5">
          {nav
            .filter((n) => !n.admin || admin)
            .map((n) => (
              <button
                title={n.label}
                key={n.id}
                onClick={() => {
                  setTab(n.id);
                  setSearch('');
                  setMobile(false);
                }}
                className={`flex items-center gap-3 w-full p-3 rounded-xl text-sm text-left transition-colors ${tab === n.id ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <n.icon size={19} className="shrink-0" />
                {!collapsed && n.label}
              </button>
            ))}
        </nav>
        <div className="mt-auto">
          {!collapsed && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <ShieldCheck size={16} className="text-indigo-500" /> Workspace terisolasi
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-5">
                Data bisnis terhubung dengan tenant {me.tenant.slug}.
              </p>
            </div>
          )}
          <button
            onClick={() => setHelp(true)}
            className="flex gap-3 text-sm text-slate-500 p-2 w-full"
          >
            <CircleHelp size={18} />
            {!collapsed && 'Tentang checkpoint'}
          </button>
          <button
            className="hidden md:flex text-xs text-slate-400 items-center gap-2 mt-5 p-2"
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}{' '}
            {!collapsed && 'Ciutkan sidebar'}
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="Tutup navigasi"
          onClick={() => setMobile(false)}
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
        />
      )}
      <div className={`flex-1 min-w-0 transition-all ${collapsed ? 'md:ml-22' : 'md:ml-64'}`}>
        <header className="h-20 bg-white/90 border-b border-slate-200 flex items-center justify-between px-5 lg:px-9 gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Buka navigasi"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </Button>
            <span className="text-xs text-slate-400 hidden sm:inline">Workspace</span>
            <ChevronRight className="text-slate-300 hidden sm:block" size={13} />
            <span className="text-sm font-medium">{active.label}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden lg:flex items-center gap-2 text-[11px] text-emerald-600 bg-emerald-50 py-1.5 px-3 rounded-full">
              <span className="size-1.5 bg-emerald-500 rounded-full" /> Terhubung
            </span>
            <div className="h-7 border-l border-slate-200 hidden sm:block" />
            <div className="size-9 bg-indigo-100 text-indigo-600 rounded-full grid place-items-center font-semibold text-xs">
              {me.user.name
                .split(' ')
                .map((s) => s[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold">{me.user.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{me.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Keluar"
              onClick={async () => {
                try {
                  await api('auth/logout', {});
                  qc.clear();
                  window.location.reload();
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </Button>
          </div>
        </header>
        <main className="p-5 lg:p-9 max-w-[1600px] mx-auto">
          <div className="flex flex-wrap justify-between items-end gap-4 mb-7">
            <div>
              <div className="eyebrow mb-2">
                {me.tenant.name} / {me.tenant.industry}
              </div>
              <h1 className="text-2xl lg:text-[28px] font-semibold tracking-tight">
                {tab === 'dashboard'
                  ? `Selamat datang, ${me.user.name.split(' ')[0]} 👋`
                  : active.label}
              </h1>
              <p className="text-sm text-slate-500 mt-2">
                {tab === 'dashboard'
                  ? 'Gambaran bisnis Anda, berdasarkan seluruh transaksi tercatat.'
                  : tab === 'pos'
                    ? 'Transaksi cepat. Persediaan selalu tercatat.'
                    : tab === 'products'
                      ? 'Kelola produk dan pantau ketersediaan di setiap outlet.'
                      : tab === 'inventory'
                        ? 'Setiap perubahan stok memiliki jejak yang dapat ditelusuri.'
                        : 'Penjualan final dan pembayaran yang telah dicatat.'}
              </p>
            </div>
            {tab === 'dashboard' && (
              <Button onClick={() => setTab('pos')}>
                <Plus size={16} /> Transaksi baru
              </Button>
            )}
          </div>
          {(tab === 'products' || tab === 'pos') && (
            <div className="relative mb-5 max-w-md">
              <Search size={17} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                aria-label="Cari nama produk atau SKU"
                className="pl-10 bg-white"
                placeholder="Cari nama produk atau scan SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="fade" key={tab}>
            {tab === 'dashboard' && <DashboardView go={setTab} />}{' '}
            {(tab === 'products' || tab === 'pos') && (
              <Catalog me={me} search={search} pos={tab === 'pos'} notify={notify} />
            )}{' '}
            {tab === 'inventory' && <Inventory />} {tab === 'sales' && <History />}
          </div>
          <footer className="mt-10 pt-5 border-t border-slate-200 flex justify-between text-[10px] text-slate-400">
            <span>© {new Date().getFullYear()} NEXALID SmartBiz Cloud</span>
            <span>Core POS · Development checkpoint</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div
          role="status"
          className="fixed bottom-6 right-6 left-6 sm:left-auto max-w-md z-50 rounded-xl bg-slate-900 text-white shadow-lg py-4 px-5 flex gap-3 items-center text-sm"
        >
          <Check size={18} />
          {notice}
          <button aria-label="Tutup notifikasi" className="ml-3" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <Modal title="Checkpoint implementasi" close={() => setHelp(false)}>
          <div className="p-6 text-sm leading-7 text-slate-600">
            Fitur aktif: sesi login, katalog, adjustment stok, shift kasir, penjualan dengan split
            payment tercatat, struk, dan ringkasan laba kotor.
            <br />
            <br />
            Modul industri, refund, pajak, diskon, billing, PWA, dan laporan biaya belum tersedia.
            Pembayaran non-tunai dicatat manual, belum diverifikasi gateway. Ringkasan tidak
            menyatakan laba bersih.
          </div>
        </Modal>
      )}
    </div>
  );
}
function DashboardView({ go }: { go: (t: Tab) => void }) {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('dashboard') });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const d = q.data;
  const cards = [
    {
      label: 'Omzet tercatat',
      value: money(d.revenue),
      icon: Wallet,
      color: 'bg-indigo-50 text-indigo-600',
      sub: `${d.saleCount} transaksi final`,
    },
    {
      label: 'Laba kotor',
      value: money(d.grossProfit),
      icon: BarChart3,
      color: 'bg-emerald-50 text-emerald-600',
      sub: 'Omzet dikurangi HPP transaksi',
    },
    {
      label: 'Nilai persediaan',
      value: money(d.inventoryValue),
      icon: Package,
      color: 'bg-amber-50 text-amber-600',
      sub: 'Kuantitas × biaya produk saat ini',
    },
    {
      label: 'Produk dalam katalog',
      value: d.productCount,
      icon: ShoppingBag,
      color: 'bg-sky-50 text-sky-600',
      sub: 'Produk aktif di workspace',
    },
  ];
  return (
    <>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div className="panel p-5" key={c.label}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{c.label}</span>
              <span className={`p-2.5 rounded-xl ${c.color}`}>
                <c.icon size={18} />
              </span>
            </div>
            <p className="text-2xl font-semibold tracking-tight mt-5 mb-3">{c.value}</p>
            <p className="text-[11px] text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-6">
        <section className="panel p-6">
          <div className="flex justify-between">
            <div>
              <h2 className="font-semibold text-sm">Aktivitas penjualan</h2>
              <p className="text-xs text-slate-400 mt-1">
                Maksimal 7 transaksi terbaru · bukan agregasi harian
              </p>
            </div>
            <span className="text-xs text-indigo-600">IDR</span>
          </div>
          {d.recent.length ? (
            <div
              className="h-60 flex items-end gap-3 mt-5 border-b border-slate-100 pb-7 px-2"
              aria-label="Grafik nominal transaksi terbaru"
            >
              {[...d.recent].reverse().map((s) => (
                <div key={s.id} className="flex-1 h-full flex flex-col justify-end relative group">
                  <span className="text-[10px] text-center text-slate-500 mb-2">
                    {money(s.total)}
                  </span>
                  <div
                    style={{
                      height: `${Math.max(3, (Number(s.total) / Math.max(...d.recent.map((s) => Number(s.total)))) * 75)}%`,
                    }}
                    className="rounded-t-lg bg-indigo-500/85 hover:bg-indigo-600 min-h-1"
                  />
                  <span className="absolute -bottom-5 text-[9px] text-slate-400 w-full text-center">
                    {s.id.slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="Belum ada penjualan untuk ditampilkan." />
          )}
          <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-400">
            <span className="size-2 bg-indigo-500 rounded-full" /> Nilai per transaksi · sumber
            database penjualan
          </div>
        </section>
        <section className="panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Perlu perhatian</h2>
            <span className="bg-amber-50 text-amber-600 text-[10px] rounded-full px-2 py-1">
              {d.lowStock.length} stok rendah
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 mb-5">Stok outlet di bawah 10 unit</p>
          {d.lowStock.length ? (
            <div className="space-y-4">
              {d.lowStock.slice(0, 5).map((p, i) => (
                <div key={`${p.name}-${i}`} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="size-9 bg-amber-50 text-amber-500 grid place-items-center rounded-lg">
                      <Package size={16} />
                    </div>
                    <span className="text-xs font-medium">{p.name}</span>
                  </div>
                  <span className="text-xs text-amber-600">{p.quantity} unit</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 p-5 text-emerald-700 text-xs leading-6">
              <ShieldCheck size={24} className="mb-2" />
              Persediaan yang tercatat berada di atas ambang peringatan.
            </div>
          )}
          <Button variant="outline" className="mt-6 w-full" onClick={() => go('products')}>
            Lihat persediaan <ArrowUpRight size={15} />
          </Button>
        </section>
      </div>
      <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 text-xs text-slate-500 leading-6">
        Laba kotor belum memperhitungkan pengeluaran, pajak, dan biaya operasional. Nilai ini bukan
        laba bersih atau arus kas.
      </div>
    </>
  );
}
function Pager({
  page,
  total,
  size,
  setPage,
}: {
  page: number;
  total: number;
  size: number;
  setPage: (n: number) => void;
}) {
  return (
    <div className="px-5 py-4 flex items-center justify-between border-t border-slate-100 text-xs text-slate-500">
      <span>
        {total} data · Halaman {page} dari {Math.max(1, Math.ceil(total / size))}
      </span>
      <div className="flex gap-2">
        <Button
          aria-label="Halaman sebelumnya"
          size="sm"
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <Button
          aria-label="Halaman berikutnya"
          size="sm"
          variant="outline"
          disabled={page * size >= total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
function Catalog({
  me,
  search,
  pos,
  notify,
}: {
  me: Me;
  search: string;
  pos: boolean;
  notify: (s: string) => void;
}) {
  const [page, setPage] = useState(1),
    [outlet, setOutlet] = useState(me.outlets[0]?.id || ''),
    [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]),
    [dialog, setDialog] = useState<'create' | 'adjust' | 'pay' | 'open' | 'close' | null>(null),
    [selected, setSelected] = useState<Product | null>(null),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [key, setKey] = useState<string | null>(null);
  useEffect(() => setPage(1), [search]);
  const q = useQuery({
    queryKey: ['products', search, page],
    queryFn: () =>
      api<Paginated<Product>>(`products?search=${encodeURIComponent(search)}&page=${page}`),
  });
  const shift = useQuery({
    queryKey: ['shift'],
    queryFn: async () => (await api<{ shift: Shift | null }>('shifts/current')).shift,
  });
  const admin = me.role !== 'CASHIER';
  const activeOutlet = pos && shift.data ? shift.data.outletId : outlet;
  const totalCents = cart.reduce((t, i) => t + cents(i.product.price) * i.quantity, 0);
  const total = (totalCents / 100).toFixed(2);
  const stock = (p: Product) => p.balances.find((b) => b.outletId === activeOutlet)?.quantity || 0;
  function add(p: Product) {
    setCart((c) => {
      const prev = c.find((i) => i.product.id === p.id);
      if ((prev?.quantity || 0) >= stock(p)) return c;
      return prev
        ? c.map((i) => (i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...c, { product: p, quantity: 1 }];
    });
    setKey(null);
  }
  return (
    <>
      <div className="flex flex-wrap justify-between gap-3 mb-5">
        <div className="flex gap-2 items-center text-xs text-slate-500">
          <Store size={16} />
          <select
            aria-label="Outlet"
            className="w-auto"
            value={activeOutlet}
            disabled={pos && !!shift.data}
            onChange={(e) => {
              setOutlet(e.target.value);
              setCart([]);
              setKey(null);
            }}
          >
            {me.outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {pos &&
            (shift.isPending ? (
              <span className="text-sm">Memuat shift…</span>
            ) : shift.error ? (
              <ErrorBox error={shift.error} />
            ) : shift.data ? (
              <Button variant="outline" onClick={() => setDialog('close')}>
                <Wallet size={16} /> Tutup shift
              </Button>
            ) : (
              <Button onClick={() => setDialog('open')}>
                <Wallet size={16} /> Buka shift
              </Button>
            ))}
          {admin && !pos && (
            <Button onClick={() => setDialog('create')}>
              <Plus size={16} /> Tambah produk
            </Button>
          )}
        </div>
      </div>
      <div className={pos ? 'grid xl:grid-cols-[1fr_350px] gap-5' : ''}>
        <section className="panel overflow-hidden">
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorBox error={q.error} retry={() => void q.refetch()} />
          ) : !q.data.items.length ? (
            <Empty text="Produk belum tersedia. Tambahkan produk atau ubah pencarian." />
          ) : pos ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {q.data.items.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  disabled={stock(p) === 0}
                  className="border border-slate-200 rounded-xl p-4 text-left hover:border-indigo-400 hover:shadow-sm transition-all disabled:opacity-40 min-h-40"
                >
                  <div
                    className={`size-11 rounded-xl mb-4 grid place-items-center ${['bg-indigo-50 text-indigo-500', 'bg-amber-50 text-amber-500', 'bg-emerald-50 text-emerald-500'][i % 3]}`}
                  >
                    <Package size={23} />
                  </div>
                  <p className="text-xs text-slate-400 mb-1">
                    {p.sku} · {stock(p)} unit
                  </p>
                  <p className="text-sm font-semibold mb-2">{p.name}</p>
                  <p className="text-sm text-indigo-600 font-semibold">{money(p.price)}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>SKU</th>
                    <th>Harga jual</th>
                    <th>Stok outlet</th>
                    {admin && <th>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="flex gap-3 items-center">
                          <div className="size-9 bg-slate-50 rounded-lg grid place-items-center text-slate-400">
                            <Package size={17} />
                          </div>
                          <span className="font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="text-slate-500">{p.sku}</td>
                      <td>{money(p.price)}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${stock(p) < 10 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                        >
                          {stock(p)} unit
                        </span>
                      </td>
                      {admin && (
                        <td>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelected(p);
                              setDialog('adjust');
                            }}
                          >
                            Sesuaikan stok
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data && <Pager page={page} total={q.data.total} size={20} setPage={setPage} />}
        </section>
        {pos && (
          <aside className="panel p-5 self-start">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <ShoppingBag size={18} /> Keranjang
              </h2>
              <span className="text-xs text-slate-400">
                {cart.reduce((s, i) => s + i.quantity, 0)} item
              </span>
            </div>
            {cart.length ? (
              <div className="divide-y divide-slate-100">
                {cart.map((i) => (
                  <div key={i.product.id} className="py-4">
                    <div className="flex justify-between text-sm gap-3">
                      <span className="font-medium">{i.product.name}</span>
                      <button
                        aria-label={`Hapus ${i.product.name}`}
                        onClick={() => {
                          setCart((c) => c.filter((x) => x.product.id !== i.product.id));
                          setKey(null);
                        }}
                      >
                        <X size={15} className="text-slate-400" />
                      </button>
                    </div>
                    <div className="flex justify-between mt-3 items-center">
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Kurangi ${i.product.name}`}
                          onClick={() => {
                            setCart((c) =>
                              c
                                .map((x) =>
                                  x.product.id === i.product.id
                                    ? { ...x, quantity: x.quantity - 1 }
                                    : x,
                                )
                                .filter((x) => x.quantity > 0),
                            );
                            setKey(null);
                          }}
                        >
                          <Minus size={13} />
                        </Button>
                        <span className="text-sm">{i.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Tambah ${i.product.name}`}
                          onClick={() => add(i.product)}
                        >
                          <Plus size={13} />
                        </Button>
                      </div>
                      <span className="text-xs">
                        {money((cents(i.product.price) * i.quantity) / 100)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="Pilih produk untuk mulai transaksi." />
            )}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex justify-between font-semibold mb-3">
                <span>Total</span>
                <span className="text-indigo-600 text-xl">{money(total)}</span>
              </div>
              <p className="text-[10px] text-slate-400 mb-5">
                Tanpa diskon / pajak · harga diverifikasi kembali oleh server.
              </p>
              <Button
                className="w-full"
                disabled={!cart.length || !shift.data}
                onClick={() => {
                  if (!key) setKey(crypto.randomUUID());
                  setDialog('pay');
                }}
              >
                Lanjut pembayaran <ChevronRight size={17} />
              </Button>
              {!shift.data && (
                <p className="text-xs text-amber-600 mt-3">Buka shift untuk menerima pembayaran.</p>
              )}
            </div>
          </aside>
        )}
      </div>
      {dialog === 'create' && (
        <DataForm
          title="Tambah produk"
          close={() => setDialog(null)}
          fields={[
            { name: 'name', label: 'Nama produk', required: true },
            { name: 'sku', label: 'SKU / barcode', required: true },
            { name: 'price', label: 'Harga jual (IDR)', type: 'number', required: true },
            { name: 'cost', label: 'Biaya per unit (IDR)', type: 'number', required: true },
          ]}
          submit={async (data) => {
            await api('products', data);
            notify('Produk tersimpan. Tambahkan stok melalui penyesuaian.');
            setDialog(null);
          }}
        />
      )}
      {dialog === 'adjust' && selected && (
        <DataForm
          title={`Stok: ${selected.name}`}
          close={() => setDialog(null)}
          fields={[
            {
              name: 'delta',
              label: 'Perubahan unit (positif / negatif)',
              type: 'number',
              required: true,
            },
            { name: 'reason', label: 'Alasan penyesuaian (minimal 5 karakter)', required: true },
          ]}
          submit={async (data) => {
            await api(`inventory/${activeOutlet}/adjust`, {
              ...data,
              productId: selected.id,
              delta: Number(data.delta),
            });
            notify('Penyesuaian dan ledger stok tersimpan.');
            setDialog(null);
          }}
        />
      )}
      {dialog === 'open' && (
        <DataForm
          title="Buka shift kasir"
          close={() => setDialog(null)}
          fields={[
            { name: 'openingCash', label: 'Modal kas awal (IDR)', type: 'number', required: true },
          ]}
          submit={async (data) => {
            await api('shifts', { ...data, outletId: outlet });
            notify('Shift kasir dibuka.');
            setDialog(null);
          }}
        />
      )}
      {dialog === 'close' && shift.data && (
        <DataForm
          title="Konfirmasi tutup shift"
          close={() => setDialog(null)}
          note="Hitung uang fisik di laci kasir. Shift yang ditutup tidak dapat digunakan untuk transaksi baru."
          fields={[
            {
              name: 'countedCash',
              label: 'Uang fisik yang dihitung (IDR)',
              type: 'number',
              required: true,
            },
          ]}
          submit={async (data) => {
            const result = await api<{ expectedCash: string; variance: string }>(
              `shifts/${shift.data!.id}/close`,
              data,
            );
            notify(
              `Shift ditutup. Kas seharusnya ${money(result.expectedCash)}; selisih ${money(result.variance)}.`,
            );
            setDialog(null);
          }}
        />
      )}
      {dialog === 'pay' && key && shift.data && (
        <Payment
          total={total}
          close={() => setDialog(null)}
          submit={async (payments) => {
            const sale = await api<Sale>('sales', {
              idempotencyKey: key,
              shiftId: shift.data!.id,
              items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
              payments,
            });
            setReceipt(sale);
            setCart([]);
            setKey(null);
            setDialog(null);
            notify('Transaksi dan pergerakan stok berhasil disimpan.');
          }}
        />
      )}
      {receipt && <Receipt sale={receipt} close={() => setReceipt(null)} tenant={me.tenant.name} />}
    </>
  );
}
type Field = { name: string; label: string; type?: string; required?: boolean };
function DataForm({
  title,
  fields,
  submit,
  close,
  note,
}: {
  title: string;
  fields: Field[];
  submit: (data: Record<string, string>) => Promise<void>;
  close: () => void;
  note?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError('');
    try {
      await submit(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={send} className="p-6 space-y-5">
        {note && <p className="text-xs text-slate-500 leading-6">{note}</p>}
        {fields.map((f) => (
          <div key={f.name}>
            <label htmlFor={f.name}>{f.label}</label>
            <input
              id={f.name}
              name={f.name}
              type={f.type || 'text'}
              step={f.name === 'delta' ? '1' : '0.01'}
              required={f.required}
              maxLength={f.type === 'number' ? undefined : 200}
            />
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" disabled={busy} onClick={close}>
            Batal
          </Button>
          <Button disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{' '}
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function Payment({
  total,
  submit,
  close,
}: {
  total: string;
  submit: (payments: { method: 'CASH' | 'NON_CASH'; amount: string }[]) => Promise<void>;
  close: () => void;
}) {
  const [method, setMethod] = useState<'CASH' | 'NON_CASH' | 'SPLIT'>('CASH'),
    [cash, setCash] = useState(total),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const remaining = (cents(total) - cents(cash || '0')) / 100;
  return (
    <Modal
      title="Konfirmasi pembayaran"
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="p-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setBusy(true);
          try {
            if (method === 'SPLIT' && (!cash || remaining <= 0 || cents(cash) <= 0))
              throw new Error('Bagian tunai harus lebih dari nol dan kurang dari total');
            await submit(
              method === 'SPLIT'
                ? [
                    { method: 'CASH', amount: cash },
                    { method: 'NON_CASH', amount: remaining.toFixed(2) },
                  ]
                : [{ method, amount: total }],
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="bg-indigo-50 p-5 rounded-xl text-center">
          <span className="text-xs text-indigo-500">Total pembayaran</span>
          <p className="text-3xl font-semibold text-indigo-700 mt-2">{money(total)}</p>
        </div>
        <div>
          <label htmlFor="method">Metode</label>
          <select
            id="method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="CASH">Tunai — jumlah pas</option>
            <option value="NON_CASH">Non-tunai — tercatat manual</option>
            <option value="SPLIT">Split: tunai + non-tunai</option>
          </select>
        </div>
        {method === 'SPLIT' && (
          <div>
            <label htmlFor="cash">Bagian tunai (IDR)</label>
            <input
              id="cash"
              type="number"
              min="0.01"
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              required
            />
            <p className="text-xs text-slate-500 mt-2">
              Non-tunai: {money(Math.max(0, remaining))}
            </p>
          </div>
        )}
        <p className="text-xs text-slate-500 leading-6">
          Pastikan dana sudah diterima. Non-tunai dicatat manual dan tidak terhubung ke payment
          gateway. Transaksi final tidak dapat diubah.
        </p>
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error} Jika koneksi terputus, coba ulang tanpa mengubah keranjang agar idempotency key
            tetap sama.
          </p>
        )}
        <Button className="w-full" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />}{' '}
          Catat pembayaran
        </Button>
      </form>
    </Modal>
  );
}
function Receipt({ sale, close, tenant }: { sale: Sale; close: () => void; tenant?: string }) {
  return (
    <Modal title="Struk transaksi" close={close}>
      <div id="receipt" className="p-6">
        <div className="text-center mb-5">
          <h3 className="font-bold tracking-widest">{tenant || 'NEXALID SmartBiz'}</h3>
          <p className="text-xs text-slate-500 mt-2">{date(sale.createdAt)}</p>
          <p className="text-[10px] text-slate-400 mt-1 break-all">{sale.id}</p>
        </div>
        <div className="border-y border-dashed border-slate-300 py-4 space-y-3">
          {sale.lines.map((l) => (
            <div key={l.id} className="flex justify-between text-sm gap-3">
              <span>
                {l.name}
                <span className="text-xs text-slate-400 block">
                  {l.quantity} × {money(l.unitPrice)}
                </span>
              </span>
              <span>{money((cents(l.unitPrice) * l.quantity) / 100)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-bold my-4">
          <span>Total</span>
          <span>{money(sale.total)}</span>
        </div>
        {sale.payments.map((p, i) => (
          <p key={i} className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{p.method === 'CASH' ? 'Tunai' : 'Non-tunai (manual)'}</span>
            <span>{money(p.amount)}</span>
          </p>
        ))}
        <Button variant="outline" className="w-full mt-6" onClick={() => window.print()}>
          <Printer size={16} /> Cetak / simpan PDF
        </Button>
      </div>
    </Modal>
  );
}
function History() {
  const [page, setPage] = useState(1),
    [receipt, setReceipt] = useState<Sale | null>(null);
  const q = useQuery({
    queryKey: ['sales', page],
    queryFn: () => api<Paginated<Sale>>(`sales?page=${page}`),
  });
  return (
    <section className="panel overflow-hidden">
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : !q.data.items.length ? (
        <Empty text="Belum ada transaksi final." />
      ) : (
        <div className="overflow-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                <th>Transaksi</th>
                <th>Waktu</th>
                <th>Outlet</th>
                <th>Total</th>
                <th>Status</th>
                <th>Struk</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">#{s.id.slice(0, 8).toUpperCase()}</td>
                  <td className="text-slate-500">{date(s.createdAt)}</td>
                  <td>{s.outlet?.name}</td>
                  <td className="font-medium">{money(s.total)}</td>
                  <td>
                    <span className="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-[10px]">
                      Final · tercatat
                    </span>
                  </td>
                  <td>
                    <Button variant="outline" size="sm" onClick={() => setReceipt(s)}>
                      <ReceiptText size={14} /> Lihat struk
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && <Pager page={page} total={q.data.total} size={20} setPage={setPage} />}{' '}
      {receipt && <Receipt sale={receipt} close={() => setReceipt(null)} />}
    </section>
  );
}
function Inventory() {
  const q = useQuery({
    queryKey: ['movements'],
    queryFn: () => api<Movement[]>('inventory/movements'),
  });
  return (
    <section className="panel overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between">
        <h2 className="text-sm font-semibold">Ledger persediaan</h2>
        <span className="text-xs text-slate-400">100 pergerakan terbaru</span>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <Empty text="Belum ada pergerakan stok." />
      ) : (
        <div className="overflow-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Outlet</th>
                <th>Perubahan</th>
                <th>Alasan</th>
                <th>Waktu</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">
                    {m.product.name}
                    <p className="text-[10px] text-slate-400 mt-1">{m.product.sku}</p>
                  </td>
                  <td>{m.outlet.name}</td>
                  <td className={m.delta > 0 ? 'text-emerald-600' : 'text-rose-500'}>
                    {m.delta > 0 ? '+' : ''}
                    {m.delta}
                  </td>
                  <td className="text-slate-500">{m.reason}</td>
                  <td className="text-slate-500">{date(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
