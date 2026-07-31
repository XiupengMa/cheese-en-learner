import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getModel } from "./models";
import type { ChatMessage, LLMDebug, StreamEvent } from "./types";

interface LLMParams {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface LLMResult {
  text: string;
  debug: LLMDebug;
}

function anthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (or your deployment env vars) to use Claude models."
    );
  }
  return new Anthropic({ apiKey });
}

function openaiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local (or your deployment env vars) to use GPT models."
    );
  }
  return new OpenAI({ apiKey });
}

export async function completeText({
  model,
  system,
  messages,
  maxTokens = 16000,
}: LLMParams): Promise<LLMResult> {
  const m = getModel(model);
  const started = Date.now();

  if (m.provider === "anthropic") {
    const payload = {
      model: m.id,
      max_tokens: maxTokens,
      system,
      messages,
    };
    const response = await anthropicClient().messages.create(payload);
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      text,
      debug: {
        request: { provider: "anthropic", endpoint: "POST /v1/messages", payload },
        response: { text, usage: response.usage, durationMs: Date.now() - started },
      },
    };
  }

  const payload = {
    model: m.id,
    max_completion_tokens: maxTokens,
    messages: [{ role: "system" as const, content: system }, ...messages],
  };
  const completion = await openaiClient().chat.completions.create(payload);
  const text = completion.choices[0]?.message?.content ?? "";
  return {
    text,
    debug: {
      request: { provider: "openai", endpoint: "POST /v1/chat/completions", payload },
      response: { text, usage: completion.usage, durationMs: Date.now() - started },
    },
  };
}

/**
 * Streams the LLM response as NDJSON events (one JSON object per line):
 *   {"type":"delta","text":"..."}   — incremental response text
 *   {"type":"done","debug":{...}}   — full request/response record for debug mode
 *   {"type":"error","message":"…"}  — a mid-stream failure
 */
export async function streamLLM({
  model,
  system,
  messages,
  maxTokens = 16000,
}: LLMParams): Promise<ReadableStream<Uint8Array>> {
  const m = getModel(model);
  const encoder = new TextEncoder();
  const started = Date.now();

  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, event: StreamEvent) =>
    controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

  if (m.provider === "anthropic") {
    const payload = {
      model: m.id,
      max_tokens: maxTokens,
      system,
      messages,
    };
    const stream = anthropicClient().messages.stream(payload);
    return new ReadableStream({
      async start(controller) {
        let text = "";
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              text += event.delta.text;
              emit(controller, { type: "delta", text: event.delta.text });
            }
          }
          const final = await stream.finalMessage();
          emit(controller, {
            type: "done",
            debug: {
              request: { provider: "anthropic", endpoint: "POST /v1/messages (stream)", payload },
              response: { text, usage: final.usage, durationMs: Date.now() - started },
            },
          });
        } catch (err) {
          emit(controller, {
            type: "error",
            message: err instanceof Error ? err.message : "Stream failed.",
          });
        }
        controller.close();
      },
      cancel() {
        stream.abort();
      },
    });
  }

  const payload = {
    model: m.id,
    stream: true as const,
    stream_options: { include_usage: true },
    max_completion_tokens: maxTokens,
    messages: [{ role: "system" as const, content: system }, ...messages],
  };
  const completion = await openaiClient().chat.completions.create(payload);
  return new ReadableStream({
    async start(controller) {
      let text = "";
      let usage: unknown;
      try {
        for await (const chunk of completion) {
          if (chunk.usage) usage = chunk.usage;
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            text += delta;
            emit(controller, { type: "delta", text: delta });
          }
        }
        emit(controller, {
          type: "done",
          debug: {
            request: { provider: "openai", endpoint: "POST /v1/chat/completions (stream)", payload },
            response: { text, usage, durationMs: Date.now() - started },
          },
        });
      } catch (err) {
        emit(controller, {
          type: "error",
          message: err instanceof Error ? err.message : "Stream failed.",
        });
      }
      controller.close();
    },
    cancel() {
      completion.controller.abort();
    },
  });
}
