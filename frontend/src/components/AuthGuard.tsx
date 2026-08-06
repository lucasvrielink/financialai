'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function AuthGuard({ children }: { children: ReactNode }) {
  const authState = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authState.status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [authState.status, router]);

  if (authState.status === 'loading') {
    return (
      <div className="spinner-page">
        <span className="spinner" />
      </div>
    );
  }

  if (authState.status === 'unauthenticated') {
    return null;
  }

  return <>{children}</>;
}
