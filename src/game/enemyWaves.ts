import type { CombatActor, CombatState } from "./combat";

export type EnemyRank = CombatActor["rank"];

const normals = (count: number): EnemyRank[] =>
  Array.from({ length: count }, () => "normal" as const);

const elites = (count: number): EnemyRank[] =>
  Array.from({ length: count }, () => "elite" as const);

export const createEnemyRanks = (stage: number, playerCount: number): EnemyRank[] => {
  if (stage === 7) {
    return [
      ...normals(playerCount >= 3 ? 14 : 10),
      "boss",
      "elite",
      "elite",
    ];
  }
  if (stage === 5) {
    return [
      ...normals(playerCount >= 3 ? 12 : 10),
      "elite",
      "elite",
    ];
  }

  const normalCountByStage = [0, 6, 8, 11, 13, 13, 16, 16];
  const normalCount = normalCountByStage[stage] ?? 26;
  const eliteCount = stage >= 6 ? Math.min(3, Math.max(1, playerCount)) : 0;
  return [
    ...normals(normalCount),
    ...elites(eliteCount),
  ];
};

export const activeEnemyCap = (stage: number, playerCount: number): number =>
  Math.min(stage >= 7 ? 10 : stage >= 5 ? 9 : stage >= 3 ? 7 : 5, Math.max(5, playerCount * 4));

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
  const progress = state.enemyTotal > 0 ? state.spawnedEnemyCount / state.enemyTotal : 0;
  const opening = state.spawnedEnemyCount === 0;
  const midBattleSurge = progress >= 0.42 && progress <= 0.64;
  const livingCount = state.enemies.filter((enemy) => enemy.hp > 0).length;
  const quietBonus = livingCount <= Math.max(1, state.players.length) ? 1 : 0;
  const baseSize = opening
    ? state.stage >= 5 ? 3 : 2
    : midBattleSurge
      ? state.stage >= 3 ? 4 : 3
      : state.stage >= 6 ? 2 : 1;

  return Math.max(1, Math.min(capacity, normalSpan, baseSize + quietBonus));
};

export const enemySpawnDelayFor = (
  state: CombatState,
  incoming: EnemyRank[],
): number => {
  if (incoming.some((rank) => rank !== "normal")) {
    return 1.35;
  }
  if (incoming.length >= 3) {
    return state.stage >= 5 ? 1.75 : 1.95;
  }
  return state.stage >= 5 ? 1.05 : 1.25;
};
