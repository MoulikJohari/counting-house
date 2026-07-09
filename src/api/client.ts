import type { AuditLogList, Expense, Invoice, LedgerData, PO, Recurring, User } from '../types';

const API_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';

let token: string | null = localStorage.getItem('token');
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

export function getToken() {
  return token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text() as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  me: () => request<User>('/api/auth/me'),
  getLedger: () => request<LedgerData>('/api/ledger'),
  updateSettings: (currency: string) =>
    request<{ currency: string }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ currency }),
    }),
  createPO: (data: Omit<PO, 'id'>) => request<PO>('/api/pos', { method: 'POST', body: JSON.stringify(data) }),
  updatePO: (id: string, data: Partial<PO>) =>
    request<PO>(`/api/pos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePO: (id: string) => request<void>(`/api/pos/${id}`, { method: 'DELETE' }),
  createInvoice: (data: Record<string, unknown>) =>
    request<Invoice>('/api/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id: string, data: Record<string, unknown>) =>
    request<Invoice>(`/api/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInvoice: (id: string) => request<void>(`/api/invoices/${id}`, { method: 'DELETE' }),
  addPayment: (invoiceId: string, data: { date: string; amount: number }) =>
    request<Invoice>(`/api/invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  removePayment: (invoiceId: string, paymentId: string) =>
    request<Invoice>(`/api/invoices/${invoiceId}/payments/${paymentId}`, {
      method: 'DELETE',
    }),
  createExpense: (data: Record<string, unknown>) =>
    request<Expense>('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id: string, data: Record<string, unknown>) =>
    request<Expense>(`/api/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExpense: (id: string) => request<void>(`/api/expenses/${id}`, { method: 'DELETE' }),
  createRecurring: (data: Record<string, unknown>) =>
    request<Recurring>('/api/recurring', { method: 'POST', body: JSON.stringify(data) }),
  deleteRecurring: (id: string) => request<void>(`/api/recurring/${id}`, { method: 'DELETE' }),
  getUsers: () => request<User[]>('/api/users'),
  createUser: (data: Record<string, unknown>) =>
    request<User>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Record<string, unknown>) =>
    request<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getLogs: (params: Record<string, string | number>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v != null) q.set(k, String(v));
    });
    return request<AuditLogList>(`/api/logs?${q}`);
  },
  importCsv: async (kind: 'pos' | 'invoices' | 'expenses', file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ created: number; errors: string[] }>(`/api/import/${kind}`, {
      method: 'POST',
      body: form,
    });
  },
  backup: async () => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/backup.json`, { headers });
    if (!res.ok) throw new Error('Backup failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'counting-house-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  },
  restore: (payload: Record<string, unknown>) =>
    request<{ ok: boolean }>('/api/restore', { method: 'POST', body: JSON.stringify(payload) }),
};
