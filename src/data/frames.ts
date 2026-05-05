import { BaseFrame, BaseFrameId, PartStats } from "../types";

const zeroStats: PartStats = {
  hp: 0,
  enCapacity: 0,
  enRegen: 0,
  defense: 0,
  moveSpeed: 0,
  turnSpeed: 0,
  weight: 0,
  loadLimit: 0,
  range: 0,
  attack: 0,
  cooldown: 0,
};

const stats = (value: Partial<PartStats>): PartStats => ({
  ...zeroStats,
  ...value,
});

export const baseFrames: BaseFrame[] = [
  {
    id: "light",
    name: "KITE 軽量型",
    typeLabel: "LIGHT",
    role: "回避 / 近接",
    description: "低耐久だが速度とブースト回避に優れる先行フレーム。",
    legType: "reverse",
    color: "#8dff6a",
    accent: "green",
    stats: stats({
      hp: 145,
      enCapacity: 90,
      enRegen: 10,
      defense: 16,
      moveSpeed: 164,
      turnSpeed: 122,
      weight: 820,
      loadLimit: 3000,
      attack: 6,
    }),
  },
  {
    id: "medium",
    name: "STRIDER 中量型",
    typeLabel: "MEDIUM",
    role: "汎用 / 射撃",
    description: "扱いやすさを重視した標準フレーム。初回選択の基準機。",
    legType: "biped",
    color: "#8ad8ff",
    accent: "blue",
    stats: stats({
      hp: 190,
      enCapacity: 60,
      enRegen: 6,
      defense: 26,
      moveSpeed: 126,
      turnSpeed: 94,
      weight: 920,
      loadLimit: 3400,
      range: 10,
    }),
  },
  {
    id: "heavy",
    name: "WARDEN 重量型",
    typeLabel: "HEAVY",
    role: "高火力 / 装甲",
    description: "鈍い代わりに耐久と積載を確保した重装二脚フレーム。",
    legType: "biped",
    color: "#ffcf66",
    accent: "orange",
    stats: stats({
      hp: 310,
      enCapacity: 42,
      enRegen: 3,
      defense: 58,
      moveSpeed: 82,
      turnSpeed: 58,
      weight: 1580,
      loadLimit: 5200,
      attack: 18,
    }),
  },
  {
    id: "quad",
    name: "ANCHOR 4脚型",
    typeLabel: "QUAD",
    role: "制圧 / 長射程",
    description: "横移動と射撃安定に強い砲戦フレーム。重火器と好相性。",
    legType: "quad",
    color: "#c878ff",
    accent: "purple",
    stats: stats({
      hp: 250,
      enCapacity: 50,
      enRegen: 4,
      defense: 42,
      moveSpeed: 96,
      turnSpeed: 78,
      weight: 1280,
      loadLimit: 4500,
      range: 34,
      cooldown: -0.05,
    }),
  },
  {
    id: "tank",
    name: "BASTION タンク型",
    typeLabel: "TANK",
    role: "超耐久 / 高積載",
    description: "回避は苦手だが、厚い装甲と火力で前線を支える履帯フレーム。",
    legType: "tank",
    color: "#ff9d42",
    accent: "orange",
    stats: stats({
      hp: 410,
      enCapacity: 36,
      enRegen: 2,
      defense: 76,
      moveSpeed: 64,
      turnSpeed: 48,
      weight: 1820,
      loadLimit: 6600,
      attack: 24,
      cooldown: 0.08,
    }),
  },
];

export const initialFrameId: BaseFrameId = "medium";

export const getBaseFrameById = (frameId: BaseFrameId): BaseFrame => {
  const frame = baseFrames.find((item) => item.id === frameId);
  if (!frame) {
    throw new Error(`Unknown base frame: ${frameId}`);
  }
  return frame;
};

export const frameChoicesForUnit = (unitIndex: number): BaseFrame[] =>
  unitIndex === 0
    ? baseFrames.filter((frame) => frame.id === "light" || frame.id === "medium" || frame.id === "heavy")
    : baseFrames;
