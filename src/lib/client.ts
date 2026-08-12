// Client-side fetch helper. Safe for browser use (no node imports).

export class ApiError extends Error {
  status: number;
  upgrade: boolean;
  constructor(message: string, status: number, upgrade = false) {
    super(message);
    this.status = status;
    this.upgrade = upgrade;
  }
}

export async function api<T>(
  path: string,
  options?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = options ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'content-type': 'application/json', ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; upgrade?: boolean };
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.upgrade === true);
  return data;
}

export function formatDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  if (tz) {
    options.timeZone = tz;
    options.timeZoneName = 'short';
  }
  return new Date(iso).toLocaleString(undefined, options);
}

export function formatDay(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };
  if (tz) options.timeZone = tz;
  return new Date(iso).toLocaleDateString(undefined, options);
}

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function statusBadge(status: string): string {
  switch (status) {
    case 'scheduled':
    case 'pending':
      return 'bg-indigo-950 text-indigo-300 border-indigo-800';
    case 'published':
      return 'bg-emerald-950 text-emerald-300 border-emerald-800';
    case 'failed':
      return 'bg-red-950 text-red-300 border-red-800';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}
