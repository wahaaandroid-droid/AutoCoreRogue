import {
  AiActionId,
  AiConditionId,
  AiDefinitionCategory,
  AiDefinitionTier,
  AiPresetId,
  AiRule,
  AiUnlockPackageId,
  BaseFrameId,
  DerivedStats,
  TargetPriorityId,
} from "../types";
import { STARTER_AI_SLOT_COUNT, getAiUnlockState, isAiRuleUnlocked } from "./aiUnlocks";

export interface ConditionDefinition {
  id: AiConditionId;
  label: string;
  tint: string;
  tier: AiDefinitionTier;
  category: AiDefinitionCategory;
  isStarter: boolean;
  unlockPackageId?: AiUnlockPackageId;
}

export interface ActionDefinition {
  id: AiActionId;
  label: string;
  tint: string;
  tier: AiDefinitionTier;
  category: AiDefinitionCategory;
  isStarter: boolean;
  unlockPackageId?: AiUnlockPackageId;
}

export interface TargetPriorityDefinition {
  id: TargetPriorityId;
  label: string;
  description: string;
  isStarter: boolean;
  unlockPackageId?: AiUnlockPackageId;
}

export interface AiPresetDefinition {
  id: AiPresetId;
  label: string;
  description: string;
  targetPriority: TargetPriorityId;
  rules: AiRule[];
}

const condition = (
  id: AiConditionId,
  label: string,
  tint: string,
  category: AiDefinitionCategory,
  tier: AiDefinitionTier = "starter",
  unlockPackageId?: AiUnlockPackageId,
): ConditionDefinition => ({
  id,
  label,
  tint,
  category,
  tier,
  unlockPackageId,
  isStarter: !unlockPackageId,
});

const action = (
  id: AiActionId,
  label: string,
  tint: string,
  category: AiDefinitionCategory,
  tier: AiDefinitionTier = "starter",
  unlockPackageId?: AiUnlockPackageId,
): ActionDefinition => ({
  id,
  label,
  tint,
  category,
  tier,
  unlockPackageId,
  isStarter: !unlockPackageId,
});

export const conditionDefinitions: ConditionDefinition[] = [
  condition("enemyClose", "敵が近距離にいる", "orange", "targeting"),
  condition("enemyMid", "敵が中距離にいる", "green", "targeting"),
  condition("enemyFar", "敵が遠距離にいる", "blue", "targeting"),
  condition("rightReady", "右腕武器が使用可能", "blue", "weapon"),
  condition("leftReady", "左腕武器が使用可能", "green", "weapon"),
  condition("always", "常に", "gray", "utility"),
  condition("hpLow", "HPが30%以下", "red", "defense", "tactical", "w1-guard-logic"),
  condition("enemyProjectileNear", "敵弾が近い", "orange", "defense", "tactical", "w1-boost-dodge"),
  condition("enHigh", "ENが50%以上", "cyan", "weapon", "tactical", "w1-suppressive-fire"),
  condition("enemyClustered", "敵が密集している", "purple", "targeting", "advanced", "w2-explosive"),
  condition("incomingMissile", "ミサイル接近", "red", "defense", "advanced", "w2-missile"),
  condition("incomingBallistic", "実弾が接近", "orange", "defense", "advanced", "w2-damage-defense"),
  condition("incomingEnergy", "EN攻撃が接近", "cyan", "defense", "advanced", "w2-damage-defense"),
  condition("incomingBeamLock", "レーザー照準中", "purple", "defense", "expert", "w3-beam-counter"),
];

export const actionDefinitions: ActionDefinition[] = [
  action("approach", "接近する", "blue", "movement"),
  action("retreat", "後退する", "orange", "movement"),
  action("strafe", "横移動する", "green", "movement"),
  action("shootRight", "右腕武器を撃つ", "blue", "weapon"),
  action("shootLeft", "左腕武器を撃つ", "green", "weapon"),
  action("idle", "何もしない", "gray", "utility"),
  action("boostDodge", "ブースト回避", "cyan", "movement", "tactical", "w1-boost-dodge"),
  action("guard", "防御する", "gray", "defense", "tactical", "w1-guard-logic"),
  action("suppressiveFire", "牽制射撃", "green", "weapon", "tactical", "w1-suppressive-fire"),
  action("fireLongRange", "長射程武器攻撃", "blue", "weapon", "advanced", "w2-long-range"),
  action("fireExplosive", "爆発武器攻撃", "orange", "weapon", "advanced", "w2-explosive"),
  action("fireMissile", "ミサイル攻撃", "orange", "weapon", "advanced", "w2-missile"),
  action("alphaStrike", "一斉射撃", "purple", "weapon", "expert", "w3-alpha-strike"),
  action("interceptMissile", "ミサイル迎撃", "cyan", "defense", "expert", "w3-missile-intercept"),
];

export const targetPriorityDefinitions: TargetPriorityDefinition[] = [
  { id: "nearest", label: "近い敵", description: "距離が最も近い敵を狙う", isStarter: true },
  {
    id: "lowestHp",
    label: "HPが低い敵",
    description: "残HPが最も少ない敵を狙う",
    isStarter: false,
    unlockPackageId: "w2-focus-fire",
  },
  {
    id: "lowestHpPercent",
    label: "HP割合が低い敵",
    description: "削れている敵を優先して狙う",
    isStarter: false,
    unlockPackageId: "w2-focus-fire",
  },
  {
    id: "eliteFirst",
    label: "強敵優先",
    description: "ボスやエリートを優先して狙う",
    isStarter: false,
    unlockPackageId: "w3-elite-hunter",
  },
];

const presetRules = (id: string, rules: Array<Omit<AiRule, "id">>): AiRule[] =>
  rules.map((rule, index) => ({
    id: `${id}-${index + 1}`,
    ...rule,
  }));

export const aiPresetDefinitions: AiPresetDefinition[] = [
  {
    id: "assault",
    label: "近距離基礎",
    description: "接近と左右腕の基本射撃から始める前衛設計図",
    targetPriority: "nearest",
    rules: presetRules("assault", [
      { condition: "incomingBeamLock", action: "boostDodge", enabled: true },
      { condition: "incomingMissile", action: "interceptMissile", enabled: true },
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "enemyClose", action: "shootLeft", enabled: true },
      { condition: "enemyMid", action: "alphaStrike", enabled: true },
      { condition: "enemyFar", action: "approach", enabled: true },
      { condition: "always", action: "suppressiveFire", enabled: true },
    ]),
  },
  {
    id: "skirmisher",
    label: "射撃維持",
    description: "横移動しながら左右武器を回す継続戦闘設計図",
    targetPriority: "lowestHpPercent",
    rules: presetRules("skirmisher", [
      { condition: "incomingBeamLock", action: "boostDodge", enabled: true },
      { condition: "incomingMissile", action: "boostDodge", enabled: true },
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "enemyClose", action: "retreat", enabled: true },
      { condition: "leftReady", action: "shootLeft", enabled: true },
      { condition: "rightReady", action: "shootRight", enabled: true },
      { condition: "always", action: "strafe", enabled: true },
    ]),
  },
  {
    id: "fireSupport",
    label: "高火力型",
    description: "長射程と腕武器をつなげて火力を伸ばす設計図",
    targetPriority: "eliteFirst",
    rules: presetRules("fire-support", [
      { condition: "incomingMissile", action: "interceptMissile", enabled: true },
      { condition: "incomingBeamLock", action: "boostDodge", enabled: true },
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "enemyFar", action: "fireLongRange", enabled: true },
      { condition: "rightReady", action: "shootRight", enabled: true },
      { condition: "leftReady", action: "shootLeft", enabled: true },
      { condition: "always", action: "suppressiveFire", enabled: true },
    ]),
  },
  {
    id: "bombard",
    label: "爆撃型",
    description: "密集敵へ爆発武器を撃ち込む設計図",
    targetPriority: "eliteFirst",
    rules: presetRules("bombard", [
      { condition: "hpLow", action: "guard", enabled: true },
      { condition: "incomingBallistic", action: "guard", enabled: true },
      { condition: "incomingMissile", action: "interceptMissile", enabled: true },
      { condition: "enemyClustered", action: "fireExplosive", enabled: true },
      { condition: "enemyFar", action: "fireLongRange", enabled: true },
      { condition: "always", action: "strafe", enabled: true },
    ]),
  },
  {
    id: "missileSupport",
    label: "ミサイル型",
    description: "ミサイルと長射程武器で圧をかける設計図",
    targetPriority: "lowestHp",
    rules: presetRules("missile-support", [
      { condition: "incomingMissile", action: "interceptMissile", enabled: true },
      { condition: "incomingBeamLock", action: "boostDodge", enabled: true },
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "enemyMid", action: "fireMissile", enabled: true },
      { condition: "enemyFar", action: "fireLongRange", enabled: true },
      { condition: "enemyMid", action: "suppressiveFire", enabled: true },
      { condition: "always", action: "strafe", enabled: true },
    ]),
  },
  {
    id: "defender",
    label: "防御型",
    description: "シールドや重装甲で耐えながら射撃する設計図",
    targetPriority: "nearest",
    rules: presetRules("defender", [
      { condition: "hpLow", action: "guard", enabled: true },
      { condition: "incomingEnergy", action: "guard", enabled: true },
      { condition: "incomingBallistic", action: "guard", enabled: true },
      { condition: "incomingMissile", action: "interceptMissile", enabled: true },
      { condition: "enemyProjectileNear", action: "guard", enabled: true },
      { condition: "enemyClustered", action: "fireExplosive", enabled: true },
      { condition: "enemyFar", action: "fireLongRange", enabled: true },
      { condition: "always", action: "suppressiveFire", enabled: true },
    ]),
  },
  {
    id: "custom",
    label: "カスタム",
    description: "詳細編集したルールをそのまま使う",
    targetPriority: "nearest",
    rules: [],
  },
];

export const getConditionLabel = (condition: AiConditionId): string =>
  conditionDefinitions.find((item) => item.id === condition)?.label ?? condition;

export const getActionLabel = (action: AiActionId): string =>
  actionDefinitions.find((item) => item.id === action)?.label ?? action;

export const getTargetPriorityLabel = (priority: TargetPriorityId): string =>
  targetPriorityDefinitions.find((item) => item.id === priority)?.label ?? priority;

export const getAiPresetDefinition = (preset: AiPresetId): AiPresetDefinition =>
  aiPresetDefinitions.find((item) => item.id === preset) ?? aiPresetDefinitions[0];

export const getAiPresetLabel = (preset: AiPresetId): string =>
  getAiPresetDefinition(preset).label;

export const defaultAiPresetForFrame = (frameId: BaseFrameId = "medium"): AiPresetId => {
  switch (frameId) {
    case "light":
      return "skirmisher";
    case "heavy":
    case "quad":
      return "bombard";
    case "tank":
      return "defender";
    case "medium":
    default:
      return "assault";
  }
};

export const createAiPresetRules = (
  preset: AiPresetId,
  slotCount = STARTER_AI_SLOT_COUNT,
  unlockedPackageIds: AiUnlockPackageId[] = [],
): AiRule[] => {
  const definition = getAiPresetDefinition(preset);
  const unlockState = getAiUnlockState(unlockedPackageIds);
  const filteredRules = definition.id === "custom"
    ? starterRuleTemplate()
    : definition.rules
        .filter((rule) => isAiRuleUnlocked(rule, unlockState))
        .map((rule) => ({ ...rule }));
  const rules = mergeStarterRules(filteredRules);
  return ensureAiRuleSlots(rules, slotCount);
};

const starterRuleTemplate = (): AiRule[] => [
  {
    id: "starter-1",
    condition: "enemyFar",
    action: "approach",
    enabled: true,
  },
  {
    id: "starter-2",
    condition: "rightReady",
    action: "shootRight",
    enabled: true,
  },
  {
    id: "starter-3",
    condition: "leftReady",
    action: "shootLeft",
    enabled: true,
  },
  {
    id: "starter-4",
    condition: "always",
    action: "strafe",
    enabled: true,
  },
];

const mergeStarterRules = (rules: AiRule[]): AiRule[] => {
  const next = [...rules];
  for (const starterRule of starterRuleTemplate()) {
    const duplicate = next.some(
      (rule) => rule.condition === starterRule.condition && rule.action === starterRule.action,
    );
    if (!duplicate) {
      next.push({ ...starterRule, id: `${starterRule.id}-${next.length + 1}` });
    }
  }
  return next;
};

export const createEmptyRule = (index: number): AiRule => ({
  id: `rule-${index + 1}`,
  condition: "always",
  action: "idle",
  enabled: true,
});

export const createInitialAiRules = (frameId: BaseFrameId = "medium"): AiRule[] =>
  createAiPresetRules(defaultAiPresetForFrame(frameId), STARTER_AI_SLOT_COUNT);

export const ensureAiRuleSlots = (rules: AiRule[], slotCount: number): AiRule[] => {
  const normalized = [...rules];
  while (normalized.length < slotCount) {
    normalized.push(createEmptyRule(normalized.length));
  }
  return normalized.slice(0, slotCount).map((rule, index) => ({
    ...rule,
    id: rule.id || `rule-${index + 1}`,
  }));
};

export const getAvailableConditionDefinitions = (
  unlockedPackageIds: AiUnlockPackageId[] = [],
): ConditionDefinition[] => {
  const unlockState = getAiUnlockState(unlockedPackageIds);
  return conditionDefinitions.filter((item) => unlockState.conditions.has(item.id));
};

export const getAvailableActionDefinitions = (
  unlockedPackageIds: AiUnlockPackageId[] = [],
): ActionDefinition[] => {
  const unlockState = getAiUnlockState(unlockedPackageIds);
  return actionDefinitions.filter((item) => unlockState.actions.has(item.id));
};

export const getAvailableTargetPriorityDefinitions = (
  unlockedPackageIds: AiUnlockPackageId[] = [],
): TargetPriorityDefinition[] => {
  const unlockState = getAiUnlockState(unlockedPackageIds);
  return targetPriorityDefinitions.filter((item) => unlockState.targetPriorities.has(item.id));
};

const autoRule = (id: string, condition: AiRule["condition"], action: AiRule["action"]): AiRule => ({
  id,
  condition,
  action,
  enabled: true,
});

export const createAutoCombatRules = (stats: DerivedStats): AiRule[] => {
  const hasWeaponKind = (kind: string): boolean =>
    stats.weapons.some((weapon) => weapon.weaponKind === kind);
  const hasExplosive = stats.weapons.some((weapon) =>
    weapon.weaponKind === "rocket" || weapon.weaponKind === "grenade" || weapon.blastRadius > 0,
  );
  const hasLongRange = stats.weapons.some((weapon) =>
    weapon.weaponKind === "sniperRifle" ||
    weapon.weaponKind === "beamLaser" ||
    weapon.weaponKind === "rocket" ||
    weapon.weaponKind === "missile" ||
    weapon.range >= 390,
  );
  const rules: AiRule[] = [
    autoRule("auto-beam-dodge", "incomingBeamLock", "boostDodge"),
    autoRule("auto-missile-intercept", "incomingMissile", "interceptMissile"),
    autoRule("auto-projectile-dodge", "enemyProjectileNear", "boostDodge"),
  ];

  if (stats.canGuard) {
    rules.push(
      autoRule("auto-low-hp-guard", "hpLow", "guard"),
      autoRule("auto-ballistic-guard", "incomingBallistic", "guard"),
      autoRule("auto-energy-guard", "incomingEnergy", "guard"),
    );
  }
  if (hasExplosive) {
    rules.push(autoRule("auto-cluster-explosive", "enemyClustered", "fireExplosive"));
  }
  if (hasWeaponKind("missile")) {
    rules.push(autoRule("auto-missile-fire", "enemyMid", "fireMissile"));
  }
  if (hasLongRange) {
    rules.push(autoRule("auto-long-range", "enemyFar", "fireLongRange"));
  } else {
    rules.push(autoRule("auto-approach", "enemyFar", "approach"));
  }
  rules.push(
    autoRule("auto-alpha", "enemyMid", "alphaStrike"),
    autoRule("auto-left", "leftReady", "shootLeft"),
    autoRule("auto-right", "rightReady", "shootRight"),
    autoRule("auto-strafe", "always", "strafe"),
    autoRule("auto-suppress", "always", "suppressiveFire"),
  );

  return rules;
};

export const createAutoTargetPriority = (stats: DerivedStats): TargetPriorityId => {
  if (stats.weapons.some((weapon) => weapon.weaponKind === "sniperRifle" || weapon.range >= 470)) {
    return "eliteFirst";
  }
  if (stats.weapons.some((weapon) => weapon.weaponKind === "machineGun" || weapon.weaponKind === "pulse")) {
    return "lowestHpPercent";
  }
  return "nearest";
};
