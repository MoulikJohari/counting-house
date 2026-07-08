import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { CsvImportButton } from '../components/CsvImportButton';
import { ExportMenu } from '../components/ExportMenu';
import { IconDelete, IconEdit, IconPay } from '../components/icons';
import { useLedger } from '../hooks/useLedger';
import { invoicesExportRows } from '../lib/exportRows';
import { GST_RATES, TDS_RATES, fmt, fmtDate, invCalc, todayStr } from '../lib/ledger';
import type { Invoice } from '../types';

export function InvoicesPage() {
  const { data, loading, reload, currency, pos, invoices } = useLedger();
  const [footMsg, setFootMsg] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, unknown>>({});

  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(todayStr());
  const [payAmt, setPayAmt] = useState('');

  const flash = (msg: string) => {
    setFootMsg(msg);
    setTimeout(() => setFootMsg(''), 1600);
  };

  const aging = useMemo(() => {
    const buckets = [
      { l: 'Not due', min: -1e9, max: 0, hot: false, amt: 0, cnt: 0 },
      { l: '1–30 days', min: 1, max: 30, hot: false, amt: 0, cnt: 0 },
      { l: '31–60', min: 31, max: 60, hot: true, amt: 0, cnt: 0 },
      { l: '61–90', min: 61, max: 90, hot: true, amt: 0, cnt: 0 },
      { l: '90+ days', min: 91, max: 1e9, hot: true, amt: 0, cnt: 0 },
    ];
    const today = new Date(todayStr() + 'T00:00:00');
    invoices.forEach((i) => {
      const c = invCalc(i);
      if (c.balance <= 0.5) return;
      let days = 0;
      if (i.due_date) days = Math.round((today.getTime() - new Date(i.due_date + 'T00:00:00').getTime()) / 86400000);
      const bk = buckets.find((x) => days >= x.min && days <= x.max) || buckets[0];
      bk.amt += c.balance;
      bk.cnt++;
    });
    return buckets;
  }, [invoices]);

  const openForm = (id?: string) => {
    setEditId(id || null);
    if (id) {
      const rec = invoices.find((x) => x.id === id);
      setFormState(rec ? { ...rec, payments: rec.payments ? [...rec.payments] : [] } : {});
    } else {
      setFormState({ date: todayStr(), gst_rate: 18, tds_rate: 0, po_id: '', payments: [] });
    }
    setFormOpen(true);
  };

  const saveForm = async () => {
    const amount = Number(formState.amount);
    if (amount <= 0) {
      flash('Enter an amount');
      return;
    }
    if (!String(formState.company || '').trim()) {
      flash('Enter a company');
      return;
    }
    try {
      const payload = { ...formState };
      payload.payments = ((formState.payments as { date: string; amount: number }[]) || []).map((p) => ({
        date: p.date,
        amount: Number(p.amount),
      }));
      if (payload.po_id === '') payload.po_id = null;
      if (editId) await api.updateInvoice(editId, payload);
      else await api.createInvoice(payload);
      setFormOpen(false);
      flash('Saved');
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await api.deleteInvoice(id);
      flash('Deleted');
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const openPay = (invId: string) => {
    const i = invoices.find((x) => x.id === invId);
    if (!i) return;
    const c = invCalc(i);
    setPayTarget(invId);
    setPayDate(todayStr());
    setPayAmt(String(Math.round(c.balance)));
    setPayOpen(true);
  };

  const savePay = async () => {
    if (!payTarget) return;
    const amount = Number(payAmt);
    if (amount <= 0) {
      flash('Enter an amount');
      return;
    }
    try {
      await api.addPayment(payTarget, { date: payDate, amount });
      setPayOpen(false);
      flash('Payment recorded');
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Payment failed');
    }
  };

  const invFormCalc = invCalc(formState as Partial<Invoice>);

  if (loading || !data) {
    return <div className="loading">Opening the ledger…</div>;
  }

  return (
    <AppLayout>
      <section>
        <div className="toolbar">
          <div>
            <h2>Invoices</h2>
            <p className="ph-sub">GST, TDS, part-payments and due dates</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <CsvImportButton kind="invoices" onDone={flash} onImported={reload} />
            <ExportMenu filename="invoices" title="Invoices" getRows={() => invoicesExportRows(invoices)} onExported={flash} />
            <button className="btn" type="button" onClick={() => openForm()}>
              + Add invoice
            </button>
          </div>
        </div>
        <div className="aging">
          {aging.map((b) => (
            <div key={b.l} className={`age ${b.hot && b.amt > 0 ? 'hot' : ''}`}>
              <div className="lbl">{b.l}</div>
              <div className="amt2">{fmt(b.amt, currency)}</div>
              <div className="cnt">
                {b.cnt} invoice{b.cnt === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
        <div className="panel" style={{ padding: '6px 8px' }}>
          {invoices.length === 0 ? (
            <div className="empty">
              <div className="big">No invoices yet</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th className="r hide-sm">Gross</th>
                  <th className="r">Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...invoices]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((i) => {
                    const c = invCalc(i);
                    const badge = c.overdue
                      ? 'overdue'
                      : c.status === 'paid'
                        ? 'paid'
                        : c.status === 'partial'
                          ? 'partial'
                          : 'unpaid';
                    return (
                      <tr key={i.id}>
                        <td className="ref">{fmtDate(i.date)}</td>
                        <td className="co">{i.company}</td>
                        <td className="ref">{i.ref || '—'}</td>
                        <td>
                          <span className={`badge ${badge}`}>
                            {c.overdue
                              ? 'Overdue'
                              : c.status === 'paid'
                                ? 'Paid'
                                : c.status === 'partial'
                                  ? `Part ${Math.round((c.collected / c.net) * 100)}%`
                                  : 'Unpaid'}
                          </span>
                        </td>
                        <td className={c.overdue ? 'due-od' : 'ref'}>{fmtDate(i.due_date)}</td>
                        <td className="r amt hide-sm">{fmt(c.gross, currency)}</td>
                        <td className="r amt">{fmt(c.balance, currency)}</td>
                        <td className="r">
                          <div className="rowacts">
                            {c.status !== 'paid' && (
                              <button className="ico pay" type="button" onClick={() => openPay(i.id)}>
                                <IconPay />
                              </button>
                            )}
                            <button className="ico" type="button" onClick={() => openForm(i.id)}>
                              <IconEdit />
                            </button>
                            <button className="ico del" type="button" onClick={() => del(i.id)}>
                              <IconDelete />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="foot">
        <span>{footMsg}</span>
      </div>

      {/* Invoice form modal */}
      <div className={`scrim ${formOpen ? 'show' : ''}`} onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}>
        <div className="modal">
          <div className="modal-h">
            <h3>{editId ? 'Edit' : 'Add'} invoice</h3>
          </div>
          <div className="modal-b">
            <div className="fgrid">
              <div className="field full">
                <label>Company / client</label>
                <input value={String(formState.company || '')} onChange={(e) => setFormState({ ...formState, company: e.target.value })} />
              </div>
              <div className="field">
                <label>Invoice number</label>
                <input value={String(formState.ref || '')} onChange={(e) => setFormState({ ...formState, ref: e.target.value })} />
              </div>
              <div className="field">
                <label>Date raised</label>
                <input type="date" value={String(formState.date || '')} onChange={(e) => setFormState({ ...formState, date: e.target.value })} />
              </div>
              <div className="field">
                <label>Due date</label>
                <input type="date" value={String(formState.due_date || '')} onChange={(e) => setFormState({ ...formState, due_date: e.target.value })} />
              </div>
              <div className="field">
                <label>Against PO</label>
                <select value={String(formState.po_id || '')} onChange={(e) => setFormState({ ...formState, po_id: e.target.value })}>
                  <option value="">— none —</option>
                  {pos.map((p) => {
                    const inv = invoices.filter((i) => i.po_id === p.id).reduce((s, i) => s + Number(i.amount), 0);
                    const remaining = Math.max(0, Number(p.amount) - inv);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.ref || p.company} · {p.company} ({fmt(remaining, currency)} left)
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="field">
                <label>Taxable amount (ex-GST)</label>
                <input type="number" value={String(formState.amount ?? '')} onChange={(e) => setFormState({ ...formState, amount: e.target.value })} />
              </div>
              <div className="field">
                <label>GST %</label>
                <select value={String(formState.gst_rate ?? 0)} onChange={(e) => setFormState({ ...formState, gst_rate: Number(e.target.value) })}>
                  {GST_RATES.map((o) => (
                    <option key={o} value={o}>
                      {o}%
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>TDS %</label>
                <select value={String(formState.tds_rate ?? 0)} onChange={(e) => setFormState({ ...formState, tds_rate: Number(e.target.value) })}>
                  {TDS_RATES.map((o) => (
                    <option key={o} value={o}>
                      {o}%
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="calcbox">
              <div className="calcrow">
                <span>Taxable</span>
                <span className="mono">{fmt(invFormCalc.taxable, currency)}</span>
              </div>
              <div className="calcrow tot">
                <span>Invoice total</span>
                <span className="mono">{fmt(invFormCalc.gross, currency)}</span>
              </div>
              <div className="calcrow">
                <span>Expected in bank</span>
                <span className="mono">{fmt(invFormCalc.net, currency)}</span>
              </div>
            </div>
            <div className="paywrap">
              <div className="cap">
                <span>Payments received</span>
                <span>{invFormCalc.balance > 0 ? fmt(invFormCalc.balance, currency) + ' balance' : 'Settled'}</span>
              </div>
              {((formState.payments as { id?: string; date: string; amount: number }[]) || []).map((p, idx) => (
                <div key={p.id || idx} className="payline">
                  <span className="ref">{fmtDate(p.date)}</span>
                  <span className="mono">
                    {fmt(Number(p.amount), currency)}{' '}
                    <button
                      className="ico del"
                      type="button"
                      onClick={() =>
                        setFormState({
                          ...formState,
                          payments: ((formState.payments as unknown[]) || []).filter((_, i) => i !== idx),
                        })
                      }
                    >
                      <IconDelete />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-f">
            <button className="btn ghost" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button className="btn" type="button" onClick={saveForm}>
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      <div className={`scrim ${payOpen ? 'show' : ''}`} onClick={(e) => e.target === e.currentTarget && setPayOpen(false)}>
        <div className="modal narrow">
          <div className="modal-h">
            <h3>Record payment</h3>
          </div>
          <div className="modal-b">
            <div className="field">
              <label>Date received</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Amount</label>
              <input type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
            </div>
          </div>
          <div className="modal-f">
            <button className="btn ghost" type="button" onClick={() => setPayOpen(false)}>
              Cancel
            </button>
            <button className="btn" type="button" onClick={savePay}>
              Add payment
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
