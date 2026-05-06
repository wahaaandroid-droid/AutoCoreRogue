export type StageType = "normal" | "elite" | "boss";

export interface StagePlan {
  stage: number;
  label: string;
  type: StageType;
  threat: string;
  brief: string;
  focus: string;
}

export const stagePlans: StagePlan[] = [
  {
    stage: 1,
    label: "BASIC",
    type: "normal",
    threat: "Drone wave",
    brief: "小型機中心の基礎戦闘。射程とクールダウンの挙動を確認しやすい。",
    focus: "AIの常時行動と武器使用許可を整える",
  },
  {
    stage: 2,
    label: "SCOUT",
    type: "normal",
    threat: "Fast scouts",
    brief: "高速機が距離を詰める。近距離条件やブースト回避が効きやすい。",
    focus: "UNIT 2の加入準備",
  },
  {
    stage: 3,
    label: "SNIPER",
    type: "normal",
    threat: "Long range",
    brief: "長射程の敵が混ざる。遠距離攻撃とターゲット優先が重要になる。",
    focus: "長射程武器または強敵優先",
  },
  {
    stage: 4,
    label: "PRESSURE",
    type: "normal",
    threat: "Mixed pressure",
    brief: "接近戦と中距離戦が重なる。防御と範囲火力のどちらかを厚くしたい。",
    focus: "修理か火力強化の判断",
  },
  {
    stage: 5,
    label: "ELITE",
    type: "elite",
    threat: "Elite pair",
    brief: "高耐久のエリートが出る節目。集中攻撃できるAI構成が有利。",
    focus: "UNIT 3の加入準備",
  },
  {
    stage: 6,
    label: "MIXED",
    type: "normal",
    threat: "Role swarm",
    brief: "敵の役割が増え、弾幕と回避が激しくなる。全機の出撃ON/OFFを見直したい。",
    focus: "損傷機の温存と修理",
  },
  {
    stage: 7,
    label: "BOSS",
    type: "boss",
    threat: "Signal Tyrant",
    brief: "ボスと護衛が同時に出る最終戦。強敵優先か雑魚処理かを明確にする。",
    focus: "一斉射撃と範囲火力",
  },
];

export const getStagePlan = (stage: number): StagePlan =>
  stagePlans.find((plan) => plan.stage === stage) ?? stagePlans[stagePlans.length - 1];
