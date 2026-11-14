"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, cx, Field, Input, Notice, Page, PageHeader } from "@/components/ui";
import { api, type ModuleStatus, type Theme, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";

const THEMES: { id: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export default function SettingsPage() {
  const { user, setUser, setTheme } = useAuth();
  const system = useApi<{ version: string; modules: ModuleStatus[] }>("/system/status");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const theme = user?.preferences.theme ?? "light";

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setUser(await api<User>("/auth/me", { method: "PATCH", body: { display_name: new FormData(e.currentTarget).get("display_name") } }));
      setProfileMsg({ ok: true, text: "Saved." });
    } catch (err) {
      setProfileMsg({ ok: false, text: (err as Error).message });
    }
  };

  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await api("/auth/password", { body: { current_password: f.get("current"), new_password: f.get("next") } });
      form.reset();
      setPasswordMsg({ ok: true, text: "Password changed. Other devices were signed out." });
    } catch (err) {
      setPasswordMsg({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <Page width="max-w-2xl">
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Card className="p-6">
          <h2 className="mb-4 text-[15px] font-semibold">Appearance</h2>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => setTheme(id)}
                className={cx("flex h-11 items-center justify-center gap-2 rounded-lg border text-sm transition-colors",
                  theme === id ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong text-fg-2 hover:bg-surface")}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-[15px] font-semibold">Profile</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Name"><Input name="display_name" defaultValue={user?.display_name} required maxLength={120} /></Field>
            <Field label="Email"><Input value={user?.email ?? ""} disabled readOnly /></Field>
            {profileMsg && <Notice tone={profileMsg.ok ? "brand" : "danger"}>{profileMsg.text}</Notice>}
            <Button type="submit" variant="primary">Save</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-[15px] font-semibold">Password</h2>
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password"><Input name="current" type="password" required autoComplete="current-password" /></Field>
            <Field label="New password" hint="At least 10 characters."><Input name="next" type="password" required minLength={10} autoComplete="new-password" /></Field>
            {passwordMsg && <Notice tone={passwordMsg.ok ? "brand" : "danger"}>{passwordMsg.text}</Notice>}
            <Button type="submit">Change password</Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Platform status</h2>
            {system.data && <span className="text-xs text-muted">Origin AI {system.data.version}</span>}
          </div>
          {system.error && <Notice>{system.error}</Notice>}
          <ul className="divide-y divide-line">
            {system.data?.modules.map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{m.name}</p>
                  {m.note && <p className="mt-0.5 text-xs leading-relaxed text-muted">{m.note}</p>}
                </div>
                <Badge tone={m.status === "available" ? "brand" : m.status === "partial" ? "warn" : "neutral"}>
                  {m.status === "available" ? "Available" : m.status === "partial" ? "Partial" : `Planned · phase ${m.phase}`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
