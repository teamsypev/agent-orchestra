// Everything the UI shows is driven by events on this bus. A live run emits them while the
// agents work; a replay emits recorded ones. The UI can't tell the difference.

export class Bus {
  constructor() {
    this.listeners = new Set();
    this.trace = [];
    this.t0 = 0;
    this.recording = false;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(record = true, speed = 1) {
    this.trace = [];
    this.t0 = performance.now();
    this.recording = record;
    this.speed = speed;
  }

  /** Current run time in seconds (in recorded time when a replay runs faster). */
  now() {
    return ((performance.now() - this.t0) / 1000) * (this.speed || 1);
  }

  emit(type, data = {}, t = this.now()) {
    const event = { t: Math.round(t * 1000) / 1000, type, ...data };
    if (this.recording) this.trace.push(event);
    for (const fn of this.listeners) {
      try { fn(event); } catch (err) { console.error('[orchestra] listener failed', err); }
    }
    return event;
  }

  /** Recorded run as a downloadable object. Large search payloads are already trimmed by the engine. */
  exportTrace(meta = {}) {
    return { version: 1, recordedAt: new Date().toISOString(), ...meta, events: this.trace };
  }
}
