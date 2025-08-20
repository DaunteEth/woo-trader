'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Signal, 
  Settings, 
  TrendingUp,
  History,
  LogOut,
  FlaskConical,
  Cog
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Simulations', href: '/dashboard/simulations', icon: FlaskConical },
  { name: 'Signals', href: '/dashboard/signals', icon: Signal },
  { name: 'Positions', href: '/dashboard/positions', icon: TrendingUp },
  { name: 'History', href: '/dashboard/history', icon: History },
  { name: 'Strategies', href: '/dashboard/strategies', icon: Settings },
  { name: 'Settings', href: '/dashboard/settings', icon: Cog },
];

export function DashboardNav() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <nav className="w-64 bg-gray-900 border-r border-green-900/20">
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-green-900/20">
          <h1 className="text-2xl font-bold text-green-500">
            WOO Trading
          </h1>
          <p className="text-xs text-gray-400 mt-1">Powered by WooX Exchange</p>
        </div>
        
        <div className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                'text-gray-300 hover:bg-gray-800 hover:text-white',
                'group'
              )}
            >
              <item.icon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-green-500" />
              {item.name}
            </Link>
          ))}
        </div>
        
        <div className="p-4 border-t border-green-900/20">
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-300 hover:bg-gray-800 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-5 w-5" />
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
