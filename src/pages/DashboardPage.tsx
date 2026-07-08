import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { useMemo, useRef, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { useLedgerContext } from '../ledger/LedgerContext';
import { CATS, CAT_COLOR, compute, invCalc, monthKey, monthLabel } from '../lib/ledger';
import type { Period } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

export function DashboardPage() {
  const { data, loading, reload, pos, invoices, expenses, format } = useLedgerContext();
  const [period, setPeriod] = useState<Period>('fy');
  const [footMsg, setFootMsg] = useState('');
  const restoreRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setFootMsg(msg);
    setTimeout(() => setFootMsg(''), 1600);
  };

  const stats = useMemo(() => compute(pos, invoices, expenses, period), [pos, invoices, expenses, period]);

  const chartData = useMemo(() => {
    const b: Record<string, { in: number; out: number }> = {};
    stats.finv.forEach((i) =>
      (i.payments || []).forEach((p) => {
        const k = monthKey(p.date || i.date);
        b[k] = b[k] || { in: 0, out: 0 };
        b[k].in += Number(p.amount);
      }),
    );
    stats.fexp.forEach((e) => {
      const k = monthKey(e.date);
      b[k] = b[k] || { in: 0, out: 0 };
      b[k].out += Number(e.amount);
    });
    const keys = Object.keys(b).sort();
    return {
      keys,
      flow: {
        labels: keys.map(monthLabel),
        datasets: [
          { label: 'In', data: keys.map((k) => b[k].in), backgroundColor: '#2E7D5B', borderRadius: 5 },
          { label: 'Out', data: keys.map((k) => b[k].out), backgroundColor: '#C9624A', borderRadius: 5 },
        ],
      },
      cat: (() => {
        const cat: Record<string, number> = {};
        CATS.forEach((c) => (cat[c] = 0));
        stats.fexp.forEach((e) => (cat[e.category || 'Misc'] = (cat[e.category || 'Misc'] || 0) + Number(e.amount)));
        const present = CATS.filter((c) => cat[c] > 0);
        return {
          present,
          data: {
            labels: present,
            datasets: [{ data: present.map((c) => cat[c]), backgroundColor: present.map((c) => CAT_COLOR[c]) }],
          },
        };
      })(),
    };
  }, [stats]);

  const byCompany = useMemo(() => {
    const map: Record<string, { po: number; inv: number; coll: number; out: number }> = {};
    stats.fpos.forEach((p) => {
      const k = p.company || '—';
      map[k] = map[k] || { po: 0, inv: 0, coll: 0, out: 0 };
      map[k].po += Number(p.amount);
    });
    stats.finv.forEach((i) => {
      const k = i.company || '—';
      const c = invCalc(i);
      map[k] = map[k] || { po: 0, inv: 0, coll: 0, out: 0 };
      map[k].inv += c.gross;
      map[k].coll += c.collected;
      map[k].out += c.balance;
    });
    return Object.entries(map).sort((a, b) => b[1].inv + b[1].po - (a[1].inv + a[1].po));
  }, [stats]);

  const onRestore = async (file: File) => {
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      if (!confirm('Replace all current data with this backup?')) return;
      await api.restore(obj);
      flash('Restored');
      await reload();
    } catch {
      alert('That file could not be read as a Counting House backup.');
    }
  };

  if (loading || !data) {
    return <div className="loading">Opening the ledger…</div>;
  }

  return (
    <AppLayout>
      <div className="mast-tools" style={{ marginBottom: 16, justifyContent: 'flex-end', display: 'flex' }}>
        <div className="seg">
          {(['fy', 'month', 'all'] as Period[]).map((p) => (
            <button key={p} type="button" className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
              {p === 'fy' ? 'This FY' : p === 'month' ? 'This month' : 'All time'}
            </button>
          ))}
        </div>
      </div>

      <section>
        <div className="hero">
          <div className="lead">
            <p className="k">Net cash position</p>
            <div className="v mono" style={{ color: stats.net >= 0 ? '#BFE3D2' : '#E9B3A6' }}>
              {format(stats.net)}
            </div>
            <small>Collected minus expenses</small>
          </div>
          <div>
            <p className="k">Collected</p>
            <div className="v in mono">{format(stats.collected)}</div>
            <small>{stats.invoiced ? Math.round((stats.collected / stats.invoiced) * 100) : 0}% of invoiced</small>
          </div>
          <div>
            <p className="k">Spent</p>
            <div className="v out mono">{format(stats.exp)}</div>
            <small>{stats.fexp.length} entries</small>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <p className="k">PO received</p>
            <div className="n mono">{format(stats.po)}</div>
            <div className="meta">{stats.fpos.length} orders</div>
          </div>
          <div className="stat">
            <p className="k">Invoiced</p>
            <div className="n mono">{format(stats.invoiced)}</div>
            <div className="meta">{stats.finv.length} invoices (incl. GST)</div>
          </div>
          <div className="stat">
            <p className="k">Collected</p>
            <div className="n mono">{format(stats.collected)}</div>
            <div className="meta">received in bank</div>
          </div>
          <div className="stat">
            <p className="k">Outstanding</p>
            <div className="n mono">{format(stats.outstanding)}</div>
            <div className="meta">{stats.overdue > 0 ? `${format(stats.overdue)} overdue` : 'all current'}</div>
          </div>
          <div className="stat">
            <p className="k">Expenses</p>
            <div className="n mono">{format(stats.exp)}</div>
            <div className="meta">this {period === 'month' ? 'month' : period === 'fy' ? 'FY' : 'all time'}</div>
          </div>
        </div>
        <div className="row2">
          <div className="panel">
            <div className="ph-head">
              <div>
                <h2>Money in vs out</h2>
                <p className="ph-sub">Collections against expenses</p>
              </div>
            </div>
            <div className="chartbox">
              {chartData.keys.length ? (
                <Bar
                  data={chartData.flow}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }}
                />
              ) : (
                <div className="empty">No payments or expenses in this period</div>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="ph-head">
              <div>
                <h2>Where it goes</h2>
                <p className="ph-sub">Expenses by category</p>
              </div>
            </div>
            <div className="chartbox sm">
              {chartData.cat.present.length ? (
                <Doughnut data={chartData.cat.data} options={{ responsive: true, maintainAspectRatio: false, cutout: '62%' }} />
              ) : (
                <div className="empty">No expenses logged yet</div>
              )}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="ph-head">
            <div>
              <h2>By company</h2>
              <p className="ph-sub">Order book, billed and collected per client</p>
            </div>
          </div>
          {byCompany.length === 0 ? (
            <div className="empty">
              <div className="big">No client activity yet</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="r">PO received</th>
                  <th className="r hide-sm">Invoiced</th>
                  <th className="r">Collected</th>
                  <th className="r">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {byCompany.map(([co, v]) => (
                  <tr key={co}>
                    <td className="co">{co}</td>
                    <td className="r amt">{format(v.po)}</td>
                    <td className="r amt hide-sm">{format(v.inv)}</td>
                    <td className="r amt">{format(v.coll)}</td>
                    <td className="r amt">{format(v.out)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="foot">
        <span>Counting House · shared ledger</span>
        <div className="dtools">
          <span>{footMsg}</span>
          <button className="btn ghost sm" type="button" onClick={() => api.backup()}>
            Backup
          </button>
          <button className="btn ghost sm" type="button" onClick={() => restoreRef.current?.click()}>
            Restore
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onRestore(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </AppLayout>
  );
}
