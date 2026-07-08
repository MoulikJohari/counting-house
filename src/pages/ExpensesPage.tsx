import { useState } from 'react';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { CsvImportButton } from '../components/CsvImportButton';
import { ExportMenu } from '../components/ExportMenu';
import { IconDelete, IconEdit } from '../components/icons';
import { useLedger } from '../hooks/useLedger';
import { expensesExportRows } from '../lib/exportRows';
import { CATS, CAT_COLOR, fmt, fmtDate, todayStr } from '../lib/ledger';
import type { Recurring } from '../types';

export function ExpensesPage() {
  const { data, loading, reload, currency, expenses, recurring } = useLedger();
  const [footMsg, setFootMsg] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, unknown>>({});

  const [recOpen, setRecOpen] = useState(false);
  const [recForm, setRecForm] = useState({ label: '', category: 'Salary', amount: '', day: '1', start: '' });

  const flash = (msg: string) => {
    setFootMsg(msg);
    setTimeout(() => setFootMsg(''), 1600);
  };

  const openForm = (id?: string) => {
    setEditId(id || null);
    if (id) {
      const rec = expenses.find((x) => x.id === id);
      setFormState(rec ? { ...rec } : {});
    } else {
      setFormState({ date: todayStr(), category: 'Flight' });
    }
    setFormOpen(true);
  };

  const saveForm = async () => {
    const amount = Number(formState.amount);
    if (amount <= 0) {
      flash('Enter an amount');
      return;
    }
    try {
      if (editId) await api.updateExpense(editId, formState);
      else await api.createExpense(formState);
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
      await api.deleteExpense(id);
      flash('Deleted');
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const addRecurring = async () => {
    if (!recForm.label.trim()) {
      flash('Add a label');
      return;
    }
    if (Number(recForm.amount) <= 0) {
      flash('Add an amount');
      return;
    }
    try {
      await api.createRecurring({
        label: recForm.label,
        category: recForm.category,
        amount: Number(recForm.amount),
        day: Number(recForm.day) || 1,
        start: recForm.start || new Date().toISOString().slice(0, 7),
      });
      flash('Recurring added');
      await reload();
      setRecOpen(false);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed');
    }
  };

  const rmRecurring = async (id: string) => {
    try {
      await api.deleteRecurring(id);
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed');
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
            <h2>Expenses</h2>
            <p className="ph-sub">Flights, salary, hotels and the rest</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => {
                const now = new Date();
                setRecForm({
                  label: '',
                  category: 'Salary',
                  amount: '',
                  day: '1',
                  start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
                });
                setRecOpen(true);
              }}
            >
              ↻ Recurring
            </button>
            <CsvImportButton kind="expenses" onDone={flash} onImported={reload} />
            <ExportMenu filename="expenses" title="Expenses" getRows={() => expensesExportRows(expenses)} onExported={flash} />
            <button className="btn" type="button" onClick={() => openForm()}>
              + Add expense
            </button>
          </div>
        </div>
        <div className="panel" style={{ padding: '6px 8px' }}>
          {expenses.length === 0 ? (
            <div className="empty">
              <div className="big">No expenses yet</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th className="hide-sm">Vendor / note</th>
                  <th className="r">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...expenses]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((e) => (
                    <tr key={e.id}>
                      <td className="ref">{fmtDate(e.date)}</td>
                      <td>
                        <span className="cat" style={{ background: `${CAT_COLOR[e.category]}1A`, color: CAT_COLOR[e.category] }}>
                          {e.category}
                        </span>
                        {e.recurring_id && <span className="repeat"> ↻</span>}
                      </td>
                      <td className="hide-sm">{e.vendor || e.notes || '—'}</td>
                      <td className="r amt">{fmt(Number(e.amount), currency)}</td>
                      <td className="r">
                        <div className="rowacts">
                          <button className="ico" type="button" onClick={() => openForm(e.id)}>
                            <IconEdit />
                          </button>
                          <button className="ico del" type="button" onClick={() => del(e.id)}>
                            <IconDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="foot">
        <span>{footMsg}</span>
      </div>

      {/* Expense form modal */}
      <div className={`scrim ${formOpen ? 'show' : ''}`} onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}>
        <div className="modal">
          <div className="modal-h">
            <h3>{editId ? 'Edit' : 'Add'} expense</h3>
          </div>
          <div className="modal-b">
            <div className="fgrid">
              <div className="field full">
                <label>Category</label>
                <div className="seg cat-pick">
                  {CATS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={formState.category === c ? 'on' : ''}
                      onClick={() => setFormState({ ...formState, category: c })}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" value={String(formState.date || '')} onChange={(e) => setFormState({ ...formState, date: e.target.value })} />
              </div>
              <div className="field">
                <label>Amount</label>
                <input type="number" value={String(formState.amount ?? '')} onChange={(e) => setFormState({ ...formState, amount: e.target.value })} />
              </div>
              <div className="field">
                <label>Vendor</label>
                <input value={String(formState.vendor || '')} onChange={(e) => setFormState({ ...formState, vendor: e.target.value })} />
              </div>
              <div className="field full">
                <label>Note</label>
                <input value={String(formState.notes || '')} onChange={(e) => setFormState({ ...formState, notes: e.target.value })} />
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

      {/* Recurring modal */}
      <div className={`scrim ${recOpen ? 'show' : ''}`} onClick={(e) => e.target === e.currentTarget && setRecOpen(false)}>
        <div className="modal">
          <div className="modal-h">
            <h3>Recurring expenses</h3>
            <p>These post automatically each month</p>
          </div>
          <div className="modal-b">
            {recurring.map((r: Recurring) => (
              <div key={r.id} className="payline">
                <span>
                  <strong>{r.label}</strong>{' '}
                  <span className="ref">
                    {r.category} · day {r.day}
                  </span>
                </span>
                <span>
                  <span className="mono">{fmt(r.amount, currency)}/mo</span>{' '}
                  <button className="ico del" type="button" onClick={() => rmRecurring(r.id)}>
                    <IconDelete />
                  </button>
                </span>
              </div>
            ))}
            <div className="fgrid" style={{ marginTop: 12 }}>
              <div className="field full">
                <label>Label</label>
                <input value={recForm.label} onChange={(e) => setRecForm({ ...recForm, label: e.target.value })} />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={recForm.category} onChange={(e) => setRecForm({ ...recForm, category: e.target.value })}>
                  {CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Amount / month</label>
                <input type="number" value={recForm.amount} onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })} />
              </div>
              <div className="field">
                <label>Day of month</label>
                <input type="number" min={1} max={28} value={recForm.day} onChange={(e) => setRecForm({ ...recForm, day: e.target.value })} />
              </div>
              <div className="field">
                <label>Start month</label>
                <input type="month" value={recForm.start} onChange={(e) => setRecForm({ ...recForm, start: e.target.value })} />
              </div>
            </div>
            <button className="btn" type="button" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={addRecurring}>
              Add recurring expense
            </button>
          </div>
          <div className="modal-f">
            <button className="btn ghost" type="button" onClick={() => setRecOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
