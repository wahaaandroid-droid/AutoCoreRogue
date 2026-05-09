import type { CombatSoundEvent } from "./combat";
import alertOneUrl from "../assets/sfx/alert_1.ogg";
import alertTwoUrl from "../assets/sfx/alert_2.ogg";
import bladeCustomUrl from "../assets/sfx/blade_custom.mp3";
import defeatOneUrl from "../assets/sfx/defeat_1.ogg";
import explosionOneUrl from "../assets/sfx/explosion_1.ogg";
import explosionTwoUrl from "../assets/sfx/explosion_2.ogg";
import hitOneUrl from "../assets/sfx/hit_1.ogg";
import hitTwoUrl from "../assets/sfx/hit_2.ogg";
import missileOneUrl from "../assets/sfx/missile_1.ogg";
import missileTwoUrl from "../assets/sfx/missile_2.ogg";
import quickBoostCustomUrl from "../assets/sfx/quick_boost_custom.m4a";
import shootBallisticOneUrl from "../assets/sfx/shoot_ballistic_1.ogg";
import shootEnergyOneUrl from "../assets/sfx/shoot_energy_1.ogg";
import shootEnergyTwoUrl from "../assets/sfx/shoot_energy_2.ogg";
import uiConfirmOneUrl from "../assets/sfx/ui_confirm_1.ogg";
import uiConfirmTwoUrl from "../assets/sfx/ui_confirm_2.ogg";
import uiEquipOneUrl from "../assets/sfx/ui_equip_1.ogg";
import uiErrorOneUrl from "../assets/sfx/ui_error_1.ogg";
import uiRepairOneUrl from "../assets/sfx/ui_repair_1.ogg";
import uiRewardOneUrl from "../assets/sfx/ui_reward_1.ogg";
import uiRunCompleteOneUrl from "../assets/sfx/ui_run_complete_1.ogg";
import uiSelectOneUrl from "../assets/sfx/ui_select_1.ogg";
import uiSelectTwoUrl from "../assets/sfx/ui_select_2.ogg";
import uiStageClearOneUrl from "../assets/sfx/ui_stage_clear_1.ogg";
import uiToggleOneUrl from "../assets/sfx/ui_toggle_1.ogg";

type AudioContextCtor = typeof AudioContext;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: AudioContextCtor;
}

interface SampleConfig {
  urls: string[];
  gain: number;
  pitch?: number;
  pitchJitter?: number;
}

export type UiSoundEvent =
  | "select"
  | "confirm"
  | "error"
  | "equip"
  | "toggle"
  | "repair"
  | "reward"
  | "stageClear"
  | "runComplete";

let audioContext: AudioContext | undefined;
let lastPlayedAt = new Map<CombatSoundEvent | UiSoundEvent, number>();
const audioBuffers = new Map<string, Promise<AudioBuffer>>();

const combatSamples: Record<CombatSoundEvent, SampleConfig> = {
  shoot: {
    urls: [shootEnergyOneUrl, shootEnergyTwoUrl, shootBallisticOneUrl],
    gain: 0.16,
    pitchJitter: 0.05,
  },
  shootEnergy: {
    urls: [shootEnergyOneUrl, shootEnergyTwoUrl],
    gain: 0.16,
    pitchJitter: 0.05,
  },
  shootBallistic: {
    urls: [shootBallisticOneUrl],
    gain: 0.18,
    pitchJitter: 0.06,
  },
  missile: {
    urls: [missileOneUrl, missileTwoUrl],
    gain: 0.24,
    pitchJitter: 0.03,
  },
  boost: {
    urls: [quickBoostCustomUrl],
    gain: 0.11,
  },
  boostQuiet: {
    urls: [quickBoostCustomUrl],
    gain: 0.022,
  },
  blade: {
    urls: [bladeCustomUrl],
    gain: 0.23,
    pitchJitter: 0.05,
  },
  hit: {
    urls: [hitOneUrl, hitTwoUrl],
    gain: 0.2,
    pitchJitter: 0.08,
  },
  hitExplosive: {
    urls: [explosionTwoUrl, hitOneUrl],
    gain: 0.26,
    pitchJitter: 0.04,
  },
  explosion: {
    urls: [explosionOneUrl, explosionTwoUrl],
    gain: 0.34,
    pitchJitter: 0.03,
  },
  defeat: {
    urls: [defeatOneUrl, explosionTwoUrl],
    gain: 0.3,
    pitch: 0.88,
  },
  alert: {
    urls: [alertOneUrl, alertTwoUrl],
    gain: 0.28,
  },
};

const uiSamples: Record<UiSoundEvent, SampleConfig> = {
  select: {
    urls: [uiSelectOneUrl, uiSelectTwoUrl],
    gain: 0.12,
    pitchJitter: 0.03,
  },
  confirm: {
    urls: [uiConfirmOneUrl, uiConfirmTwoUrl],
    gain: 0.16,
  },
  error: {
    urls: [uiErrorOneUrl],
    gain: 0.18,
  },
  equip: {
    urls: [uiEquipOneUrl],
    gain: 0.16,
  },
  toggle: {
    urls: [uiToggleOneUrl],
    gain: 0.13,
  },
  repair: {
    urls: [uiRepairOneUrl],
    gain: 0.18,
  },
  reward: {
    urls: [uiRewardOneUrl],
    gain: 0.18,
  },
  stageClear: {
    urls: [uiStageClearOneUrl],
    gain: 0.18,
  },
  runComplete: {
    urls: [uiRunCompleteOneUrl],
    gain: 0.2,
  },
};

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

const sampleUrls = (): string[] => {
  const urls = new Set<string>();
  for (const config of [...Object.values(combatSamples), ...Object.values(uiSamples)]) {
    for (const url of config.urls) {
      urls.add(url);
    }
  }
  return [...urls];
};

const getAudioBuffer = (context: AudioContext, url: string): Promise<AudioBuffer> => {
  const cached = audioBuffers.get(url);
  if (cached) {
    return cached;
  }

  const request = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load audio asset: ${url}`);
      }
      return response.arrayBuffer();
    })
    .then((buffer) => context.decodeAudioData(buffer));
  audioBuffers.set(url, request);
  return request;
};

const preloadAudioSamples = (context: AudioContext): void => {
  for (const url of sampleUrls()) {
    void getAudioBuffer(context, url).catch(() => undefined);
  }
};

export const unlockCombatAudio = (): void => {
  const context = getAudioContext();
  if (!context) {
    return;
  }
  if (context.state === "suspended") {
    void context.resume().then(() => preloadAudioSamples(context));
    return;
  }
  preloadAudioSamples(context);
};

const playSample = (
  context: AudioContext,
  config: SampleConfig,
  fallbackEvent?: CombatSoundEvent,
): void => {
  const url = config.urls[Math.floor(Math.random() * config.urls.length)];
  const pitch = Math.max(
    0.5,
    (config.pitch ?? 1) + (Math.random() * 2 - 1) * (config.pitchJitter ?? 0),
  );

  void getAudioBuffer(context, url)
    .then((buffer) => {
      if (context.state !== "running") {
        return;
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(pitch, context.currentTime);
      gain.gain.setValueAtTime(config.gain, context.currentTime);
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
    })
    .catch(() => {
      if (fallbackEvent) {
        playSynthEvent(context, fallbackEvent);
      }
    });
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

const playNoise = (
  context: AudioContext,
  duration: number,
  gainValue: number,
  frequency = 680,
  q = 1.1,
): void => {
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
  filter.frequency.setValueAtTime(frequency, now);
  filter.Q.setValueAtTime(q, now);
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(now);
  source.stop(now + duration);
};

const playSynthEvent = (context: AudioContext, event: CombatSoundEvent): void => {
  switch (event) {
    case "shoot":
    case "shootEnergy":
      playTone(context, "square", 740, 420, 0.075, 0.035);
      break;
    case "shootBallistic":
      playTone(context, "square", 520, 290, 0.06, 0.04);
      playNoise(context, 0.045, 0.026, 1200, 0.9);
      break;
    case "missile":
      playTone(context, "sawtooth", 190, 92, 0.22, 0.045);
      break;
    case "boost":
    case "boostQuiet": {
      const gainScale = event === "boostQuiet" ? 0.1 : 0.5;
      playTone(context, "sawtooth", 820, 95, 0.21, 0.062 * gainScale);
      playTone(context, "triangle", 1480, 420, 0.11, 0.026 * gainScale);
      playNoise(context, 0.22, 0.058 * gainScale, 1450, 0.74);
      break;
    }
    case "blade":
      playTone(context, "sawtooth", 1180, 260, 0.16, 0.048);
      playTone(context, "triangle", 520, 940, 0.09, 0.032);
      playNoise(context, 0.12, 0.035, 2200, 1.6);
      break;
    case "hit":
      playNoise(context, 0.11, 0.04);
      break;
    case "hitExplosive":
      playTone(context, "sawtooth", 116, 58, 0.18, 0.05);
      playNoise(context, 0.18, 0.06, 210, 0.8);
      break;
    case "explosion":
      playTone(context, "sawtooth", 96, 38, 0.32, 0.074);
      playTone(context, "triangle", 58, 32, 0.36, 0.046);
      playNoise(context, 0.34, 0.082, 150, 0.72);
      playNoise(context, 0.16, 0.048, 1250, 0.86);
      break;
    case "defeat":
      playTone(context, "sawtooth", 220, 55, 0.55, 0.05);
      playNoise(context, 0.24, 0.045);
      break;
    case "alert":
      playTone(context, "sawtooth", 520, 240, 0.24, 0.052);
      playTone(context, "square", 880, 320, 0.18, 0.032);
      playNoise(context, 0.18, 0.035, 980, 1.4);
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
    const cooldown =
      event === "hit" || event === "hitExplosive"
        ? 55
        : event === "shoot" || event === "shootEnergy" || event === "shootBallistic"
          ? 45
          : event === "explosion"
            ? 95
            : 90;
    if (now - previous < cooldown) {
      continue;
    }
    lastPlayedAt.set(event, now);
    playSample(context, combatSamples[event], event);
  }
};

export const playUiSound = (event: UiSoundEvent): void => {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const play = () => {
    const now = performance.now();
    const previous = lastPlayedAt.get(event) ?? 0;
    if (now - previous < 40) {
      return;
    }
    lastPlayedAt.set(event, now);
    playSample(context, uiSamples[event]);
  };

  if (context.state === "suspended") {
    void context.resume().then(play);
    return;
  }
  play();
};
