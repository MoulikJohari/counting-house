import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import type { AuditLog } from '../types';

export function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setFilters] = useState({ entity_type: '', action: '' });

  useEffect(() => {
    setLoading(true);
    api
      .getLogs({ page, limit: 50, ...filters })
      .then((res) => {
        setLogs(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page, filters]);

  const fmtTime = (iso: string) => new Date(iso).toLocaleString();

  return (
    <AppLayout>
      <div className="toolbar">
        <div>
          <h2>Activity logs</h2>
          <p className="ph-sub">All changes and creations on the platform</p>
        </div>
      </div>

      <div className="filters">
        <select
          className="ctl"
          value={filters.entity_type}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, entity_type: e.target.value });
          }}
        >
          <option value="">All entities</option>
          <option value="po">Purchase orders</option>
          <option value="invoice">Invoices</option>
          <option value="expense">Expenses</option>
          <option value="recurring">Recurring</option>
          <option value="payment">Payments</option>
          <option value="user">Users</option>
          <option value="settings">Settings</option>
        </select>
        <select
          className="ctl"
          value={filters.action}
          onChange={(e) => {
            setPage(1);
            setFilters({ ...filters, action: e.target.value });
          }}
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="payment_add">Payment add</option>
          <option value="payment_remove">Payment remove</option>
          <option value="restore">Restore</option>
          <option value="import">CSV import</option>
          <option value="user_create">User create</option>
          <option value="user_update">User update</option>
          <option value="user_deactivate">User deactivate</option>
        </select>
      </div>

      <div className="panel" style={{ padding: '6px 8px' }}>
        {loading ? (
          <div className="empty">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="empty">
            <div className="big">No activity yet</div>
            <p>Changes to the ledger and user management will appear here.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {logs.flatMap((log) => [
                <tr
                  key={log.id}
                  style={{ cursor: log.changes ? 'pointer' : undefined }}
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  <td className="ref">{fmtTime(log.created_at)}</td>
                  <td>{log.user_name || log.user_email || 'System'}</td>
                  <td>{log.action}</td>
                  <td>{log.entity_type}</td>
                  <td>{log.summary}</td>
                </tr>,
                expanded === log.id && log.changes ? (
                  <tr key={`${log.id}-detail`}>
                    <td colSpan={5}>
                      <div className="log-changes">{JSON.stringify(log.changes, null, 2)}</div>
                    </td>
                  </tr>
                ) : null,
              ])}
            </tbody>
          </table>
        )}
      </div>

      {total > 50 && (
        <div className="foot">
          <span>
            Page {page} of {Math.ceil(total / 50)} ({total} entries)
          </span>
          <div className="dtools">
            <button className="btn ghost sm" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button
              className="btn ghost sm"
              type="button"
              disabled={page >= Math.ceil(total / 50)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
