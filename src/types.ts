export const EQUIP_SLOTS = [
  "HEAD",
  "BODY",
  "BOOSTER",
  "L-ARM",
  "R-ARM",
  "SPECIAL",
] as const;
export const PART_SLOTS = [...EQUIP_SLOTS, "LEGS"] as const;

export const SQUAD_SIZE = 3;

export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export type PartSlot = (typeof PART_SLOTS)[number];

export type WeaponMountSlot = EquipSlot | "L-SHOULDER" | "R-SHOULDER" | "B-SHOULDER";

export type BaseFrameId = "light" | "medium" | "heavy" | "quad" | "tank";

export type LegType = "biped" | "quad" | "reverse" | "tank" | "hover";

export type Rarity = "common" | "rare" | "elite";

export type RelicRarity = Rarity | "clear";

export type WeaponResource = "energy" | "ballistic";

export type WeaponFirePattern = "single" | "burst" | "sustain";

export type GuardProfile = "kinetic" | "energy" | "balanced";

export type SpecialKind =
  | "shield"
  | "barrier"
  | "bit"
  | "bomb"
  | "stun"
  | "poison";

export type SpecialTrigger =
  | "hpLow"
  | "incomingThreat"
  | "enemyPresent"
  | "enemyClustered"
  | "enemyClose"
  | "enemyMid";

export interface SpecialDefinition {
  kind: SpecialKind;
  trigger: SpecialTrigger;
  cooldown: number;
  threshold?: number;
  duration?: number;
  shieldHp?: number;
  damageReduction?: number;
  bitHp?: number;
  bitCount?: number;
  fireInterval?: number;
  range?: number;
  damage?: number;
  blastRadius?: number;
  statusDuration?: number;
  dotDamagePerSecond?: number;
}

export interface EquippedSpecial extends SpecialDefinition {
  partId: string;
  name: string;
}

export type WeaponKind =
  | "rifle"
  | "sniperRifle"
  | "machineGun"
  | "beamLaser"
  | "rocket"
  | "grenade"
  | "missile"
  | "pulse"
  | "blade";

export const WEAPON_HARDPOINTS = [
  "leftArm",
  "rightArm",
  "leftShoulder",
  "rightShoulder",
  "bothShoulders",
] as const;

export type WeaponHardpoint = (typeof WEAPON_HARDPOINTS)[number];

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
  boostSpeed: number;
  quickBoostThrust: number;
  quickBoostReload: number;
  quickBoostCost: number;
  quickBoostDuration: number;
  quickBoostIdealWeight: number;
  aiReaction: number;
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
  special?: SpecialDefinition;
  weaponResource?: WeaponResource;
  weaponKind?: WeaponKind;
  guardEnabled?: boolean;
  guardProfile?: GuardProfile;
  blastRadius?: number;
  energyCost?: number;
  ammoCapacity?: number;
  firePattern?: WeaponFirePattern;
  magazineSize?: number;
  reloadTime?: number;
  heatPerShot?: number;
  heatLimit?: number;
  coolingRate?: number;
  burstCount?: number;
  burstInterval?: number;
  spinUpTime?: number;
  sustainTime?: number;
  rarity: Rarity;
  initial: boolean;
  stats: PartStats;
}

export type Loadout = Record<EquipSlot, string>;

export type MechBuild = Record<EquipSlot, Part>;

export type PartInventory = Record<string, number>;

export type WeaponAutoUse = Record<WeaponHardpoint, boolean>;

export interface WeaponStats {
  hardpoint: WeaponHardpoint;
  slot: WeaponMountSlot;
  partId: string;
  label: string;
  range: number;
  attack: number;
  cooldown: number;
  resource: WeaponResource;
  weaponKind: WeaponKind;
  energyCost: number;
  ammoMax: number;
  blastRadius: number;
  firePattern: WeaponFirePattern;
  magazineSize: number;
  reloadTime: number;
  heatPerShot: number;
  heatLimit: number;
  coolingRate: number;
  burstCount: number;
  burstInterval: number;
  spinUpTime: number;
  sustainTime: number;
}

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
  boostSpeed: number;
  quickBoostThrust: number;
  quickBoostCooldown: number;
  quickBoostCost: number;
  quickBoostDuration: number;
  aiReaction: number;
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
  canGuard: boolean;
  guardProfile: GuardProfile;
  weapons: WeaponStats[];
  special?: EquippedSpecial;
  archetype?: UnitArchetypeId;
  growth?: UnitGrowth;
}

export type UnitArchetypeId = "evasive" | "cutter" | "rapid";

export interface UnitGrowth {
  reflex: number;
  boost: number;
  cutting: number;
  trigger: number;
  sync: number;
}

export type UnitGrowthKey = keyof UnitGrowth;

export type PrepUpgradeIcon = "eye" | "boost" | "slash" | "burst" | "sync" | "repair";

export interface PrepUpgradeOption {
  id: string;
  title: string;
  icon: PrepUpgradeIcon;
  shortText: string;
  target: "all" | "unit";
  unitIndex?: number;
  effect: Partial<UnitGrowth> & {
    healPercent?: number;
  };
}

export type AiConditionId =
  | "hpLow"
  | "enemyClose"
  | "enemyMid"
  | "enemyFar"
  | "enemyClustered"
  | "enHigh"
  | "rightReady"
  | "leftReady"
  | "leftShoulderReady"
  | "rightShoulderReady"
  | "bothShoulderReady"
  | "shoulderReady"
  | "enemyProjectileNear"
  | "incomingBallistic"
  | "incomingEnergy"
  | "incomingMissile"
  | "incomingBeamLock"
  | "always";

export type AiActionId =
  | "approach"
  | "retreat"
  | "strafe"
  | "boostDodge"
  | "suppressiveFire"
  | "alphaStrike"
  | "fireExplosive"
  | "fireLongRange"
  | "shootRight"
  | "shootLeft"
  | "fireLeftShoulder"
  | "fireRightShoulder"
  | "fireBothShoulders"
  | "fireShoulder"
  | "fireMissile"
  | "interceptMissile"
  | "guard"
  | "idle";

export type TargetPriorityId =
  | "nearest"
  | "lowestHp"
  | "lowestHpPercent"
  | "eliteFirst";

export type AiDefinitionTier = "starter" | "tactical" | "advanced" | "expert";

export type AiDefinitionCategory =
  | "movement"
  | "weapon"
  | "defense"
  | "targeting"
  | "utility";

export type AiUnlockPackageId =
  | "w1-boost-dodge"
  | "w1-guard-logic"
  | "w1-suppressive-fire"
  | "w2-long-range"
  | "w2-explosive"
  | "w2-missile"
  | "w2-damage-defense"
  | "w2-focus-fire"
  | "w3-alpha-strike"
  | "w3-missile-intercept"
  | "w3-beam-counter"
  | "w3-elite-hunter";

export interface AiUnlockPackage {
  id: AiUnlockPackageId;
  name: string;
  world: number;
  rarity: Rarity;
  actions: AiActionId[];
  conditions: AiConditionId[];
  targetPriorities: TargetPriorityId[];
  recommendedRules: AiRule[];
  description: string;
}

export type RelicId =
  | "boot-log"
  | "reserve-cell"
  | "armor-sample"
  | "mechanic-mark"
  | "junk-appraiser"
  | "tactical-memory"
  | "merchant-tag"
  | "reward-filter"
  | "route-scanner"
  | "supply-beacon"
  | "elite-blackbox"
  | "triple-core-sync"
  | "world-core-echo"
  | "clear-auth-key";

export type RelicEffectKind =
  | "initialCredits"
  | "unitOneEn"
  | "unitOneHp"
  | "restHealBonus"
  | "partShopDiscount"
  | "aiRewardBias"
  | "aiShopDiscount"
  | "rewardRerolls"
  | "extraRouteChoice"
  | "worldEntryHeal"
  | "eliteRewardOption"
  | "reinforcementAiSlot"
  | "bossRewardBias"
  | "clearStartChoice";

export type ClearStartBonusChoice = "credits" | "rewardReroll" | "shopDiscount";

export interface RelicDefinition {
  id: RelicId;
  name: string;
  rarity: RelicRarity;
  maxLevel: number;
  description: string;
  effectKind: RelicEffectKind;
  values: number[];
  unlockCondition: "defeat" | "clear";
}

export interface MetaRunHistoryEntry {
  id: string;
  endedAt: string;
  completed: boolean;
  reachedStage: number;
  reachedWorld: number;
  clearedStages: number;
  relicIds: RelicId[];
}

export interface MetaSaveState {
  ownedRelics: Partial<Record<RelicId, number>>;
  runHistory: MetaRunHistoryEntry[];
  duplicateDust: number;
  clearStartBonusChoice: ClearStartBonusChoice;
}

export interface RelicBonuses {
  initialCredits: number;
  unitOneHpMultiplier: number;
  unitOneEnMultiplier: number;
  restHealBonus: number;
  partShopDiscount: number;
  aiShopDiscount: number;
  rewardRerollsPerWorld: number;
  extraRouteChoice: boolean;
  worldEntryHealPercent: number;
  aiRewardBonusCount: number;
  eliteRewardBonusCount: number;
  reinforcementAiSlotBonus: number;
  bossRareBias: boolean;
}

export interface RelicRewardOption {
  id: string;
  relicId: RelicId;
  duplicate: boolean;
  nextLevel: number;
  dust: number;
}

export interface PendingRelicReward {
  reason: "defeat" | "clear";
  phase: "normal" | "clear";
  reachedStage: number;
  reachedWorld: number;
  clearedStages: number;
  picksRemaining: number;
  options: RelicRewardOption[];
  grantedRelicIds: RelicId[];
}

export type AiPresetId =
  | "assault"
  | "skirmisher"
  | "fireSupport"
  | "bombard"
  | "missileSupport"
  | "defender"
  | "custom";

export interface AiRule {
  id: string;
  condition: AiConditionId;
  action: AiActionId;
  enabled: boolean;
}

export type ScreenId = "prep" | "combat" | "map" | "complete";
