const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Small, reusable PCM clips. Generate once when sound is enabled, never during
// a kick or animation frame. All audio is synthesized locally; no file fetches.
export function buildMatchSounds(context) {
  let seed = 9042;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 2147483648 - 1;
  };
  const clip = (duration, sample) => {
    const buffer = context.createBuffer(
      2,
      Math.ceil(context.sampleRate * duration),
      context.sampleRate
    );
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / context.sampleRate;
        const n = noise();
        low = low * 0.94 + n * 0.06;
        const edge = Math.min(1, t / 0.005, (duration - t) / 0.015);
        data[i] = clamp(sample(t, n, low, channel) * edge, -0.92, 0.92);
      }
    }
    return buffer;
  };
  const kick = clip(
    0.24,
    (t, n) =>
      Math.sin(TAU * (105 * t - 105 * t * t)) * Math.exp(-23 * t) * 0.8 +
      n * Math.exp(-90 * t) * 0.5
  );
  const net = clip(0.52, (t, n, low) => {
    const rattle = Math.pow(Math.max(0, Math.sin(TAU * 32 * t)), 6);
    return (
      (n - low) * (0.12 + rattle * 0.65) * Math.exp(-6 * t) +
      Math.sin(TAU * 165 * t) * Math.exp(-25 * t) * 0.25
    );
  });
  const catchBall = clip(
    0.18,
    (t, n, low) =>
      (low * 1.7 + n * 0.13 + Math.sin(TAU * 78 * t) * 0.5) * Math.exp(-27 * t)
  );
  const crowd = clip(4, (t, n, low, channel) => {
    // Wide roar, staggered claps, and several detuned voices chanting in waves.
    const swell =
      0.58 + 0.22 * Math.sin((TAU * t) / 4) + 0.12 * Math.sin(TAU * t);
    let voices = 0;
    for (let v = 0; v < 5; v++) {
      const f = 112 + v * 19 + channel * 0.7;
      const phrase = Math.pow(
        Math.max(0, Math.sin(TAU * (t / 2 + v * 0.12))),
        2
      );
      const phase = TAU * (f * t + 0.8 * Math.sin((TAU * t) / 4 + v));
      voices +=
        phrase *
        (Math.sin(phase) * 0.55 +
          Math.sin(phase * 3) * 0.3 +
          Math.sin(phase * 5) * 0.15);
    }
    const clapTime = (t + channel * 0.047) % 0.31;
    const clap = n * Math.exp(-clapTime * 95) * 0.34;
    return (low * 2.8 + n * 0.22) * swell + voices * 0.075 + clap;
  });
  const ohh = clip(1.45, (t, n, low) => {
    const envelope = Math.sin((Math.PI * t) / 1.45);
    let voices = 0;
    for (let v = 0; v < 5; v++) {
      const phase = TAU * ((165 + v * 8) * t - 25 * t * t);
      voices += Math.sin(phase) * 0.1 + Math.sin(phase * 2) * 0.045;
    }
    return (voices + low * 1.4 + n * 0.05) * envelope;
  });
  const whistle = clip(0.68, (t) => {
    const envelope = Math.sin((Math.PI * t) / 0.68);
    return (
      Math.sin(TAU * (2150 * t + 9 * Math.sin(TAU * 4 * t))) * envelope * 0.26
    );
  });
  return { kick, net, catchBall, crowd, ohh, whistle };
}

export class MatchdayAudio {
  constructor(context) {
    this.context = context;
    this.enabled = false;
    this.disposed = false;
    this.voices = new Set();
    this.buffers = buildMatchSounds(context);
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -16;
    this.limiter.ratio.value = 5;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.master.connect(this.limiter).connect(context.destination);
  }

  async enable() {
    await this.context.resume();
    if (this.disposed) return;
    this.enabled = true;
    this.master.gain.setValueAtTime(0.68, this.context.currentTime);
    if (!this.stadium) this.stadium = this.play("crowd", 0.055, true);
  }

  play(name, volume = 1, loop = false, rate = 1) {
    if (!this.enabled || this.disposed) return null;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffers[name];
    source.loop = loop;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    const voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start();
    return voice;
  }

  release(voice) {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  crowdVolume(volume, seconds) {
    if (!this.stadium) return;
    const param = this.stadium.gain.gain;
    param.cancelScheduledValues(this.context.currentTime);
    param.setTargetAtTime(volume, this.context.currentTime, seconds);
  }

  kick(power) {
    this.play("kick", 0.55 + power * 0.4, false, 0.92 + power * 0.18);
  }
  net(power) {
    this.play("net", 0.65 + power * 0.25);
  }
  catchBall() {
    this.play("catchBall", 0.65);
  }
  cheer() {
    if (!this.enabled) return;
    this.cheering = true;
    this.crowdVolume(0.85, 0.1);
    this.play("whistle", 0.3);
  }
  disappoint() {
    this.stopCheer();
    this.play("ohh", 0.62);
  }
  stopCheer() {
    this.cheering = false;
    this.crowdVolume(0.055, 0.25);
  }
  complete() {
    this.stopCheer();
    this.play("whistle", 0.22, false, 1.12);
  }
  mute() {
    this.enabled = false;
    this.cheering = false;
    this.master.gain.setValueAtTime(0, this.context.currentTime);
    for (const voice of this.voices) {
      voice.source.stop();
      this.release(voice);
    }
    this.stadium = null;
  }
  dispose() {
    this.mute();
    this.disposed = true;
    this.master.disconnect();
    this.limiter.disconnect();
    this.context.close()?.catch(() => {});
  }
}
