import type {
  ClearStartBonusChoice,
  DerivedStats,
  MetaRunHistoryEntry,
  MetaSaveState,
  PendingRelicReward,
  RelicBonuses,
  RelicDefinition,
  RelicId,
  RelicRewardOption,
} from "../types";
import { worldForStage } from "./stages";

export const relicDefinitions: RelicDefinition[] = [
  {
    id: "boot-log",
    name: "起動ログ",
    rarity: "common",
    maxLevel: 3,
    description: "新ラン開始時の初期CRが少し増える。",
    effectKind: "initialCredits",
    values: [40, 70, 100],
    unlockCondition: "defeat",
  },
  {
    id: "reserve-cell",
    name: "予備セル",
    rarity: "common",
    maxLevel: 3,
    description: "UNIT 1 のEN容量が少し増える。",
    effectKind: "unitOneEn",
    values: [0.03, 0.05, 0.07],
    unlockCondition: "defeat",
  },
  {
    id: "armor-sample",
    name: "装甲サンプル",
    rarity: "common",
    maxLevel: 3,
    description: "UNIT 1 の最大HPが少し増える。",
    effectKind: "unitOneHp",
    values: [0.03, 0.05, 0.07],
    unlockCondition: "defeat",
  },
  {
    id: "mechanic-mark",
    name: "整備士の刻印",
    rarity: "common",
    maxLevel: 3,
    description: "休憩地点でのHP回復量が増える。",
    effectKind: "restHealBonus",
    values: [0.08, 0.12, 0.16],
    unlockCondition: "defeat",
  },
  {
    id: "junk-appraiser",
    name: "ジャンク鑑定札",
    rarity: "common",
    maxLevel: 3,
    description: "ショップのパーツ価格が下がる。",
    effectKind: "partShopDiscount",
    values: [0.05, 0.08, 0.12],
    unlockCondition: "defeat",
  },
  {
    id: "tactical-memory",
    name: "戦術メモリ片",
    rarity: "rare",
    maxLevel: 3,
    description: "報酬候補に特殊装備が並びやすくなる。",
    effectKind: "aiRewardBias",
    values: [1, 1, 1],
    unlockCondition: "defeat",
  },
  {
    id: "merchant-tag",
    name: "商人の認証タグ",
    rarity: "rare",
    maxLevel: 3,
    description: "ショップの特殊装備価格が下がる。",
    effectKind: "aiShopDiscount",
    values: [0.1, 0.15, 0.2],
    unlockCondition: "defeat",
  },
  {
    id: "reward-filter",
    name: "報酬フィルタ",
    rarity: "rare",
    maxLevel: 3,
    description: "各ワールド1回、戦闘報酬候補を再抽選できる。",
    effectKind: "rewardRerolls",
    values: [1, 1, 1],
    unlockCondition: "defeat",
  },
  {
    id: "route-scanner",
    name: "ルートスキャナ",
    rarity: "rare",
    maxLevel: 3,
    description: "分岐ルートの候補が少ない場面で追加ルートを表示する。",
    effectKind: "extraRouteChoice",
    values: [1, 1, 1],
    unlockCondition: "defeat",
  },
  {
    id: "supply-beacon",
    name: "補給ビーコン",
    rarity: "rare",
    maxLevel: 3,
    description: "World 2/3 突入時に全機HPを回復する。",
    effectKind: "worldEntryHeal",
    values: [0.1, 0.15, 0.2],
    unlockCondition: "defeat",
  },
  {
    id: "elite-blackbox",
    name: "エリートの黒箱",
    rarity: "elite",
    maxLevel: 3,
    description: "エリート撃破報酬の候補数が増える。",
    effectKind: "eliteRewardOption",
    values: [1, 1, 1],
    unlockCondition: "defeat",
  },
  {
    id: "triple-core-sync",
    name: "三連コア同期装置",
    rarity: "elite",
    maxLevel: 3,
    description: "World 2/3 で新加入する機体の特殊装備候補が増えやすくなる。",
    effectKind: "reinforcementAiSlot",
    values: [1, 1, 1],
    unlockCondition: "defeat",
  },
  {
    id: "world-core-echo",
    name: "世界核の残響",
    rarity: "elite",
    maxLevel: 3,
    description: "ボス撃破後の報酬候補にレア以上が出やすくなる。",
    effectKind: "bossRewardBias",
    values: [1, 1, 1],
    unlockCondition: "defeat",
  },
  {
    id: "clear-auth-key",
    name: "クリア認証キー",
    rarity: "clear",
    maxLevel: 3,
    description: "全クリア専用。新ラン開始時の小さな開幕ボーナスを選べる。",
    effectKind: "clearStartChoice",
    values: [1, 2, 3],
    unlockCondition: "clear",
  },
];

const relicById = new Map(relicDefinitions.map((definition) => [definition.id, definition]));

export const createInitialMetaSaveState = (): MetaSaveState => ({
  ownedRelics: {},
  runHistory: [],
  duplicateDust: 0,
  clearStartBonusChoice: "credits",
});

export const emptyRelicBonuses: RelicBonuses = {
  initialCredits: 0,
  unitOneHpMultiplier: 1,
  unitOneEnMultiplier: 1,
  restHealBonus: 0,
  partShopDiscount: 0,
  aiShopDiscount: 0,
  rewardRerollsPerWorld: 0,
  extraRouteChoice: false,
  worldEntryHealPercent: 0,
  aiRewardBonusCount: 0,
  eliteRewardBonusCount: 0,
  reinforcementAiSlotBonus: 0,
  bossRareBias: false,
};

export const normalizeMetaSaveState = (value?: Partial<MetaSaveState>): MetaSaveState => {
  const fallback = createInitialMetaSaveState();
  const ownedRelics = Object.entries(value?.ownedRelics ?? {}).reduce<MetaSaveState["ownedRelics"]>(
    (next, [id, level]) => {
      if (!relicById.has(id as RelicId)) {
        return next;
      }
      const definition = getRelicDefinition(id as RelicId);
      next[id as RelicId] = Math.min(definition.maxLevel, Math.max(1, Math.floor(Number(level) || 1)));
      return next;
    },
    {},
  );
  const clearStartBonusChoice: ClearStartBonusChoice =
    value?.clearStartBonusChoice === "rewardReroll" || value?.clearStartBonusChoice === "shopDiscount"
      ? value.clearStartBonusChoice
      : "credits";

  return {
    ...fallback,
    ownedRelics,
    runHistory: Array.isArray(value?.runHistory) ? value.runHistory.slice(-40) : fallback.runHistory,
    duplicateDust: Math.max(0, Math.floor(Number(value?.duplicateDust) || 0)),
    clearStartBonusChoice,
  };
};

export const getRelicDefinition = (id: RelicId): RelicDefinition => {
  const definition = relicById.get(id);
  if (!definition) {
    throw new Error(`Unknown relic: ${id}`);
  }
  return definition;
};

export const getRelicLevel = (metaState: MetaSaveState, id: RelicId): number =>
  metaState.ownedRelics[id] ?? 0;

const valueForLevel = (definition: RelicDefinition, level: number): number =>
  level <= 0 ? 0 : definition.values[Math.min(definition.values.length - 1, level - 1)] ?? 0;

export const calculateRelicBonuses = (metaState: MetaSaveState): RelicBonuses => {
  const normalized = normalizeMetaSaveState(metaState);
  const bonuses: RelicBonuses = { ...emptyRelicBonuses };

  for (const [id, level] of Object.entries(normalized.ownedRelics) as [RelicId, number][]) {
    const definition = getRelicDefinition(id);
    const value = valueForLevel(definition, level);
    switch (definition.effectKind) {
      case "initialCredits":
        bonuses.initialCredits += value;
        break;
      case "unitOneEn":
        bonuses.unitOneEnMultiplier += value;
        break;
      case "unitOneHp":
        bonuses.unitOneHpMultiplier += value;
        break;
      case "restHealBonus":
        bonuses.restHealBonus += value;
        break;
      case "partShopDiscount":
        bonuses.partShopDiscount += value;
        break;
      case "aiRewardBias":
        bonuses.aiRewardBonusCount += Math.floor(value);
        break;
      case "aiShopDiscount":
        bonuses.aiShopDiscount += value;
        break;
      case "rewardRerolls":
        bonuses.rewardRerollsPerWorld += Math.floor(value);
        break;
      case "extraRouteChoice":
        bonuses.extraRouteChoice = value > 0;
        break;
      case "worldEntryHeal":
        bonuses.worldEntryHealPercent += value;
        break;
      case "eliteRewardOption":
        bonuses.eliteRewardBonusCount += Math.floor(value);
        break;
      case "reinforcementAiSlot":
        bonuses.reinforcementAiSlotBonus += Math.floor(value);
        break;
      case "bossRewardBias":
        bonuses.bossRareBias = value > 0;
        break;
      case "clearStartChoice":
        if (normalized.clearStartBonusChoice === "credits") {
          bonuses.initialCredits += 35 + value * 25;
        }
        if (normalized.clearStartBonusChoice === "rewardReroll") {
          bonuses.rewardRerollsPerWorld += 1;
        }
        if (normalized.clearStartBonusChoice === "shopDiscount") {
          bonuses.partShopDiscount += 0.03 + value * 0.01;
          bonuses.aiShopDiscount += 0.03 + value * 0.01;
        }
        break;
      default:
        break;
    }
  }

  bonuses.partShopDiscount = Math.min(0.35, bonuses.partShopDiscount);
  bonuses.aiShopDiscount = Math.min(0.35, bonuses.aiShopDiscount);
  bonuses.restHealBonus = Math.min(0.25, bonuses.restHealBonus);
  bonuses.worldEntryHealPercent = Math.min(0.3, bonuses.worldEntryHealPercent);
  bonuses.aiRewardBonusCount = Math.min(2, bonuses.aiRewardBonusCount);
  bonuses.eliteRewardBonusCount = Math.min(2, bonuses.eliteRewardBonusCount);
  bonuses.reinforcementAiSlotBonus = Math.min(2, bonuses.reinforcementAiSlotBonus);
  bonuses.rewardRerollsPerWorld = Math.min(2, bonuses.rewardRerollsPerWorld);

  return bonuses;
};

export const applyRelicBonusesToStats = (
  stats: DerivedStats,
  unitIndex: number,
  bonuses: RelicBonuses,
): DerivedStats => {
  if (unitIndex !== 0) {
    return stats;
  }
  return {
    ...stats,
    hpMax: Math.round(stats.hpMax * bonuses.unitOneHpMultiplier),
    enMax: Math.round(stats.enMax * bonuses.unitOneEnMultiplier),
  };
};

const rarityWeight = (definition: RelicDefinition): number => {
  if (definition.rarity === "clear") {
    return 4;
  }
  if (definition.rarity === "elite") {
    return 3;
  }
  if (definition.rarity === "rare") {
    return 2;
  }
  return 1;
};

const rotate = <T,>(items: T[], offset: number): T[] => {
  if (items.length === 0) {
    return [];
  }
  const safeOffset = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(safeOffset), ...items.slice(0, safeOffset)];
};

const relicPoolFor = (
  reason: PendingRelicReward["reason"],
  phase: PendingRelicReward["phase"],
  reachedWorld: number,
): RelicDefinition[] => {
  if (phase === "clear") {
    return relicDefinitions.filter((definition) => definition.unlockCondition === "clear");
  }

  return relicDefinitions
    .filter((definition) => definition.unlockCondition === "defeat")
    .filter((definition) => {
      if (reason === "clear") {
        return true;
      }
      if (definition.rarity === "elite") {
        return reachedWorld >= 3;
      }
      if (definition.rarity === "rare") {
        return reachedWorld >= 2;
      }
      return definition.rarity === "common";
    });
};

export const generateRelicRewardOptions = (
  reason: PendingRelicReward["reason"],
  phase: PendingRelicReward["phase"],
  reachedStage: number,
  clearedStages: number,
  metaState: MetaSaveState,
  excludedRelicIds: RelicId[] = [],
): RelicRewardOption[] => {
  if (reason === "defeat" && clearedStages <= 0) {
    return [];
  }
  const reachedWorld = worldForStage(reachedStage);
  const excluded = new Set(excludedRelicIds);
  const pool = relicPoolFor(reason, phase, reachedWorld)
    .filter((definition) => !excluded.has(definition.id))
    .sort((a, b) => rarityWeight(a) - rarityWeight(b) || a.id.localeCompare(b.id));

  const rotated = rotate(pool, reachedStage + clearedStages + (phase === "clear" ? 3 : 0));
  const optionCount = phase === "clear" ? 1 : 3;
  return rotated.slice(0, optionCount).map((definition): RelicRewardOption => {
    const level = getRelicLevel(metaState, definition.id);
    const duplicate = level > 0;
    const capped = level >= definition.maxLevel;
    return {
      id: `relic-${definition.id}-${phase}`,
      relicId: definition.id,
      duplicate,
      nextLevel: capped ? level : level + 1,
      dust: capped ? 1 : 0,
    };
  });
};

export const createPendingRelicReward = (
  reason: PendingRelicReward["reason"],
  reachedStage: number,
  clearedStages: number,
  metaState: MetaSaveState,
  phase: PendingRelicReward["phase"] = "normal",
  grantedRelicIds: RelicId[] = [],
): PendingRelicReward | undefined => {
  const options = generateRelicRewardOptions(
    reason,
    phase,
    reachedStage,
    clearedStages,
    metaState,
    grantedRelicIds,
  );
  if (options.length === 0) {
    return undefined;
  }
  return {
    reason,
    phase,
    reachedStage,
    reachedWorld: worldForStage(reachedStage),
    clearedStages,
    picksRemaining: reason === "clear" && phase === "normal" ? 2 : 1,
    options,
    grantedRelicIds,
  };
};

export const grantRelicToMeta = (
  metaState: MetaSaveState,
  relicId: RelicId,
): { metaState: MetaSaveState; level: number; dustGained: number } => {
  const normalized = normalizeMetaSaveState(metaState);
  const definition = getRelicDefinition(relicId);
  const currentLevel = getRelicLevel(normalized, relicId);
  if (currentLevel >= definition.maxLevel) {
    return {
      metaState: {
        ...normalized,
        duplicateDust: normalized.duplicateDust + 1,
      },
      level: currentLevel,
      dustGained: 1,
    };
  }
  const level = Math.min(definition.maxLevel, currentLevel + 1);
  return {
    metaState: {
      ...normalized,
      ownedRelics: {
        ...normalized.ownedRelics,
        [relicId]: level,
      },
    },
    level,
    dustGained: 0,
  };
};

export const appendRunHistory = (
  metaState: MetaSaveState,
  pending: PendingRelicReward,
  endedAt: string,
): MetaSaveState => {
  const entry: MetaRunHistoryEntry = {
    id: `${endedAt}-${pending.reason}-${pending.reachedStage}`,
    endedAt,
    completed: pending.reason === "clear",
    reachedStage: pending.reachedStage,
    reachedWorld: pending.reachedWorld,
    clearedStages: pending.clearedStages,
    relicIds: pending.grantedRelicIds,
  };
  return {
    ...metaState,
    runHistory: [...metaState.runHistory, entry].slice(-40),
  };
};

export const getRelicEffectText = (definition: RelicDefinition, level: number): string => {
  if (level <= 0) {
    return definition.description;
  }
  const value = valueForLevel(definition, level);
  if (
    definition.effectKind === "unitOneEn" ||
    definition.effectKind === "unitOneHp" ||
    definition.effectKind === "restHealBonus" ||
    definition.effectKind === "partShopDiscount" ||
    definition.effectKind === "aiShopDiscount" ||
    definition.effectKind === "worldEntryHeal"
  ) {
    return `${definition.description} 現在 +${Math.round(value * 100)}%。`;
  }
  if (definition.effectKind === "initialCredits") {
    return `${definition.description} 現在 +${value} CR。`;
  }
  return `${definition.description} 現在 Lv${level}。`;
};
