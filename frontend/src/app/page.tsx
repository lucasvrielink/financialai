'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function RootPage() {
  const authState = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authState.status === 'authenticated') {
      router.replace('/transactions');
    } else if (authState.status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [authState.status, router]);

  return (
    <div className="spinner-page">
      <span className="spinner" />
    </div>
  );
}
