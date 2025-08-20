import { Toaster } from '@/components/ui/toaster';
import { DashboardNav } from '@/components/dashboard/nav';
import { AIChat } from '@/components/ai/AIChat';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-black">
      <DashboardNav />
      <main className="flex-1 overflow-y-auto bg-black">
        {children}
      </main>
      <Toaster />
      <AIChat />
    </div>
  );
}
