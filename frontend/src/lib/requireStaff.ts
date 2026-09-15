'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Hard gate for back-office pages: renders nothing until a staff token is
// confirmed. Without login the user is bounced to /login before ever seeing
// the form (the API separately rejects unauthenticated calls with 401).
export function useRequireStaff(next: string): boolean {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('staff_token')) {
      router.replace(`/login?next=${next}`);
    } else {
      setOk(true);
    }
  }, [router, next]);
  return ok;
}
