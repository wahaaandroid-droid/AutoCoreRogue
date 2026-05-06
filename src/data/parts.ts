import {
  BaseFrameId,
  DerivedStats,
  EQUIP_SLOTS,
  EquipSlot,
  LegType,
  Loadout,
  MechBuild,
  Part,
  PartInventory,
  PartSlot,
  PartStats,
  PilotUpgrades,
  WeaponHardpoint,
  WeaponKind,
  WeaponStats,
} from "../types";
import { getBaseFrameById, initialFrameId } from "./frames";

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

const weaponSlotLabels: Record<EquipSlot, string> = {
  HEAD: "頭部",
  BODY: "コア",
  "L-ARM": "左腕",
  "R-ARM": "右腕",
  "L-SHOULDER": "左肩",
  "R-SHOULDER": "右肩",
  "B-SHOULDER": "両肩",
};

const weaponKindLabels: Record<WeaponKind, string> = {
  rifle: "ライフル",
  sniperRifle: "スナイパーライフル",
  machineGun: "マシンガン",
  rocket: "ロケット",
  grenade: "グレネード",
  missile: "ミサイル",
  pulse: "パルス",
  blade: "ブレード",
};

const weaponHardpoints: Record<EquipSlot, WeaponHardpoint | undefined> = {
  HEAD: undefined,
  BODY: undefined,
  "L-ARM": "leftArm",
  "R-ARM": "rightArm",
  "L-SHOULDER": "leftShoulder",
  "R-SHOULDER": "rightShoulder",
  "B-SHOULDER": "bothShoulders",
};

export const getSlotLabel = (slot: PartSlot): string =>
  slot === "LEGS" ? "脚部" : weaponSlotLabels[slot];

export const getWeaponKindLabel = (kind: WeaponKind): string => weaponKindLabels[kind];

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
    weaponResource: "energy",
    weaponKind: "pulse",
    energyCost: 5,
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
    id: "larm-solid-shredder",
    slot: "L-ARM",
    name: "ソリッドシュレッダー",
    manufacturer: "Vantline",
    description: "実弾を消費する左腕用軽機関砲。ステージ開始時に弾薬全回復。",
    weaponResource: "ballistic",
    weaponKind: "machineGun",
    ammoCapacity: 72,
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 80,
      defense: 10,
      weight: 510,
      range: 275,
      attack: 36,
      cooldown: 0.28,
    }),
  },
  {
    id: "larm-micro-missile",
    slot: "L-ARM",
    name: "マイクロミサイルポッド",
    manufacturer: "North Arc",
    description: "中距離で追尾弾をばらまく左腕兵装。",
    weaponResource: "ballistic",
    weaponKind: "missile",
    ammoCapacity: 12,
    rarity: "rare",
    initial: true,
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
    weaponResource: "energy",
    weaponKind: "blade",
    energyCost: 8,
    rarity: "rare",
    initial: true,
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
    weaponResource: "energy",
    weaponKind: "rifle",
    energyCost: 6,
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
    id: "rarm-kinetic-rifle",
    slot: "R-ARM",
    name: "キネティックライフル",
    manufacturer: "North Arc",
    description: "実弾を消費する右腕ライフル。ENを節約しながら安定射撃できる。",
    weaponResource: "ballistic",
    weaponKind: "rifle",
    ammoCapacity: 48,
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 92,
      defense: 9,
      weight: 610,
      range: 335,
      attack: 58,
      cooldown: 0.62,
    }),
  },
  {
    id: "rarm-longshot-sniper",
    slot: "R-ARM",
    name: "ロングショットSR",
    manufacturer: "Kairo Grid",
    description: "遠距離から高弾速の一撃を通す右腕スナイパーライフル。",
    weaponResource: "ballistic",
    weaponKind: "sniperRifle",
    ammoCapacity: 22,
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 74,
      defense: 6,
      turnSpeed: -4,
      weight: 700,
      range: 510,
      attack: 112,
      cooldown: 1.38,
    }),
  },
  {
    id: "rarm-burst-cannon",
    slot: "R-ARM",
    name: "バーストキャノン",
    manufacturer: "Vantline",
    description: "重いが威力の高い右腕キャノン。",
    weaponResource: "ballistic",
    weaponKind: "rocket",
    blastRadius: 36,
    ammoCapacity: 18,
    rarity: "rare",
    initial: true,
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
    description: "EN消費で高弾速を出す実験兵装。",
    weaponResource: "energy",
    weaponKind: "pulse",
    energyCost: 9,
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
    id: "lshoulder-harrier-rocket",
    slot: "L-SHOULDER",
    name: "HARRIER 左肩ロケット",
    manufacturer: "North Arc",
    description: "中遠距離から直進ロケットを撃ち込む左肩武装。",
    weaponResource: "ballistic",
    weaponKind: "rocket",
    blastRadius: 42,
    ammoCapacity: 14,
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 64,
      defense: 5,
      turnSpeed: -3,
      weight: 620,
      range: 420,
      attack: 118,
      cooldown: 1.65,
    }),
  },
  {
    id: "lshoulder-sentinel-sniper",
    slot: "L-SHOULDER",
    name: "SENTINEL 肩部狙撃砲",
    manufacturer: "Kairo Grid",
    description: "静止砲撃に向いた左肩用スナイパーライフル。",
    weaponResource: "energy",
    weaponKind: "sniperRifle",
    energyCost: 14,
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 50,
      enCapacity: 34,
      defense: 4,
      turnSpeed: -5,
      weight: 560,
      range: 560,
      attack: 132,
      cooldown: 1.72,
    }),
  },
  {
    id: "rshoulder-lynx-mg",
    slot: "R-SHOULDER",
    name: "LYNX 右肩マシンガン",
    manufacturer: "Vantline",
    description: "近中距離で弾幕を張る右肩マシンガン。",
    weaponResource: "ballistic",
    weaponKind: "machineGun",
    ammoCapacity: 120,
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 56,
      defense: 4,
      weight: 470,
      range: 285,
      attack: 24,
      cooldown: 0.16,
    }),
  },
  {
    id: "rshoulder-viper-missile",
    slot: "R-SHOULDER",
    name: "VIPER 右肩ミサイル",
    manufacturer: "North Arc",
    description: "回避行動中でも追尾弾で圧をかける右肩ミサイルポッド。",
    weaponResource: "ballistic",
    weaponKind: "missile",
    ammoCapacity: 16,
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 62,
      enCapacity: 20,
      defense: 5,
      weight: 540,
      range: 390,
      attack: 76,
      cooldown: 1.08,
    }),
  },
  {
    id: "bshoulder-crater-grenade",
    slot: "B-SHOULDER",
    name: "CRATER 両肩グレネード",
    manufacturer: "Vantline",
    description: "両肩で反動を受け止め、着弾点を範囲爆破する重グレネード。",
    weaponResource: "ballistic",
    weaponKind: "grenade",
    blastRadius: 76,
    ammoCapacity: 8,
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 110,
      defense: 12,
      moveSpeed: -4,
      turnSpeed: -8,
      weight: 980,
      range: 365,
      attack: 152,
      cooldown: 2.35,
    }),
  },
  {
    id: "bshoulder-siege-rocket",
    slot: "B-SHOULDER",
    name: "SIEGE 両肩ロケット",
    manufacturer: "Mira Node",
    description: "長射程の連装ロケット。単体火力と制圧力を両立する。",
    weaponResource: "ballistic",
    weaponKind: "rocket",
    blastRadius: 52,
    ammoCapacity: 10,
    rarity: "elite",
    initial: false,
    stats: stats({
      hp: 82,
      enRegen: -2,
      defense: 7,
      turnSpeed: -6,
      weight: 860,
      range: 470,
      attack: 138,
      cooldown: 1.85,
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
  "L-SHOULDER": "lshoulder-harrier-rocket",
  "R-SHOULDER": "rshoulder-lynx-mg",
  "B-SHOULDER": "bshoulder-crater-grenade",
};

export const createInitialLoadoutForFrame = (frameId: BaseFrameId): Loadout => {
  switch (frameId) {
    case "light":
      return {
        HEAD: "head-orbit-s",
        BODY: "body-flux",
        "L-ARM": "larm-arc-blade",
        "R-ARM": "rarm-kinetic-rifle",
        "L-SHOULDER": "lshoulder-harrier-rocket",
        "R-SHOULDER": "rshoulder-lynx-mg",
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "heavy":
      return {
        HEAD: "head-warden",
        BODY: "body-aegis",
        "L-ARM": "larm-solid-shredder",
        "R-ARM": "rarm-burst-cannon",
        "L-SHOULDER": "lshoulder-harrier-rocket",
        "R-SHOULDER": "rshoulder-lynx-mg",
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "quad":
      return {
        HEAD: "head-orbit-s",
        BODY: "body-aegis",
        "L-ARM": "larm-micro-missile",
        "R-ARM": "rarm-longshot-sniper",
        "L-SHOULDER": "lshoulder-harrier-rocket",
        "R-SHOULDER": "rshoulder-lynx-mg",
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "tank":
      return {
        HEAD: "head-warden",
        BODY: "body-aegis",
        "L-ARM": "larm-solid-shredder",
        "R-ARM": "rarm-burst-cannon",
        "L-SHOULDER": "lshoulder-harrier-rocket",
        "R-SHOULDER": "rshoulder-lynx-mg",
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "medium":
    default:
      return { ...initialLoadout };
  }
};

export const initialUnlockedPartIds = parts
  .filter((part) => part.initial)
  .map((part) => part.id);

export const starterKitPartIds: string[] = parts
  .filter((part) => part.initial && part.slot !== "LEGS")
  .map((part) => part.id);

export const createEmptyPartInventory = (): PartInventory => ({});

export const grantStarterKit = (inventory: PartInventory): PartInventory => {
  const next = { ...inventory };
  for (const partId of starterKitPartIds) {
    next[partId] = (next[partId] ?? 0) + 1;
  }
  return next;
};

export const createInitialPartInventory = (): PartInventory => grantStarterKit(createEmptyPartInventory());

export const getPartById = (partId: string): Part => {
  const part = parts.find((item) => item.id === partId);
  if (!part) {
    throw new Error(`Unknown part: ${partId}`);
  }
  return part;
};

export const partsBySlot = (slot: PartSlot): Part[] =>
  parts.filter((part) => part.slot === slot);

export const playableParts = (): Part[] =>
  parts.filter((part) => part.slot !== "LEGS");

export const buildFromLoadout = (loadout: Loadout): MechBuild =>
  EQUIP_SLOTS.reduce((build, slot) => {
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
  frameId: BaseFrameId = initialFrameId,
): DerivedStats => {
  const build = buildFromLoadout(loadout);
  const frame = getBaseFrameById(frameId);
  const selected = EQUIP_SLOTS.map((slot) => build[slot]);
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
    { ...frame.stats },
  );

  const right = build["R-ARM"];
  const left = build["L-ARM"];
  const weaponEntries = EQUIP_SLOTS
    .map((slot) => ({ slot, part: build[slot], hardpoint: weaponHardpoints[slot] }))
    .filter((entry): entry is { slot: EquipSlot; part: Part; hardpoint: WeaponHardpoint } =>
      Boolean(entry.hardpoint),
    );
  const legType = frame.legType;
  const loadLimit = Math.max(1, total.loadLimit);
  const overloadRatio = Math.max(0, (total.weight - loadLimit) / loadLimit);
  const overloadPenalty = 1 + overloadRatio * 0.7;
  const mobilityPenalty = Math.max(0.45, 1 - overloadRatio * 0.45);
  const legCooldownBonus = legType === "quad" ? 0.94 : legType === "tank" ? 1.08 : 1;
  const dodgeMoveBonus = legType === "reverse" ? 1.08 : legType === "hover" ? 1.04 : 1;
  const frameCooldownOffset = frame.stats.cooldown;
  const cooldownPenalty = Math.max(0.82, legCooldownBonus * overloadPenalty + frameCooldownOffset);
  const weaponRange = weaponEntries.reduce((sum, entry) => sum + entry.part.stats.range, 0);
  const weaponAttack = weaponEntries.reduce((sum, entry) => sum + entry.part.stats.attack, 0);
  const supportRange = total.range - weaponRange;
  const supportAttack = total.attack - weaponAttack;
  const weaponFor = (slot: EquipSlot, part: Part, hardpoint: WeaponHardpoint): WeaponStats => ({
    hardpoint,
    slot,
    partId: part.id,
    label: weaponSlotLabels[slot],
    range: Math.round(part.stats.range + supportRange),
    attack: Math.round(part.stats.attack + supportAttack + upgrades.attack),
    cooldown: Math.max(
      hardpoint === "bothShoulders" ? 0.85 : hardpoint.includes("Shoulder") ? 0.4 : 0.18,
      part.stats.cooldown * upgrades.cooldownMultiplier * cooldownPenalty,
    ),
    resource: part.weaponResource ?? "energy",
    weaponKind: part.weaponKind ?? "rifle",
    energyCost: part.energyCost ?? (hardpoint.includes("Shoulder") ? 10 : 6),
    ammoMax: part.weaponResource === "ballistic" ? part.ammoCapacity ?? 24 : 0,
    blastRadius: part.blastRadius ?? (part.weaponKind === "grenade" ? 70 : part.weaponKind === "rocket" ? 42 : 0),
  });
  const weapons = weaponEntries.map((entry) => weaponFor(entry.slot, entry.part, entry.hardpoint));

  return {
    frameId,
    frameName: frame.name,
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
    rightRange: Math.round(right.stats.range + supportRange),
    leftRange: Math.round(left.stats.range + supportRange),
    rightAttack: Math.round(right.stats.attack + supportAttack + upgrades.attack),
    leftAttack: Math.round(left.stats.attack + supportAttack + upgrades.attack),
    rightCooldown: Math.max(
      0.18,
      right.stats.cooldown * upgrades.cooldownMultiplier * cooldownPenalty,
    ),
    leftCooldown: Math.max(
      0.2,
      left.stats.cooldown * upgrades.cooldownMultiplier * cooldownPenalty,
    ),
    rightResource: right.weaponResource ?? "energy",
    leftResource: left.weaponResource ?? "energy",
    rightWeaponKind: right.weaponKind ?? "rifle",
    leftWeaponKind: left.weaponKind ?? "rifle",
    rightEnergyCost: right.energyCost ?? 6,
    leftEnergyCost: left.energyCost ?? 5,
    rightAmmoMax: right.weaponResource === "ballistic" ? right.ammoCapacity ?? 32 : 0,
    leftAmmoMax: left.weaponResource === "ballistic" ? left.ammoCapacity ?? 32 : 0,
    weapons,
  };
};

export const equippedPartCounts = (
  loadouts: Loadout[],
  unlockedUnitCount: number,
): PartInventory => {
  const counts: PartInventory = {};
  for (let unitIndex = 0; unitIndex < unlockedUnitCount; unitIndex += 1) {
    const loadout = loadouts[unitIndex];
    if (!loadout) {
      continue;
    }
    for (const slot of EQUIP_SLOTS) {
      const partId = loadout[slot];
      counts[partId] = (counts[partId] ?? 0) + 1;
    }
  }
  return counts;
};

export const unitsEquippingPart = (
  loadouts: Loadout[],
  unlockedUnitCount: number,
  partId: string,
): number[] => {
  const units: number[] = [];
  for (let unitIndex = 0; unitIndex < unlockedUnitCount; unitIndex += 1) {
    const loadout = loadouts[unitIndex];
    if (loadout && EQUIP_SLOTS.some((slot: EquipSlot) => loadout[slot] === partId)) {
      units.push(unitIndex);
    }
  }
  return units;
};
