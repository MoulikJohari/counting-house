import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLedgerContext } from '../ledger/LedgerContext';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isSuperadmin } = useAuth();
  const { currency, onCurrency } = useLedgerContext();
  const location = useLocation();
  const [currErr, setCurrErr] = useState('');

  const handleCurrency = async (c: string) => {
    try {
      await onCurrency(c);
      setCurrErr('');
    } catch (err) {
      setCurrErr(err instanceof Error ? err.message : 'Failed to update currency');
    }
  };

  return (
    <div className="wrap">
      <header className="mast">
        <div className="brand">
          <div className="mark">₹</div>
          <div>
            <h1>Counting House</h1>
            <div className="sub">PO · Invoices · Expenses</div>
          </div>
        </div>
        <div className="mast-tools">
          <nav className="nav-links">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
              Overview
            </Link>
            <Link to="/purchase-orders" className={location.pathname === '/purchase-orders' ? 'active' : ''}>
              Purchase Orders
            </Link>
            <Link to="/invoices" className={location.pathname === '/invoices' ? 'active' : ''}>
              Invoices
            </Link>
            <Link to="/expenses" className={location.pathname === '/expenses' ? 'active' : ''}>
              Expenses
            </Link>
            {isSuperadmin && (
              <Link to="/logs" className={location.pathname === '/logs' ? 'active' : ''}>
                Logs
              </Link>
            )}
            {isSuperadmin && (
              <Link to="/users" className={location.pathname === '/users' ? 'active' : ''}>
                Users
              </Link>
            )}
          </nav>
          <select className="ctl" value={currency} onChange={(e) => handleCurrency(e.target.value)}>
            <option value="₹">₹ INR</option>
            <option value="$">$ USD</option>
            <option value="€">€ EUR</option>
            <option value="£">£ GBP</option>
          </select>
          <div className="user-menu">
            <span>{user?.name}</span>
            <button className="btn ghost sm" type="button" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>
      {currErr && (
        <div className="login-error" style={{ margin: '8px 24px 0' }}>
          {currErr}
        </div>
      )}
      {children}
    </div>
  );
}
