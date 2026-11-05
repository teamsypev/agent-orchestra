// The orchestra: a planner splits the task, researchers work in parallel with web search,
// a critic reviews (and can send researchers back for one more round), a writer composes the answer.
import { streamMessage, ApiError, errorKey } from './api.js';

const MAX_SUBTASKS = 3;
const MAX_GAPS = 2;

const today = () => new Date().toISOString().slice(0, 10);
const answerLanguage = (task) => {
  if (/[а-яё]/i.test(task)) return 'Russian';
  if (/\b(va|uchun|qanday|nima|haqida|qilish|bo['ʻ]yicha|eng|yaxshi)\b/i.test(task)) return 'Uzbek';
  return 'English';
};

const PROMPTS = {
  planner: (lang) => `You are the planner of a small team of AI agents. Today is ${today()}.
Split the user's task into ${MAX_SUBTASKS - 1}–${MAX_SUBTASKS} research subtasks that can be worked on in parallel by researchers with web search. Subtasks must not overlap, and together they must cover everything needed for a great answer.
Titles: 2–5 words. Briefs: one sentence saying exactly what to find out.
Write titles and briefs in ${lang}. Submit the plan with the submit_plan tool.`,

  researcher: (lang) => `You are a researcher in a small team of AI agents. Today is ${today()}.
Research only your subtask, using web search for anything that can change over time (prices, versions, news, rankings, dates). Do at most 2 searches.
Then report your findings in ${lang}: 4–7 short bullet points with concrete facts, numbers and names, 150 words at most. No introduction, no conclusion. If sources disagree or something is uncertain, say so.`,

  critic: (lang) => `You are the critic in a small team of AI agents. Today is ${today()}.
Check whether the researchers' findings are enough to fully and accurately answer the user's task. Look for missing aspects, contradictions and claims without support.
Choose "approve" if a strong answer can be written now. Choose "revise" only if something important is missing, and list at most ${MAX_GAPS} focused follow-up research subtasks as gaps.
Write notes, gap titles and briefs in ${lang}. Submit with the submit_review tool.`,

  writer: (lang) => `You are the writer in a small team of AI agents. Today is ${today()}.
Write the final answer to the user's task in ${lang}, using only the researchers' findings. Lead with the direct answer, then the supporting detail. Use short paragraphs, and a list or a small table only where it genuinely helps. 120–300 words.
Cite sources inline as [n] with the numbers from the source list. Do not invent sources or facts. Use Markdown.`,
};

const PLAN_TOOL = {
  name: 'submit_plan',
  description: 'Submit the research plan.',
  input_schema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'One sentence: what a great answer must contain.' },
      subtasks: {
        type: 'array',
        minItems: 2,
        maxItems: MAX_SUBTASKS,
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, brief: { type: 'string' } },
          required: ['title', 'brief'],
        },
      },
    },
    required: ['goal', 'subtasks'],
  },
};

const REVIEW_TOOL = {
  name: 'submit_review',
  description: 'Submit the review of the findings.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['approve', 'revise'] },
      notes: { type: 'string', description: '1–2 sentences on the quality of the findings.' },
      gaps: {
        type: 'array',
        maxItems: MAX_GAPS,
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, brief: { type: 'string' } },
          required: ['title', 'brief'],
        },
      },
    },
    required: ['verdict', 'notes'],
  },
};

const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 2 };

export class Orchestra {
  constructor(bus, { apiKey, workspaceId, useSearch = true }) {
    this.bus = bus;
    this.apiKey = apiKey;
    this.workspaceId = workspaceId;
    this.useSearch = useSearch;
    this.controller = new AbortController();
    this.sources = []; // global numbered list: { n, title, url }
    this.nodeCount = 0;
  }

  stop() {
    this.controller.abort();
  }

  async run(task) {
    const bus = this.bus;
    const lang = answerLanguage(task);
    bus.emit('run_start', { task, lang, live: true });
    bus.emit('node_add', { id: 'user', role: 'user', label: task, stage: 0 });
    try {
      // 1. Plan
      const plan = await this.planner(task, lang);
      const subtasks = (plan.subtasks || []).slice(0, MAX_SUBTASKS);
      if (!subtasks.length) throw new Error('empty plan');
      bus.emit('plan', { goal: plan.goal || '', subtasks });

      // 2. Research in parallel
      let findings = await this.researchRound(task, lang, subtasks, 1, 'planner');

      // 3. Review — may send researchers back once
      const review = await this.critic(task, lang, findings);
      let writerInputs = ['critic'];
      if (review.verdict === 'revise' && review.gaps?.length) {
        const extra = await this.researchRound(task, lang, review.gaps.slice(0, MAX_GAPS), 2, 'critic');
        findings = findings.concat(extra);
        writerInputs = extra.map((f) => f.id);
      }

      // 4. Write
      await this.writer(task, lang, findings, writerInputs);
      bus.emit('run_end', { status: 'done', elapsed: bus.now() });
    } catch (err) {
      if (err.name === 'AbortError') {
        bus.emit('run_end', { status: 'stopped', elapsed: bus.now() });
      } else {
        console.error('[orchestra] run failed', err);
        bus.emit('run_end', { status: 'error', key: errorKey(err), message: String(err.message || err), elapsed: bus.now() });
      }
    }
  }

  // ------------------------------------------------------------------ agents

  async planner(task, lang) {
    const id = 'planner';
    const system = PROMPTS.planner(lang);
    const prompt = `Task: ${task}`;
    this.addNode({ id, role: 'planner', label: '', stage: 1, from: ['user'], system, prompt });
    this.bus.emit('edge', { from: 'user', to: id });
    const { input } = await this.callTool(id, system, prompt, PLAN_TOOL);
    this.done(id);
    return input;
  }

  async researchRound(task, lang, subtasks, round, from) {
    const stage = round === 1 ? 2 : 4;
    const jobs = subtasks.map((st, i) => {
      const id = `r${round}-${i + 1}`;
      const system = PROMPTS.researcher(lang);
      const prompt = `Overall task: ${task}\n\nYour subtask: ${st.title}\n${st.brief}`;
      this.addNode({ id, role: 'researcher', label: st.title, brief: st.brief, stage, round, index: i, from: [from], system, prompt });
      this.bus.emit('edge', { from, to: id, label: st.title });
      return { id, st, system, prompt };
    });
    const results = await Promise.all(jobs.map((j) => this.researcher(j)));
    return results;
  }

  async researcher({ id, st, system, prompt }) {
    const out = await this.callResearch(id, system, prompt);
    this.done(id);
    return { id, title: st.title, text: out.text, sources: out.sources };
  }

  async critic(task, lang, findings) {
    const id = 'critic';
    const system = PROMPTS.critic(lang);
    const prompt = `Task: ${task}\n\n${this.findingsBlock(findings)}`;
    this.addNode({ id, role: 'critic', label: '', stage: 3, from: findings.map((f) => f.id), system, prompt });
    for (const f of findings) this.bus.emit('edge', { from: f.id, to: id });
    const { input } = await this.callTool(id, system, prompt, REVIEW_TOOL);
    const review = { verdict: input.verdict === 'revise' ? 'revise' : 'approve', notes: input.notes || '', gaps: input.gaps || [] };
    this.bus.emit('review', { id, ...review });
    this.done(id);
    return review;
  }

  async writer(task, lang, findings, inputs) {
    const id = 'writer';
    const system = PROMPTS.writer(lang);
    const sourceList = this.sources.map((s) => `[${s.n}] ${s.title} — ${s.url}`).join('\n') || '(no web sources)';
    const prompt = `Task: ${task}\n\n${this.findingsBlock(findings)}\n\nSource list:\n${sourceList}`;
    this.addNode({ id, role: 'writer', label: '', stage: 5, from: inputs, system, prompt });
    for (const from of inputs) this.bus.emit('edge', { from, to: id });
    this.status(id, 'writing');
    let markdown = '';
    const res = await this.call(id, {
      system,
      max_tokens: 1400,
      messages: [{ role: 'user', content: prompt }],
    }, {
      text: (d) => {
        markdown += d;
        this.bus.emit('stream', { id, kind: 'text', delta: d });
        this.bus.emit('final_delta', { delta: d });
      },
    });
    markdown = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || markdown;
    this.bus.emit('final', { markdown, sources: this.sources });
    this.done(id);
  }

  // ------------------------------------------------------------------ plumbing

  addNode(node) {
    const { system, prompt, ...rest } = node;
    this.bus.emit('node_add', rest);
    this.bus.emit('detail', { id: node.id, system, prompt });
    this.status(node.id, 'thinking');
  }

  status(id, status) {
    this.bus.emit('node_status', { id, status });
  }

  done(id) {
    this.status(id, 'done');
  }

  findingsBlock(findings) {
    return findings
      .map((f, i) => {
        const cites = f.sources.length ? `\nSources: ${f.sources.map((s) => `[${s.n}]`).join(' ')}` : '';
        return `Findings ${i + 1} — ${f.title}:\n${f.text}${cites}`;
      })
      .join('\n\n');
  }

  registerSource(title, url) {
    let s = this.sources.find((x) => x.url === url);
    if (!s) {
      s = { n: this.sources.length + 1, title: title || url, url };
      this.sources.push(s);
    }
    return s;
  }

  /** One API call (with continuation after pause_turn), keeping per-agent usage up to date. */
  async call(id, body, handlers = {}) {
    const totals = { input: 0, output: 0, searches: 0 };
    let messages = body.messages;
    let content = [];
    for (let step = 0; step < 4; step++) {
      const res = await streamMessage({
        apiKey: this.apiKey,
        workspaceId: this.workspaceId,
        body: { ...body, messages, thinking: { type: 'disabled' }, output_config: { effort: 'low' } },
        signal: this.controller.signal,
        on: {
          ...handlers,
          usage: (u) => {
            this.bus.emit('usage', {
              id,
              input: totals.input + u.input,
              output: totals.output + u.output,
              searches: totals.searches + u.searches,
            });
          },
        },
      });
      totals.input += res.usage.input;
      totals.output += res.usage.output;
      totals.searches += res.usage.searches;
      content = content.concat(res.content);
      if (res.stopReason !== 'pause_turn') return { content, stopReason: res.stopReason };
      messages = [...messages, { role: 'assistant', content: res.content }];
    }
    return { content, stopReason: 'max_steps' };
  }

  /** Planner / critic: structured output through a forced tool call, streamed as it is written. */
  async callTool(id, system, prompt, tool) {
    const res = await this.call(id, {
      system,
      max_tokens: 1200,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: prompt }],
    }, {
      toolInput: (_index, partial, block) => {
        if (block?.type === 'tool_use') this.bus.emit('stream', { id, kind: 'json', snapshot: partial });
      },
    });
    const call = res.content.find((b) => b.type === 'tool_use');
    if (!call) throw new Error(`${id} did not submit a result`);
    return call;
  }

  /** Researcher: free text with live web search; falls back to no search if the account can't use it. */
  async callResearch(id, system, prompt) {
    const sources = [];
    const seen = new Set();
    const addSource = (title, url) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      sources.push(this.registerSource(title, url));
    };
    const handlers = {
      text: (d) => this.bus.emit('stream', { id, kind: 'text', delta: d }),
      blockStart: (block) => {
        if (block.type === 'server_tool_use') this.status(id, 'searching');
        if (block.type === 'text') this.status(id, 'writing');
        if (block.type === 'web_search_tool_result') {
          const results = Array.isArray(block.content)
            ? block.content.filter((r) => r.type === 'web_search_result').slice(0, 6)
                .map((r) => ({ title: r.title, url: r.url, age: r.page_age || null }))
            : [];
          this.bus.emit('search_results', { id, results, error: Array.isArray(block.content) ? null : block.content?.error_code || 'error' });
          this.status(id, 'thinking');
        }
      },
      blockStop: (block) => {
        if (block.type === 'server_tool_use' && block.input?.query) this.bus.emit('search', { id, query: block.input.query });
      },
      citation: (c) => { if (c.url) addSource(c.title, c.url); },
    };
    const body = (withSearch) => ({
      system,
      max_tokens: 1200,
      ...(withSearch ? { tools: [WEB_SEARCH] } : {}),
      messages: [{ role: 'user', content: prompt }],
    });

    let res;
    try {
      res = await this.call(id, body(this.useSearch), handlers);
    } catch (err) {
      if (this.useSearch && err instanceof ApiError && errorKey(err) === 'errSearch') {
        this.useSearch = false;
        this.bus.emit('notice', { key: 'noSearch' });
        res = await this.call(id, body(false), handlers);
      } else throw err;
    }
    const textBlocks = res.content.filter((b) => b.type === 'text');
    // If nothing was cited, keep the top results of the searches as sources.
    if (!sources.length) {
      for (const b of res.content) {
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          for (const r of b.content.slice(0, 2)) addSource(r.title, r.url);
        }
      }
    }
    return { text: textBlocks.map((b) => b.text).join('').trim(), sources };
  }
}
