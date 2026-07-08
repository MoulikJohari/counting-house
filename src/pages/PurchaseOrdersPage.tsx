import { useState } from 'react';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { CsvImportButton } from '../components/CsvImportButton';
import { ExportMenu } from '../components/ExportMenu';
import { IconDelete, IconEdit } from '../components/icons';
import { useLedgerContext } from '../ledger/LedgerContext';
import { posExportRows } from '../lib/exportRows';
import { GST_RATES, fmtDate, poCalc, todayStr } from '../lib/ledger';
import type { PO } from '../types';

export function PurchaseOrdersPage() {
  const { data, loading, reload, pos, invoices, format, convert, convertToBase } = useLedgerContext();
  const [footMsg, setFootMsg] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, unknown>>({});

  const flash = (msg: string) => {
    setFootMsg(msg);
    setTimeout(() => setFootMsg(''), 1600);
  };

  const openForm = (id?: string) => {
    setEditId(id || null);
    if (id) {
      const rec = pos.find((x) => x.id === id);
      setFormState(rec ? { ...rec, amount: convert(rec.amount) } : {});
    } else {
      setFormState({ date: todayStr(), gst_rate: 0, notes: '' });
    }
    setFormOpen(true);
  };

  const saveForm = async () => {
    const amount = convertToBase(Number(formState.amount));
    if (amount <= 0) {
      flash('Enter an amount');
      return;
    }
    if (!String(formState.company || '').trim()) {
      flash('Enter a company');
      return;
    }
    const payload = { ...formState, amount };
    try {
      if (editId) await api.updatePO(editId, payload);
      else await api.createPO(payload as Omit<PO, 'id'>);
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
      await api.deletePO(id);
      flash('Deleted');
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (loading || !data) {
    return <div className="loading">Opening the ledger…</div>;
  }

  return (
    <AppLayout>
      <section>
        <div className="toolbar">
          <div>
            <h2>Purchase orders received</h2>
            <p className="ph-sub">Confirmed work — track how much you've billed against each</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <CsvImportButton kind="pos" onDone={flash} onImported={reload} />
            <ExportMenu filename="pos" title="Purchase Orders" getRows={() => posExportRows(pos, invoices)} onExported={flash} />
            <button className="btn" type="button" onClick={() => openForm()}>
              + Add PO
            </button>
          </div>
        </div>
        <div className="panel" style={{ padding: '6px 8px' }}>
          {pos.length === 0 ? (
            <div className="empty">
              <div className="big">No purchase orders yet</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Company</th>
                  <th>PO ref</th>
                  <th className="r hide-sm">Value</th>
                  <th>Invoiced</th>
                  <th className="r">Remaining</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...pos]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((p) => {
                    const c = poCalc(p, invoices);
                    return (
                      <tr key={p.id}>
                        <td className="ref">{fmtDate(p.date)}</td>
                        <td className="co">{p.company}</td>
                        <td className="ref">{p.ref || '—'}</td>
                        <td className="r amt hide-sm">{format(c.val)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="bar">
                              <i style={{ width: `${c.pct}%` }} />
                            </div>
                            <span className="ref">{c.pct}%</span>
                          </div>
                        </td>
                        <td className="r amt">{format(c.remaining)}</td>
                        <td className="r">
                          <div className="rowacts">
                            <button className="ico" type="button" onClick={() => openForm(p.id)}>
                              <IconEdit />
                            </button>
                            <button className="ico del" type="button" onClick={() => del(p.id)}>
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

      <div className={`scrim ${formOpen ? 'show' : ''}`} onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}>
        <div className="modal">
          <div className="modal-h">
            <h3>{editId ? 'Edit' : 'Add'} purchase order</h3>
          </div>
          <div className="modal-b">
            <div className="fgrid">
              <div className="field full">
                <label>Company / client</label>
                <input value={String(formState.company || '')} onChange={(e) => setFormState({ ...formState, company: e.target.value })} />
              </div>
              <div className="field">
                <label>PO number</label>
                <input value={String(formState.ref || '')} onChange={(e) => setFormState({ ...formState, ref: e.target.value })} />
              </div>
              <div className="field">
                <label>Date received</label>
                <input type="date" value={String(formState.date || '')} onChange={(e) => setFormState({ ...formState, date: e.target.value })} />
              </div>
              <div className="field">
                <label>Order value (ex-GST)</label>
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
              <div className="field full">
                <label>Description</label>
                <textarea value={String(formState.notes || '')} onChange={(e) => setFormState({ ...formState, notes: e.target.value })} />
              </div>
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
    </AppLayout>
  );
}
