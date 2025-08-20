import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useAuth(requireAuth: boolean = true) {
  const router = useRouter();
  
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (requireAuth && !data.authenticated) {
          router.push('/login');
        } else if (!requireAuth && data.authenticated) {
          router.push('/dashboard');
        }
      } catch {
        if (requireAuth) {
          router.push('/login');
        }
      }
    };
    
    checkAuth();
  }, [requireAuth, router]);
}
