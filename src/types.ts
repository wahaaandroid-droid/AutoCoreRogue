export const EQUIP_SLOTS = ["HEAD", "BODY", "L-ARM", "R-ARM"] as const;
export const PART_SLOTS = [...EQUIP_SLOTS, "LEGS"] as const;

export const SQUAD_SIZE = 3;

export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export type PartSlot = (typeof PART_SLOTS)[number];

export type BaseFrameId = "light" | "medium" | "heavy" | "quad" | "tank";

export type LegType = "biped" | "quad" | "reverse" | "tank" | "hover";

export type Rarity = "common" | "rare" | "elite";

export type WeaponResource = "energy" | "ballistic";

export type WeaponKind = "gun" | "missile" | "blade";

export interface PartStats {
  hp: number;
  enCapacity: number;
  enRegen: number;
  defense: number;
  moveSpeed: number;
  turnSpeed: number;
  weight: number;
  loadLimit: number;
  range: number;
  attack: number;
  cooldown: number;
}

export interface BaseFrame {
  id: BaseFrameId;
  name: string;
  typeLabel: string;
  role: string;
  description: string;
  legType: LegType;
  color: string;
  accent: "blue" | "green" | "orange" | "purple";
  stats: PartStats;
}

export interface Part {
  id: string;
  slot: PartSlot;
  name: string;
  manufacturer: string;
  description: string;
  legType?: LegType;
  weaponResource?: WeaponResource;
  weaponKind?: WeaponKind;
  energyCost?: number;
  ammoCapacity?: number;
  rarity: Rarity;
  initial: boolean;
  stats: PartStats;
}

export type Loadout = Record<EquipSlot, string>;

export type MechBuild = Record<EquipSlot, Part>;

export type PartInventory = Record<string, number>;

export interface PilotUpgrades {
  hp: number;
  enCapacity: number;
  enRegen: number;
  defense: number;
  attack: number;
  cooldownMultiplier: number;
}

export interface DerivedStats {
  frameId: BaseFrameId;
  frameName: string;
  hpMax: number;
  enMax: number;
  enRegen: number;
  defense: number;
  moveSpeed: number;
  turnSpeed: number;
  weight: number;
  loadLimit: number;
  overloadRatio: number;
  legType: LegType;
  rightRange: number;
  leftRange: number;
  rightAttack: number;
  leftAttack: number;
  rightCooldown: number;
  leftCooldown: number;
  rightResource: WeaponResource;
  leftResource: WeaponResource;
  rightWeaponKind: WeaponKind;
  leftWeaponKind: WeaponKind;
  rightEnergyCost: number;
  leftEnergyCost: number;
  rightAmmoMax: number;
  leftAmmoMax: number;
  missileAttack: number;
  missileCooldown: number;
  missileEnergyCost: number;
}

export type AiConditionId =
  | "hpLow"
  | "enemyClose"
  | "enemyMid"
  | "enemyFar"
  | "enHigh"
  | "rightReady"
  | "leftReady"
  | "enemyProjectileNear"
  | "always";

export type AiActionId =
  | "approach"
  | "retreat"
  | "strafe"
  | "boostDodge"
  | "shootRight"
  | "shootLeft"
  | "fireMissile"
  | "guard"
  | "idle";

export type TargetPriorityId =
  | "nearest"
  | "lowestHp"
  | "lowestHpPercent"
  | "eliteFirst";

export interface AiRule {
  id: string;
  condition: AiConditionId;
  action: AiActionId;
  enabled: boolean;
}

export type ScreenId = "frameSelect" | "assemble" | "ai" | "combat" | "reward" | "map";
