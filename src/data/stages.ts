export type StageType = "normal" | "elite" | "boss";

export interface StagePlan {
  stage: number;
  label: string;
  type: StageType;
}

export const stagePlans: StagePlan[] = [
  { stage: 1, label: "BASIC", type: "normal" },
  { stage: 2, label: "SCOUT", type: "normal" },
  { stage: 3, label: "SNIPER", type: "normal" },
  { stage: 4, label: "PRESSURE", type: "normal" },
  { stage: 5, label: "ELITE", type: "elite" },
  { stage: 6, label: "MIXED", type: "normal" },
  { stage: 7, label: "BOSS", type: "boss" },
];

export const getStagePlan = (stage: number): StagePlan =>
  stagePlans.find((plan) => plan.stage === stage) ?? stagePlans[stagePlans.length - 1];
