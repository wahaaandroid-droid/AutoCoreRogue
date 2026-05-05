import {
  DerivedStats,
  LegType,
  Loadout,
  MechBuild,
  Part,
  PartSlot,
  PartStats,
  PilotUpgrades,
  SLOTS,
} from "../types";

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

export const parts: Part[] = [
  {
    id: "head-orbit-s",
    slot: "HEAD",
    name: "ORBIT-S センサー",
    manufacturer: "Kairo Grid",
    description: "射程補正に優れた軽量センサーヘッド。",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 90,
      enCapacity: 70,
      enRegen: 4,
      defense: 12,
      moveSpeed: 3,
      turnSpeed: 18,
      weight: 130,
      range: 24,
    }),
  },
  {
    id: "head-warden",
    slot: "HEAD",
    name: "WARDEN 装甲頭部",
    manufacturer: "Vantline",
    description: "被弾に強く、近距離戦向けの装甲ヘッド。",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 150,
      enCapacity: 35,
      enRegen: 2,
      defense: 28,
      turnSpeed: 8,
      weight: 210,
      range: 8,
    }),
  },
  {
    id: "head-lattice",
    slot: "HEAD",
    name: "LATTICE 予測核",
    manufacturer: "Mira Node",
    description: "AI射撃補正を持つ希少な演算ヘッド。",
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 110,
      enCapacity: 110,
      enRegen: 7,
      defense: 16,
      moveSpeed: 4,
      turnSpeed: 24,
      weight: 170,
      range: 42,
      attack: 8,
    }),
  },
  {
    id: "body-aegis",
    slot: "BODY",
    name: "AEGIS 中量コア",
    manufacturer: "North Arc",
    description: "扱いやすい標準コア。ENと防御のバランスが良い。",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 560,
      enCapacity: 470,
      enRegen: 26,
      defense: 64,
      weight: 1650,
      loadLimit: 2600,
    }),
  },
  {
    id: "body-flux",
    slot: "BODY",
    name: "FLUX 高出力コア",
    manufacturer: "Mira Node",
    description: "EN回復を重視した軽量リアクターコア。",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 440,
      enCapacity: 620,
      enRegen: 40,
      defense: 42,
      moveSpeed: 8,
      turnSpeed: 6,
      weight: 1450,
      loadLimit: 2200,
    }),
  },
  {
    id: "body-citadel",
    slot: "BODY",
    name: "CITADEL 重装コア",
    manufacturer: "Vantline",
    description: "高耐久・高積載の重量コア。",
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 780,
      enCapacity: 390,
      enRegen: 18,
      defense: 92,
      turnSpeed: -8,
      weight: 2250,
      loadLimit: 3700,
      attack: 10,
    }),
  },
  {
    id: "larm-pulse-needle",
    slot: "L-ARM",
    name: "パルスニードル",
    manufacturer: "Kairo Grid",
    description: "短い間隔で撃てる左腕用パルス武器。",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 70,
      enCapacity: 20,
      defense: 8,
      weight: 360,
      range: 245,
      attack: 42,
      cooldown: 0.42,
    }),
  },
  {
    id: "larm-micro-missile",
    slot: "L-ARM",
    name: "マイクロミサイルポッド",
    manufacturer: "North Arc",
    description: "中距離で追尾弾をばらまく左腕兵装。",
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 90,
      enCapacity: 35,
      defense: 10,
      weight: 620,
      range: 360,
      attack: 88,
      cooldown: 1.65,
    }),
  },
  {
    id: "larm-arc-blade",
    slot: "L-ARM",
    name: "アークブレード",
    manufacturer: "Mira Node",
    description: "近距離で大きな一撃を出す放電刃。",
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 85,
      enCapacity: 55,
      defense: 9,
      moveSpeed: 4,
      weight: 430,
      range: 118,
      attack: 126,
      cooldown: 1.05,
    }),
  },
  {
    id: "rarm-rail-carbine",
    slot: "R-ARM",
    name: "レールカービン",
    manufacturer: "Kairo Grid",
    description: "射程と連射のバランスが良い右腕ライフル。",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 80,
      enCapacity: 20,
      defense: 8,
      weight: 520,
      range: 320,
      attack: 64,
      cooldown: 0.72,
    }),
  },
  {
    id: "rarm-burst-cannon",
    slot: "R-ARM",
    name: "バーストキャノン",
    manufacturer: "Vantline",
    description: "重いが威力の高い右腕キャノン。",
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 120,
      enCapacity: 10,
      defense: 16,
      turnSpeed: -6,
      weight: 920,
      range: 390,
      attack: 142,
      cooldown: 1.55,
    }),
  },
  {
    id: "rarm-plasma-splitter",
    slot: "R-ARM",
    name: "プラズマスプリッタ",
    manufacturer: "Mira Node",
    description: "ENを食うが弾速の速い実験兵装。",
    rarity: "elite",
    initial: false,
    stats: stats({
      hp: 95,
      enCapacity: 80,
      enRegen: -2,
      defense: 10,
      weight: 680,
      range: 350,
      attack: 96,
      cooldown: 0.58,
    }),
  },
  {
    id: "legs-biped-strider",
    slot: "LEGS",
    name: "2脚 ストライダー",
    manufacturer: "North Arc",
    description: "バランス型。旋回と速度が扱いやすい。",
    legType: "biped",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 170,
      enCapacity: 50,
      enRegen: 4,
      defense: 24,
      moveSpeed: 128,
      turnSpeed: 92,
      weight: 890,
      loadLimit: 3300,
    }),
  },
  {
    id: "legs-quad-anchor",
    slot: "LEGS",
    name: "4脚 アンカー",
    manufacturer: "Vantline",
    description: "安定射撃型。射程と防御を底上げする。",
    legType: "quad",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 230,
      enCapacity: 35,
      defense: 38,
      moveSpeed: 98,
      turnSpeed: 76,
      weight: 1240,
      loadLimit: 4300,
      range: 28,
    }),
  },
  {
    id: "legs-reverse-kite",
    slot: "LEGS",
    name: "逆関節 カイト",
    manufacturer: "Kairo Grid",
    description: "回避・ジャンプ型。ブースト回避が軽い。",
    legType: "reverse",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 145,
      enCapacity: 80,
      enRegen: 8,
      defense: 16,
      moveSpeed: 154,
      turnSpeed: 112,
      weight: 820,
      loadLimit: 2850,
    }),
  },
  {
    id: "legs-tank-bastion",
    slot: "LEGS",
    name: "タンク バスティオン",
    manufacturer: "Vantline",
    description: "高耐久・高火力・低機動の履帯脚。",
    legType: "tank",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 360,
      enCapacity: 30,
      defense: 66,
      moveSpeed: 68,
      turnSpeed: 52,
      weight: 1700,
      loadLimit: 6200,
      attack: 20,
    }),
  },
  {
    id: "legs-hover-drift",
    slot: "LEGS",
    name: "ホバー ドリフト",
    manufacturer: "Mira Node",
    description: "中距離・地形無視型。EN容量に優れる。",
    legType: "hover",
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 190,
      enCapacity: 150,
      enRegen: 9,
      defense: 24,
      moveSpeed: 118,
      turnSpeed: 88,
      weight: 1080,
      loadLimit: 3600,
      range: 16,
    }),
  },
  {
    id: "legs-reverse-vault",
    slot: "LEGS",
    name: "逆関節 ヴォルト",
    manufacturer: "Kairo Grid",
    description: "さらに攻撃的な跳躍脚。軽量武器と相性が良い。",
    legType: "reverse",
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 170,
      enCapacity: 110,
      enRegen: 11,
      defense: 18,
      moveSpeed: 168,
      turnSpeed: 124,
      weight: 920,
      loadLimit: 3000,
      attack: 8,
    }),
  },
];

export const baseUpgrades: PilotUpgrades = {
  hp: 0,
  enCapacity: 0,
  enRegen: 0,
  defense: 0,
  attack: 0,
  cooldownMultiplier: 1,
};

export const initialLoadout: Loadout = {
  HEAD: "head-orbit-s",
  BODY: "body-aegis",
  "L-ARM": "larm-pulse-needle",
  "R-ARM": "rarm-rail-carbine",
  LEGS: "legs-biped-strider",
};

export const initialUnlockedPartIds = parts
  .filter((part) => part.initial)
  .map((part) => part.id);

export const getPartById = (partId: string): Part => {
  const part = parts.find((item) => item.id === partId);
  if (!part) {
    throw new Error(`Unknown part: ${partId}`);
  }
  return part;
};

export const partsBySlot = (slot: PartSlot): Part[] =>
  parts.filter((part) => part.slot === slot);

export const buildFromLoadout = (loadout: Loadout): MechBuild =>
  SLOTS.reduce((build, slot) => {
    build[slot] = getPartById(loadout[slot]);
    return build;
  }, {} as MechBuild);

const legLabels: Record<LegType, string> = {
  biped: "2脚",
  quad: "4脚",
  reverse: "逆関節",
  tank: "タンク",
  hover: "ホバー",
};

export const getLegLabel = (legType: LegType): string => legLabels[legType];

export const calculateDerivedStats = (
  loadout: Loadout,
  upgrades: PilotUpgrades,
): DerivedStats => {
  const build = buildFromLoadout(loadout);
  const selected = SLOTS.map((slot) => build[slot]);
  const total = selected.reduce<PartStats>(
    (sum, part) => ({
      hp: sum.hp + part.stats.hp,
      enCapacity: sum.enCapacity + part.stats.enCapacity,
      enRegen: sum.enRegen + part.stats.enRegen,
      defense: sum.defense + part.stats.defense,
      moveSpeed: sum.moveSpeed + part.stats.moveSpeed,
      turnSpeed: sum.turnSpeed + part.stats.turnSpeed,
      weight: sum.weight + part.stats.weight,
      loadLimit: sum.loadLimit + part.stats.loadLimit,
      range: sum.range + part.stats.range,
      attack: sum.attack + part.stats.attack,
      cooldown: sum.cooldown + part.stats.cooldown,
    }),
    { ...zeroStats },
  );

  const right = build["R-ARM"];
  const left = build["L-ARM"];
  const legs = build.LEGS;
  const legType = legs.legType ?? "biped";
  const loadLimit = Math.max(1, total.loadLimit);
  const overloadRatio = Math.max(0, (total.weight - loadLimit) / loadLimit);
  const overloadPenalty = 1 + overloadRatio * 0.7;
  const mobilityPenalty = Math.max(0.45, 1 - overloadRatio * 0.45);
  const legCooldownBonus = legType === "quad" ? 0.94 : legType === "tank" ? 1.08 : 1;
  const dodgeMoveBonus = legType === "reverse" ? 1.08 : legType === "hover" ? 1.04 : 1;

  return {
    hpMax: Math.round(total.hp + upgrades.hp),
    enMax: Math.round(total.enCapacity + upgrades.enCapacity),
    enRegen: Math.max(8, total.enRegen + upgrades.enRegen),
    defense: Math.max(0, Math.round(total.defense + upgrades.defense)),
    moveSpeed: Math.round(Math.max(46, total.moveSpeed * mobilityPenalty * dodgeMoveBonus)),
    turnSpeed: Math.round(Math.max(34, total.turnSpeed * mobilityPenalty)),
    weight: Math.round(total.weight),
    loadLimit: Math.round(loadLimit),
    overloadRatio,
    legType,
    rightRange: Math.round(right.stats.range + total.range - right.stats.range),
    leftRange: Math.round(left.stats.range + total.range - left.stats.range),
    rightAttack: Math.round(right.stats.attack + total.attack - right.stats.attack + upgrades.attack),
    leftAttack: Math.round(left.stats.attack + total.attack - left.stats.attack + upgrades.attack),
    rightCooldown: Math.max(
      0.18,
      right.stats.cooldown * upgrades.cooldownMultiplier * legCooldownBonus * overloadPenalty,
    ),
    leftCooldown: Math.max(
      0.2,
      left.stats.cooldown * upgrades.cooldownMultiplier * legCooldownBonus * overloadPenalty,
    ),
    missileAttack: Math.round(58 + total.attack * 0.45 + upgrades.attack * 0.7),
    missileCooldown: Math.max(1.25, 2.8 * upgrades.cooldownMultiplier * overloadPenalty),
  };
};
