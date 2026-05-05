import { AiActionId, AiConditionId, AiRule } from "../types";

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

export const conditionDefinitions: ConditionDefinition[] = [
  { id: "hpLow", label: "HPが30%以下", tint: "red" },
  { id: "enemyClose", label: "敵が近距離にいる", tint: "orange" },
  { id: "enemyMid", label: "敵が中距離にいる", tint: "green" },
  { id: "enemyFar", label: "敵が遠距離にいる", tint: "blue" },
  { id: "enHigh", label: "ENが50%以上", tint: "cyan" },
  { id: "rightReady", label: "右腕武器が使用可能", tint: "blue" },
  { id: "leftReady", label: "左腕武器が使用可能", tint: "green" },
  { id: "enemyProjectileNear", label: "敵弾が近い", tint: "orange" },
  { id: "always", label: "常に", tint: "gray" },
];

export const actionDefinitions: ActionDefinition[] = [
  { id: "approach", label: "接近する", tint: "blue" },
  { id: "retreat", label: "後退する", tint: "orange" },
  { id: "strafe", label: "横移動する", tint: "green" },
  { id: "boostDodge", label: "ブースト回避", tint: "cyan" },
  { id: "shootRight", label: "右腕武器を撃つ", tint: "blue" },
  { id: "shootLeft", label: "左腕武器を撃つ", tint: "green" },
  { id: "fireMissile", label: "ミサイルを撃つ", tint: "orange" },
  { id: "guard", label: "防御する", tint: "gray" },
  { id: "idle", label: "何もしない", tint: "gray" },
];

export const getConditionLabel = (condition: AiConditionId): string =>
  conditionDefinitions.find((item) => item.id === condition)?.label ?? condition;

export const getActionLabel = (action: AiActionId): string =>
  actionDefinitions.find((item) => item.id === action)?.label ?? action;

export const createEmptyRule = (index: number): AiRule => ({
  id: `rule-${index + 1}`,
  condition: index === 0 ? "enemyProjectileNear" : "always",
  action: index === 0 ? "boostDodge" : "idle",
  enabled: true,
});

export const createInitialAiRules = (): AiRule[] => [
  { id: "rule-1", condition: "hpLow", action: "retreat", enabled: true },
  { id: "rule-2", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
  { id: "rule-3", condition: "rightReady", action: "shootRight", enabled: true },
  { id: "rule-4", condition: "leftReady", action: "shootLeft", enabled: true },
  { id: "rule-5", condition: "always", action: "strafe", enabled: true },
];

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
