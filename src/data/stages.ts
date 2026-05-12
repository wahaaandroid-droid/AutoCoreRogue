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

export const STAGES_PER_WORLD = 4;
export const WORLD_COUNT = 3;
export const TOTAL_STAGES = STAGES_PER_WORLD * WORLD_COUNT;

const typeLabels: Record<StageType, string> = {
  normal: "通常",
  elite: "危険",
  rest: "修理",
  shop: "補給",
  boss: "ボス",
};

const worldNames = ["", "外縁区", "鉄の街", "中枢部"] as const;

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
    if (!bonuses?.extraRouteChoice || worldStage === 1 || worldStage === STAGES_PER_WORLD || choices.length >= 3) {
      return choices;
    }
    return [
      ...choices,
      plan(
        safeStage,
        3,
        "normal",
        "安全な迂回路",
        "損耗を抑えて次の戦闘へ入る。",
        "小隊を守る",
        "索敵",
      ),
    ];
  };

  if (worldStage === STAGES_PER_WORLD) {
    return [
      plan(
        safeStage,
        1,
        "boss",
        `WORLD ${world} ボス`,
        `${worldName} の最後に待つ大型コア。`,
        world === 1 ? "初期AIで突破" : world === 2 ? "2機連携で突破" : "3機の超反応で突破",
      ),
    ];
  }

  if (worldStage === 1) {
    return [
      plan(
        safeStage,
        1,
        "normal",
        `${worldName} 入口`,
        world === 1
          ? "弱い1機から始まる最初の戦闘。"
          : `新しいUNITと合流して${pressure}戦へ入る。`,
        world === 1 ? "反射速度の起動" : "新加入機の型を決める",
        "入口",
      ),
    ];
  }

  switch (worldStage) {
    case 2:
      return withScannerChoice([
        plan(safeStage, 0, "normal", "通常ルート", "標準的な敵部隊。", "安全にAIを伸ばす"),
        plan(safeStage, 1, "elite", "危険ルート", "強い敵が混ざるが強化が伸びる。", "速い判断で押し切る"),
        plan(safeStage, 2, "rest", "修理ルート", "戦闘前に小隊を回復する。", "損傷を戻す"),
      ], bonuses);
    case 3:
    default:
      return withScannerChoice([
        plan(safeStage, 0, "normal", "通常ルート", "敵数が増えるが安定して進める。", "小隊の連携を伸ばす"),
        plan(safeStage, 1, "elite", "危険ルート", "ボス前の高リスク戦。", "超反応をさらに尖らせる"),
        plan(safeStage, 2, "rest", "修理ルート", "ボス前に小隊を回復する。", "最後の立て直し"),
      ], bonuses);
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
