import { CombatStageType, worldForStage, worldStageForStage } from "../data/stages";
import type { CombatActor, CombatState } from "./combat";

export type EnemyRank = CombatActor["rank"];

const normals = (count: number): EnemyRank[] =>
  Array.from({ length: count }, () => "normal" as const);

const worldNormalCount = (stage: number, playerCount: number, stageType: CombatStageType): number => {
  const world = worldForStage(stage);
  const worldStage = worldStageForStage(stage);
  const playerScale = Math.max(0, playerCount - 1);
  const tutorialTrim = world === 1 ? -2 : 0;
  const base = world === 1 ? 3 : world === 2 ? 6 : 8;
  const ramp = worldStage + playerScale * (world === 3 ? 2 : 1);
  const typeBonus = stageType === "elite" ? 2 + world : stageType === "boss" ? world + 1 : 0;
  return Math.max(world === 1 ? 3 : 5, base + ramp + typeBonus + tutorialTrim);
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
    const eliteCount = world === 1 ? 1 : world === 2 ? 1 : 2;
    return [
      ...normals(worldNormalCount(stage, playerCount, stageType)),
      ...Array.from({ length: eliteCount }, () => "elite" as const),
    ];
  }

  return normals(worldNormalCount(stage, playerCount, stageType));
};

export const activeEnemyCap = (
  stage: number,
  playerCount: number,
  stageType: CombatStageType = "normal",
): number => {
  const world = worldForStage(stage);
  const base = world === 1 ? 3 : world === 2 ? 5 : 7;
  const typeBonus = stageType === "boss" ? 1 : stageType === "elite" ? 1 : 0;
  return Math.min(base + typeBonus + playerCount, Math.max(3, playerCount * (world + 2)));
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
  const baseSize = opening
    ? world === 1 ? 2 : world === 2 ? 3 : 4
    : midBattleSurge
      ? world === 1 ? 2 : world === 2 ? 3 : 4
      : world === 1 ? 1 : 2;

  return Math.max(1, Math.min(capacity, normalSpan, baseSize + quietBonus));
};

export const enemySpawnDelayFor = (
  state: CombatState,
  incoming: EnemyRank[],
): number => {
  const world = worldForStage(state.stage);
  if (incoming.some((rank) => rank !== "normal")) {
    return world === 1 ? 1.45 : 1.25;
  }
  if (incoming.length >= 3) {
    return world === 1 ? 2.1 : world === 2 ? 1.75 : 1.45;
  }
  return world === 1 ? 1.35 : world === 2 ? 1.05 : 0.9;
};
