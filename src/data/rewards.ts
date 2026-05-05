import { parts } from "./parts";

export type RewardPayload =
  | { kind: "part"; partId: string }
  | { kind: "stat"; stat: "hp" | "enCapacity" | "enRegen" | "attack" | "defense"; amount: number }
  | { kind: "cooldown"; multiplier: number }
  | { kind: "aiSlot"; amount: number };

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

const rewardIconSeed = ["新しい武器", "新しい脚部", "試作パーツ"];

export const generateRewardOptions = (
  stage: number,
  unlockedPartIds: string[],
  aiSlotCount: number,
): RewardOption[] => {
  const lockedParts = parts.filter((part) => !unlockedPartIds.includes(part.id));
  const partRewards = lockedParts.slice(0, 3).map<RewardOption>((part, index) => ({
    id: `part-${part.id}`,
    title: rewardIconSeed[index % rewardIconSeed.length],
    subtitle: part.name,
    description: `${part.slot} / ${part.rarity.toUpperCase()} を入手`,
    accent: part.slot === "LEGS" ? "green" : part.slot.includes("ARM") ? "orange" : "blue",
    payload: { kind: "part", partId: part.id },
  }));

  const aiReward =
    aiSlotCount < 8
      ? staticRewards.find((reward) => reward.id === "ai-slot")
      : staticRewards.find((reward) => reward.id === "cooldown-boost");
  const rotating = staticRewards.filter((reward) => reward.id !== "ai-slot");
  const first = rotating[(stage + 1) % rotating.length];
  const second = rotating[(stage + 3) % rotating.length];
  const pool = [...partRewards, first, second, aiReward].filter(Boolean) as RewardOption[];
  const unique = new Map<string, RewardOption>();

  for (const reward of pool) {
    unique.set(reward.id, reward);
  }

  return [...unique.values()].slice(0, 3);
};
