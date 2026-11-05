// Minimal streaming client for the Claude Messages API, called straight from the browser.
// The key never leaves the visitor's browser except to api.anthropic.com.

export const MODEL = 'claude-haiku-5-5';
export const PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6, search: 10 / 1000 }; // USD, Claude Haiku 5.5

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class ApiError extends Error {
  constructor(status, type, message) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

/** Human-readable reason for an API error, keyed for i18n. */
export function errorKey(err) {
  if (!(err instanceof ApiError)) return 'errNetwork';
  if (err.status === 401) return 'errKey';
  if (err.status === 403) return 'errForbidden';
  if (err.status === 429) return 'errRate';
  if (err.status === 529 || err.status >= 500) return 'errOverloaded';
  if (/workspace/i.test(err.message)) return 'errWorkspace';
  if (/credit|balance/i.test(err.message)) return 'errCredit';
  if (/web.?search/i.test(err.message)) return 'errSearch';
  return 'errRequest';
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });

/**
 * Streams one Messages API call. `on` receives:
 *   text(delta), thinking(delta), toolInput(blockIndex, partialJson), blockStart(block), citation(c), usage(u)
 * Resolves to { content, stopReason, usage } where content is the full list of blocks
 * (needed to continue after `pause_turn`).
 */
export async function streamMessage({ apiKey, workspaceId, body, on = {}, signal }) {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (workspaceId) headers['anthropic-workspace-id'] = workspaceId;

  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: MODEL, stream: true, ...body }),
      signal,
    });
    const retriable = res.status === 429 || res.status === 529 || res.status >= 500;
    if (res.ok || !retriable || attempt >= 3) break;
    const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt;
    await sleep(Math.min(wait, 15000), signal);
  }
  if (!res.ok) {
    let type = 'error', message = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      type = j.error?.type || type;
      message = j.error?.message || message;
    } catch {}
    throw new ApiError(res.status, type, message);
  }

  const content = [];
  const usage = { input: 0, output: 0, searches: 0 };
  let stopReason = null;
  const partialJson = {};

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (event) => {
    switch (event.type) {
      case 'message_start': {
        const u = event.message?.usage || {};
        usage.input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        usage.output = u.output_tokens || 0;
        on.usage?.({ ...usage });
        break;
      }
      case 'content_block_start': {
        const block = structuredClone(event.content_block);
        if (block.type === 'text') { block.text = ''; block.citations = block.citations || null; }
        if (block.type === 'thinking') block.thinking = block.thinking || '';
        if (block.type === 'tool_use' || block.type === 'server_tool_use') partialJson[event.index] = '';
        content[event.index] = block;
        on.blockStart?.(block, event.index);
        break;
      }
      case 'content_block_delta': {
        const block = content[event.index];
        const d = event.delta;
        if (d.type === 'text_delta') { block.text += d.text; on.text?.(d.text); }
        else if (d.type === 'thinking_delta') { block.thinking += d.thinking; on.thinking?.(d.thinking); }
        else if (d.type === 'signature_delta') { block.signature = (block.signature || '') + d.signature; }
        else if (d.type === 'input_json_delta') {
          partialJson[event.index] += d.partial_json;
          on.toolInput?.(event.index, partialJson[event.index], block);
        } else if (d.type === 'citations_delta') {
          (block.citations ||= []).push(d.citation);
          on.citation?.(d.citation);
        }
        break;
      }
      case 'content_block_stop': {
        const block = content[event.index];
        if (block && event.index in partialJson) {
          try { block.input = partialJson[event.index] ? JSON.parse(partialJson[event.index]) : {}; }
          catch { block.input = {}; }
          on.blockStop?.(block, event.index);
        }
        if (block?.type === 'text' && !block.citations) delete block.citations;
        break;
      }
      case 'message_delta': {
        stopReason = event.delta?.stop_reason || stopReason;
        const u = event.usage || {};
        if (u.output_tokens != null) usage.output = u.output_tokens;
        if (u.input_tokens) usage.input = u.input_tokens + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        if (u.server_tool_use?.web_search_requests != null) usage.searches = u.server_tool_use.web_search_requests;
        on.usage?.({ ...usage });
        break;
      }
      case 'error':
        throw new ApiError(500, event.error?.type || 'error', event.error?.message || 'stream error');
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('');
      if (!dataLine) continue;
      let event;
      try { event = JSON.parse(dataLine); } catch { continue; }
      handle(event);
    }
  }
  return { content: content.filter(Boolean), stopReason, usage };
}
