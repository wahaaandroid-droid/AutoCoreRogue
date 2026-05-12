import type {
  AiRule,
  BaseFrameId,
  DerivedStats,
  Loadout,
  PrepUpgradeOption,
  TargetPriorityId,
  UnitArchetypeId,
  UnitGrowth,
  UnitGrowthKey,
} from "../types";
import { calculateDerivedStats, baseUpgrades, EMPTY_LEFT_ARM_PART_ID } from "./parts";
import { STAGES_PER_WORLD, StageType } from "./stages";

export const ARCHETYPE_IDS: UnitArchetypeId[] = ["evasive", "cutter", "rapid"];
export const UNIT_GROWTH_MAX = 12;
export const UPGRADE_PROGRESS_PIPS = 6;

export const archetypeLabels: Record<UnitArchetypeId, { name: string; icon: string; short: string }> = {
  evasive: {
    name: "回避型",
    icon: "避",
    short: "弾を見てから横へ消える",
  },
  cutter: {
    name: "切払型",
    icon: "斬",
    short: "近い弾をブレードで叩き落とす",
  },
  rapid: {
    name: "連射型",
    icon: "速",
    short: "判断を詰めて先に撃ち続ける",
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const capGrowth = (growth: UnitGrowth): UnitGrowth => ({
  reflex: clamp(growth.reflex, 0, UNIT_GROWTH_MAX),
  boost: clamp(growth.boost, 0, UNIT_GROWTH_MAX),
  cutting: clamp(growth.cutting, 0, UNIT_GROWTH_MAX),
  trigger: clamp(growth.trigger, 0, UNIT_GROWTH_MAX),
  sync: clamp(growth.sync, 0, UNIT_GROWTH_MAX),
});

export const growthPower = (value: number, power = 2.12): number => {
  const normalized = clamp(value, 0, UNIT_GROWTH_MAX) / UNIT_GROWTH_MAX;
  return Math.pow(normalized, power);
};

export const curvedGrowthPoints = (value: number, power = 2.12): number =>
  UNIT_GROWTH_MAX * growthPower(value, power);

export const growthKeysForUpgrade = (option: PrepUpgradeOption): UnitGrowthKey[] =>
  (["reflex", "boost", "cutting", "trigger", "sync"] as UnitGrowthKey[])
    .filter((key) => (option.effect[key] ?? 0) > 0);

export const createEmptyGrowth = (): UnitGrowth => ({
  reflex: 0,
  boost: 0,
  cutting: 0,
  trigger: 0,
  sync: 0,
});

export const createInitialUnitGrowth = (archetype: UnitArchetypeId): UnitGrowth =>
  capGrowth({
    reflex: 1,
    boost: archetype === "evasive" ? 2 : 1,
    cutting: archetype === "cutter" ? 2 : 0,
    trigger: archetype === "rapid" ? 2 : 1,
    sync: 0,
  });

export const frameForArchetype = (archetype: UnitArchetypeId): BaseFrameId =>
  archetype === "rapid" ? "medium" : "light";

export const loadoutForArchetype = (archetype: UnitArchetypeId): Loadout => {
  switch (archetype) {
    case "cutter":
      return {
        HEAD: "head-orbit-s",
        BODY: "body-flux",
        BOOSTER: "booster-sparrow",
        "L-ARM": "larm-arc-blade",
        "R-ARM": "rarm-kinetic-rifle",
        SPECIAL: "special-aegis-shell",
      };
    case "rapid":
      return {
        HEAD: "head-orbit-s",
        BODY: "body-aegis",
        BOOSTER: "booster-vanguard",
        "L-ARM": "larm-solid-shredder",
        "R-ARM": "rarm-rail-carbine",
        SPECIAL: "special-aegis-shell",
      };
    case "evasive":
    default:
      return {
        HEAD: "head-orbit-s",
        BODY: "body-flux",
        BOOSTER: "booster-sparrow",
        "L-ARM": EMPTY_LEFT_ARM_PART_ID,
        "R-ARM": "rarm-kinetic-rifle",
        SPECIAL: "special-aegis-shell",
      };
  }
};

export const buildSimpleStats = (
  archetype: UnitArchetypeId,
  growth: UnitGrowth,
): DerivedStats => {
  const base = calculateDerivedStats(loadoutForArchetype(archetype), baseUpgrades, frameForArchetype(archetype));
  return applyGrowthToStats(base, archetype, growth);
};

export const applyGrowthToStats = (
  stats: DerivedStats,
  archetype: UnitArchetypeId,
  growth: UnitGrowth,
): DerivedStats => {
  const capped = capGrowth(growth);
  const reflexCurve = curvedGrowthPoints(capped.reflex);
  const boostCurve = curvedGrowthPoints(capped.boost);
  const cuttingCurve = curvedGrowthPoints(capped.cutting);
  const triggerCurve = curvedGrowthPoints(capped.trigger);
  const syncCurve = curvedGrowthPoints(capped.sync);
  const reflexBoost = reflexCurve * 10.6 + syncCurve * 5.8;
  const boostScale = 0.84 + boostCurve * 0.058 + syncCurve * 0.022;
  const cooldownScale = clamp(1.34 - triggerCurve * 0.078 - syncCurve * 0.024, 0.32, 1.34);
  const weapons = stats.weapons.slice(0, 2).map((weapon) => ({
    ...weapon,
    range: weapon.weaponKind === "blade"
      ? Math.round(weapon.range * (0.9 + cuttingCurve * 0.025))
      : weapon.range,
    cooldown: Math.max(0.045, weapon.cooldown * cooldownScale),
    burstInterval: Math.max(0.028, weapon.burstInterval * clamp(cooldownScale + 0.08, 0.42, 1)),
    spinUpTime: Math.max(0, weapon.spinUpTime * clamp(cooldownScale + 0.1, 0.45, 1)),
    coolingRate: weapon.coolingRate * (0.82 + triggerCurve * 0.045),
  }));
  const right = weapons.find((weapon) => weapon.hardpoint === "rightArm");
  const left = weapons.find((weapon) => weapon.hardpoint === "leftArm");

  return {
    ...stats,
    archetype,
    growth: capped,
    aiReaction: stats.aiReaction * 0.38 + reflexBoost,
    boostSpeed: Math.round(stats.boostSpeed * boostScale),
    quickBoostThrust: Math.round(stats.quickBoostThrust * (0.82 + boostCurve * 0.1)),
    quickBoostCooldown: Math.max(0.08, stats.quickBoostCooldown * clamp(1.28 - boostCurve * 0.088 - syncCurve * 0.03, 0.22, 1.45)),
    quickBoostCost: Math.max(4, Math.round(stats.quickBoostCost * clamp(1.22 - boostCurve * 0.058, 0.38, 1.28))),
    weapons,
    rightCooldown: right?.cooldown ?? stats.rightCooldown,
    leftCooldown: left?.cooldown ?? stats.leftCooldown,
    rightRange: right?.range ?? stats.rightRange,
    leftRange: left?.weaponKind === "blade"
      ? Math.round((left?.range ?? stats.leftRange) * (0.9 + cuttingCurve * 0.025))
      : left?.range ?? stats.leftRange,
    rightAttack: right?.attack ?? stats.rightAttack,
    leftAttack: left?.attack ?? stats.leftAttack,
    rightResource: right?.resource ?? stats.rightResource,
    leftResource: left?.resource ?? stats.leftResource,
    rightWeaponKind: right?.weaponKind ?? stats.rightWeaponKind,
    leftWeaponKind: left?.weaponKind ?? stats.leftWeaponKind,
    rightEnergyCost: right?.energyCost ?? stats.rightEnergyCost,
    leftEnergyCost: left?.energyCost ?? stats.leftEnergyCost,
    rightAmmoMax: right?.magazineSize ?? stats.rightAmmoMax,
    leftAmmoMax: left?.magazineSize ?? stats.leftAmmoMax,
  };
};

const rule = (id: string, condition: AiRule["condition"], action: AiRule["action"]): AiRule => ({
  id,
  condition,
  action,
  enabled: true,
});

export const createSimpleCombatRules = (stats: DerivedStats): AiRule[] => {
  const archetype = stats.archetype ?? "evasive";
  const hasBlade = stats.weapons.some((weapon) => weapon.weaponKind === "blade");

  return [
    rule("simple-beam-dodge", "incomingBeamLock", "boostDodge"),
    rule("simple-missile-answer", "incomingMissile", hasBlade ? "interceptMissile" : "boostDodge"),
    rule("simple-projectile-dodge", "enemyProjectileNear", "boostDodge"),
    rule("simple-close-blade", "enemyClose", hasBlade ? "shootLeft" : "retreat"),
    rule("simple-burst", "enHigh", archetype === "rapid" ? "alphaStrike" : "suppressiveFire"),
    rule("simple-right", "rightReady", "shootRight"),
    rule("simple-left", "leftReady", "shootLeft"),
    rule("simple-far", "enemyFar", "approach"),
    rule("simple-mid", "enemyMid", archetype === "evasive" ? "strafe" : "shootRight"),
    rule("simple-always", "always", "strafe"),
  ];
};

export const targetPriorityForArchetype = (archetype: UnitArchetypeId): TargetPriorityId =>
  archetype === "rapid" ? "lowestHp" : archetype === "cutter" ? "nearest" : "lowestHpPercent";

const targetUnit = (
  archetypes: (UnitArchetypeId | undefined)[],
  unlockedUnitCount: number,
  preferred: UnitArchetypeId,
): number => {
  const index = archetypes.slice(0, unlockedUnitCount).findIndex((archetype) => archetype === preferred);
  return index >= 0 ? index : 0;
};

const option = (
  stage: number,
  id: string,
  title: string,
  icon: PrepUpgradeOption["icon"],
  shortText: string,
  effect: PrepUpgradeOption["effect"],
  target: PrepUpgradeOption["target"] = "all",
  unitIndex?: number,
): PrepUpgradeOption => ({
  id: `${stage}-${id}`,
  title,
  icon,
  shortText,
  effect,
  target,
  unitIndex,
});

export const createPrepUpgradeOptions = (
  stage: number,
  unlockedUnitCount: number,
  archetypes: (UnitArchetypeId | undefined)[],
  routeType: StageType = "normal",
): PrepUpgradeOption[] => {
  const evasiveIndex = targetUnit(archetypes, unlockedUnitCount, "evasive");
  const cutterIndex = targetUnit(archetypes, unlockedUnitCount, "cutter");
  const rapidIndex = targetUnit(archetypes, unlockedUnitCount, "rapid");
  const activeArchetypes = archetypes.slice(0, unlockedUnitCount);
  const hasCutter = activeArchetypes.includes("cutter");
  const routeBonus = routeType === "elite" ? 1 : routeType === "boss" ? 1 : 0;
  const pool = [
    option(stage, "reflex", "反応アップ", "eye", "見てから動ける", { reflex: 1 + routeBonus }),
    option(
      stage,
      "boost",
      "回避アップ",
      "boost",
      "弾をよけやすい",
      { boost: 2 + routeBonus, reflex: 1 },
      "unit",
      evasiveIndex,
    ),
    hasCutter
      ? option(
          stage,
          "cut",
          "切払アップ",
          "slash",
          "近い弾を切る",
          { cutting: 2 + routeBonus, reflex: 1 },
          "unit",
          cutterIndex,
        )
      : undefined,
    option(
      stage,
      "rapid",
      "連射アップ",
      "burst",
      "すぐ撃てる",
      { trigger: 2 + routeBonus, reflex: 1 },
      "unit",
      rapidIndex,
    ),
    option(stage, "sync", "チームアップ", "sync", "みんな速くなる", { sync: 1 + routeBonus, reflex: 1 }),
  ].filter(Boolean) as PrepUpgradeOption[];
  const start = (stage + unlockedUnitCount) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, 3);
};

export const applyPrepUpgradeToGrowths = (
  growths: UnitGrowth[],
  option: PrepUpgradeOption,
  unlockedUnitCount: number,
): UnitGrowth[] =>
  growths.map((growth, index) => {
    const applies =
      index < unlockedUnitCount &&
      (option.target === "all" || option.unitIndex === index);
    if (!applies) {
      return growth;
    }
    return capGrowth({
      reflex: growth.reflex + (option.effect.reflex ?? 0),
      boost: growth.boost + (option.effect.boost ?? 0),
      cutting: growth.cutting + (option.effect.cutting ?? 0),
      trigger: growth.trigger + (option.effect.trigger ?? 0),
      sync: growth.sync + (option.effect.sync ?? 0),
    });
  });

export const joinIndexForStage = (stage: number): number | undefined => {
  if (stage === STAGES_PER_WORLD + 1) {
    return 1;
  }
  if (stage === STAGES_PER_WORLD * 2 + 1) {
    return 2;
  }
  return undefined;
};
