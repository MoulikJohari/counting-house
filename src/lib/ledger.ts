import type { Invoice, Period, PO } from '../types';

export const CATS = ['Flight', 'Salary', 'Hotel', 'Misc'] as const;
export const CAT_COLOR: Record<string, string> = {
  Flight: '#2E7D5B',
  Salary: '#A9863F',
  Hotel: '#B4452E',
  Misc: '#6B7280',
};
export const GST_RATES = [0, 5, 12, 18, 28];
export const TDS_RATES = [0, 1, 2, 5, 10];

export const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
};

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function fmt(n: number, currency: string) {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  const s = currency === '₹' ? abs.toLocaleString('en-IN') : abs.toLocaleString('en-US');
  return (neg ? '-' : '') + currency + s;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const x = new Date(d + 'T00:00:00');
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fyBounds() {
  const n = new Date();
  const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  return [new Date(y, 3, 1), new Date(y + 1, 2, 31, 23, 59, 59)] as const;
}

function monthBounds() {
  const n = new Date();
  return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59)] as const;
}

export function inPeriod(dStr: string | null | undefined, period: Period) {
  if (period === 'all') return true;
  if (!dStr) return false;
  const d = new Date(dStr + 'T00:00:00');
  const [a, b] = period === 'fy' ? fyBounds() : monthBounds();
  return d >= a && d <= b;
}

export function invCalc(i: Partial<Invoice> & { payments?: { amount: number }[] }) {
  const taxable = num(i.amount);
  const gst = (taxable * num(i.gst_rate)) / 100;
  const gross = taxable + gst;
  const tds = (taxable * num(i.tds_rate)) / 100;
  const net = gross - tds;
  const collected = (i.payments || []).reduce((s, p) => s + num(p.amount), 0);
  const balance = Math.max(0, net - collected);
  let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
  if (net > 0 && collected >= net - 0.5) status = 'paid';
  else if (collected > 0.5) status = 'partial';
  const overdue = status !== 'paid' && !!i.due_date && new Date(i.due_date + 'T00:00:00') < new Date(todayStr() + 'T00:00:00');
  return { taxable, gst, gross, tds, net, collected, balance, status, overdue };
}

export function poCalc(p: PO, invoices: Invoice[]) {
  const val = num(p.amount);
  const inv = invoices.filter((i) => i.po_id === p.id).reduce((s, i) => s + num(i.amount), 0);
  const remaining = Math.max(0, val - inv);
  const pct = val ? Math.min(100, Math.round((inv / val) * 100)) : 0;
  return { val, inv, remaining, pct };
}

export function compute(
  pos: PO[],
  invoices: Invoice[],
  expenses: { date: string; amount: number; category: string }[],
  period: Period,
) {
  const fpos = pos.filter((p) => inPeriod(p.date, period));
  const finv = invoices.filter((i) => inPeriod(i.date, period));
  const fexp = expenses.filter((e) => inPeriod(e.date, period));
  const po = fpos.reduce((s, p) => s + num(p.amount), 0);
  let invoiced = 0;
  let collected = 0;
  let outstanding = 0;
  let overdue = 0;
  finv.forEach((i) => {
    const c = invCalc(i);
    invoiced += c.gross;
    collected += c.collected;
    outstanding += c.balance;
    if (c.overdue) overdue += c.balance;
  });
  const exp = fexp.reduce((s, e) => s + num(e.amount), 0);
  return { po, invoiced, collected, outstanding, overdue, exp, net: collected - exp, fpos, finv, fexp };
}

export const monthKey = (d: string) => {
  const x = new Date(d + 'T00:00:00');
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

export const monthLabel = (k: string) => {
  const [y, m] = k.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-GB', { month: 'short' }) + " '" + String(y).slice(2);
};
