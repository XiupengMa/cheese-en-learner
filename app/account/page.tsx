"use client";

import { useState } from "react";
import Link from "next/link";
import { Field } from "@/components/Field";
import { authClient } from "@/lib/auth-client";
import { submitOnModEnter } from "@/lib/keySubmit";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Notice({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-xl px-4 py-3 text-sm ${
        kind === "error"
          ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
      }`}
    >
      {children}
    </p>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setDone(false);
    if (newPassword !== confirmPassword) {
      setError("The new passwords don't match. Please retype them.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: revokeOthers,
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not change the password.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setDone(true);
  }

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Field
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Field
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-500">
          <input
            type="checkbox"
            checked={revokeOthers}
            onChange={(e) => setRevokeOthers(e.target.checked)}
            className="accent-amber-500"
          />
          Sign out my other devices
        </label>

        {error && <Notice kind="error">{error}</Notice>}
        {done && <Notice kind="ok">Password changed.</Notice>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-40"
        >
          {pending ? "Changing…" : "Change password"}
        </button>
      </form>
    </Card>
  );
}

function PasskeysCard() {
  const { data: passkeys, isPending } = authClient.useListPasskeys();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id of the passkey being renamed, and the draft name
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  async function add() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await authClient.passkey.addPasskey({
      name: newName.trim() || undefined,
    });
    setBusy(false);
    if (result?.error) {
      setError(result.error.message ?? "Could not add a passkey on this device.");
      return;
    }
    setNewName("");
  }

  async function rename(id: string) {
    const name = draftName.trim();
    setRenamingId(null);
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    const result = await authClient.passkey.updatePasskey({ id, name });
    setBusy(false);
    if (result?.error) {
      setError(result.error.message ?? "Could not rename the passkey.");
    }
  }

  async function remove(id: string, name: string) {
    if (busy) return;
    if (!window.confirm(`Delete passkey “${name}”? You won't be able to sign in with it anymore.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authClient.passkey.deletePasskey({ id });
    setBusy(false);
    if (result?.error) {
      setError(result.error.message ?? "Could not delete the passkey.");
    }
  }

  return (
    <Card title="Passkeys">
      <p className="mb-4 text-sm text-neutral-500">
        Sign in with Face ID, Touch ID, or a security key instead of your
        password. A passkey works on the device (or password manager) where you
        create it.
      </p>

      {error && (
        <div className="mb-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {isPending && (
        <div className="mb-3 animate-pulse space-y-2">
          <div className="h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800/60" />
        </div>
      )}

      {!isPending && (passkeys?.length ?? 0) === 0 && (
        <p className="mb-3 rounded-xl bg-neutral-100/70 px-4 py-3 text-sm text-neutral-400 dark:bg-neutral-800/40">
          No passkeys yet.
        </p>
      )}

      {(passkeys?.length ?? 0) > 0 && (
        <ul className="mb-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {passkeys!.map((pk) => {
            const label = pk.name || "Unnamed passkey";
            return (
              <li key={pk.id} className="flex items-center gap-2 py-2.5">
                <span aria-hidden>🔑</span>
                {renamingId === pk.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename(pk.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={submitOnModEnter}
                      maxLength={100}
                      autoFocus
                      className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-base outline-none focus:border-amber-400 sm:text-sm dark:border-neutral-600 dark:bg-neutral-950"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="text-xs text-neutral-400 hover:text-neutral-600"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{label}</span>
                      <span className="block text-xs text-neutral-400">
                        Added {pk.createdAt ? new Date(pk.createdAt).toLocaleDateString() : "—"}
                        {pk.backedUp ? " · synced" : " · this device only"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName(pk.name ?? "");
                        setRenamingId(pk.id);
                      }}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(pk.id, label)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-neutral-800"
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={submitOnModEnter}
          placeholder="Name (optional), e.g. MacBook Touch ID"
          maxLength={100}
          className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-base outline-none placeholder:text-neutral-400 focus:border-amber-400 sm:text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-40"
        >
          {busy ? "…" : "Add passkey"}
        </button>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const { data: session } = authClient.useSession();

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex min-h-14 w-full max-w-3xl items-center gap-4 px-4">
          <Link
            href="/"
            className="text-sm text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline dark:hover:text-neutral-200"
          >
            ← Back
          </Link>
          <h1 className="text-base font-bold tracking-tight">Account</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:space-y-6 sm:py-6">
        {session && (
          <div className="px-1">
            <p className="font-medium">{session.user.name}</p>
            <p className="text-sm text-neutral-500">{session.user.email}</p>
          </div>
        )}

        <PasskeysCard />
        <PasswordCard />
      </main>
    </div>
  );
}
