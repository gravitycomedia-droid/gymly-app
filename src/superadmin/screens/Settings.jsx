// src/superadmin/screens/Settings.jsx
// Super Admin contact details + the account card. Save stays disabled until a
// value actually differs from what's stored (README §7.5).

import { useCallback, useMemo, useState } from 'react';
import { LogOut, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAsync from '../hooks/useAsync';
import { fetchSuperAdminProfile, saveContactDetails } from '../lib/api';
import { toTenDigits } from '../lib/format';
import { logout } from '../../firebase/auth';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../SuperAdminLayout';
import Button from '../components/Button';
import { Card } from '../components/Card';
import { PhoneInput, TextInput } from '../components/Inputs';
import { ErrorState, Skeleton } from '../components/States';
import { useConfirm } from '../components/Overlays';
import { useSaToast } from '../components/Toast';

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Settings() {
  const profileQ = useAsync(fetchSuperAdminProfile, []);

  return (
    <div className="flex max-w-[720px] flex-col gap-4 md:gap-6">
      <PageHeader title="Settings" subtitle="Your Super Admin contact details and account." />

      {profileQ.loading ? (
        <Card className="p-4 md:p-5" aria-busy="true">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-11 w-full max-w-[360px]" />
          <Skeleton className="mt-4 h-11 w-full max-w-[360px]" />
        </Card>
      ) : profileQ.error ? (
        <Card>
          <ErrorState
            title="Couldn’t load your details"
            body="Something went wrong while fetching your contact details. Check your connection and try again."
            onRetry={profileQ.refetch}
          />
        </Card>
      ) : (
        <ContactCard
          key={profileQ.data?.updatedAt?.getTime() || 'initial'}
          saved={profileQ.data}
          onSaved={profileQ.setData}
        />
      )}

      <AccountCard />
    </div>
  );
}

function ContactCard({ saved, onSaved }) {
  const { showToast } = useSaToast();
  const [phone, setPhone] = useState(() => toTenDigits(saved?.phone));
  const [email, setEmail] = useState(() => saved?.email || '');
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const savedPhone = toTenDigits(saved?.phone);
  const savedEmail = saved?.email || '';
  const dirty = phone !== savedPhone || email !== savedEmail;

  const errors = useMemo(() => {
    const e = {};
    if (!phone) e.phone = 'Phone number is required';
    else if (!PHONE_RE.test(phone)) e.phone = 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9';
    if (!email.trim()) e.email = 'Email address is required';
    else if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address, like name@example.com';
    return e;
  }, [phone, email]);

  const show = (field) => ((submitted || touched[field]) ? errors[field] : undefined);

  const discard = useCallback(() => {
    setPhone(savedPhone);
    setEmail(savedEmail);
    setTouched({});
    setSubmitted(false);
    setSaveError(false);
  }, [savedPhone, savedEmail]);

  const submit = async (e) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setSaveError(false);
    try {
      await saveContactDetails({ phone, email: email.trim() });
      onSaved({ phone, email: email.trim(), updatedAt: new Date() });
      setTouched({});
      setSubmitted(false);
      showToast('Contact details saved');
    } catch (err) {
      // The typed values are deliberately kept so nothing is retyped.
      setSaveError(true);
      showToast(err?.message || 'Couldn’t save your changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="form" onSubmit={submit} className="overflow-hidden">
      <div className="flex flex-col gap-[18px] p-4 md:p-5">
        <div>
          <h2 className="text-base font-semibold leading-6">Contact details</h2>
          <p className="mt-1 text-[13px] text-sa-ink-3">
            Used for platform alerts and shown to gym owners on support screens.
          </p>
        </div>

        {saveError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-sa-danger-soft px-3.5 py-3 text-[13px] font-medium text-sa-danger">
            <TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
            Couldn’t save your changes. Check your connection and try again.
          </div>
        )}

        <PhoneInput
          label="Phone"
          required
          value={phone}
          onChange={setPhone}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          error={show('phone')}
        />

        <TextInput
          label="Email"
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={show('email')}
          placeholder="name@example.com"
          wrapClassName="max-w-[360px]"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sa-line bg-sa-subtle px-4 py-3 md:px-5">
        <p className="text-[13px] text-sa-ink-3">
          {dirty ? 'You have unsaved changes' : 'No changes to save'}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" onClick={discard} disabled={saving}>Discard</Button>
          )}
          <Button type="submit" variant="primary" disabled={!dirty} loading={saving} loadingLabel="Saving…">
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AccountCard() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { showToast } = useSaToast();

  const handleLogout = async () => {
    const ok = await confirm({
      icon: LogOut,
      destructive: true,
      title: 'Log out of Super Admin?',
      body: 'You’ll need to sign in again to manage gyms, broadcasts and plans.',
      confirmLabel: 'Log out',
    });
    if (!ok) return;
    try {
      await logout();
      navigate('/select-role', { replace: true });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Logout error:', err);
      showToast('Couldn’t log out. Please try again.', 'error');
    }
  };

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-6">Account</h2>
        <p className="mt-1 truncate text-[13px] text-sa-ink-3">
          Signed in as Super Admin on this device
          {user?.email || user?.phoneNumber ? ` · ${user.email || user.phoneNumber}` : ''}.
        </p>
      </div>
      <Button variant="danger" onClick={handleLogout}>
        <LogOut aria-hidden="true" size={16} />
        Log out
      </Button>
    </Card>
  );
}
