"use client";

import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Sidebar } from "@/components/sidebar";
import { IconButton, Spinner } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";

function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    try {
      // Restore the saved sidebar preference after hydration.
      if (localStorage.getItem("origin-sidebar") === "collapsed") queueMicrotask(() => setCollapsed(true));
    } catch {}
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("origin-sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });

  if (loading || !user) {
    return <div className="flex h-dvh items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={toggle} onNavigate={() => {}} />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/25" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[264px] shadow-pop">
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 md:hidden">
          <IconButton label="Open menu" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></IconButton>
          <Logo size={20} />
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
