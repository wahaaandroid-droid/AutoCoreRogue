import { AiActionId, AiConditionId, AiRule, BaseFrameId, TargetPriorityId } from "../types";

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

export const getConditionLabel = (condition: AiConditionId): string =>
  conditionDefinitions.find((item) => item.id === condition)?.label ?? condition;

export const getActionLabel = (action: AiActionId): string =>
  actionDefinitions.find((item) => item.id === action)?.label ?? action;

export const getTargetPriorityLabel = (priority: TargetPriorityId): string =>
  targetPriorityDefinitions.find((item) => item.id === priority)?.label ?? priority;

export const createEmptyRule = (index: number): AiRule => ({
  id: `rule-${index + 1}`,
  condition: index === 0 ? "enemyProjectileNear" : "always",
  action: index === 0 ? "boostDodge" : "idle",
  enabled: true,
});

export const createInitialAiRules = (frameId: BaseFrameId = "medium"): AiRule[] => {
  switch (frameId) {
    case "light":
      return [
        { id: "rule-1", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
        { id: "rule-2", condition: "enemyClose", action: "shootLeft", enabled: true },
        { id: "rule-3", condition: "enemyFar", action: "fireLongRange", enabled: true },
        { id: "rule-4", condition: "shoulderReady", action: "suppressiveFire", enabled: true },
        { id: "rule-5", condition: "always", action: "strafe", enabled: true },
      ];
    case "heavy":
      return [
        { id: "rule-1", condition: "enemyClose", action: "guard", enabled: true },
        { id: "rule-2", condition: "enemyClustered", action: "fireExplosive", enabled: true },
        { id: "rule-3", condition: "enemyFar", action: "fireLongRange", enabled: true },
        { id: "rule-4", condition: "enemyMid", action: "alphaStrike", enabled: true },
        { id: "rule-5", condition: "always", action: "suppressiveFire", enabled: true },
      ];
    case "quad":
      return [
        { id: "rule-1", condition: "enemyFar", action: "fireLongRange", enabled: true },
        { id: "rule-2", condition: "enemyClustered", action: "fireExplosive", enabled: true },
        { id: "rule-3", condition: "enemyMid", action: "alphaStrike", enabled: true },
        { id: "rule-4", condition: "always", action: "suppressiveFire", enabled: true },
        { id: "rule-5", condition: "always", action: "strafe", enabled: true },
      ];
    case "tank":
      return [
        { id: "rule-1", condition: "hpLow", action: "guard", enabled: true },
        { id: "rule-2", condition: "enemyClustered", action: "fireExplosive", enabled: true },
        { id: "rule-3", condition: "enemyFar", action: "fireLongRange", enabled: true },
        { id: "rule-4", condition: "enemyMid", action: "alphaStrike", enabled: true },
        { id: "rule-5", condition: "always", action: "approach", enabled: true },
      ];
    case "medium":
    default:
      return [
        { id: "rule-1", condition: "hpLow", action: "retreat", enabled: true },
        { id: "rule-2", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
        { id: "rule-3", condition: "enemyClustered", action: "fireExplosive", enabled: true },
        { id: "rule-4", condition: "enemyFar", action: "fireLongRange", enabled: true },
        { id: "rule-5", condition: "always", action: "suppressiveFire", enabled: true },
      ];
  }
};

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
