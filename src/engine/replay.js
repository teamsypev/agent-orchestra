// Plays a recorded run back through the bus, with the original timing (optionally faster).

export class Replay {
  constructor(bus, trace, speed = 1) {
    this.bus = bus;
    this.events = trace.events || [];
    this.speed = speed;
    this.stopped = false;
    this.timer = null;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    this._tick?.();
  }

  run() {
    this.bus.start(false, this.speed);
    const events = this.events;
    let i = 0;
    const startWall = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (this.stopped) {
          if (!this._ended) this.bus.emit('run_end', { status: 'stopped', elapsed: this.bus.now() });
          this._ended = true;
          return resolve();
        }
        const elapsed = ((performance.now() - startWall) / 1000) * this.speed;
        while (i < events.length && events[i].t <= elapsed) {
          const { t, type, ...data } = events[i++];
          this.bus.emit(type, { ...data, replay: true }, t);
        }
        if (i >= events.length) return resolve();
        const wait = ((events[i].t - elapsed) / this.speed) * 1000;
        this.timer = setTimeout(tick, Math.max(8, Math.min(wait, 100)));
      };
      this._tick = tick;
      tick();
    });
  }
}
