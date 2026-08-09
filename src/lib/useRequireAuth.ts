'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicUser } from './types';

export function useRequireAuth(): { user: PublicUser | null; loading: boolean } {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        const data = (await res.json()) as { user: PublicUser };
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { user, loading };
}
