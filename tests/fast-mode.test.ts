import assert from "node:assert/strict";
import test from "node:test";
import { completeText, streamLLM } from "../lib/llm";
import { MODELS, resolveSpeed } from "../lib/models";
import type { StreamEvent } from "../lib/types";

test("provider requests use supported speed settings for both completion paths", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKeys = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [index, key] of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].entries()) {
      if (originalKeys[index] === undefined) delete process.env[key];
      else process.env[key] = originalKeys[index];
    }
  });

  for (const model of MODELS) {
    for (const speed of ["standard", "fast"] as const) {
      for (const streaming of [false, true]) {
        await t.test(`${model.id}: ${speed}, ${streaming ? "stream" : "complete"}`, async () => {
          let requests = 0;
          const effectiveFast = resolveSpeed(model.id, speed) === "fast";
          globalThis.fetch = async (input, init) => {
            const request = new Request(input, init);
            const payload = await request.json();
            requests++;
            assert.equal(payload.model, model.id);
            assert.equal(Boolean(payload.stream), streaming);
            if (model.provider === "anthropic") {
              assert.equal(new URL(request.url).hostname, "api.anthropic.com");
              assert.equal(payload.speed, effectiveFast ? "fast" : undefined);
              assert.equal(request.headers.get("anthropic-beta"), effectiveFast ? "fast-mode-2026-02-01" : null);
              assert.deepEqual(payload.output_config, { effort: "low" });
              const usage = { input_tokens: 5, output_tokens: 1, ...(effectiveFast ? { speed: "fast" } : {}) };
              const message = { id: "msg_test", type: "message", role: "assistant", model: model.id, content: [], stop_reason: null, stop_sequence: null, usage };
              if (!streaming) return Response.json({ ...message, content: [{ type: "text", text: "Hello" }], stop_reason: "end_turn" });
              const events = [
                { type: "message_start", message },
                { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
                { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
                { type: "content_block_stop", index: 0 },
                { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage },
                { type: "message_stop" },
              ];
              return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
                headers: { "Content-Type": "text/event-stream" },
              });
            }

            assert.equal(new URL(request.url).hostname, "api.openai.com");
            assert.equal(payload.service_tier, effectiveFast ? "priority" : "default");
            assert.equal(payload.reasoning_effort, "low");
            // Simulate a provider downgrade: Debug must report the actual tier.
            const base = { id: "chat_test", created: 1, model: model.id, service_tier: "default", usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } };
            if (!streaming) return Response.json({ ...base, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }] });
            const chunk = { ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: "stop" }] };
            return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
          };

          const params = { model: model.id, speed, system: "Be helpful.", messages: [{ role: "user" as const, content: "Hi" }], effort: "low" as const };
          if (streaming) {
            const stream = await streamLLM(params);
            const events = (await new Response(stream).text()).trim().split("\n").map((line) => JSON.parse(line) as StreamEvent);
            assert.equal(events.filter((event) => event.type === "delta").map((event) => event.text).join(""), "Hello");
            const done = events.find((event) => event.type === "done");
            assert.ok(done);
            if (model.provider === "openai") assert.equal(done.debug.response.serviceTier, "default");
            assert.equal(events.some((event) => event.type === "error"), false);
          } else {
            const result = await completeText(params);
            assert.equal(result.text, "Hello");
            if (model.provider === "openai") assert.equal(result.debug.response.serviceTier, "default");
          }
          assert.equal(requests, 1);
        });
      }
    }
  }
});

test("untrusted and missing speed values stay at standard speed", () => {
  for (const value of [undefined, null, "ultrafast", "FAST", true, {}, 1]) {
    for (const model of MODELS) assert.equal(resolveSpeed(model.id, value), "standard");
  }
});
