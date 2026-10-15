import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeedSelect } from "../components/SpeedSelect";

test("supported models offer Standard and Fast with price and access information", () => {
  for (const model of ["claude-opus-5-5", "gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"]) {
    const html = renderToStaticMarkup(<SpeedSelect model={model} value="fast" onChange={() => {}} />);
    assert.match(html, /value="fast" selected=""/);
    assert.doesNotMatch(html, /disabled=/);
    assert.match(html, /Fast costs more/);
    if (model.startsWith("claude")) assert.match(html, /requires Anthropic fast-mode access/);
  }
});

test("unsupported models show disabled Standard even when the saved preference is Fast", () => {
  for (const model of ["claude-fable-5-1", "claude-sonnet-5-5", "claude-haiku-5-5"]) {
    const html = renderToStaticMarkup(<SpeedSelect model={model} value="fast" onChange={() => {}} />);
    assert.match(html, /disabled=""/);
    assert.match(html, /value="standard" selected=""/);
    assert.match(html, /Fast unavailable for this model/);
  }
});
