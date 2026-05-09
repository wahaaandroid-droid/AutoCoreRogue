import { AiActionId, AiConditionId, AiPresetId, AiRule, BaseFrameId, TargetPriorityId } from "../types";

export interface ConditionDefinition {
  id: AiConditionId;
  label: string;
  tint: string;
}

export interface ActionDefinition {
  id: AiActionId;
  label: string;
  tint: string;
}

export interface TargetPriorityDefinition {
  id: TargetPriorityId;
  label: string;
  description: string;
}

export interface AiPresetDefinition {
  id: AiPresetId;
  label: string;
  description: string;
  targetPriority: TargetPriorityId;
  rules: AiRule[];
}

export const conditionDefinitions: ConditionDefinition[] = [
  { id: "hpLow", label: "HPが30%以下", tint: "red" },
  { id: "enemyClose", label: "敵が近距離にいる", tint: "orange" },
  { id: "enemyMid", label: "敵が中距離にいる", tint: "green" },
  { id: "enemyFar", label: "敵が遠距離にいる", tint: "blue" },
  { id: "enemyClustered", label: "敵が密集している", tint: "purple" },
  { id: "enHigh", label: "ENが50%以上", tint: "cyan" },
  { id: "rightReady", label: "右腕武器が使用可能", tint: "blue" },
  { id: "leftReady", label: "左腕武器が使用可能", tint: "green" },
  { id: "leftShoulderReady", label: "左肩武器が使用可能", tint: "orange" },
  { id: "rightShoulderReady", label: "右肩武器が使用可能", tint: "orange" },
  { id: "bothShoulderReady", label: "両肩武器が使用可能", tint: "purple" },
  { id: "shoulderReady", label: "肩武器が使用可能", tint: "purple" },
  { id: "enemyProjectileNear", label: "敵弾が近い", tint: "orange" },
  { id: "always", label: "常に", tint: "gray" },
];

export const actionDefinitions: ActionDefinition[] = [
  { id: "approach", label: "接近する", tint: "blue" },
  { id: "retreat", label: "後退する", tint: "orange" },
  { id: "strafe", label: "横移動する", tint: "green" },
  { id: "boostDodge", label: "ブースト回避", tint: "cyan" },
  { id: "suppressiveFire", label: "牽制射撃", tint: "green" },
  { id: "alphaStrike", label: "一斉射撃", tint: "purple" },
  { id: "fireExplosive", label: "爆発武器攻撃", tint: "orange" },
  { id: "fireLongRange", label: "長射程武器攻撃", tint: "blue" },
  { id: "shootRight", label: "右腕武器を撃つ", tint: "blue" },
  { id: "shootLeft", label: "左腕武器を撃つ", tint: "green" },
  { id: "fireLeftShoulder", label: "左肩武器を撃つ", tint: "orange" },
  { id: "fireRightShoulder", label: "右肩武器を撃つ", tint: "orange" },
  { id: "fireBothShoulders", label: "両肩武器を撃つ", tint: "purple" },
  { id: "fireShoulder", label: "肩武器を撃つ", tint: "purple" },
  { id: "fireMissile", label: "肩ミサイルを撃つ", tint: "orange" },
  { id: "guard", label: "防御する", tint: "gray" },
  { id: "idle", label: "何もしない", tint: "gray" },
];

export const targetPriorityDefinitions: TargetPriorityDefinition[] = [
  { id: "nearest", label: "近い敵", description: "距離が最も近い敵を狙う" },
  { id: "lowestHp", label: "HPが低い敵", description: "残HPが最も少ない敵を狙う" },
  { id: "lowestHpPercent", label: "HP割合が低い敵", description: "削れている敵を優先して狙う" },
  { id: "eliteFirst", label: "強敵優先", description: "ボスやエリートを優先して狙う" },
];

const presetRules = (id: string, rules: Array<Omit<AiRule, "id">>): AiRule[] =>
  rules.map((rule, index) => ({
    id: `${id}-${index + 1}`,
    ...rule,
  }));

export const aiPresetDefinitions: AiPresetDefinition[] = [
  {
    id: "assault",
    label: "強襲",
    description: "近中距離で圧をかけ、撃てる武器を素早く回す",
    targetPriority: "nearest",
    rules: presetRules("assault", [
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "enemyClose", action: "shootLeft", enabled: true },
      { condition: "enemyMid", action: "alphaStrike", enabled: true },
      { condition: "enemyFar", action: "approach", enabled: true },
      { condition: "always", action: "suppressiveFire", enabled: true },
    ]),
  },
  {
    id: "skirmisher",
    label: "近接回避",
    description: "回避と横移動を優先し、軽量機で粘る",
    targetPriority: "lowestHpPercent",
    rules: presetRules("skirmisher", [
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "enemyClose", action: "retreat", enabled: true },
      { condition: "leftReady", action: "shootLeft", enabled: true },
      { condition: "rightReady", action: "shootRight", enabled: true },
      { condition: "always", action: "strafe", enabled: true },
    ]),
  },
  {
    id: "fireSupport",
    label: "火力支援",
    description: "遠距離と腕武器の継続火力を優先する",
    targetPriority: "eliteFirst",
    rules: presetRules("fire-support", [
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "enemyFar", action: "fireLongRange", enabled: true },
      { condition: "rightReady", action: "shootRight", enabled: true },
      { condition: "leftReady", action: "shootLeft", enabled: true },
      { condition: "always", action: "suppressiveFire", enabled: true },
    ]),
  },
  {
    id: "bombard",
    label: "爆撃",
    description: "密集敵へ爆発武器を優先して撃ち込む",
    targetPriority: "eliteFirst",
    rules: presetRules("bombard", [
      { condition: "hpLow", action: "guard", enabled: true },
      { condition: "enemyClustered", action: "fireExplosive", enabled: true },
      { condition: "bothShoulderReady", action: "fireBothShoulders", enabled: true },
      { condition: "shoulderReady", action: "fireShoulder", enabled: true },
      { condition: "enemyFar", action: "fireLongRange", enabled: true },
      { condition: "always", action: "strafe", enabled: true },
    ]),
  },
  {
    id: "missileSupport",
    label: "ミサイル支援",
    description: "肩ミサイルと長射程武器で圧をかける",
    targetPriority: "lowestHp",
    rules: presetRules("missile-support", [
      { condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { condition: "shoulderReady", action: "fireMissile", enabled: true },
      { condition: "enemyFar", action: "fireLongRange", enabled: true },
      { condition: "enemyMid", action: "suppressiveFire", enabled: true },
      { condition: "always", action: "strafe", enabled: true },
    ]),
  },
  {
    id: "defender",
    label: "防御",
    description: "シールドや重装甲で耐えながら射撃する",
    targetPriority: "nearest",
    rules: presetRules("defender", [
      { condition: "hpLow", action: "guard", enabled: true },
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

export const createAiPresetRules = (preset: AiPresetId, slotCount?: number): AiRule[] => {
  const definition = getAiPresetDefinition(preset);
  const rules = definition.id === "custom"
    ? createInitialAiRules()
    : definition.rules.map((rule) => ({ ...rule }));
  return slotCount ? ensureAiRuleSlots(rules, slotCount) : rules;
};

export const createEmptyRule = (index: number): AiRule => ({
  id: `rule-${index + 1}`,
  condition: index === 0 ? "enemyProjectileNear" : "always",
  action: index === 0 ? "boostDodge" : "idle",
  enabled: true,
});

export const createInitialAiRules = (frameId: BaseFrameId = "medium"): AiRule[] =>
  createAiPresetRules(defaultAiPresetForFrame(frameId));

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
