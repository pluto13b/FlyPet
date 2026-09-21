// FlyPet's own small-circuit LIF engine. Anatomy is measured; dynamics/gains are models.
export const MODEL = Object.freeze({ dtMs: 1, tauMs: 20, threshold: 1,
  refractoryMs: 3, synapseGain: 0.0008, sensoryToGFBoost: 6, sensoryGain: 0.30, inhibitionDelayMs: 4 });

export class Brain {
  constructor(graph) {
    this.graph = graph;
    this.n = graph.neurons.length;
    this.v = new Float64Array(this.n);
    this.current = new Float64Array(this.n);
    this.inhibition = Array.from({ length: MODEL.inhibitionDelayMs }, () => new Float64Array(this.n));
    this.refractory = new Uint8Array(this.n);
    this.rates = new Float64Array(this.n);
    this.silenced = new Set();
    this.groups = {};
    this.outgoing = Array.from({ length: this.n }, () => []);
    graph.neurons.forEach((cell, i) => {
      for (const group of [cell.role, `${cell.role}:${cell.side}`]) {
        (this.groups[group] ??= []).push(i);
      }
    });
    for (const [pre, post, count] of graph.edges) {
      const from = graph.neurons[pre], to = graph.neurons[post];
      const boost = to.role === 'gf' && ['lc4', 'lplc2'].includes(from.role)
        ? MODEL.sensoryToGFBoost : 1;
      this.outgoing[pre].push([post, count * MODEL.synapseGain * boost]);
    }
    this.timeMs = 0;
    this.totalSpikes = 0;
    this.pulses = [];
    this.lastSpikes = [];
  }

  stimulate(group, strength = 0.25, durationMs = 250) {
    if (!this.groups[group]) return false;
    this.pulses.push({ group, strength, until: this.timeMs + durationMs });
    return true;
  }

  silence(group, enabled = true) {
    for (const i of this.groups[group] ?? []) {
      if (enabled) { this.silenced.add(i); this.v[i] = 0; }
      else this.silenced.delete(i);
    }
  }

  step(milliseconds, inputs = {}) {
    const drive = new Float64Array(this.n);
    for (const [group, value] of Object.entries(inputs)) {
      for (const i of this.groups[group] ?? []) drive[i] += value;
    }
    const decay = Math.exp(-1 / MODEL.tauMs), rateDecay = Math.exp(-1 / 120);
    let gfSpikes = 0;
    const observed = new Set();
    for (let tick = 0; tick < milliseconds; tick++) {
      this.timeMs++;
      const pulseDrive = new Float64Array(this.n);
      this.pulses = this.pulses.filter(p => p.until >= this.timeMs);
      for (const p of this.pulses) for (const i of this.groups[p.group]) pulseDrive[i] += p.strength;
      const spikes = [];
      for (let i = 0; i < this.n; i++) {
        this.rates[i] *= rateDecay;
        if (this.silenced.has(i) || this.refractory[i] > 0) {
          this.v[i] = 0;
          if (this.refractory[i]) this.refractory[i]--;
        } else {
          this.v[i] = Math.max(-2, this.v[i] * decay + this.current[i]
            + this.inhibition[this.timeMs % MODEL.inhibitionDelayMs][i] + drive[i] + pulseDrive[i]);
          if (this.v[i] >= MODEL.threshold) {
            this.v[i] = 0;
            this.refractory[i] = MODEL.refractoryMs;
            this.rates[i] += 1000 * (1 - rateDecay);
            spikes.push(i); observed.add(i);
            if (this.graph.neurons[i].role === 'gf') gfSpikes++;
          }
        }
        this.current[i] = 0;
        this.inhibition[this.timeMs % MODEL.inhibitionDelayMs][i] = 0;
      }
      // Excitation arrives next tick; modeled inhibition delay permits transient responses.
      for (const i of spikes) for (const [post, weight] of this.outgoing[i]) {
        if (weight >= 0) this.current[post] += weight;
        else this.inhibition[this.timeMs % MODEL.inhibitionDelayMs][post] += weight;
      }
      this.totalSpikes += spikes.length;
    }
    this.lastSpikes = [...observed];
    return { gfSpikes, spikes: this.lastSpikes, rates: this.groupRates() };
  }

  groupRates() {
    return Object.fromEntries(Object.entries(this.groups).map(([name, ids]) =>
      [name, ids.reduce((sum, i) => sum + this.rates[i], 0) / ids.length]));
  }

  snapshot() {
    return { timeMs: this.timeMs, totalSpikes: this.totalSpikes, v: [...this.v],
      current: [...this.current], refractory: [...this.refractory], rates: [...this.rates],
      inhibition: this.inhibition.map(q => [...q]),
      pulses: structuredClone(this.pulses), silenced: [...this.silenced] };
  }

  restore(s) {
    for (const name of ['v', 'current', 'refractory', 'rates']) {
      if (!Array.isArray(s[name]) || s[name].length !== this.n || s[name].some(v => !Number.isFinite(v)))
        throw new Error(`Invalid brain snapshot: ${name}`);
      this[name].set(s[name]);
    }
    this.timeMs = s.timeMs; this.totalSpikes = s.totalSpikes;
    this.inhibition.forEach((q, i) => q.set(s.inhibition[i]));
    this.pulses = structuredClone(s.pulses ?? []);
    this.silenced = new Set(s.silenced ?? []);
  }
}
