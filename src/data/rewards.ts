import { PartInventory } from "../types";
import { getSlotLabel, playableParts } from "./parts";

export type RewardPayload =
  | { kind: "part"; partId: string }
  | { kind: "stat"; stat: "hp" | "enCapacity" | "enRegen" | "attack" | "defense"; amount: number }
  | { kind: "cooldown"; multiplier: number }
  | { kind: "aiSlot"; amount: number }
  | { kind: "repairKit"; amount: number };

export interface RewardOption {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  accent: "blue" | "green" | "orange" | "purple";
  payload: RewardPayload;
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
  {
    id: "ai-slot",
    title: "AIスロット追加",
    subtitle: "判断キュー拡張",
    description: "AIルール上限 +1",
    accent: "purple",
    payload: { kind: "aiSlot", amount: 1 },
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
  if (slot.includes("SHOULDER")) {
    return "新しい肩武器";
  }
  return "新しいパーツ";
};

export const generateRewardOptions = (
  stage: number,
  partInventory: PartInventory,
  aiSlotCount: number,
): RewardOption[] => {
  const parts = playableParts();
  const lockedParts = parts.filter((part) => (partInventory[part.id] ?? 0) === 0);
  const duplicateParts = parts.filter((part) => (partInventory[part.id] ?? 0) > 0 && !part.initial);
  const rotatedDuplicates = duplicateParts.slice(stage % Math.max(1, duplicateParts.length));
  const partCandidates = [...lockedParts, ...rotatedDuplicates, ...duplicateParts].slice(0, 3);
  const partRewards = partCandidates.map<RewardOption>((part, index) => {
    const owned = partInventory[part.id] ?? 0;
    return {
      id: `part-${part.id}`,
      title: owned > 0 ? "追加パーツ" : rewardPartTitle(part.slot),
      subtitle: part.name,
      description: `${getSlotLabel(part.slot)} / ${part.rarity.toUpperCase()} を1個入手${owned > 0 ? `（所持 ${owned}）` : ""}`,
      accent: part.slot.includes("ARM") || part.slot.includes("SHOULDER") ? "orange" : part.slot === "BOOSTER" ? "green" : "blue",
      payload: { kind: "part", partId: part.id },
    };
  });

  const aiReward =
    aiSlotCount < 8
      ? staticRewards.find((reward) => reward.id === "ai-slot")
      : staticRewards.find((reward) => reward.id === "cooldown-boost");
  const rotating = staticRewards.filter((reward) => reward.id !== "ai-slot");
  const first = rotating[(stage + 1) % rotating.length];
  const second = rotating[(stage + 3) % rotating.length];
  const repairReward = staticRewards.find((reward) => reward.id === "repair-kit");
  const pool = [repairReward, ...partRewards, first, second, aiReward].filter(Boolean) as RewardOption[];
  const unique = new Map<string, RewardOption>();

  for (const reward of pool) {
    unique.set(reward.id, reward);
  }

  return [...unique.values()].slice(0, 4);
};
