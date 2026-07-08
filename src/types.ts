export type UserRole = 'superadmin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
}

export interface PO {
  id: string;
  company: string;
  ref: string | null;
  date: string;
  amount: number;
  gst_rate: number;
  notes: string | null;
}

export interface Invoice {
  id: string;
  company: string;
  ref: string | null;
  date: string;
  due_date: string | null;
  po_id: string | null;
  amount: number;
  gst_rate: number;
  tds_rate: number;
  notes: string | null;
  payments: Payment[];
}

export interface Expense {
  id: string;
  category: string;
  date: string;
  amount: number;
  vendor: string | null;
  notes: string | null;
  recurring_id: string | null;
  rkey: string | null;
}

export interface Recurring {
  id: string;
  label: string;
  category: string;
  amount: number;
  day: number;
  start: string;
  active: boolean;
}

export interface LedgerData {
  currency: string;
  pos: PO[];
  invoices: Invoice[];
  expenses: Expense[];
  recurring: Recurring[];
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogList {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export type Period = 'fy' | 'month' | 'all';

export interface LedgerState {
  currency: string;
  period: Period;
  pos: PO[];
  invoices: Invoice[];
  expenses: Expense[];
  recurring: Recurring[];
}
