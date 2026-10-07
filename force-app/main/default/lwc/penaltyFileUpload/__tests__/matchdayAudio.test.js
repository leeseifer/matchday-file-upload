import { buildMatchSounds, MatchdayAudio } from "../matchdayAudio";
import { audioTestContext } from "./audioTestContext";

describe("Matchday synthesized audio", () => {
  it("builds distinct, finite, audible stereo clips with silent edges and headroom", () => {
    const buffers = buildMatchSounds(audioTestContext());
    for (const buffer of Object.values(buffers)) {
      expect(buffer.numberOfChannels).toBe(2);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        expect([...data].every(Number.isFinite)).toBe(true);
        expect(Math.max(...data.map(Math.abs))).toBeLessThan(0.93);
        expect(
          Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length)
        ).toBeGreaterThan(0.02);
        expect(Math.abs(data[0])).toBeLessThan(0.001);
        expect(Math.abs(data[data.length - 1])).toBeLessThan(0.01);
      }
    }
    expect(buffers.kick.length).toBeLessThan(buffers.net.length);
    expect(buffers.ohh.getChannelData(0)).not.toEqual(
      buffers.crowd.getChannelData(0)
    );
  });

  it("reuses PCM buffers across shots and keeps the crowd going until completion", async () => {
    const context = audioTestContext();
    const sound = new MatchdayAudio(context);
    sound.kick(1);
    expect(context.sources).toHaveLength(0);
    await sound.enable();
    const bufferCount = context.createBuffer.mock.calls.length;
    const crowd = sound.stadium;
    expect(crowd.source.loop).toBe(true);
    sound.kick(0.2);
    sound.kick(1);
    expect(context.sources[2].playbackRate.value).toBeGreaterThan(
      context.sources[1].playbackRate.value
    );
    sound.net(1);
    sound.cheer();
    context.currentTime = 60;
    expect(crowd.source.stop).not.toHaveBeenCalled();
    expect(sound.cheering).toBe(true);
    sound.complete();
    expect(sound.cheering).toBe(false);
    expect(crowd.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.055,
      60,
      0.25
    );
    expect(context.createBuffer).toHaveBeenCalledTimes(bufferCount);
    sound.dispose();
  });

  it("disconnects ended sounds, mutes every active voice, and reuses buffers when unmuted", async () => {
    const context = audioTestContext();
    const sound = new MatchdayAudio(context);
    await sound.enable();
    sound.catchBall();
    const caught = context.sources[1];
    caught.onended();
    expect(caught.disconnect).toHaveBeenCalledTimes(1);
    expect(sound.voices.size).toBe(1);
    sound.disappoint();
    const active = [...sound.voices];
    sound.mute();
    expect(sound.voices.size).toBe(0);
    expect(sound.master.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
    for (const voice of active) {
      expect(voice.source.stop).toHaveBeenCalledTimes(1);
      expect(voice.source.disconnect).toHaveBeenCalledTimes(1);
      expect(voice.gain.disconnect).toHaveBeenCalledTimes(1);
    }
    const before = context.sources.length;
    sound.kick(1);
    sound.cheer();
    expect(context.sources).toHaveLength(before);
    await sound.enable();
    expect(context.createBuffer).toHaveBeenCalledTimes(6);
    expect(sound.voices.size).toBe(1);
    sound.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("does not restart audio if removed during an asynchronous resume", async () => {
    const context = audioTestContext();
    let resume;
    context.resume.mockImplementation(
      () =>
        new Promise((resolve) => {
          resume = resolve;
        })
    );
    const sound = new MatchdayAudio(context);
    const pending = sound.enable();
    sound.dispose();
    resume();
    await pending;
    expect(sound.enabled).toBe(false);
    expect(context.sources).toHaveLength(0);
  });
});
