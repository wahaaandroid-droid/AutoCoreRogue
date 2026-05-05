import type { CombatSoundEvent } from "./combat";

type AudioContextCtor = typeof AudioContext;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: AudioContextCtor;
}

let audioContext: AudioContext | undefined;
let lastPlayedAt = new Map<CombatSoundEvent, number>();

const getAudioContext = (): AudioContext | undefined => {
  if (audioContext) {
    return audioContext;
  }

  const AudioCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioCtor) {
    return undefined;
  }

  audioContext = new AudioCtor();
  return audioContext;
};

export const unlockCombatAudio = (): void => {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume();
  }
};

const playTone = (
  context: AudioContext,
  type: OscillatorType,
  startFrequency: number,
  endFrequency: number,
  duration: number,
  gainValue: number,
): void => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
};

const playNoise = (context: AudioContext, duration: number, gainValue: number): void => {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const now = context.currentTime;

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(680, now);
  filter.Q.setValueAtTime(1.1, now);
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(now);
  source.stop(now + duration);
};

const playEvent = (context: AudioContext, event: CombatSoundEvent): void => {
  switch (event) {
    case "shoot":
      playTone(context, "square", 740, 420, 0.075, 0.035);
      break;
    case "missile":
      playTone(context, "sawtooth", 190, 92, 0.22, 0.045);
      break;
    case "boost":
      playTone(context, "sawtooth", 120, 68, 0.18, 0.04);
      playNoise(context, 0.16, 0.03);
      break;
    case "hit":
      playNoise(context, 0.11, 0.04);
      break;
    case "defeat":
      playTone(context, "sawtooth", 220, 55, 0.55, 0.05);
      playNoise(context, 0.24, 0.045);
      break;
  }
};

export const playCombatSoundEvents = (events: CombatSoundEvent[]): void => {
  if (events.length === 0) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }
  if (context.state === "suspended") {
    void context.resume();
    return;
  }

  const now = performance.now();
  for (const event of [...new Set(events)]) {
    const previous = lastPlayedAt.get(event) ?? 0;
    const cooldown = event === "hit" ? 55 : event === "shoot" ? 45 : 90;
    if (now - previous < cooldown) {
      continue;
    }
    lastPlayedAt.set(event, now);
    playEvent(context, event);
  }
};
