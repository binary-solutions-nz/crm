import { useState, type FormEvent } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/Field';
import { PageHeader } from '../components/ui';

export default function Account() {
  return (
    <div>
      <PageHeader title="My account" subtitle="Update your own sign-in email and password" />
      <div className="panel-grid">
        <ChangeEmailPanel />
        <ChangePasswordPanel />
      </div>
    </div>
  );
}

function ChangeEmailPanel() {
  const { user } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, newEmail.trim());
      setSent(true);
      setNewEmail('');
      setCurrentPassword('');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Email address</h2>
      </div>
      <form onSubmit={submit} className="entity-form panel-body">
        <Field label="Current email">
          <input value={user?.email ?? ''} disabled />
        </Field>
        <Field label="New email" required>
          <input
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Current password" required hint="Required to confirm this change">
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </Field>

        {error && <p className="login-error">{error}</p>}
        {sent && (
          <p className="form-success">
            A verification link was sent to the new address. The email only changes once you
            click it.
          </p>
        )}

        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Update email'}
          </button>
        </div>
      </form>
    </section>
  );
}

function ChangePasswordPanel() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    setError(null);
    setDone(false);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Password</h2>
      </div>
      <form onSubmit={submit} className="entity-form panel-body">
        <Field label="Current password" required>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="New password" required hint="At least 8 characters">
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        <Field label="Confirm new password" required>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        {error && <p className="login-error">{error}</p>}
        {done && <p className="form-success">Password updated.</p>}

        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Current password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/email-already-in-use':
      return 'That email address is already in use by another account.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/requires-recent-login':
      return 'Please sign out and back in, then try again.';
    case 'auth/weak-password':
      return 'Please choose a stronger password (at least 8 characters).';
    default:
      return 'Something went wrong. Please try again.';
  }
}
