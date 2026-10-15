import assert from "node:assert/strict";
import test from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

test("speed preferences survive a new session and remain separate per mode and account", async () => {
  const { auth } = await import("../lib/auth");
  const store = { user: [], session: [], account: [], verification: [] };
  const makeAuth = () => betterAuth({
    ...auth.options,
    database: memoryAdapter(store),
    secret: "speed-preference-test-secret-32-characters",
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    plugins: [],
    hooks: {},
    rateLimit: { enabled: false },
  });
  const app = makeAuth();
  const password = "test-password-123";
  async function signUp(email: string) {
    const result = await app.api.signUpEmail({
      body: { email, name: "Test User", password },
      returnHeaders: true,
    });
    const cookie = result.headers.get("set-cookie")?.match(/better-auth\.session_token=[^;]+/)?.[0];
    assert.ok(cookie);
    return new Headers({ cookie });
  }
  const alice = await signUp("alice@example.com");
  const bob = await signUp("bob@example.com");
  const initial = await app.api.getSession({ headers: alice });
  assert.equal(initial?.user.dictionarySpeed, "standard");
  assert.equal(initial?.user.teacherSpeed, "standard");

  await app.api.updateUser({ headers: alice, body: { dictionarySpeed: "fast" } });
  await app.api.updateUser({ headers: bob, body: { teacherSpeed: "fast" } });

  // A new auth instance and sign-in read stored user preferences, not local UI state.
  const fresh = makeAuth();
  for (const [email, dictionary, teacher] of [
    ["alice@example.com", "fast", "standard"],
    ["bob@example.com", "standard", "fast"],
  ]) {
    const login = await fresh.api.signInEmail({ body: { email, password }, returnHeaders: true });
    const cookie = login.headers.get("set-cookie")?.match(/better-auth\.session_token=[^;]+/)?.[0];
    assert.ok(cookie);
    const session = await fresh.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session?.user.dictionarySpeed, dictionary);
    assert.equal(session?.user.teacherSpeed, teacher);
  }

  await assert.rejects(app.api.updateUser({ headers: alice, body: { dictionarySpeed: "ultrafast" } }));
  await assert.rejects(app.api.updateUser({ headers: alice, body: { teacherSpeed: true as unknown as string } }));
  await assert.rejects(app.api.updateUser({ body: { dictionarySpeed: "fast" } }));
  await app.api.updateUser({ headers: alice, body: { dictionarySpeed: "standard" } });
  assert.equal((await app.api.getSession({ headers: alice }))?.user.dictionarySpeed, "standard");
});
