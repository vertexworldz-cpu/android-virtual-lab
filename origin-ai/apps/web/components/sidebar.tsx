"use client";

import {
  Bot, Boxes, Brain, Code2, Cpu, FolderClosed, FolderKanban, History, LogOut, PanelLeft, Search,
  Settings, ShieldCheck, Sparkles, SquarePen,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CONVERSATIONS_CHANGED, type Conversation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, useWindowEvent } from "@/lib/hooks";
import { Logo, LogoMark } from "./logo";
import { cx, IconButton } from "./ui";

const NAV = [
  { href: "/history", label: "Chat History", icon: History },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/code", label: "Code", icon: Code2 },
  { href: "/create", label: "Create", icon: Sparkles },
  { href: "/research", label: "Research", icon: Search },
  { href: "/files", label: "Files", icon: FolderClosed },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/compute", label: "GPU & Compute", icon: Cpu },
  { href: "/models", label: "Models", icon: Boxes },
];

function NavLink({ href, label, icon: Icon, collapsed, active, onNavigate }: {
  href: string; label: string; icon: React.ComponentType<{ className?: string }>; collapsed: boolean; active: boolean; onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors",
        active ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cx("size-[17px] shrink-0", active ? "text-brand" : "text-muted")} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle: () => void; onNavigate: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const recent = useApi<Conversation[]>("/conversations?limit=12");
  useWindowEvent(CONVERSATIONS_CHANGED, recent.reload);
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  return (
    <aside className={cx("flex h-full flex-col border-r border-line bg-surface transition-[width] duration-200", collapsed ? "w-[60px]" : "w-[264px]")}>
      <div className={cx("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "justify-between pl-4 pr-2.5")}>
        {!collapsed && (
          <Link href="/" onClick={onNavigate} aria-label="Origin AI home"><Logo size={22} /></Link>
        )}
        <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggle}>
          {collapsed ? <LogoMark size={22} /> : <PanelLeft className="size-[17px]" />}
        </IconButton>
      </div>

      <div className="px-2.5 pb-2">
        <Link
          href="/"
          onClick={onNavigate}
          title={collapsed ? "New Chat" : undefined}
          className={cx(
            "flex h-9 items-center gap-3 rounded-lg border border-line-strong bg-bg px-2.5 text-[13.5px] font-medium shadow-soft transition-colors hover:border-brand/40",
            collapsed && "justify-center px-0",
          )}
        >
          <SquarePen className="size-[17px] shrink-0 text-brand" />
          {!collapsed && "New Chat"}
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3" aria-label="Main">
        <div className="space-y-0.5">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} collapsed={collapsed} active={pathname.startsWith(item.href)} onNavigate={onNavigate} />
          ))}
        </div>
        {!collapsed && recent.data && recent.data.length > 0 && (
          <div className="mt-6">
            <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted">Recent</p>
            <div className="space-y-0.5">
              {recent.data.map((c) => (
                <Link
                  key={c.id}
                  href={`/chat/${c.id}`}
                  onClick={onNavigate}
                  className={cx(
                    "block truncate rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                    pathname === `/chat/${c.id}` ? "bg-surface-2 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {c.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="shrink-0 space-y-0.5 border-t border-line p-2.5">
        {isAdmin && <NavLink href="/admin" label="Admin" icon={ShieldCheck} collapsed={collapsed} active={pathname.startsWith("/admin")} onNavigate={onNavigate} />}
        <NavLink href="/settings" label="Settings" icon={Settings} collapsed={collapsed} active={pathname.startsWith("/settings")} onNavigate={onNavigate} />
        {!collapsed && user && (
          <div className="flex items-center gap-2.5 px-2.5 pt-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">{user.display_name}</p>
              <p className="truncate text-[11px] leading-tight text-muted">{user.email}</p>
            </div>
            <IconButton label="Sign out" onClick={async () => { await logout(); router.replace("/login"); }}>
              <LogOut className="size-4" />
            </IconButton>
          </div>
        )}
      </div>
    </aside>
  );
}
