import { CombatStageType, worldForStage, worldStageForStage } from "../data/stages";
import type { CombatActor, CombatState } from "./combat";

export type EnemyRank = CombatActor["rank"];

const normals = (count: number): EnemyRank[] =>
  Array.from({ length: count }, () => "normal" as const);

export const isRivalAmbushStage = (stage: number): boolean => stage === 6 || stage === 10;

const progressPowerForStage = (stage: number): number => {
  const progress = Math.max(0, Math.min(1, (stage - 1) / 11));
  return progress * progress;
};

const worldNormalCount = (stage: number, playerCount: number, stageType: CombatStageType): number => {
  const world = worldForStage(stage);
  const worldStage = worldStageForStage(stage);
  const playerScale = Math.max(0, playerCount - 1);
  const curve = progressPowerForStage(stage);
  const base = 2 + Math.round(curve * 12);
  const worldPressure = (world - 1) * 2 + Math.max(0, worldStage - 1);
  const typeBonus = stageType === "elite" ? 2 + Math.round(curve * 4) : stageType === "boss" ? 1 + world : 0;
  const playerBonus = playerScale * (1 + Math.round(curve * 2));
  return Math.max(stage <= 2 ? 2 : 4, base + worldPressure + typeBonus + playerBonus);
};

export const createEnemyRanks = (
  stage: number,
  playerCount: number,
  stageType: CombatStageType = "normal",
): EnemyRank[] => {
  if (stageType === "boss") {
    const world = worldForStage(stage);
    const escortCount = world === 1 ? 2 : world === 2 ? 5 : 7;
    return [
      ...normals(escortCount),
      "boss",
    ];
  }

  if (stageType === "elite") {
    const world = worldForStage(stage);
    const eliteCount = world === 1 ? 1 : world === 2 ? 2 : 3;
    return [
      ...normals(worldNormalCount(stage, playerCount, stageType)),
      ...Array.from({ length: eliteCount }, () => "elite" as const),
      ...(isRivalAmbushStage(stage) ? ["elite" as const] : []),
    ];
  }

  return [
    ...normals(worldNormalCount(stage, playerCount, stageType)),
    ...(isRivalAmbushStage(stage) ? ["elite" as const] : []),
  ];
};

export const activeEnemyCap = (
  stage: number,
  playerCount: number,
  stageType: CombatStageType = "normal",
): number => {
  const world = worldForStage(stage);
  const curve = progressPowerForStage(stage);
  const base = world === 1 ? 2 : world === 2 ? 5 : 7;
  const typeBonus = stageType === "boss" ? 1 : stageType === "elite" ? 1 : 0;
  return Math.min(base + typeBonus + playerCount + Math.round(curve * 4), Math.max(2, playerCount * (world + 3)));
};

const countFrontRanks = (
  ranks: EnemyRank[],
  predicate: (rank: EnemyRank) => boolean,
): number => {
  let count = 0;
  for (const rank of ranks) {
    if (!predicate(rank)) {
      break;
    }
    count += 1;
  }
  return count;
};

export const nextEnemyBatchSize = (state: CombatState, capacity: number): number => {
  const frontRank = state.enemyQueue[0];
  if (!frontRank || capacity <= 0) {
    return 0;
  }

  if (frontRank !== "normal") {
    return Math.min(capacity, countFrontRanks(state.enemyQueue, (rank) => rank !== "normal"));
  }

  const normalSpan = countFrontRanks(state.enemyQueue, (rank) => rank === "normal");
  const world = worldForStage(state.stage);
  const progress = state.enemyTotal > 0 ? state.spawnedEnemyCount / state.enemyTotal : 0;
  const opening = state.spawnedEnemyCount === 0;
  const midBattleSurge = progress >= 0.42 && progress <= 0.64;
  const livingCount = state.enemies.filter((enemy) => enemy.hp > 0).length;
  const quietBonus = livingCount <= Math.max(1, state.players.length) ? 1 : 0;
  const curve = progressPowerForStage(state.stage);
  const baseSize = opening
    ? world === 1 ? 1 : world === 2 ? 3 : 4
    : midBattleSurge
      ? world === 1 ? 2 : world === 2 ? 3 : 4 + Math.round(curve * 2)
      : world === 1 ? 1 : 2;

  return Math.max(1, Math.min(capacity, normalSpan, baseSize + quietBonus));
};

export const enemySpawnDelayFor = (
  state: CombatState,
  incoming: EnemyRank[],
): number => {
  const world = worldForStage(state.stage);
  if (incoming.some((rank) => rank !== "normal")) {
    return world === 1 ? 1.55 : world === 2 ? 1.18 : 0.95;
  }
  if (incoming.length >= 3) {
    return world === 1 ? 2.2 : world === 2 ? 1.55 : 1.08;
  }
  return world === 1 ? 1.48 : world === 2 ? 0.96 : 0.72;
};
