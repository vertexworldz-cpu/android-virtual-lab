"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { applyTheme } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { Button, Field, Input, Notice, Spinner } from "./ui";

type Status = { has_users: boolean; registration_open: boolean };

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const status = useApi<Status>("/auth/status");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRun = status.data ? !status.data.has_users : false;

  useEffect(() => {
    // A fresh install has no accounts: send sign-in straight to owner setup.
    if (mode === "login" && firstRun) router.replace("/register");
  }, [mode, firstRun, router]);

  if (status.loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (status.error) return <Notice>{status.error}</Notice>;

  const closed = mode === "register" && !status.data!.registration_open;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const user = await api<User>(`/auth/${mode}`, {
        body: mode === "login"
          ? { email: f.get("email"), password: f.get("password") }
          : { email: f.get("email"), password: f.get("password"), display_name: f.get("display_name") },
      });
      if (user.preferences.theme) applyTheme(user.preferences.theme);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-center text-xl font-semibold tracking-tight">
        {mode === "login" ? "Welcome back" : firstRun ? "Set up Origin" : "Create your account"}
      </h1>
      <p className="mb-7 mt-2 text-center text-sm leading-relaxed text-muted">
        {mode === "login" ? "Sign in to continue." : firstRun ? "Create the owner account for this installation." : "Join this Origin installation."}
      </p>
      {closed ? (
        <Notice tone="warn">Registration is closed on this installation. Ask the owner for an account.</Notice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "register" && (
            <Field label="Name"><Input name="display_name" required maxLength={120} autoComplete="name" autoFocus /></Field>
          )}
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" autoFocus={mode === "login"} /></Field>
          <Field label="Password" hint={mode === "register" ? "At least 10 characters." : undefined}>
            <Input name="password" type="password" required minLength={mode === "register" ? 10 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>
          {error && <Notice>{error}</Notice>}
          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {mode === "login" ? "Sign in" : firstRun ? "Create owner account" : "Create account"}
          </Button>
        </form>
      )}
      {!firstRun && (
        <p className="mt-6 text-center text-[13px] text-muted">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <Link href={mode === "login" ? "/register" : "/login"} className="font-medium text-brand hover:underline">
            {mode === "login" ? "Create one" : "Sign in"}
          </Link>
        </p>
      )}
    </div>
  );
}
