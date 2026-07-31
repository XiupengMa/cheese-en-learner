# 🧀 Cheese · English Learner

A personal, AI-powered English learning app for native Chinese speakers. Two modes:

- **📖 Dictionary** — type or paste a word/phrase and get an English explanation
  (with etymology and US/UK cultural background when interesting), US pronunciation
  (IPA + click-to-play audio), the Chinese translation, and real-world example
  sentences. A follow-up box lets you keep asking about the word.
- **🎓 Teacher** — paste a sentence or paragraphs and get a full Chinese
  translation. Select any part of the original text to get a popup with an
  **✨ Explain this** shortcut or a box to ask your own question about that
  fragment. A follow-up box below digs deeper into the whole text.

Both modes are powered by your choice of Claude or GPT models (selector in the
header; the choice is remembered in `localStorage`). All LLM calls happen on the
backend — API keys never reach the browser.

A **Debug** toggle in the header reveals the raw request/response exchanged
between this server and the LLM provider (exact payload, usage, latency) under
each result.

## Tech

- Next.js (App Router) + TypeScript + Tailwind CSS
- `@anthropic-ai/sdk` and `openai` on the server, streaming responses
- Pronunciation audio from the [Free Dictionary API](https://dictionaryapi.dev/)
  (US recording preferred), with browser speech synthesis as fallback

## Local development

```bash
cp .env.example .env.local   # then fill in your key(s)
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable            | Purpose                          |
| ------------------- | -------------------------------- |
| `ANTHROPIC_API_KEY` | Required to use Claude models    |
| `OPENAI_API_KEY`    | Required to use GPT models       |

You only need the key(s) for the provider(s) you use.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel (framework preset: Next.js —
   auto-detected, no config needed).
2. In **Project Settings → Environment Variables**, add `ANTHROPIC_API_KEY`
   and/or `OPENAI_API_KEY`.
3. Deploy.

> Note: keep this app personal — use personal API keys and don't connect it to
> any work data or services.

## Editing the model list

The model picker is defined in [`lib/models.ts`](lib/models.ts). Add or remove
entries there (any Anthropic Messages API model or OpenAI Chat Completions
model works).
