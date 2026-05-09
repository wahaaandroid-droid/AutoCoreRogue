import type { PartInventory, RelicBonuses } from "../types";
import { getSlotLabel, playableParts } from "./parts";
import { StageType } from "./stages";

export type RewardPayload =
  | { kind: "part"; partId: string }
  | { kind: "stat"; stat: "hp" | "enCapacity" | "enRegen" | "attack" | "defense"; amount: number }
  | { kind: "cooldown"; multiplier: number }
  | { kind: "repairKit"; amount: number }
  | { kind: "credits"; amount: number };

export interface RewardOption {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  accent: "blue" | "green" | "orange" | "purple";
  payload: RewardPayload;
}

export interface ShopOffer {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  cost: number;
  accent: "blue" | "green" | "orange" | "purple";
  payload: RewardPayload | { kind: "repairAll"; percent: number };
}

const staticRewards: RewardOption[] = [
  {
    id: "repair-kit",
    title: "リペアキット",
    subtitle: "応急修理資材",
    description: "リペアキットを1個ストック。ASSEMBLEで選択中ユニットを全回復できる。",
    accent: "green",
    payload: { kind: "repairKit", amount: 1 },
  },
  {
    id: "hp-boost",
    title: "HP強化",
    subtitle: "装甲プレート",
    description: "最大HP +180",
    accent: "green",
    payload: { kind: "stat", stat: "hp", amount: 180 },
  },
  {
    id: "en-boost",
    title: "EN強化",
    subtitle: "高密度セル",
    description: "EN容量 +140",
    accent: "blue",
    payload: { kind: "stat", stat: "enCapacity", amount: 140 },
  },
  {
    id: "regen-boost",
    title: "EN回復強化",
    subtitle: "整流モジュール",
    description: "EN回復 +7 / 秒",
    accent: "blue",
    payload: { kind: "stat", stat: "enRegen", amount: 7 },
  },
  {
    id: "attack-boost",
    title: "攻撃力強化",
    subtitle: "火器同期チップ",
    description: "左右武器の攻撃力 +18",
    accent: "orange",
    payload: { kind: "stat", stat: "attack", amount: 18 },
  },
  {
    id: "defense-boost",
    title: "防御力強化",
    subtitle: "複合装甲材",
    description: "防御力 +18",
    accent: "green",
    payload: { kind: "stat", stat: "defense", amount: 18 },
  },
  {
    id: "cooldown-boost",
    title: "クールダウン短縮",
    subtitle: "冷却ループ",
    description: "武器クールダウン 10%短縮",
    accent: "orange",
    payload: { kind: "cooldown", multiplier: 0.9 },
  },
];

const rewardPartTitle = (slot: string): string => {
  if (slot === "HEAD") {
    return "新しい頭部パーツ";
  }
  if (slot === "BODY") {
    return "新しいコア";
  }
  if (slot === "BOOSTER") {
    return "新しいブースター";
  }
  if (slot.includes("ARM")) {
    return "新しい腕部武器";
  }
  if (slot === "SPECIAL") {
    return "新しい特殊装備";
  }
  return "新しいパーツ";
};

const rarityScore = (rarity: string): number =>
  rarity === "elite" ? 3 : rarity === "rare" ? 2 : 1;

const creditRewardFor = (stage: number, stageType: StageType): RewardOption => {
  const world = Math.ceil(stage / 7);
  const amount = stageType === "elite" ? 150 + world * 55 : stageType === "boss" ? 210 + world * 70 : 80 + world * 35;
  return {
    id: `credits-${stageType}-${stage}`,
    title: "クレジット",
    subtitle: "作戦資金",
    description: `${amount} CR を獲得。商人ノードでパーツ購入や全体修理に使える。`,
    accent: "blue",
    payload: { kind: "credits", amount },
  };
};

const scaledStaticReward = (reward: RewardOption, stageType: StageType): RewardOption => {
  if (stageType !== "elite") {
    return reward;
  }
  const payload = reward.payload;
  if (payload.kind === "stat") {
    const amount = Math.ceil(payload.amount * 1.35);
    return {
      ...reward,
      id: `${reward.id}-elite`,
      title: `${reward.title}+`,
      description: `${reward.description}（エリート強化: +${amount}）`,
      payload: { ...payload, amount },
    };
  }
  if (payload.kind === "cooldown") {
    return {
      ...reward,
      id: `${reward.id}-elite`,
      title: `${reward.title}+`,
      description: "武器クールダウン 14%短縮",
      payload: { kind: "cooldown", multiplier: 0.86 },
    };
  }
  if (payload.kind === "repairKit") {
    return {
      ...reward,
      id: `${reward.id}-elite`,
      title: "リペアキット x2",
      description: "リペアキットを2個ストック。ASSEMBLEで選択中ユニットを全回復できる。",
      payload: { kind: "repairKit", amount: 2 },
    };
  }
  return reward;
};

export const generateRewardOptions = (
  stage: number,
  partInventory: PartInventory,
  stageType: StageType = "normal",
  relicBonuses: Partial<RelicBonuses> = {},
  seedOffset = 0,
): RewardOption[] => {
  const parts = playableParts();
  const rareBiased = stageType === "elite" || (stageType === "boss" && relicBonuses.bossRareBias);
  const partPool = rareBiased
    ? [...parts].sort((a, b) => rarityScore(b.rarity) - rarityScore(a.rarity))
    : parts;
  const lockedParts = partPool.filter((part) => (partInventory[part.id] ?? 0) === 0);
  const duplicateParts = partPool.filter((part) => (partInventory[part.id] ?? 0) > 0 && !part.initial);
  const rotatedDuplicates = duplicateParts.slice((stage + seedOffset) % Math.max(1, duplicateParts.length));
  const eliteBonusCount = stageType === "elite" ? relicBonuses.eliteRewardBonusCount ?? 0 : 0;
  const specialBonusCount = relicBonuses.aiRewardBonusCount ?? 0;
  const partCandidateCount = (stageType === "elite" || stageType === "boss" ? 4 : 3) + eliteBonusCount;
  const specialParts = partPool.filter((part) => part.slot === "SPECIAL");
  const specialCandidates = specialParts
    .filter((part) => (partInventory[part.id] ?? 0) === 0)
    .slice(0, specialBonusCount);
  const partCandidates = [...specialCandidates, ...lockedParts, ...rotatedDuplicates, ...duplicateParts].slice(
    0,
    partCandidateCount + specialBonusCount,
  );
  const partRewards = partCandidates.map<RewardOption>((part, index) => {
    const owned = partInventory[part.id] ?? 0;
    return {
      id: `part-${part.id}`,
      title: owned > 0 ? "追加パーツ" : rewardPartTitle(part.slot),
      subtitle: part.name,
      description: `${getSlotLabel(part.slot)} / ${part.rarity.toUpperCase()} を1個入手${owned > 0 ? `（所持 ${owned}）` : ""}`,
      accent: part.slot === "SPECIAL" ? "purple" : part.slot.includes("ARM") ? "orange" : part.slot === "BOOSTER" ? "green" : "blue",
      payload: { kind: "part", partId: part.id },
    };
  });

  const rotating = staticRewards;
  const first = scaledStaticReward(rotating[(stage + 1 + seedOffset) % rotating.length], stageType);
  const second = scaledStaticReward(rotating[(stage + 3 + seedOffset) % rotating.length], stageType);
  const repairReward = staticRewards.find((reward) => reward.id === "repair-kit");
  const pool = [
    creditRewardFor(stage, stageType),
    stageType === "elite" ? undefined : repairReward,
    ...partRewards,
    first,
    second,
    stageType === "boss" ? creditRewardFor(stage, stageType) : undefined,
  ].filter(Boolean) as RewardOption[];
  const unique = new Map<string, RewardOption>();

  for (const reward of pool) {
    unique.set(reward.id, reward);
  }

  return [...unique.values()].slice(0, 4 + eliteBonusCount);
};

export const generateShopOffers = (
  stage: number,
  partInventory: PartInventory,
  relicBonuses: Partial<RelicBonuses> = {},
): ShopOffer[] => {
  const discountedCost = (cost: number, discount = 0): number =>
    Math.max(1, Math.ceil(cost * (1 - Math.min(0.35, Math.max(0, discount)))));
  const parts = playableParts();
  const lockedParts = parts.filter((part) => (partInventory[part.id] ?? 0) === 0);
  const duplicateParts = parts.filter((part) => (partInventory[part.id] ?? 0) > 0 && !part.initial);
  const stock = [...lockedParts, ...duplicateParts].slice(stage % 3, stage % 3 + 3);
  const partOffers = stock.map<ShopOffer>((part, index) => ({
    id: `shop-part-${part.id}`,
    title: part.name,
    subtitle: `${getSlotLabel(part.slot)} / ${part.rarity.toUpperCase()}`,
    description: `${part.description} 所持 ${partInventory[part.id] ?? 0}`,
    cost: discountedCost(
      95 + rarityScore(part.rarity) * 65 + index * 20 + Math.ceil(stage / 7) * 25,
      part.slot === "SPECIAL" ? relicBonuses.aiShopDiscount : relicBonuses.partShopDiscount,
    ),
    accent: part.slot === "SPECIAL" ? "purple" : part.slot.includes("ARM") ? "orange" : part.slot === "BOOSTER" ? "green" : "blue",
    payload: { kind: "part", partId: part.id },
  }));

  const utilityOffers: ShopOffer[] = [
    {
      id: "shop-repair-all",
      title: "全体修理",
      subtitle: "メンテナンスベイ",
      description: "全配備UNITのHPを最大値の45%ぶん回復する。",
      cost: 120 + Math.ceil(stage / 7) * 45,
      accent: "green",
      payload: { kind: "repairAll", percent: 0.45 },
    },
    {
      id: "shop-repair-kit",
      title: "リペアキット",
      subtitle: "携行修理資材",
      description: "ASSEMBLEで使えるリペアキットを1個購入。",
      cost: 85 + Math.ceil(stage / 7) * 25,
      accent: "green",
      payload: { kind: "repairKit", amount: 1 },
    },
    {
      id: "shop-cooldown-tune",
      title: "冷却チューニング",
      subtitle: "武器同期調整",
      description: "武器クールダウンを8%短縮。",
      cost: 160 + Math.ceil(stage / 7) * 55,
      accent: "purple",
      payload: { kind: "cooldown", multiplier: 0.92 },
    },
  ];

  return [...partOffers.slice(0, 3), ...utilityOffers].slice(0, 6);
};
