<p align="center">
  <img src="docs/hero.svg" alt="🧀 Cheese · English Learner — an AI-powered English dictionary &amp; reading teacher for Chinese speakers" width="100%">
</p>

A personal, AI-powered English learning app for native Chinese speakers. Two modes:

- **📖 Dictionary** — type or paste a word/phrase and get an English explanation
  (with etymology and US/UK cultural background when interesting), US pronunciation
  (IPA + click-to-play audio), the Chinese translation, and real-world example
  sentences. A follow-up box lets you keep asking about the word.
- **🎓 Teacher** — paste a sentence or paragraphs and get a full Chinese
  translation, then dig deeper with the follow-up box below.
- **Select anywhere** — select text anywhere on the page (the original text,
  the dictionary entry, a translation, an answer…) and it snaps outward to
  whole words, each word getting a rounded highlight. A popup offers
  **✨ Explain this** and a free-form question box (answered in the active
  mode's follow-up thread), plus **📖 Open in Dictionary** to look the
  selected words up directly. The highlight stays visible while the popup is
  open and while the answer streams; Esc or a click away deselects.

Both modes are powered by your choice of Claude or GPT models (selector in the
header; the choice is remembered in `localStorage`). All LLM calls happen on the
backend — API keys never reach the browser.

A **Debug** toggle in the header reveals the raw request/response exchanged
between this server and the LLM provider (exact payload, usage, latency) under
each result.

The app is behind a login: sign-up requires an invite code
(`SIGNUP_INVITE_CODE`), so only people you invite can create an account.

## Tech

- Next.js (App Router) + TypeScript + Tailwind CSS
- `@anthropic-ai/sdk` and `openai` on the server, streaming responses
- [Better Auth](https://www.better-auth.com/) accounts (email + password,
  invite-only sign-up) stored in Postgres via [Drizzle](https://orm.drizzle.team/)
- Pronunciation audio from the [Free Dictionary API](https://dictionaryapi.dev/)
  (US recording preferred); example sentences read aloud with OpenAI TTS
  (`gpt-4o-mini-tts`, needs `OPENAI_API_KEY`), with browser speech synthesis
  as the final fallback

## Local development

You need a Postgres database. The easiest way is Docker:

```bash
docker run -d --name cheese-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=cheese -e POSTGRES_DB=cheese postgres:17-alpine
```

Then:

```bash
cp .env.example .env.local   # then fill in the values (see below)
npm install
npm run db:push              # create/update the database tables
npm run dev
```

Open http://localhost:3000, create your account with the invite code you set,
and sign in.

## Environment variables

| Variable             | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Required to use Claude models                                  |
| `OPENAI_API_KEY`     | Required to use GPT models                                     |
| `DATABASE_URL`       | Postgres connection string (accounts, sessions; history later) |
| `BETTER_AUTH_SECRET` | Session signing secret (`openssl rand -base64 32`)             |
| `SIGNUP_INVITE_CODE` | Code required to create an account                             |

You only need the LLM key(s) for the provider(s) you use. For the Docker
setup above, `DATABASE_URL` is
`postgresql://postgres:cheese@localhost:5432/cheese`.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel (framework preset: Next.js —
   auto-detected, no config needed).
2. Create a Postgres database (e.g. Neon via the Vercel Marketplace) and use
   its **pooled** connection string as `DATABASE_URL`.
3. In **Project Settings → Environment Variables**, add `ANTHROPIC_API_KEY`
   and/or `OPENAI_API_KEY`, plus `DATABASE_URL`, `BETTER_AUTH_SECRET`, and
   `SIGNUP_INVITE_CODE`.
4. Run `npm run db:push` once against the production `DATABASE_URL` to create
   the tables (temporarily set it in `.env.local`, or run
   `DATABASE_URL=... npm run db:push`).
5. Deploy.

> Note: keep this app personal — use personal API keys and don't connect it to
> any work data or services.

## Editing the model list

The model picker is defined in [`lib/models.ts`](lib/models.ts). Add or remove
entries there (any Anthropic Messages API model or OpenAI Chat Completions
model works).
