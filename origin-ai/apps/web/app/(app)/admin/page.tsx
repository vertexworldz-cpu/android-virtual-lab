"use client";

import { useState } from "react";
import { Badge, Card, LoadState, Notice, Page, PageHeader, Select } from "@/components/ui";
import { api, formatBytes, formatDate, type AuditEntry, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";

type Overview = { users: number; conversations: number; messages: number; files: number; storage_bytes: number; active_sessions: number };

export default function AdminPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const overview = useApi<Overview>(isAdmin ? "/admin/overview" : null);
  const users = useApi<User[]>(isAdmin ? "/admin/users" : null);
  const audit = useApi<AuditEntry[]>(isAdmin ? "/admin/audit?limit=50" : null);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return <Page><PageHeader title="Admin" /><Notice tone="warn">Administrator access is required to view this page.</Notice></Page>;
  }

  const update = async (id: string, body: Record<string, unknown>) => {
    setError(null);
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", body });
    } catch (e) {
      setError((e as Error).message);
    }
    users.reload();
    audit.reload();
  };

  const names = new Map(users.data?.map((u) => [u.id, u.display_name]));
  const o = overview.data;
  return (
    <Page width="max-w-5xl">
      <PageHeader title="Admin" description="Accounts, roles and the audit trail for this installation." />
      {o && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[["Users", o.users], ["Conversations", o.conversations], ["Messages", o.messages], ["Files", o.files], ["Storage", formatBytes(o.storage_bytes)]].map(([label, value]) => (
            <Card key={label} className="p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight">{value}</p></Card>
          ))}
        </div>
      )}
      {error && <div className="mb-4"><Notice>{error}</Notice></div>}

      <h2 className="mb-3 text-[15px] font-semibold">Users</h2>
      <LoadState loading={users.loading && !users.data} error={users.error}>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr><th className="px-4 py-2.5 font-medium">User</th><th className="px-4 py-2.5 font-medium">Role</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium">Joined</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.data?.map((u) => {
                const locked = u.id === me?.id || (u.role === "owner" && me?.role !== "owner");
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5"><p className="font-medium">{u.display_name}{u.id === me?.id && <span className="ml-2 text-xs font-normal text-muted">you</span>}</p><p className="text-xs text-muted">{u.email}</p></td>
                    <td className="px-4 py-2.5">
                      <Select aria-label={`Role for ${u.display_name}`} value={u.role} disabled={locked} className="h-8 w-28 text-[13px]" onChange={(e) => update(u.id, { role: e.target.value })}>
                        {me?.role === "owner" && <option value="owner">Owner</option>}
                        {me?.role !== "owner" && u.role === "owner" && <option value="owner">Owner</option>}
                        <option value="admin">Admin</option><option value="user">User</option>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={u.is_active} disabled={locked} className="size-4 accent-[var(--brand)]" onChange={(e) => update(u.id, { is_active: e.target.checked })} />
                        {u.is_active ? "Active" : "Disabled"}
                      </label>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted">{formatDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </LoadState>

      <h2 className="mb-3 mt-10 text-[15px] font-semibold">Audit log</h2>
      <LoadState loading={audit.loading && !audit.data} error={audit.error}>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="bg-surface text-xs text-muted">
              <tr><th className="px-4 py-2.5 font-medium">Time</th><th className="px-4 py-2.5 font-medium">Action</th><th className="px-4 py-2.5 font-medium">By</th><th className="px-4 py-2.5 font-medium">IP</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {audit.data?.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2"><Badge tone={a.action.includes("failed") ? "danger" : "neutral"}>{a.action}</Badge></td>
                  <td className="px-4 py-2">{a.user_id ? names.get(a.user_id) ?? a.user_id.slice(0, 8) : <span className="text-muted">anonymous</span>}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LoadState>
    </Page>
  );
}
