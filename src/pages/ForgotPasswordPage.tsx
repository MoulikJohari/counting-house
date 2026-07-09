import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand" style={{ marginBottom: 24 }}>
          <div className="mark">₹</div>
          <div>
            <h1>Counting House</h1>
            <div className="sub">Reset your password</div>
          </div>
        </div>

        {sent ? (
          <>
            <p style={{ marginBottom: 16 }}>
              If an account exists for <strong>{email}</strong>, we've sent a link to reset your password. Check
              your inbox (and spam folder).
            </p>
            <Link className="btn" to="/login" style={{ width: '100%', justifyContent: 'center' }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button className="btn" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link to="/login">Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
