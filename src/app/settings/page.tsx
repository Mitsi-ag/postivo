'use client';

import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { btnDanger, btnPrimary, cardCls, ErrorBanner, inputCls } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import { useRequireAuth } from '@/lib/useRequireAuth';
import type { ApiKeyDTO } from '@/lib/types';

interface CreatedKey {
  id: string;
  name: string;
  key_prefix: string;
  token: string;
}

export default function SettingsPage() {
  const { user } = useRequireAuth();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const [keys, setKeys] = useState<ApiKeyDTO[]>([]);
  const [keyName, setKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setTimezone(user.timezone);
    }
  }, [user]);

  function loadKeys() {
    api<{ keys: ApiKeyDTO[] }>('/api/settings/keys')
      .then((d) => setKeys(d.keys))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load keys'));
  }

  useEffect(loadKeys, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setError(null);
    try {
      await api('/api/settings/profile', { method: 'POST', json: { name, timezone } });
      setProfileMsg('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setError(null);
    try {
      await api('/api/settings/password', { method: 'POST', json: { current, next } });
      setPwMsg('Password updated.');
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    }
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const d = await api<{ key: CreatedKey }>('/api/settings/keys', {
        method: 'POST',
        json: { name: keyName },
      });
      setCreatedKey(d.key);
      setKeyName('');
      loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Key creation failed');
    }
  }

  async function revokeKey(id: string) {
    if (!window.confirm('Revoke this API key? Agents using it will lose access.')) return;
    try {
      await api(`/api/settings/keys/${id}`, { method: 'DELETE' });
      loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed');
    }
  }

  async function exportData() {
    const res = await fetch('/api/export');
    if (!res.ok) {
      setError(`Export failed (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `postivo-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Portal title="Settings">
      <div className="mx-auto max-w-2xl space-y-6">
        <ErrorBanner message={error} />

        <form onSubmit={saveProfile} className={`${cardCls} space-y-3`}>
          <h2 className="font-semibold text-white">Profile</h2>
          {profileMsg && <p className="text-xs text-emerald-400">{profileMsg}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Timezone</label>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputCls}
              placeholder="Australia/Sydney"
            />
          </div>
          <button type="submit" className={btnPrimary}>
            Save profile
          </button>
        </form>

        <form onSubmit={changePassword} className={`${cardCls} space-y-3`}>
          <h2 className="font-semibold text-white">Change password</h2>
          {pwMsg && <p className="text-xs text-emerald-400">{pwMsg}</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Current password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">New password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputCls}
            />
          </div>
          <button type="submit" className={btnPrimary}>
            Update password
          </button>
        </form>

        <div className={`${cardCls} space-y-3`}>
          <h2 className="font-semibold text-white">API keys</h2>
          <p className="text-xs text-slate-500">
            Use keys as <code className="rounded bg-slate-800 px-1">Authorization: Bearer pv_…</code> on the{' '}
            <code className="rounded bg-slate-800 px-1">/api/v1/*</code> endpoints.
          </p>

          {createdKey && (
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/50 p-3">
              <p className="mb-1 text-xs font-medium text-emerald-300">
                Key created — copy it now, it will not be shown again:
              </p>
              <code className="block break-all rounded bg-slate-900 px-2 py-1.5 text-xs text-emerald-200">
                {createdKey.token}
              </code>
              <button
                onClick={() => setCreatedKey(null)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Dismiss
              </button>
            </div>
          )}

          <form onSubmit={createKey} className="flex gap-2">
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className={inputCls}
              placeholder="Key name (e.g. content-agent)"
            />
            <button type="submit" className={`${btnPrimary} shrink-0`}>
              Create key
            </button>
          </form>

          {keys.length > 0 && (
            <ul className="divide-y divide-slate-800">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="text-slate-200">{k.name}</p>
                    <p className="text-xs text-slate-500">
                      <code>{k.key_prefix}…</code> · created {formatDate(k.created_at)}
                      {k.last_used_at ? ` · last used ${formatDate(k.last_used_at)}` : ' · never used'}
                    </p>
                  </div>
                  <button onClick={() => void revokeKey(k.id)} className={btnDanger}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cardCls}>
          <h2 className="mb-2 font-semibold text-white">Export data</h2>
          <p className="mb-3 text-xs text-slate-500">
            Download all of your data — profile, channels, posts, targets and API key metadata — as JSON.
          </p>
          <button onClick={() => void exportData()} className={btnPrimary}>
            Download export
          </button>
        </div>
      </div>
    </Portal>
  );
}
