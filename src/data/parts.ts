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
  WeaponFirePattern,
  WeaponHardpoint,
  WeaponKind,
  WeaponResource,
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
  boostSpeed: 0,
  quickBoostThrust: 0,
  quickBoostReload: 0,
  quickBoostCost: 0,
  quickBoostDuration: 0,
  quickBoostIdealWeight: 0,
};

const stats = (value: Partial<PartStats>): PartStats => ({
  ...zeroStats,
  ...value,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const weaponSlotLabels: Record<EquipSlot, string> = {
  HEAD: "頭部",
  BODY: "コア",
  BOOSTER: "ブースター",
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
  beamLaser: "照射レーザー",
  rocket: "ロケット",
  grenade: "グレネード",
  missile: "ミサイル",
  pulse: "パルス",
  blade: "ブレード",
};

const weaponHardpoints: Record<EquipSlot, WeaponHardpoint | undefined> = {
  HEAD: undefined,
  BODY: undefined,
  BOOSTER: undefined,
  "L-ARM": "leftArm",
  "R-ARM": "rightArm",
  "L-SHOULDER": "leftShoulder",
  "R-SHOULDER": "rightShoulder",
  "B-SHOULDER": "bothShoulders",
};

const defaultMagazineSize = (kind: WeaponKind): number => {
  switch (kind) {
    case "machineGun":
      return 36;
    case "beamLaser":
      return 0;
    case "sniperRifle":
      return 5;
    case "rocket":
      return 4;
    case "grenade":
      return 2;
    case "missile":
      return 4;
    case "rifle":
    default:
      return 10;
  }
};

const defaultReloadTime = (kind: WeaponKind, hardpoint: WeaponHardpoint): number => {
  const shoulderLoad = hardpoint.includes("Shoulder") ? 0.22 : 0;
  switch (kind) {
    case "machineGun":
      return 1.35 + shoulderLoad;
    case "beamLaser":
      return 0;
    case "sniperRifle":
      return 1.65 + shoulderLoad;
    case "rocket":
      return 1.9 + shoulderLoad;
    case "grenade":
      return 2.45 + shoulderLoad;
    case "missile":
      return 1.65 + shoulderLoad;
    case "rifle":
    default:
      return 1.08 + shoulderLoad;
  }
};

const defaultHeatPerShot = (kind: WeaponKind, energyCost: number): number => {
  switch (kind) {
    case "pulse":
      return Math.max(14, energyCost * 2.5);
    case "beamLaser":
      return Math.max(12, energyCost * 2.1);
    case "sniperRifle":
      return Math.max(25, energyCost * 2.3);
    case "blade":
      return Math.max(28, energyCost * 2.2);
    case "machineGun":
      return Math.max(10, energyCost * 2);
    case "rifle":
    default:
      return Math.max(16, energyCost * 2.2);
  }
};

const defaultCoolingRate = (kind: WeaponKind): number =>
  kind === "sniperRifle" ? 24 : kind === "blade" ? 30 : kind === "pulse" ? 34 : kind === "beamLaser" ? 28 : 31;

const defaultFirePattern = (kind: WeaponKind, resource: WeaponResource): WeaponFirePattern =>
  resource === "energy" && kind === "beamLaser" ? "sustain" :
  resource === "ballistic" && kind === "machineGun" ? "sustain" : "single";

export const EMPTY_LEFT_ARM_PART_ID = "empty-larm";
export const EMPTY_RIGHT_ARM_PART_ID = "empty-rarm";
export const EMPTY_LEFT_SHOULDER_PART_ID = "empty-lshoulder";
export const EMPTY_RIGHT_SHOULDER_PART_ID = "empty-rshoulder";
export const EMPTY_BOTH_SHOULDER_PART_ID = "empty-bshoulder";

const freePartIds = new Set<string>([
  EMPTY_LEFT_ARM_PART_ID,
  EMPTY_RIGHT_ARM_PART_ID,
  EMPTY_LEFT_SHOULDER_PART_ID,
  EMPTY_RIGHT_SHOULDER_PART_ID,
  EMPTY_BOTH_SHOULDER_PART_ID,
]);

export const isFreePart = (partId: string): boolean => freePartIds.has(partId);

const isBothShoulderWeaponEquipped = (loadout: Loadout): boolean =>
  !isFreePart(loadout["B-SHOULDER"]);

const isSideShoulderSlot = (slot: EquipSlot): boolean =>
  slot === "L-SHOULDER" || slot === "R-SHOULDER";

export const isShoulderSlotBlocked = (loadout: Loadout, slot: EquipSlot): boolean =>
  isSideShoulderSlot(slot) && isBothShoulderWeaponEquipped(loadout);

export const normalizeShoulderLoadout = (loadout: Loadout): Loadout => {
  if (isBothShoulderWeaponEquipped(loadout)) {
    return {
      ...loadout,
      "L-SHOULDER": EMPTY_LEFT_SHOULDER_PART_ID,
      "R-SHOULDER": EMPTY_RIGHT_SHOULDER_PART_ID,
    };
  }

  return {
    ...loadout,
    "B-SHOULDER": EMPTY_BOTH_SHOULDER_PART_ID,
  };
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
    id: "booster-sparrow",
    slot: "BOOSTER",
    name: "SPARROW 軽量ブースター",
    manufacturer: "Kairo Grid",
    description: "軽量機向けの低燃費ブースター。クイックブーストの再使用が短い。",
    rarity: "common",
    initial: true,
    stats: stats({
      enCapacity: 28,
      enRegen: 2,
      weight: 250,
      boostSpeed: 268,
      quickBoostThrust: 250,
      quickBoostReload: 0.42,
      quickBoostCost: 12,
      quickBoostDuration: 0.18,
      quickBoostIdealWeight: 3600,
    }),
  },
  {
    id: "booster-vanguard",
    slot: "BOOSTER",
    name: "VANGUARD 標準ブースター",
    manufacturer: "North Arc",
    description: "推力と消費ENのバランスが良い標準ブースター。",
    rarity: "common",
    initial: true,
    stats: stats({
      enCapacity: 20,
      weight: 340,
      boostSpeed: 248,
      quickBoostThrust: 274,
      quickBoostReload: 0.5,
      quickBoostCost: 16,
      quickBoostDuration: 0.18,
      quickBoostIdealWeight: 4700,
    }),
  },
  {
    id: "booster-drift",
    slot: "BOOSTER",
    name: "DRIFT 巡航ブースター",
    manufacturer: "Mira Node",
    description: "ブースト速度を伸ばすホバー・中距離戦向けブースター。",
    rarity: "rare",
    initial: false,
    stats: stats({
      enCapacity: 54,
      enRegen: 3,
      weight: 430,
      boostSpeed: 304,
      quickBoostThrust: 236,
      quickBoostReload: 0.56,
      quickBoostCost: 17,
      quickBoostDuration: 0.22,
      quickBoostIdealWeight: 5200,
    }),
  },
  {
    id: "booster-hammer",
    slot: "BOOSTER",
    name: "HAMMER 高出力ブースター",
    manufacturer: "Vantline",
    description: "重い機体を押し出す大推力ブースター。消費ENと重量は大きい。",
    rarity: "elite",
    initial: false,
    stats: stats({
      hp: 60,
      defense: 8,
      weight: 620,
      boostSpeed: 236,
      quickBoostThrust: 338,
      quickBoostReload: 0.66,
      quickBoostCost: 24,
      quickBoostDuration: 0.16,
      quickBoostIdealWeight: 6900,
    }),
  },
  {
    id: EMPTY_LEFT_ARM_PART_ID,
    slot: "L-ARM",
    name: "左腕 未装備",
    manufacturer: "Standard",
    description: "左腕武装を外し、重量とEN負荷を空ける。",
    rarity: "common",
    initial: true,
    stats: stats({}),
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
    heatPerShot: 14,
    heatLimit: 96,
    coolingRate: 38,
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
    firePattern: "burst",
    magazineSize: 18,
    reloadTime: 1.15,
    burstCount: 3,
    burstInterval: 0.075,
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
    magazineSize: 4,
    reloadTime: 1.65,
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
    heatPerShot: 26,
    heatLimit: 110,
    coolingRate: 36,
    rarity: "rare",
    initial: true,
    stats: stats({
      hp: 85,
      enCapacity: 55,
      defense: 9,
      moveSpeed: 4,
      weight: 430,
      range: 86,
      attack: 126,
      cooldown: 1.05,
    }),
  },
  {
    id: "larm-aegis-shield",
    slot: "L-ARM",
    name: "AEGIS ガードシールド",
    manufacturer: "North Arc",
    description: "防御姿勢を有効化する左腕用シールド。火器を持たない代わりに防御を厚くする。",
    guardEnabled: true,
    rarity: "common",
    initial: true,
    stats: stats({
      hp: 130,
      enCapacity: 30,
      enRegen: 2,
      defense: 36,
      turnSpeed: 4,
      weight: 280,
    }),
  },
  {
    id: EMPTY_RIGHT_ARM_PART_ID,
    slot: "R-ARM",
    name: "右腕 未装備",
    manufacturer: "Standard",
    description: "右腕武装を外し、軽量化して機動を優先する。",
    rarity: "common",
    initial: true,
    stats: stats({}),
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
    heatPerShot: 17,
    heatLimit: 100,
    coolingRate: 34,
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
    firePattern: "burst",
    magazineSize: 12,
    reloadTime: 1.05,
    burstCount: 3,
    burstInterval: 0.085,
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
    magazineSize: 4,
    reloadTime: 1.55,
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
    firePattern: "burst",
    magazineSize: 6,
    reloadTime: 1.9,
    burstCount: 2,
    burstInterval: 0.14,
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
    heatPerShot: 22,
    heatLimit: 112,
    coolingRate: 36,
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
    id: "rarm-lumen-laser",
    slot: "R-ARM",
    name: "LUMEN 照射レーザー",
    manufacturer: "Mira Node",
    description: "照準後に細い高熱ビームを照射し続けるEN兵装。動きの遅い強敵に強い。",
    weaponResource: "energy",
    weaponKind: "beamLaser",
    energyCost: 6,
    firePattern: "sustain",
    heatPerShot: 13,
    heatLimit: 128,
    coolingRate: 27,
    burstInterval: 0.08,
    spinUpTime: 0.22,
    sustainTime: 1.18,
    rarity: "rare",
    initial: false,
    stats: stats({
      hp: 86,
      enCapacity: 95,
      enRegen: -3,
      defense: 8,
      turnSpeed: -3,
      weight: 720,
      range: 390,
      attack: 38,
      cooldown: 1.34,
    }),
  },
  {
    id: EMPTY_LEFT_SHOULDER_PART_ID,
    slot: "L-SHOULDER",
    name: "左肩 未装備",
    manufacturer: "Standard",
    description: "左肩武装を外し、重量と火器管制負荷を空ける。",
    rarity: "common",
    initial: true,
    stats: stats({}),
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
    magazineSize: 4,
    reloadTime: 1.85,
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
    heatPerShot: 35,
    heatLimit: 96,
    coolingRate: 24,
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
    id: EMPTY_RIGHT_SHOULDER_PART_ID,
    slot: "R-SHOULDER",
    name: "右肩 未装備",
    manufacturer: "Standard",
    description: "右肩武装を外し、片肩または両肩構成に切り替える。",
    rarity: "common",
    initial: true,
    stats: stats({}),
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
    firePattern: "sustain",
    magazineSize: 48,
    reloadTime: 1.45,
    burstInterval: 0.09,
    spinUpTime: 0.42,
    sustainTime: 1.45,
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
    magazineSize: 4,
    reloadTime: 1.55,
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
    id: EMPTY_BOTH_SHOULDER_PART_ID,
    slot: "B-SHOULDER",
    name: "両肩 未装備",
    manufacturer: "Standard",
    description: "両肩武装を外し、左右肩武装を使用できるようにする。",
    rarity: "common",
    initial: true,
    stats: stats({}),
  },
  {
    id: "bshoulder-crater-grenade",
    slot: "B-SHOULDER",
    name: "CRATER 両肩グレネード",
    manufacturer: "Vantline",
    description: "両肩で反動を受け止め、着弾点を範囲爆破する重グレネード。",
    weaponResource: "ballistic",
    weaponKind: "grenade",
    blastRadius: 108,
    ammoCapacity: 8,
    magazineSize: 2,
    reloadTime: 2.45,
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
    magazineSize: 5,
    reloadTime: 2.05,
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
  BOOSTER: "booster-vanguard",
  "L-ARM": "larm-pulse-needle",
  "R-ARM": "rarm-rail-carbine",
  "L-SHOULDER": EMPTY_LEFT_SHOULDER_PART_ID,
  "R-SHOULDER": EMPTY_RIGHT_SHOULDER_PART_ID,
  "B-SHOULDER": "bshoulder-crater-grenade",
};

export const createInitialLoadoutForFrame = (frameId: BaseFrameId): Loadout => {
  switch (frameId) {
    case "light":
      return {
        HEAD: "head-orbit-s",
        BODY: "body-flux",
        BOOSTER: "booster-sparrow",
        "L-ARM": "larm-arc-blade",
        "R-ARM": "rarm-kinetic-rifle",
        "L-SHOULDER": EMPTY_LEFT_SHOULDER_PART_ID,
        "R-SHOULDER": EMPTY_RIGHT_SHOULDER_PART_ID,
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "heavy":
      return {
        HEAD: "head-warden",
        BODY: "body-aegis",
        BOOSTER: "booster-vanguard",
        "L-ARM": "larm-solid-shredder",
        "R-ARM": "rarm-burst-cannon",
        "L-SHOULDER": EMPTY_LEFT_SHOULDER_PART_ID,
        "R-SHOULDER": EMPTY_RIGHT_SHOULDER_PART_ID,
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "quad":
      return {
        HEAD: "head-orbit-s",
        BODY: "body-aegis",
        BOOSTER: "booster-vanguard",
        "L-ARM": "larm-micro-missile",
        "R-ARM": "rarm-longshot-sniper",
        "L-SHOULDER": EMPTY_LEFT_SHOULDER_PART_ID,
        "R-SHOULDER": EMPTY_RIGHT_SHOULDER_PART_ID,
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "tank":
      return {
        HEAD: "head-warden",
        BODY: "body-aegis",
        BOOSTER: "booster-vanguard",
        "L-ARM": "larm-solid-shredder",
        "R-ARM": "rarm-burst-cannon",
        "L-SHOULDER": EMPTY_LEFT_SHOULDER_PART_ID,
        "R-SHOULDER": EMPTY_RIGHT_SHOULDER_PART_ID,
        "B-SHOULDER": "bshoulder-crater-grenade",
      };
    case "medium":
    default:
      return { ...initialLoadout };
  }
};

export const normalizeLoadout = (loadout: Partial<Loadout> | undefined): Loadout => {
  const withDefaults = EQUIP_SLOTS.reduce((next, slot) => {
    next[slot] = loadout?.[slot] ?? initialLoadout[slot];
    return next;
  }, {} as Loadout);

  return normalizeShoulderLoadout(withDefaults);
};

export const initialUnlockedPartIds = parts
  .filter((part) => part.initial && !isFreePart(part.id))
  .map((part) => part.id);

export const starterKitPartIds: string[] = parts
  .filter((part) => part.initial && part.slot !== "LEGS" && !isFreePart(part.id))
  .map((part) => part.id);

export const createEmptyPartInventory = (): PartInventory => ({});

export const grantStarterKit = (inventory: PartInventory): PartInventory => {
  const next = { ...inventory };
  for (const partId of starterKitPartIds) {
    next[partId] = (next[partId] ?? 0) + 1;
  }
  return next;
};

export const ensureStarterKit = (inventory: PartInventory): PartInventory => {
  const next = { ...inventory };
  for (const partId of starterKitPartIds) {
    next[partId] = Math.max(1, next[partId] ?? 0);
  }
  return next;
};

export const createInitialPartInventory = (): PartInventory => ensureStarterKit(createEmptyPartInventory());

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
  parts.filter((part) => part.slot !== "LEGS" && !isFreePart(part.id));

export const buildFromLoadout = (loadout: Loadout): MechBuild => {
  const normalizedLoadout = normalizeLoadout(loadout);
  return EQUIP_SLOTS.reduce((build, slot) => {
    build[slot] = getPartById(normalizedLoadout[slot]);
    return build;
  }, {} as MechBuild);
};

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
      boostSpeed: sum.boostSpeed + part.stats.boostSpeed,
      quickBoostThrust: sum.quickBoostThrust + part.stats.quickBoostThrust,
      quickBoostReload: sum.quickBoostReload + part.stats.quickBoostReload,
      quickBoostCost: sum.quickBoostCost + part.stats.quickBoostCost,
      quickBoostDuration: sum.quickBoostDuration + part.stats.quickBoostDuration,
      quickBoostIdealWeight: sum.quickBoostIdealWeight + part.stats.quickBoostIdealWeight,
    }),
    { ...frame.stats },
  );

  const right = build["R-ARM"];
  const left = build["L-ARM"];
  const weaponEntries = EQUIP_SLOTS
    .map((slot) => ({ slot, part: build[slot], hardpoint: weaponHardpoints[slot] }))
    .filter((entry): entry is { slot: EquipSlot; part: Part; hardpoint: WeaponHardpoint } =>
      Boolean(entry.hardpoint) && !isFreePart(entry.part.id) && Boolean(entry.part.weaponKind),
    );
  const legType = frame.legType;
  const loadLimit = Math.max(1, total.loadLimit);
  const loadRatio = total.weight / loadLimit;
  const overloadRatio = Math.max(0, (total.weight - loadLimit) / loadLimit);
  const overloadPenalty = 1 + overloadRatio * 1.05 + Math.max(0, loadRatio - 0.72) * 0.28;
  const moveWeightFactor = clamp(1.16 - loadRatio * 0.44 - overloadRatio * 0.62, 0.46, 1.12);
  const turnWeightFactor = clamp(1.1 - loadRatio * 0.32 - overloadRatio * 0.5, 0.5, 1.06);
  const legCooldownBonus = legType === "quad" ? 0.94 : legType === "tank" ? 1.08 : 1;
  const dodgeMoveBonus = legType === "reverse" ? 1.08 : legType === "hover" ? 1.04 : 1;
  const moveSpeed = Math.round(Math.max(38, total.moveSpeed * moveWeightFactor * dodgeMoveBonus));
  const boostWeightFactor = clamp(1.12 - loadRatio * 0.25 - overloadRatio * 0.55, 0.55, 1.08);
  const quickBoostIdealWeight = Math.max(1, total.quickBoostIdealWeight || loadLimit * 0.78);
  const quickBoostWeightPenalty = total.weight <= quickBoostIdealWeight
    ? 1
    : clamp(1 + ((total.weight - quickBoostIdealWeight) / quickBoostIdealWeight) * 0.5, 1, 1.65);
  const legBoostThrustBonus =
    legType === "reverse" ? 1.12 : legType === "hover" ? 1.04 : legType === "tank" ? 0.82 : legType === "quad" ? 0.98 : 1;
  const legBoostSpeedBonus =
    legType === "hover" ? 1.12 : legType === "reverse" ? 1.05 : legType === "tank" ? 0.86 : legType === "quad" ? 1.02 : 1;
  const legBoostReloadBonus =
    legType === "reverse" ? 0.88 : legType === "hover" ? 0.96 : legType === "tank" ? 1.18 : 1;
  const legBoostCostBonus =
    legType === "reverse" ? 0.88 : legType === "hover" ? 0.96 : legType === "tank" ? 1.18 : legType === "quad" ? 1.02 : 1;
  const boostSpeed = Math.round(
    Math.max(moveSpeed * 1.15, Math.max(180, total.boostSpeed) * boostWeightFactor * legBoostSpeedBonus),
  );
  const quickBoostThrust = Math.round(
    Math.max(90, total.quickBoostThrust) * boostWeightFactor * legBoostThrustBonus,
  );
  const quickBoostCooldown = Math.max(
    0.24,
    (total.quickBoostReload || 0.5) * quickBoostWeightPenalty * legBoostReloadBonus,
  );
  const quickBoostCost = Math.max(
    4,
    Math.round(Math.max(8, total.quickBoostCost) * legBoostCostBonus * (1 + overloadRatio * 0.35)),
  );
  const quickBoostDuration = clamp(
    (total.quickBoostDuration || 0.18) * (legType === "hover" ? 1.08 : legType === "tank" ? 0.92 : 1),
    0.1,
    0.3,
  );
  const frameCooldownOffset = frame.stats.cooldown;
  const cooldownPenalty = Math.max(0.82, legCooldownBonus * overloadPenalty + frameCooldownOffset);
  const weaponRange = weaponEntries.reduce((sum, entry) => sum + entry.part.stats.range, 0);
  const weaponAttack = weaponEntries.reduce((sum, entry) => sum + entry.part.stats.attack, 0);
  const supportRange = total.range - weaponRange;
  const supportAttack = total.attack - weaponAttack;
  const rightHasWeapon = !isFreePart(right.id) && Boolean(right.weaponKind);
  const leftHasWeapon = !isFreePart(left.id) && Boolean(left.weaponKind);
  const weaponFor = (slot: EquipSlot, part: Part, hardpoint: WeaponHardpoint): WeaponStats => {
    const attackMultiplier = hardpoint === "bothShoulders" ? 2 : 1;
    const weaponKind = part.weaponKind ?? "rifle";
    const resource = part.weaponResource ?? "energy";
    const energyCost = part.energyCost ?? (hardpoint.includes("Shoulder") ? 10 : 6);
    const firePattern = part.firePattern ?? defaultFirePattern(weaponKind, resource);
    const magazineSize = resource === "ballistic"
      ? Math.max(1, part.magazineSize ?? defaultMagazineSize(weaponKind))
      : 0;
    const reloadTime = resource === "ballistic"
      ? part.reloadTime ?? defaultReloadTime(weaponKind, hardpoint)
      : 0;
    const heatLimit = resource === "energy" ? part.heatLimit ?? 100 : 0;
    return {
      hardpoint,
      slot,
      partId: part.id,
      label: weaponSlotLabels[slot],
      range: Math.round(part.stats.range + supportRange),
      attack: Math.round(part.stats.attack * attackMultiplier + supportAttack + upgrades.attack),
      cooldown: Math.max(
        hardpoint === "bothShoulders" ? 0.85 : hardpoint.includes("Shoulder") ? 0.4 : 0.18,
        part.stats.cooldown * upgrades.cooldownMultiplier * cooldownPenalty,
      ),
      resource,
      weaponKind,
      energyCost,
      ammoMax: magazineSize,
      blastRadius: part.blastRadius ?? (weaponKind === "grenade" ? 96 : weaponKind === "rocket" ? 42 : 0),
      firePattern,
      magazineSize,
      reloadTime,
      heatPerShot: resource === "energy" ? part.heatPerShot ?? defaultHeatPerShot(weaponKind, energyCost) : 0,
      heatLimit,
      coolingRate: resource === "energy" ? part.coolingRate ?? defaultCoolingRate(weaponKind) : 0,
      burstCount: firePattern === "burst" ? Math.max(2, part.burstCount ?? 3) : 1,
      burstInterval: Math.max(0.05, part.burstInterval ?? (firePattern === "sustain" ? 0.1 : 0.08)),
      spinUpTime: firePattern === "sustain" ? Math.max(0, part.spinUpTime ?? 0.38) : 0,
      sustainTime: firePattern === "sustain" ? Math.max(0.25, part.sustainTime ?? 1.2) : 0,
    };
  };
  const weapons = weaponEntries.map((entry) => weaponFor(entry.slot, entry.part, entry.hardpoint));

  return {
    frameId,
    frameName: frame.name,
    hpMax: Math.round(total.hp + upgrades.hp),
    enMax: Math.round(total.enCapacity + upgrades.enCapacity),
    enRegen: Math.max(8, total.enRegen + upgrades.enRegen),
    defense: Math.max(0, Math.round(total.defense + upgrades.defense)),
    moveSpeed,
    turnSpeed: Math.round(Math.max(30, total.turnSpeed * turnWeightFactor)),
    weight: Math.round(total.weight),
    loadLimit: Math.round(loadLimit),
    overloadRatio,
    legType,
    boostSpeed,
    quickBoostThrust,
    quickBoostCooldown,
    quickBoostCost,
    quickBoostDuration,
    rightRange: rightHasWeapon ? Math.round(right.stats.range + supportRange) : 0,
    leftRange: leftHasWeapon ? Math.round(left.stats.range + supportRange) : 0,
    rightAttack: rightHasWeapon ? Math.round(right.stats.attack + supportAttack + upgrades.attack) : 0,
    leftAttack: leftHasWeapon ? Math.round(left.stats.attack + supportAttack + upgrades.attack) : 0,
    rightCooldown: Math.max(
      rightHasWeapon ? 0.18 : 0,
      rightHasWeapon ? right.stats.cooldown * upgrades.cooldownMultiplier * cooldownPenalty : 0,
    ),
    leftCooldown: Math.max(
      leftHasWeapon ? 0.2 : 0,
      leftHasWeapon ? left.stats.cooldown * upgrades.cooldownMultiplier * cooldownPenalty : 0,
    ),
    rightResource: right.weaponResource ?? "energy",
    leftResource: left.weaponResource ?? "energy",
    rightWeaponKind: right.weaponKind ?? "rifle",
    leftWeaponKind: left.weaponKind ?? "rifle",
    rightEnergyCost: rightHasWeapon ? right.energyCost ?? 6 : 0,
    leftEnergyCost: leftHasWeapon ? left.energyCost ?? 5 : 0,
    rightAmmoMax: rightHasWeapon && right.weaponResource === "ballistic"
      ? right.magazineSize ?? defaultMagazineSize(right.weaponKind ?? "rifle")
      : 0,
    leftAmmoMax: leftHasWeapon && left.weaponResource === "ballistic"
      ? left.magazineSize ?? defaultMagazineSize(left.weaponKind ?? "rifle")
      : 0,
    canGuard: selected.some((part) => part.guardEnabled),
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
    const normalizedLoadout = normalizeLoadout(loadout);
    for (const slot of EQUIP_SLOTS) {
      const partId = normalizedLoadout[slot];
      if (isFreePart(partId)) {
        continue;
      }
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
  if (isFreePart(partId)) {
    return units;
  }

  for (let unitIndex = 0; unitIndex < unlockedUnitCount; unitIndex += 1) {
    const loadout = loadouts[unitIndex];
    if (loadout && EQUIP_SLOTS.some((slot: EquipSlot) => normalizeLoadout(loadout)[slot] === partId)) {
      units.push(unitIndex);
    }
  }
  return units;
};
