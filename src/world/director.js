// Turns agent-engine events into what the little people do in the office.
import { t } from '../i18n.js';

const NOTE_COLORS = ['#ffd866', '#9de0d4', '#ffb3c1', '#c8bdfc', '#b9e4a0'];
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const tailText = (s, n) => {
  // speech bubbles show plain words: drop Markdown marks and citation numbers
  const clean = s.replace(/\[\d+(?:,\s*\d+)*\]/g, '').replace(/[#*_`>|]+/g, '').replace(/^\s*[-•]\s*/gm, '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? '…' + clean.slice(-n) : clean;
};

export class Director {
  constructor(agents, dyn, log) {
    this.agents = Object.fromEntries(agents.map((a) => [a.id, a]));
    this.dyn = dyn;
    this.log = log; // (agentId|null, text) → activity feed
    this.nodeToAgent = new Map();
    this.text = new Map();
    this.lastBubble = new Map();
  }

  agentFor(nodeId) {
    if (this.nodeToAgent.has(nodeId)) return this.agents[this.nodeToAgent.get(nodeId)];
    let id = null;
    if (nodeId === 'planner') id = 'P';
    else if (nodeId === 'critic') id = 'C';
    else if (nodeId === 'writer') id = 'W';
    else if (/^r\d-(\d)$/.test(nodeId)) id = `R${((Number(nodeId.split('-')[1]) - 1) % 3) + 1}`;
    if (id) this.nodeToAgent.set(nodeId, id);
    return id ? this.agents[id] : null;
  }

  deskOf(a) {
    return { R1: 'desk0', R2: 'desk1', R3: 'desk2' }[a.id];
  }

  handle(e) {
    const A = this.agents;
    const a = e.id ? this.agentFor(e.id) : null;
    switch (e.type) {
      case 'run_start': {
        Object.assign(this.dyn, { task: e.task, notes: [], boardTitle: 0, criticPapers: 0, screens: {}, printing: false });
        this.text.clear();
        this.nodeToAgent.clear();
        A.P.plan([{ spot: 'inbox', act: 'read', dur: 1.4, carry: null }, { spot: 'board', act: 'think' }]);
        A.P.say(clip(e.task, 70), 4.5, 'task');
        this.log('P', t('logTask')(clip(e.task, 80)));
        break;
      }
      case 'node_status': {
        if (!a) break;
        if (e.id === 'planner' && e.status === 'thinking') A.P.then([]);
        if (e.status === 'done' && a.role === 'researcher') this.researcherDone(e.id, a);
        if (e.status === 'done' && e.id === 'critic') A.C.say(this.dyn.review?.verdict === 'revise' ? t('needMore') : t('approved'), 4);
        if (e.status === 'searching' && a.role === 'researcher') break;
        if (e.status === 'writing' && a.role === 'researcher') {
          const desk = this.deskOf(a);
          if (a.spot !== desk && !a.path.length) a.plan([{ spot: desk, act: 'type' }]);
        }
        break;
      }
      case 'node_add': {
        if (!a) break;
        if (e.role === 'researcher') {
          const desk = this.deskOf(a);
          if (e.round === 2) {
            // the critic hands out the follow-up question
            a.plan([{ spot: 'drop2', act: 'listen', dur: 1.6 }, { spot: desk, act: 'type' }]);
            this.log(a.id, t('logGap')(clip(e.label, 60)));
          } else {
            a.plan([{ spot: `brief${e.index ?? 0}`, act: 'listen', dur: 1.8, carry: null }, { spot: desk, act: 'type' }]);
            this.log(a.id, t('logAssigned')(clip(e.label, 60), a.female));
          }
          a.say(clip(e.label, 48), 3.5, 'task');
        } else if (e.role === 'critic') {
          A.C.plan([{ spot: 'deskC', act: 'read' }]);
          this.log('C', t('logReview'));
        } else if (e.role === 'writer') {
          A.W.plan([{ spot: 'drop0', act: 'collect', dur: 1.4, carry: 'paper' }, { spot: 'deskW', act: 'type', carry: null }]);
          this.log('W', t('logWrite'));
        }
        break;
      }
      case 'stream': {
        if (!a) break;
        if (e.kind === 'json') {
          if (e.id === 'planner') {
            const titles = [...e.snapshot.matchAll(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"?/g)].map((m) => m[1]);
            this.dyn.boardTitle = Math.min(1, e.snapshot.length / 120);
            this.dyn.notes = titles.map((title, i) => ({ title, color: NOTE_COLORS[i % NOTE_COLORS.length], progress: 1 }));
            if (a.step?.act !== 'draw' && a.spot === 'board' && !a.path.length) a.plan([{ spot: 'board', act: 'draw' }]);
            else if (a.step?.act === 'think') a.step.act = 'draw';
            if (titles.length) this.bubble(a, titles[titles.length - 1], 'note');
          } else if (e.id === 'critic') {
            const m = e.snapshot.match(/"notes"\s*:\s*"((?:[^"\\]|\\.)*)/);
            if (m) this.bubble(a, tailText(m[1], 60));
          }
          break;
        }
        const prev = (this.text.get(e.id) || '') + e.delta;
        this.text.set(e.id, prev);
        const desk = a.role === 'writer' ? 'deskW' : this.deskOf(a);
        if (desk) this.dyn.screens[desk === 'deskW' ? 'deskW' : desk] = { color: a.shirt, tick: (prev.length % 97) / 97, seed: prev.length };
        this.bubble(a, tailText(prev, 54));
        break;
      }
      case 'search': {
        if (!a) break;
        const shelf = `shelf${(Number(a.id.slice(1)) - 1 + (this.searchCount = (this.searchCount || 0) + 1)) % 4}`;
        a.plan([{ spot: shelf, act: 'browse', dur: 2.2 }, { spot: this.deskOf(a), act: 'type' }]);
        a.say(`⌕ ${clip(e.query, 50)}`, 3.5, 'search');
        this.log(a.id, t('logSearch')(clip(e.query, 60)));
        break;
      }
      case 'search_results': {
        if (!a) break;
        const n = e.results?.length || 0;
        if (n) this.log(a.id, t('logFound')(n, a.female));
        break;
      }
      case 'plan': {
        this.dyn.notes = e.subtasks.map((s, i) => ({ title: s.title, color: NOTE_COLORS[i % NOTE_COLORS.length], progress: 1 }));
        this.dyn.boardTitle = 1;
        A.P.plan([{ spot: 'board', act: 'idle', dur: 2.5 }]);
        A.P.say(t('planReady')(e.subtasks.length), 3.5);
        this.log('P', t('logPlan')(e.subtasks.length));
        break;
      }
      case 'review': {
        this.dyn.review = { verdict: e.verdict };
        A.C.say(e.verdict === 'revise' ? `${t('needMore')}: ${clip(e.gaps?.[0]?.title || '', 40)}` : t('approved'), 5);
        this.log('C', e.verdict === 'revise' ? t('logRevise') : t('logApprove')(A.C.female));
        break;
      }
      case 'final': {
        A.W.plan([{ spot: 'printer', act: 'print', dur: 2.6, carry: null }, { spot: 'pin', act: 'pin', dur: 1.6, carry: 'paper' }, { spot: 'coffee1', act: 'idle', carry: 'mug' }]);
        this.dyn.printing = true;
        setTimeout(() => { this.dyn.printing = false; }, 4200);
        setTimeout(() => { this.dyn.answers = (this.dyn.answers || 0) + 1; A.W.carry = null; }, 7600);
        A.W.say(t('printing'), 3);
        this.log('W', t('logDone'));
        break;
      }
      case 'run_end': {
        this.dyn.screens = {};
        if (e.status === 'error') { A.P.say(t('oops'), 5); this.log(null, t(e.key || 'errRequest')); }
        if (e.status === 'stopped') this.log(null, t('stopped'));
        // everyone drifts off for coffee after a while
        for (const ag of Object.values(A)) if (ag.id !== 'W') setTimeout(() => { if (!ag.path.length) ag.plan([]); }, 2500 + Math.random() * 3000);
        break;
      }
    }
  }

  researcherDone(nodeId, a) {
    const drops = ['drop0', 'drop1', 'drop2'];
    const drop = drops[(Number(a.id.slice(1)) - 1) % 3];
    a.plan([{ spot: drop, act: 'deliver', dur: 1.2, carry: 'paper' }, { spot: `coffee${(Number(a.id.slice(1)) - 1) % 3}`, act: 'idle', carry: 'mug', dur: 6 }]);
    setTimeout(() => { this.dyn.criticPapers = (this.dyn.criticPapers || 0) + 1; }, 2600);
    delete this.dyn.screens[this.deskOf(a)];
    a.say(t('handIn'), 2.5);
    this.log(a.id, t('logHandIn')(a.female));
    void nodeId;
  }

  bubble(a, text, kind = 'say') {
    const now = performance.now();
    if (now - (this.lastBubble.get(a.id) || 0) < 180) return;
    this.lastBubble.set(a.id, now);
    a.say(text, 2.5, kind);
  }
}
