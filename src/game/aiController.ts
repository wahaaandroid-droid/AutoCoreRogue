import { AiActionId, AiConditionId, AiRule } from "../types";

export interface AiRuntimeContext {
  en: number;
  hpPercent: number;
  enPercent: number;
  nearestEnemyDistance: number;
  clusteredEnemyCount: number;
  rightCooldown: number;
  leftCooldown: number;
  leftShoulderCooldown: number;
  rightShoulderCooldown: number;
  bothShoulderCooldown: number;
  rightCanPay: boolean;
  leftCanPay: boolean;
  leftShoulderCanPay: boolean;
  rightShoulderCanPay: boolean;
  bothShoulderCanPay: boolean;
  enemyProjectileDistance: number;
  canGuard: boolean;
}

export interface AiDecision {
  action: AiActionId;
  ruleId?: string;
  condition?: AiConditionId;
}

const isConditionMet = (condition: AiConditionId, context: AiRuntimeContext): boolean => {
  switch (condition) {
    case "hpLow":
      return context.hpPercent <= 0.3;
    case "enemyClose":
      return context.nearestEnemyDistance <= 125;
    case "enemyMid":
      return context.nearestEnemyDistance > 125 && context.nearestEnemyDistance <= 285;
    case "enemyFar":
      return context.nearestEnemyDistance > 285;
    case "enemyClustered":
      return context.clusteredEnemyCount >= 2;
    case "enHigh":
      return context.enPercent >= 0.5;
    case "rightReady":
      return context.rightCooldown <= 0 && context.rightCanPay;
    case "leftReady":
      return context.leftCooldown <= 0 && context.leftCanPay;
    case "leftShoulderReady":
      return context.leftShoulderCooldown <= 0 && context.leftShoulderCanPay;
    case "rightShoulderReady":
      return context.rightShoulderCooldown <= 0 && context.rightShoulderCanPay;
    case "bothShoulderReady":
      return context.bothShoulderCooldown <= 0 && context.bothShoulderCanPay;
    case "shoulderReady":
      return (
        (context.leftShoulderCooldown <= 0 && context.leftShoulderCanPay) ||
        (context.rightShoulderCooldown <= 0 && context.rightShoulderCanPay) ||
        (context.bothShoulderCooldown <= 0 && context.bothShoulderCanPay)
      );
    case "enemyProjectileNear":
      return context.enemyProjectileDistance < 82;
    case "always":
      return true;
    default:
      return false;
  }
};

export const evaluateAiRules = (
  rules: AiRule[],
  context: AiRuntimeContext,
): AiDecision[] => {
  const decisions: AiDecision[] = [];

  for (const rule of rules) {
    if (rule.enabled && rule.action === "guard" && !context.canGuard) {
      continue;
    }
    if (rule.enabled && isConditionMet(rule.condition, context)) {
      decisions.push({
        action: rule.action,
        ruleId: rule.id,
        condition: rule.condition,
      });
    }
  }

  return decisions.length > 0 ? decisions : [{ action: "idle" }];
};
