export function audioTestContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    cancelScheduledValues: jest.fn()
  });
  const node = () => ({
    connect: jest.fn(function () {
      return this;
    }),
    disconnect: jest.fn(),
    gain: param(),
    playbackRate: param(),
    threshold: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    start: jest.fn(),
    stop: jest.fn()
  });
  const sources = [];
  return {
    sources,
    sampleRate: 8000,
    currentTime: 0,
    destination: node(),
    resume: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    createGain: jest.fn(node),
    createDynamicsCompressor: jest.fn(node),
    createBufferSource: jest.fn(() => {
      const source = node();
      sources.push(source);
      return source;
    }),
    createBuffer: jest.fn((channels, length, sampleRate) => {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length)
      );
      return {
        length,
        sampleRate,
        numberOfChannels: channels,
        getChannelData: (index) => data[index]
      };
    })
  };
}
