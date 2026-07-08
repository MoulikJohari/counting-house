import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import type { User, UserRole } from '../types';

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user' as UserRole });

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser(form);
      setShowModal(false);
      setForm({ email: '', name: '', password: '', role: 'user' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const toggleActive = async (user: User) => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  return (
    <AppLayout>
      <div className="toolbar">
        <div>
          <h2>Users</h2>
          <p className="ph-sub">Manage platform access — superadmin only</p>
        </div>
        <button className="btn" type="button" onClick={() => setShowModal(true)}>
          + Add user
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div className="panel" style={{ padding: '6px 8px' }}>
        {loading ? (
          <div className="empty">Loading users…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="co">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="r">
                    <button className="btn ghost sm" type="button" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`scrim ${showModal ? 'show' : ''}`} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
        <div className="modal" role="dialog">
          <div className="modal-h">
            <h3>Add user</h3>
            <p>Create a new account on the platform</p>
          </div>
          <form onSubmit={onCreate}>
            <div className="modal-b">
              <div className="field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={6}
                  required
                />
              </div>
              <div className="field">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                  <option value="user">User</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn ghost" type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="btn" type="submit">
                Create user
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
