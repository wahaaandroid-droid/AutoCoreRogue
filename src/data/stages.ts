import type { RelicBonuses } from "../types";

export type StageType = "normal" | "elite" | "rest" | "shop" | "boss";

export type CombatStageType = Extract<StageType, "normal" | "elite" | "boss">;

export interface StagePlan {
  id: string;
  stage: number;
  world: number;
  worldStage: number;
  lane: number;
  label: string;
  type: StageType;
  threat: string;
  brief: string;
  focus: string;
}

export const STAGES_PER_WORLD = 7;
export const WORLD_COUNT = 3;
export const TOTAL_STAGES = STAGES_PER_WORLD * WORLD_COUNT;

const typeLabels: Record<StageType, string> = {
  normal: "BATTLE",
  elite: "ELITE",
  rest: "REST",
  shop: "SHOP",
  boss: "BOSS",
};

const worldNames = ["", "Outer Yard", "Iron Sprawl", "Core Depth"] as const;

export const worldForStage = (stage: number): number =>
  Math.min(WORLD_COUNT, Math.max(1, Math.ceil(stage / STAGES_PER_WORLD)));

export const worldStageForStage = (stage: number): number =>
  ((Math.max(1, stage) - 1) % STAGES_PER_WORLD) + 1;

export const isCombatStageType = (type: StageType): type is CombatStageType =>
  type === "normal" || type === "elite" || type === "boss";

const stageId = (stage: number, lane: number, type: StageType): string =>
  `w${worldForStage(stage)}-s${worldStageForStage(stage)}-${lane}-${type}`;

const plan = (
  stage: number,
  lane: number,
  type: StageType,
  threat: string,
  brief: string,
  focus: string,
  label = typeLabels[type],
): StagePlan => ({
  id: stageId(stage, lane, type),
  stage,
  world: worldForStage(stage),
  worldStage: worldStageForStage(stage),
  lane,
  label,
  type,
  threat,
  brief,
  focus,
});

export const createStageChoices = (stage: number, bonuses?: Partial<RelicBonuses>): StagePlan[] => {
  const safeStage = Math.min(TOTAL_STAGES, Math.max(1, stage));
  const world = worldForStage(safeStage);
  const worldStage = worldStageForStage(safeStage);
  const worldName = worldNames[world] ?? worldNames[1];
  const pressure = world === 1 ? "基礎" : world === 2 ? "連携" : "総力";
  const withScannerChoice = (choices: StagePlan[], bonuses?: Partial<RelicBonuses>): StagePlan[] => {
    if (!bonuses?.extraRouteChoice || worldStage === 1 || worldStage === 7 || choices.length >= 3) {
      return choices;
    }
    return [
      ...choices,
      plan(
        safeStage,
        3,
        "normal",
        "Scanner flank",
        "ルートスキャナが見つけた迂回路。戦闘リスクを抑えて通常報酬を狙う。",
        "損耗を抑えた安定進行",
        "SCAN",
      ),
    ];
  };

  if (worldStage === 7) {
    return [
      plan(
        safeStage,
        1,
        "boss",
        `World ${world} overlord`,
        `${worldName} の最終防衛線。巨大ボスが単体で戦域を支配する。`,
        world === 1 ? "被弾を抑えながら基本AIを確認" : world === 2 ? "2機の射程とターゲット優先を合わせる" : "3機の役割分担と一斉射撃を完成させる",
      ),
    ];
  }

  if (worldStage === 1) {
    return [
      plan(
        safeStage,
        1,
        "normal",
        `${worldName} entry patrol`,
        world === 1
          ? "最初の1機で戦闘手順を確認する低圧戦闘。"
          : `新しいUNITを迎えた直後の${pressure}確認戦。`,
        world === 1 ? "移動・射撃・AI条件の基礎" : "新加入機の装備と出撃ONを確認",
        "ENTRY",
      ),
    ];
  }

  switch (worldStage) {
    case 2:
      return withScannerChoice([
        plan(safeStage, 0, "normal", "Scout screen", "高速機が散発的に接近する。", "近距離条件と回避行動"),
        plan(safeStage, 2, "normal", "Ranged picket", "長射程機が混ざるが敵数は控えめ。", "射程とターゲット優先"),
      ], bonuses);
    case 3:
      return [
        plan(safeStage, 0, "normal", "Mixed patrol", "標準的な混成小隊。安定した報酬を狙える。", "通常報酬で装備幅を広げる"),
        plan(safeStage, 1, "elite", "Elite frame", "危険な強化機。勝てば報酬候補とクレジットが厚い。", "集中攻撃AIと火力確認"),
        plan(safeStage, 2, "shop", "Field merchant", "戦闘を避け、クレジットで部品や修理を買える。", "必要なパーツを購入"),
      ];
    case 4:
      return [
        plan(safeStage, 0, "rest", "Repair point", "補給地点。全機のHPを回復して次へ進む。", "損傷機の復帰"),
        plan(safeStage, 1, "normal", "Pressure route", "戦闘を継続して報酬を増やす。", "継戦力の確認"),
        plan(safeStage, 2, "shop", "Arms broker", "クレジットを使って装備を整える。", "不足スロットの補強"),
      ];
    case 5:
      return [
        plan(safeStage, 0, "normal", "Assault lane", "敵数が増える通常戦闘。", "範囲火力と弾幕処理"),
        plan(safeStage, 1, "elite", "Prize hunter", "報酬重視のエリート戦。消耗は大きい。", "強敵優先と一斉射撃"),
        plan(safeStage, 2, "normal", "Defensive line", "耐久寄りの敵が多い通常戦闘。", "防御とクールダウン"),
      ];
    case 6:
    default:
      return [
        plan(safeStage, 0, "rest", "Last repair", "ボス前の休憩地点。HPを戻せる。", "ボス前の立て直し"),
        plan(safeStage, 1, "elite", "Gate elite", "ボス前の高リスク戦。報酬が最も厚い。", "完成したAI構成の確認"),
        plan(safeStage, 2, "shop", "Last merchant", "ボス前の商人。クレジットを使い切る判断。", "最終調整"),
      ];
  }
};

export const getDefaultStagePlan = (stage: number): StagePlan => createStageChoices(stage)[0];

export const getStagePlan = (stage: number, nodeId?: string, bonuses?: Partial<RelicBonuses>): StagePlan => {
  const choices = createStageChoices(stage, bonuses);
  return choices.find((choice) => choice.id === nodeId) ?? choices[0];
};

export const stagePlans: StagePlan[] = Array.from(
  { length: TOTAL_STAGES },
  (_, index) => getDefaultStagePlan(index + 1),
);
