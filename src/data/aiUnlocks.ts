import {
  AiActionId,
  AiConditionId,
  AiRule,
  AiUnlockPackage,
  AiUnlockPackageId,
  TargetPriorityId,
} from "../types";
import { StageType, worldForStage } from "./stages";

export const STARTER_AI_SLOT_COUNT = 4;

export const STARTER_AI_ACTIONS: AiActionId[] = [
  "approach",
  "retreat",
  "strafe",
  "shootRight",
  "shootLeft",
  "idle",
];

export const STARTER_AI_CONDITIONS: AiConditionId[] = [
  "enemyClose",
  "enemyMid",
  "enemyFar",
  "rightReady",
  "leftReady",
  "always",
];

export const STARTER_TARGET_PRIORITIES: TargetPriorityId[] = ["nearest"];

const rule = (
  id: string,
  condition: AiConditionId,
  action: AiActionId,
): AiRule => ({
  id,
  condition,
  action,
  enabled: true,
});

export const aiUnlockPackages: AiUnlockPackage[] = [
  {
    id: "w1-boost-dodge",
    name: "ブースト回避",
    world: 1,
    rarity: "common",
    actions: ["boostDodge"],
    conditions: ["enemyProjectileNear"],
    targetPriorities: [],
    recommendedRules: [rule("chip-boost-dodge", "enemyProjectileNear", "boostDodge")],
    description: "敵弾接近を読んで横方向へクイックブーストする基礎回避AI。",
  },
  {
    id: "w1-guard-logic",
    name: "ガード判断",
    world: 1,
    rarity: "common",
    actions: ["guard"],
    conditions: ["hpLow"],
    targetPriorities: [],
    recommendedRules: [rule("chip-guard-low-hp", "hpLow", "guard")],
    description: "HP低下時にシールドを構える防御AI。シールド装備で真価を発揮する。",
  },
  {
    id: "w1-suppressive-fire",
    name: "制圧射撃",
    world: 1,
    rarity: "rare",
    actions: ["suppressiveFire"],
    conditions: ["enHigh"],
    targetPriorities: [],
    recommendedRules: [rule("chip-suppressive-fire", "enHigh", "suppressiveFire")],
    description: "ENに余裕がある時、使える武器を継続的に回す攻撃AI。",
  },
  {
    id: "w2-long-range",
    name: "長距離射撃",
    world: 2,
    rarity: "common",
    actions: ["fireLongRange"],
    conditions: [],
    targetPriorities: [],
    recommendedRules: [rule("chip-long-range", "enemyFar", "fireLongRange")],
    description: "遠距離の敵へ射程の長い武器を優先して撃つ支援AI。",
  },
  {
    id: "w2-explosive",
    name: "爆発武器運用",
    world: 2,
    rarity: "rare",
    actions: ["fireExplosive"],
    conditions: ["enemyClustered"],
    targetPriorities: [],
    recommendedRules: [rule("chip-explosive-cluster", "enemyClustered", "fireExplosive")],
    description: "密集した敵にロケットやグレネードを撃ち込む範囲火力AI。",
  },
  {
    id: "w2-missile",
    name: "ミサイル運用",
    world: 2,
    rarity: "rare",
    actions: ["fireMissile"],
    conditions: ["incomingMissile"],
    targetPriorities: [],
    recommendedRules: [rule("chip-fire-missile", "enemyMid", "fireMissile")],
    description: "ミサイル系武器の発射判断とミサイル接近の検知をまとめる。",
  },
  {
    id: "w2-damage-defense",
    name: "実弾/EN防御判断",
    world: 2,
    rarity: "rare",
    actions: [],
    conditions: ["incomingBallistic", "incomingEnergy"],
    targetPriorities: [],
    recommendedRules: [
      rule("chip-guard-ballistic", "incomingBallistic", "guard"),
      rule("chip-guard-energy", "incomingEnergy", "guard"),
    ],
    description: "実弾とEN攻撃を見分け、防御や回避の条件に使えるようにする。",
  },
  {
    id: "w2-focus-fire",
    name: "弱敵集中狙い",
    world: 2,
    rarity: "common",
    actions: [],
    conditions: [],
    targetPriorities: ["lowestHp", "lowestHpPercent"],
    recommendedRules: [],
    description: "残HPの低い敵を優先し、撃破数を安定させるターゲットAI。",
  },
  {
    id: "w3-alpha-strike",
    name: "αストライク",
    world: 3,
    rarity: "elite",
    actions: ["alphaStrike"],
    conditions: [],
    targetPriorities: [],
    recommendedRules: [rule("chip-alpha-strike", "enemyMid", "alphaStrike")],
    description: "中距離で全武装を同期して叩き込む高火力AI。",
  },
  {
    id: "w3-missile-intercept",
    name: "ミサイル迎撃",
    world: 3,
    rarity: "elite",
    actions: ["interceptMissile"],
    conditions: [],
    targetPriorities: [],
    recommendedRules: [rule("chip-missile-intercept", "incomingMissile", "interceptMissile")],
    description: "接近ミサイルに腕部武器を向け、迎撃判定を狙う防空AI。",
  },
  {
    id: "w3-beam-counter",
    name: "レーザー照準回避",
    world: 3,
    rarity: "elite",
    actions: [],
    conditions: ["incomingBeamLock"],
    targetPriorities: [],
    recommendedRules: [rule("chip-beam-counter", "incomingBeamLock", "boostDodge")],
    description: "照射レーザーの予兆ラインを検知し、ブースト回避条件にできる。",
  },
  {
    id: "w3-elite-hunter",
    name: "エリート優先狙い",
    world: 3,
    rarity: "rare",
    actions: [],
    conditions: [],
    targetPriorities: ["eliteFirst"],
    recommendedRules: [],
    description: "エリートやボスを優先して狙い、小隊火力を強敵へ集中させる。",
  },
];

const packageIds = new Set(aiUnlockPackages.map((item) => item.id));

export const createInitialUnlockedAiPackageIds = (): AiUnlockPackageId[] => [];

export const normalizeAiUnlockPackageIds = (
  packageIdsValue: AiUnlockPackageId[] | undefined,
): AiUnlockPackageId[] => {
  if (!Array.isArray(packageIdsValue)) {
    return createInitialUnlockedAiPackageIds();
  }
  const unique = new Set<AiUnlockPackageId>();
  for (const id of packageIdsValue) {
    if (packageIds.has(id)) {
      unique.add(id);
    }
  }
  return [...unique];
};

export interface AiUnlockState {
  packageIds: Set<AiUnlockPackageId>;
  actions: Set<AiActionId>;
  conditions: Set<AiConditionId>;
  targetPriorities: Set<TargetPriorityId>;
}

export const getAiUnlockState = (unlockedPackageIds: AiUnlockPackageId[] = []): AiUnlockState => {
  const state: AiUnlockState = {
    packageIds: new Set(unlockedPackageIds),
    actions: new Set(STARTER_AI_ACTIONS),
    conditions: new Set(STARTER_AI_CONDITIONS),
    targetPriorities: new Set(STARTER_TARGET_PRIORITIES),
  };

  for (const item of aiUnlockPackages) {
    item.actions.forEach((action) => state.actions.add(action));
    item.conditions.forEach((condition) => state.conditions.add(condition));
    item.targetPriorities.forEach((priority) => state.targetPriorities.add(priority));
  }

  return state;
};

export const getAiUnlockPackage = (id: AiUnlockPackageId): AiUnlockPackage =>
  aiUnlockPackages.find((item) => item.id === id) ?? aiUnlockPackages[0];

export const isAiRuleUnlocked = (ruleItem: AiRule, unlockState: AiUnlockState): boolean =>
  unlockState.conditions.has(ruleItem.condition) && unlockState.actions.has(ruleItem.action);

export const normalizeRulesForCombat = (
  rules: AiRule[],
  unlockState: AiUnlockState,
): AiRule[] =>
  rules.map((ruleItem) =>
    isAiRuleUnlocked(ruleItem, unlockState)
      ? ruleItem
      : {
          ...ruleItem,
          action: "idle",
        },
  );

const rarityWeight = (rarity: AiUnlockPackage["rarity"]): number =>
  rarity === "elite" ? 3 : rarity === "rare" ? 2 : 1;

export const getLockedAiUnlockPackages = (
  unlockedPackageIds: AiUnlockPackageId[] = [],
): AiUnlockPackage[] => {
  const unlocked = new Set(unlockedPackageIds);
  return aiUnlockPackages.filter((item) => !unlocked.has(item.id));
};

export const selectAiUnlockPackagesForReward = (
  stage: number,
  stageType: StageType,
  unlockedPackageIds: AiUnlockPackageId[] = [],
  count = 1,
): AiUnlockPackage[] => {
  const world = worldForStage(stage);
  const maxWorld = stageType === "boss" ? Math.min(3, world + 1) : world;
  const locked = getLockedAiUnlockPackages(unlockedPackageIds).filter((item) => item.world <= maxWorld);
  const preferred = locked.filter((item) => item.world === maxWorld);
  const fallback = locked.filter((item) => item.world !== maxWorld);
  const sorted = [...preferred, ...fallback].sort((a, b) => {
    if (stageType === "elite" || stageType === "boss") {
      return rarityWeight(b.rarity) - rarityWeight(a.rarity) || a.world - b.world;
    }
    return a.world - b.world || rarityWeight(a.rarity) - rarityWeight(b.rarity);
  });
  return sorted.slice(0, count);
};

export const selectAiUnlockPackagesForShop = (
  stage: number,
  unlockedPackageIds: AiUnlockPackageId[] = [],
  count = 2,
): AiUnlockPackage[] => {
  const world = worldForStage(stage);
  const locked = getLockedAiUnlockPackages(unlockedPackageIds).filter((item) => item.world <= world);
  return locked
    .sort((a, b) => a.world - b.world || rarityWeight(a.rarity) - rarityWeight(b.rarity))
    .slice(0, count);
};
