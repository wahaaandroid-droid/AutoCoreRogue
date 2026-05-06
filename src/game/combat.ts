import { evaluateAiRules } from "./aiController";
import { damageAfterDefense, updateHits } from "./combatDamage";
import { updateEnemyDestructions } from "./combatDestruction";
import { isEntryBoosting, resolveActorCollisions, updatePositions } from "./combatMovement";
import {
  activeEnemyCap,
  createEnemyRanks,
  enemySpawnDelayFor,
  nextEnemyBatchSize,
} from "./enemyWaves";
import {
  createEffect,
  createProjectile,
  Effect,
  Projectile,
} from "./projectiles";
import {
  AiActionId,
  AiRule,
  BaseFrameId,
  DerivedStats,
  LegType,
  TargetPriorityId,
  WeaponHardpoint,
  WeaponKind,
  WeaponAutoUse,
  WeaponResource,
  WeaponStats,
} from "../types";

export interface CombatActor {
  id: string;
  name: string;
  team: "player" | "enemy";
  x: number;
  y: number;
  ax: number;
  ay: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  en: number;
  maxEn: number;
  rightAmmo: number;
  rightAmmoMax: number;
  leftAmmo: number;
  leftAmmoMax: number;
  enRegen: number;
  defense: number;
  moveSpeed: number;
  range: number;
  attack: number;
  cooldown: number;
  cooldownMax: number;
  boostCooldown: number;
  guard: boolean;
  facingX: number;
  facingY: number;
  frameId?: BaseFrameId;
  legType?: LegType;
  color: string;
  rank: "normal" | "elite" | "boss";
  enemyRole?: "drone" | "scout" | "sniper" | "bruiser" | "jammer";
  entryBoostTime?: number;
  entryBoostPulse?: number;
  deathTimer?: number;
  deathEffectPlayed?: boolean;
}

export interface PlayerCombatUnit {
  unitIndex: number;
  actor: CombatActor;
  stats: DerivedStats;
  activeAction: AiActionId;
  activeRuleId?: string;
  weapons: PlayerWeaponState[];
  boostCooldown: number;
}

export interface PlayerWeaponState extends WeaponStats {
  cooldownRemaining: number;
  cooldownMax: number;
  ammo: number;
  autoUse: boolean;
}

export type CombatSoundEvent = "shoot" | "missile" | "boost" | "blade" | "hit" | "explosion" | "defeat";

export interface CombatReport {
  damageByUnit: number[];
  ruleHitsByUnit: Record<string, number>[];
}

export interface CombatState {
  width: number;
  height: number;
  time: number;
  stage: number;
  players: PlayerCombatUnit[];
  enemies: CombatActor[];
  enemyQueue: CombatActor["rank"][];
  enemyTotal: number;
  spawnedEnemyCount: number;
  defeatedEnemyCount: number;
  nextEnemySpawnAt: number;
  projectiles: Projectile[];
  effects: Effect[];
  soundEvents: CombatSoundEvent[];
  report: CombatReport;
  status: "running" | "victory" | "defeat";
}

const ARENA_WIDTH = 980;
const ARENA_HEIGHT = 570;
const BOOST_LOCK_BREAK_MIN_DISTANCE = 52;
const BOOST_LOCK_BREAK_MAX_DISTANCE = 108;
const BOOST_LOCK_BREAK_MIN_APPROACH = 0.35;
let nextId = 1;

const uid = (prefix: string): string => `${prefix}-${nextId++}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalize = (dx: number, dy: number): { x: number; y: number; distance: number } => {
  const distance = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / distance, y: dy / distance, distance };
};

const applyThrust = (actor: CombatActor, x: number, y: number, strength = 1): void => {
  actor.ax += x * actor.moveSpeed * 3.15 * strength;
  actor.ay += y * actor.moveSpeed * 3.15 * strength;
};

const PLAYER_FORMATION = [
  { x: 0.38, y: 0.64 },
  { x: 0.46, y: 0.52 },
  { x: 0.54, y: 0.64 },
  { x: 0.62, y: 0.52 },
] as const;

const PLAYER_COLORS = ["#8ad8ff", "#54f4a7", "#ffcf66", "#c878ff"] as const;

const createPlayerActor = (stats: DerivedStats, index: number): CombatActor => ({
  id: `player-${index + 1}`,
  name: `AutoCore ${index + 1}`,
  team: "player",
  x: ARENA_WIDTH * (PLAYER_FORMATION[index]?.x ?? 0.5),
  y: ARENA_HEIGHT * (PLAYER_FORMATION[index]?.y ?? 0.58),
  ax: 0,
  ay: 0,
  vx: 0,
  vy: 0,
  radius: stats.legType === "tank" ? 20 : 17,
  hp: stats.hpMax,
  maxHp: stats.hpMax,
  en: stats.enMax,
  maxEn: stats.enMax,
  rightAmmo: stats.rightAmmoMax,
  rightAmmoMax: stats.rightAmmoMax,
  leftAmmo: stats.leftAmmoMax,
  leftAmmoMax: stats.leftAmmoMax,
  enRegen: stats.enRegen,
  defense: stats.defense,
  moveSpeed: stats.moveSpeed,
  range: Math.max(...stats.weapons.map((weapon) => weapon.range), stats.rightRange, stats.leftRange),
  attack: Math.max(...stats.weapons.map((weapon) => weapon.attack), stats.rightAttack, stats.leftAttack),
  cooldown: 0,
  cooldownMax: 1,
  boostCooldown: 0,
  guard: false,
  facingX: 0,
  facingY: -1,
  frameId: stats.frameId,
  legType: stats.legType,
  color: PLAYER_COLORS[index] ?? PLAYER_COLORS[0],
  rank: "normal",
});

const createPlayerUnit = (
  stats: DerivedStats,
  unitIndex: number,
  formationIndex: number,
  currentHp: number,
  weaponAutoUse?: WeaponAutoUse,
): PlayerCombatUnit => {
  const actor = createPlayerActor(stats, unitIndex);
  actor.x = ARENA_WIDTH * (PLAYER_FORMATION[formationIndex]?.x ?? 0.5);
  actor.y = ARENA_HEIGHT * (PLAYER_FORMATION[formationIndex]?.y ?? 0.58);
  actor.hp = clamp(currentHp, 0, stats.hpMax);
  const weapons = stats.weapons.map((weapon, weaponIndex): PlayerWeaponState => ({
    ...weapon,
    cooldownRemaining: 0.18 + formationIndex * 0.08 + weaponIndex * 0.12,
    cooldownMax: weapon.cooldown,
    ammo: weapon.ammoMax,
    autoUse: weaponAutoUse?.[weapon.hardpoint] ?? true,
  }));

  return {
    unitIndex,
    actor,
    stats,
    activeAction: "idle",
    weapons,
    boostCooldown: 0,
  };
};

const createEnemy = (
  stage: number,
  index: number,
  rank: CombatActor["rank"],
  total: number,
  enterFromOffscreen = false,
): CombatActor => {
  const role = (() => {
    if (rank === "boss") {
      return "jammer" as const;
    }
    if (rank === "elite") {
      return stage >= 6 ? "bruiser" as const : "sniper" as const;
    }
    if (stage === 2) {
      return "scout" as const;
    }
    if (stage === 3) {
      return index % 2 === 0 ? "sniper" as const : "drone" as const;
    }
    if (stage === 4) {
      return index % 3 === 0 ? "bruiser" as const : "scout" as const;
    }
    if (stage >= 6) {
      return (["scout", "sniper", "bruiser", "drone"] as const)[index % 4];
    }
    return "drone" as const;
  })();
  const angle = -Math.PI * 0.94 + ((index + 0.5) / Math.max(1, total)) * Math.PI * 1.88;
  const distance = rank === "boss" ? 235 : 228 + (index % 3) * 28;
  const roleHpScale = role === "bruiser" ? 1.32 : role === "scout" ? 0.78 : role === "sniper" ? 0.9 : 1;
  const roleAttackScale = role === "sniper" ? 1.25 : role === "bruiser" ? 1.12 : role === "scout" ? 0.84 : 1;
  const hpScale = (rank === "boss" ? 3.1 : rank === "elite" ? 1.85 : 1) * roleHpScale;
  const attackScale = (rank === "boss" ? 1.65 : rank === "elite" ? 1.28 : 1) * roleAttackScale;
  const baseHp = 128 + stage * 34;
  const baseAttack = 10 + stage * 2.2;
  const spawnX = rank === "boss"
    ? ARENA_WIDTH * 0.5
    : ARENA_WIDTH * 0.5 + Math.cos(angle) * distance;
  const spawnY = rank === "boss"
    ? ARENA_HEIGHT * 0.22
    : ARENA_HEIGHT * 0.46 + Math.sin(angle) * distance * 0.72;
  const entrySide = index % 4;
  const entryOffset = 84 + (index % 3) * 20;
  const entryTargetX = ARENA_WIDTH * (0.28 + ((index * 37) % 45) / 100);
  const entryTargetY = ARENA_HEIGHT * (0.26 + ((index * 29) % 42) / 100);
  const entryX =
    entrySide === 0
      ? -entryOffset
      : entrySide === 1
        ? ARENA_WIDTH + entryOffset
        : clamp(entryTargetX, 84, ARENA_WIDTH - 84);
  const entryY =
    entrySide === 2
      ? -entryOffset
      : entrySide === 3
        ? ARENA_HEIGHT + entryOffset
        : clamp(entryTargetY, 84, ARENA_HEIGHT - 84);
  const entryDirection = normalize(entryTargetX - entryX, entryTargetY - entryY);
  const initialSpeed = rank === "boss" ? 70 : rank === "elite" ? 116 : 138;

  return {
    id: uid("enemy"),
    name: rank === "boss"
      ? "Signal Tyrant"
      : rank === "elite"
        ? role === "sniper" ? "Gatebreaker Artillery" : "Gatebreaker Bulwark"
        : role === "scout"
          ? "Scout Frame"
          : role === "sniper"
            ? "Lance Frame"
            : role === "bruiser"
              ? "Bulwark Frame"
              : "Drone Frame",
    team: "enemy",
    x: enterFromOffscreen ? entryX : clamp(spawnX, 52, ARENA_WIDTH - 52),
    y: enterFromOffscreen ? entryY : clamp(spawnY, 52, ARENA_HEIGHT - 52),
    ax: 0,
    ay: 0,
    vx: enterFromOffscreen ? entryDirection.x * initialSpeed : 0,
    vy: enterFromOffscreen ? entryDirection.y * initialSpeed : 0,
    radius: rank === "boss" ? 27 : rank === "elite" ? 22 : 16,
    hp: baseHp * hpScale,
    maxHp: baseHp * hpScale,
    en: 0,
    maxEn: 0,
    rightAmmo: 0,
    rightAmmoMax: 0,
    leftAmmo: 0,
    leftAmmoMax: 0,
    enRegen: 0,
    defense: (rank === "boss" ? 78 + stage * 6 : rank === "elite" ? 56 + stage * 5 : 30 + stage * 4) +
      (role === "bruiser" ? 22 : role === "scout" ? -8 : 0),
    moveSpeed: (rank === "boss" ? 48 : rank === "elite" ? 66 : 76 + stage * 1.5) *
      (role === "scout" ? 1.34 : role === "sniper" ? 0.72 : role === "bruiser" ? 0.82 : 1),
    range: role === "sniper" ? 430 : role === "bruiser" ? 230 : rank === "boss" ? 380 : rank === "elite" ? 330 : 275,
    attack: baseAttack * attackScale,
    cooldown: 0.4 + index * 0.35,
    cooldownMax: role === "scout" ? 0.92 : role === "sniper" ? 1.46 : rank === "boss" ? 0.82 : rank === "elite" ? 1.0 : 1.18,
    boostCooldown: 1.1 + index * 0.18,
    guard: false,
    facingX: rank === "boss" ? 0 : -entryDirection.x,
    facingY: rank === "boss" ? 1 : -entryDirection.y,
    color: rank === "boss" ? "#ff6a42" : rank === "elite" ? "#d889ff" : "#f1b15b",
    rank,
    enemyRole: role,
    entryBoostTime: enterFromOffscreen ? 1.15 : undefined,
    entryBoostPulse: enterFromOffscreen ? 0 : undefined,
  };
};

const spawnEnemies = (
  stage: number,
  ranks: CombatActor["rank"][],
  startIndex: number,
  total: number,
  enterFromOffscreen = false,
): CombatActor[] =>
  ranks.map((rank, index) =>
    createEnemy(stage, startIndex + index, rank, total, enterFromOffscreen),
  );

const createInitialEnemies = (
  stage: number,
  playerCount: number,
): {
  enemies: CombatActor[];
  enemyQueue: CombatActor["rank"][];
  enemyTotal: number;
  spawnedEnemyCount: number;
  defeatedEnemyCount: number;
  nextEnemySpawnAt: number;
} => {
  const ranks = createEnemyRanks(stage, playerCount);

  return {
    enemies: [],
    enemyQueue: ranks,
    enemyTotal: ranks.length,
    spawnedEnemyCount: 0,
    defeatedEnemyCount: 0,
    nextEnemySpawnAt: 0,
  };
};

const refillEnemyWave = (state: CombatState): void => {
  const capacity = activeEnemyCap(state.stage, state.players.length) - state.enemies.length;
  if (capacity <= 0 || state.enemyQueue.length === 0) {
    return;
  }
  const livingCount = state.enemies.filter((enemy) => enemy.hp > 0).length;
  if (state.time < state.nextEnemySpawnAt && livingCount > 0) {
    return;
  }

  const batchSize = nextEnemyBatchSize(state, capacity);
  if (batchSize <= 0) {
    return;
  }

  const incoming = state.enemyQueue.splice(0, batchSize);
  state.enemies.push(
    ...spawnEnemies(state.stage, incoming, state.spawnedEnemyCount, state.enemyTotal, true),
  );
  state.spawnedEnemyCount += incoming.length;
  state.nextEnemySpawnAt = state.time + enemySpawnDelayFor(state, incoming);
};

export const createCombatState = (
  stage: number,
  statsByUnit: DerivedStats[],
  unitHpByUnit: number[],
  sortieEnabled: boolean[],
  unlockedUnitCount: number,
  weaponAutoUseByUnit: WeaponAutoUse[] = [],
): CombatState => {
  const players = statsByUnit
    .map((stats, unitIndex) => ({ stats, unitIndex }))
    .filter(({ stats, unitIndex }) =>
      unitIndex < unlockedUnitCount &&
      (sortieEnabled[unitIndex] ?? true) &&
      (unitHpByUnit[unitIndex] ?? stats.hpMax) > 0,
    )
    .map(({ stats, unitIndex }, formationIndex) =>
      createPlayerUnit(
        stats,
        unitIndex,
        formationIndex,
        unitHpByUnit[unitIndex] ?? stats.hpMax,
        weaponAutoUseByUnit[unitIndex],
      ),
    );
  const wave = createInitialEnemies(stage, Math.max(1, players.length));

  return {
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    time: 0,
    stage,
    players,
    enemies: wave.enemies,
    enemyQueue: wave.enemyQueue,
    enemyTotal: wave.enemyTotal,
    spawnedEnemyCount: wave.spawnedEnemyCount,
    defeatedEnemyCount: wave.defeatedEnemyCount,
    nextEnemySpawnAt: wave.nextEnemySpawnAt,
    projectiles: [],
    effects: [],
    soundEvents: [],
    report: {
      damageByUnit: statsByUnit.map(() => 0),
      ruleHitsByUnit: statsByUnit.map(() => ({})),
    },
    status: "running",
  };
};

const livingPlayerUnits = (state: CombatState): PlayerCombatUnit[] =>
  state.players.filter((unit) => unit.actor.hp > 0);

const livingEnemies = (state: CombatState): CombatActor[] =>
  state.enemies.filter((enemy) => enemy.hp > 0);

const enemyDistance = (player: CombatActor, enemy: CombatActor): number =>
  Math.hypot(enemy.x - player.x, enemy.y - player.y);

const rankScore = (enemy: CombatActor): number =>
  enemy.rank === "boss" ? 3 : enemy.rank === "elite" ? 2 : 1;

const nearestEnemyDistance = (state: CombatState, player: CombatActor): number =>
  livingEnemies(state).reduce(
    (nearest, enemy) => Math.min(nearest, enemyDistance(player, enemy)),
    Number.POSITIVE_INFINITY,
  );

const clusteredEnemyCount = (state: CombatState, target: CombatActor | undefined): number => {
  if (!target) {
    return 0;
  }

  return livingEnemies(state).filter((enemy) =>
    enemy.id !== target.id &&
    Math.hypot(enemy.x - target.x, enemy.y - target.y) <= 96,
  ).length + 1;
};

const selectEnemyTarget = (
  state: CombatState,
  player: CombatActor,
  priority: TargetPriorityId = "nearest",
): CombatActor | undefined => {
  const enemies = livingEnemies(state);
  if (enemies.length === 0) {
    return undefined;
  }

  const sorted = [...enemies].sort((a, b) => {
    const distanceA = enemyDistance(player, a);
    const distanceB = enemyDistance(player, b);

    switch (priority) {
      case "lowestHp":
        return a.hp - b.hp || distanceA - distanceB;
      case "lowestHpPercent":
        return a.hp / a.maxHp - b.hp / b.maxHp || distanceA - distanceB;
      case "eliteFirst":
        return rankScore(b) - rankScore(a) || a.hp / a.maxHp - b.hp / b.maxHp || distanceA - distanceB;
      case "nearest":
      default:
        return distanceA - distanceB;
    }
  });

  return sorted[0];
};

const nearestPlayerUnit = (state: CombatState, enemy: CombatActor): PlayerCombatUnit | undefined => {
  let best: PlayerCombatUnit | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const unit of livingPlayerUnits(state)) {
    const player = unit.actor;
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (distance < bestDistance) {
      best = unit;
      bestDistance = distance;
    }
  }
  return best;
};

const nearestEnemyProjectileDistance = (state: CombatState, player: CombatActor): number => {
  let best = Number.POSITIVE_INFINITY;
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "enemy") {
      continue;
    }
    best = Math.min(best, Math.hypot(projectile.x - player.x, projectile.y - player.y));
  }
  return best;
};

const breakIncomingMissileLocks = (state: CombatState, player: CombatActor): void => {
  for (const projectile of state.projectiles) {
    const dx = player.x - projectile.x;
    const dy = player.y - projectile.y;
    const distance = Math.hypot(dx, dy);
    const speed = Math.max(1, Math.hypot(projectile.vx, projectile.vy));
    const approach = (projectile.vx * dx + projectile.vy * dy) / Math.max(1, speed * distance);

    if (
      projectile.owner === "enemy" &&
      projectile.kind === "missile" &&
      projectile.targetId === player.id &&
      distance >= BOOST_LOCK_BREAK_MIN_DISTANCE &&
      distance <= BOOST_LOCK_BREAK_MAX_DISTANCE &&
      approach >= BOOST_LOCK_BREAK_MIN_APPROACH
    ) {
      projectile.targetId = undefined;
    }
  }
};

const nearestPlayerProjectileThreat = (
  state: CombatState,
  enemy: CombatActor,
): { distance: number; x: number; y: number } | undefined => {
  let best: { distance: number; x: number; y: number } | undefined;
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "player") {
      continue;
    }

    const dx = projectile.x - enemy.x;
    const dy = projectile.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 92) {
      continue;
    }

    const closing = (projectile.vx * dx + projectile.vy * dy) < 0;
    if (!closing && distance > 48) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = { distance, x: dx / Math.max(1, distance), y: dy / Math.max(1, distance) };
    }
  }

  return best;
};

const pushMoveEffect = (
  state: CombatState,
  x: number,
  y: number,
  color: string,
  size = 13,
  life = 0.22,
  rotation?: number,
): void => {
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "boost",
      x,
      y,
      life,
      maxLife: life,
      color,
      size,
      rotation,
    }),
  );
};

const pushBoostBurst = (
  state: CombatState,
  actor: CombatActor,
  direction: { x: number; y: number },
  color = "#21e0ff",
): void => {
  const angle = Math.atan2(direction.y, direction.x);
  const side = { x: -direction.y, y: direction.x };
  const backX = actor.x - direction.x * (actor.radius + 5);
  const backY = actor.y - direction.y * (actor.radius + 5);

  pushMoveEffect(state, backX, backY, color, 34, 0.34, angle);
  pushMoveEffect(state, backX - direction.x * 5 + side.x * 6, backY - direction.y * 5 + side.y * 6, "#8af6ff", 18, 0.26, angle);
  pushMoveEffect(state, backX - direction.x * 6 - side.x * 6, backY - direction.y * 6 - side.y * 6, "#ffb35a", 15, 0.22, angle);
};

const fireProjectile = (
  state: CombatState,
  source: CombatActor,
  target: CombatActor,
  damage: number,
  speed: number,
  kind: Projectile["kind"],
  color: string,
  radius: number,
  targetId?: string,
  sourceUnitIndex?: number,
  blastRadius = 0,
): void => {
  const aim = normalize(target.x - source.x, target.y - source.y);
  state.projectiles.push(
    createProjectile({
      id: uid("projectile"),
      owner: source.team,
      kind,
      x: source.x + aim.x * (source.radius + 8),
      y: source.y + aim.y * (source.radius + 8),
      vx: aim.x * speed,
      vy: aim.y * speed,
      damage,
      radius,
      blastRadius,
      life: kind === "missile" ? 2.9 : kind === "rocket" || kind === "grenade" ? 2.05 : 1.55,
      color,
      targetId,
      sourceUnitIndex,
    }),
  );
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "muzzle",
      x: source.x + aim.x * (source.radius + 12),
      y: source.y + aim.y * (source.radius + 12),
      life: 0.12,
      maxLife: 0.12,
      color,
      size: 16,
    }),
  );
  state.soundEvents.push(kind === "missile" || kind === "rocket" || kind === "grenade" ? "missile" : "shoot");
};

const projectileProfile = (
  kind: WeaponKind,
  resource: WeaponResource,
): {
  projectileKind: Projectile["kind"];
  speed: number;
  color: string;
  radius: number;
  damageScale: number;
  homing: boolean;
} => {
  switch (kind) {
    case "sniperRifle":
      return {
        projectileKind: resource === "energy" ? "pulse" : "bullet",
        speed: resource === "energy" ? 820 : 880,
        color: resource === "energy" ? "#8ce5ff" : "#ffe0a6",
        radius: 4.1,
        damageScale: 1.18,
        homing: false,
      };
    case "machineGun":
      return {
        projectileKind: resource === "energy" ? "pulse" : "bullet",
        speed: resource === "energy" ? 560 : 640,
        color: resource === "energy" ? "#54f4a7" : "#ffb15a",
        radius: 3.5,
        damageScale: 0.82,
        homing: false,
      };
    case "rocket":
      return {
        projectileKind: "rocket",
        speed: 315,
        color: "#ff9d42",
        radius: 6.4,
        damageScale: 1.08,
        homing: false,
      };
    case "grenade":
      return {
        projectileKind: "grenade",
        speed: 255,
        color: "#ffc45f",
        radius: 7.2,
        damageScale: 1.0,
        homing: false,
      };
    case "missile":
      return {
        projectileKind: "missile",
        speed: 225,
        color: "#ff9c35",
        radius: 5.9,
        damageScale: 1.0,
        homing: true,
      };
    case "pulse":
      return {
        projectileKind: "pulse",
        speed: 510,
        color: "#63cfff",
        radius: 4.8,
        damageScale: 1.0,
        homing: false,
      };
    case "rifle":
    default:
      return {
        projectileKind: resource === "energy" ? "pulse" : "bullet",
        speed: resource === "energy" ? 585 : 650,
        color: resource === "energy" ? "#63cfff" : "#ffb15a",
        radius: 4.4,
        damageScale: 1.0,
        homing: false,
      };
  }
};

const performBladeAttack = (
  state: CombatState,
  source: CombatActor,
  target: CombatActor,
  damage: number,
  reach: number,
): void => {
  const aim = normalize(target.x - source.x, target.y - source.y);
  const rotation = Math.atan2(aim.y, aim.x);
  const strikeDistance = Math.min(reach * 0.72, aim.distance * 0.58);
  const strikeX = source.x + aim.x * strikeDistance;
  const strikeY = source.y + aim.y * strikeDistance;

  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "slash",
      x: strikeX,
      y: strikeY,
      life: 0.38,
      maxLife: 0.38,
      color: "#8dfff1",
      size: 82,
      rotation,
    }),
  );
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "muzzle",
      x: source.x + aim.x * (source.radius + 10),
      y: source.y + aim.y * (source.radius + 10),
      life: 0.11,
      maxLife: 0.11,
      color: "#d7fff6",
      size: 20,
    }),
  );

  const resolvedDamage = damageAfterDefense(damage, target);
  target.hp = Math.max(0, target.hp - resolvedDamage);
  const sourceUnitIndex = source.id.startsWith("player-") ? Number(source.id.replace("player-", "")) - 1 : undefined;
  if (sourceUnitIndex !== undefined && Number.isFinite(sourceUnitIndex)) {
    state.report.damageByUnit[sourceUnitIndex] =
      (state.report.damageByUnit[sourceUnitIndex] ?? 0) + resolvedDamage;
  }
  const knockback = target.rank === "boss" ? 95 : target.rank === "elite" ? 145 : 205;
  target.vx += aim.x * knockback;
  target.vy += aim.y * knockback;
  state.soundEvents.push("blade", "hit");
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "explosion",
      x: target.x - aim.x * target.radius * 0.35,
      y: target.y - aim.y * target.radius * 0.35,
      life: 0.18,
      maxLife: 0.18,
      color: "#9fffee",
      size: 22,
    }),
  );
};

const spendEnergy = (actor: CombatActor, amount: number): boolean => {
  if (actor.en < amount) {
    return false;
  }
  actor.en -= amount;
  return true;
};

const weaponByHardpoint = (
  unit: PlayerCombatUnit,
  hardpoint: WeaponHardpoint,
): PlayerWeaponState | undefined =>
  unit.weapons.find((weapon) => weapon.hardpoint === hardpoint);

const firstReadyShoulderWeapon = (
  unit: PlayerCombatUnit,
  target: CombatActor,
): PlayerWeaponState | undefined =>
  unit.weapons.find((weapon) =>
    weapon.hardpoint.includes("Shoulder") &&
    weapon.autoUse &&
    weapon.cooldownRemaining <= 0 &&
    canPayWeapon(unit, weapon) &&
    isWeaponInRange(unit.actor, target, weapon),
  );

const canPayWeapon = (unit: PlayerCombatUnit, weapon: PlayerWeaponState | undefined): boolean => {
  if (!weapon) {
    return false;
  }
  return weapon.resource === "ballistic"
    ? weapon.ammo > 0
    : unit.actor.en >= weapon.energyCost;
};

const canAutoUseWeapon = (unit: PlayerCombatUnit, weapon: PlayerWeaponState | undefined): boolean =>
  Boolean(weapon?.autoUse) && canPayWeapon(unit, weapon);

const isWeaponInRange = (
  actor: CombatActor,
  target: CombatActor,
  weapon: PlayerWeaponState,
): boolean => {
  if (weapon.weaponKind === "blade") {
    return Math.hypot(target.x - actor.x, target.y - actor.y) <= actor.radius + target.radius + 118;
  }
  return Math.hypot(target.x - actor.x, target.y - actor.y) <= weapon.range + target.radius;
};

const consumeWeapon = (
  unit: PlayerCombatUnit,
  weapon: PlayerWeaponState,
): boolean => {
  if (weapon.resource === "ballistic") {
    if (weapon.ammo <= 0) {
      return false;
    }
    weapon.ammo -= 1;
    return true;
  }
  return spendEnergy(unit.actor, weapon.energyCost);
};

const firePlayerWeapon = (
  state: CombatState,
  unit: PlayerCombatUnit,
  weapon: PlayerWeaponState | undefined,
  target: CombatActor,
  requireRange = false,
): boolean => {
  if (!weapon || !weapon.autoUse || weapon.cooldownRemaining > 0) {
    return false;
  }

  const player = unit.actor;
  const toTarget = normalize(target.x - player.x, target.y - player.y);

  if (weapon.weaponKind === "blade") {
    const bladeReach = player.radius + target.radius + 118;
    if (toTarget.distance > bladeReach) {
      return false;
    }
    if (!consumeWeapon(unit, weapon)) {
      return false;
    }
    player.vx += toTarget.x * player.moveSpeed * 0.88;
    player.vy += toTarget.y * player.moveSpeed * 0.88;
    performBladeAttack(state, player, target, weapon.attack * 1.55, bladeReach);
    weapon.cooldownRemaining = weapon.cooldownMax;
    return true;
  }

  if (requireRange && !isWeaponInRange(player, target, weapon)) {
    return false;
  }

  if (!consumeWeapon(unit, weapon)) {
    return false;
  }
  const profile = projectileProfile(weapon.weaponKind, weapon.resource);
  fireProjectile(
    state,
    player,
    target,
    weapon.attack * profile.damageScale,
    profile.speed,
    profile.projectileKind,
    profile.color,
    profile.radius,
    profile.homing ? target.id : undefined,
    unit.unitIndex,
    weapon.blastRadius,
  );
  weapon.cooldownRemaining = weapon.cooldownMax;
  return true;
};

type WeaponPlanMode = "suppressive" | "alpha" | "explosive" | "longRange";

const isExplosiveWeapon = (weapon: PlayerWeaponState): boolean =>
  weapon.weaponKind === "rocket" || weapon.weaponKind === "grenade" || weapon.blastRadius > 0;

const isLongRangeWeapon = (weapon: PlayerWeaponState): boolean =>
  weapon.weaponKind === "sniperRifle" ||
  weapon.weaponKind === "rocket" ||
  weapon.weaponKind === "missile" ||
  weapon.range >= 390;

const suppressiveWeaponScore = (weapon: PlayerWeaponState): number => {
  const armBonus = weapon.hardpoint === "leftArm" || weapon.hardpoint === "rightArm" ? 80 : 0;
  const kindBonus =
    weapon.weaponKind === "machineGun"
      ? 42
      : weapon.weaponKind === "rifle" || weapon.weaponKind === "pulse"
        ? 30
        : weapon.weaponKind === "blade"
          ? 10
          : 0;
  return armBonus + kindBonus + Math.max(0, 3 - weapon.cooldownMax) * 10;
};

const plannedWeaponCandidates = (
  unit: PlayerCombatUnit,
  target: CombatActor,
  mode: WeaponPlanMode,
): PlayerWeaponState[] =>
  unit.weapons
    .filter((weapon) => {
      if (!weapon.autoUse || weapon.cooldownRemaining > 0 || !canPayWeapon(unit, weapon)) {
        return false;
      }
      if (!isWeaponInRange(unit.actor, target, weapon)) {
        return false;
      }

      switch (mode) {
        case "suppressive":
          return (
            !isExplosiveWeapon(weapon) &&
            (weapon.hardpoint === "leftArm" ||
              weapon.hardpoint === "rightArm" ||
              weapon.weaponKind === "machineGun" ||
              weapon.weaponKind === "rifle" ||
              weapon.weaponKind === "pulse")
          );
        case "explosive":
          return isExplosiveWeapon(weapon);
        case "longRange":
          return isLongRangeWeapon(weapon);
        case "alpha":
        default:
          return true;
      }
    })
    .sort((a, b) => {
      switch (mode) {
        case "suppressive":
          return suppressiveWeaponScore(b) - suppressiveWeaponScore(a);
        case "explosive":
          return (b.blastRadius || b.attack) - (a.blastRadius || a.attack);
        case "longRange":
          return b.range - a.range || b.attack - a.attack;
        case "alpha":
        default:
          return b.attack - a.attack || b.range - a.range;
      }
    });

const firePlannedWeapons = (
  state: CombatState,
  unit: PlayerCombatUnit,
  target: CombatActor,
  mode: WeaponPlanMode,
): boolean => {
  const candidates = plannedWeaponCandidates(unit, target, mode);
  const limit = mode === "alpha" ? candidates.length : mode === "suppressive" ? 2 : 1;
  let fired = false;

  for (const weapon of candidates.slice(0, limit)) {
    fired = firePlayerWeapon(state, unit, weapon, target, true) || fired;
  }

  return fired;
};

const applyPlayerAction = (
  state: CombatState,
  unit: PlayerCombatUnit,
  action: AiActionId,
  target: CombatActor | undefined,
): void => {
  const player = unit.actor;
  if (!target) {
    return;
  }

  const toTarget = normalize(target.x - player.x, target.y - player.y);
  player.facingX = toTarget.x;
  player.facingY = toTarget.y;
  const strafeDirection = Math.sin(state.time * 2.7) > 0 ? 1 : -1;
  const perpendicular = { x: -toTarget.y * strafeDirection, y: toTarget.x * strafeDirection };
  const rangeBias = toTarget.distance > 285 ? 0.44 : toTarget.distance < 118 ? -0.62 : 0.05;
  const combatDrift = () => {
    applyThrust(player, perpendicular.x * 0.45 + toTarget.x * rangeBias, perpendicular.y * 0.45 + toTarget.y * rangeBias, 0.5);
  };

  switch (action) {
    case "approach":
      applyThrust(player, toTarget.x, toTarget.y, 0.82);
      break;
    case "retreat":
      applyThrust(player, -toTarget.x, -toTarget.y, 0.68);
      break;
    case "strafe":
      applyThrust(player, perpendicular.x * 0.55 + toTarget.x * rangeBias, perpendicular.y * 0.55 + toTarget.y * rangeBias, 0.58);
      break;
    case "boostDodge": {
      const cost = player.legType === "reverse" ? 12 : player.legType === "tank" ? 22 : 16;
      if (unit.boostCooldown <= 0 && spendEnergy(player, cost)) {
        player.vx += perpendicular.x * player.moveSpeed * 2.08;
        player.vy += perpendicular.y * player.moveSpeed * 2.08;
        applyThrust(player, perpendicular.x, perpendicular.y, 1.28);
        pushBoostBurst(state, player, perpendicular);
        breakIncomingMissileLocks(state, player);
        unit.boostCooldown = 0.5;
        state.soundEvents.push("boost");
      } else {
        applyThrust(player, perpendicular.x * 0.35 + toTarget.x * rangeBias, perpendicular.y * 0.35 + toTarget.y * rangeBias, 0.32);
      }
      break;
    }
    case "suppressiveFire":
      combatDrift();
      firePlannedWeapons(state, unit, target, "suppressive");
      break;
    case "alphaStrike":
      combatDrift();
      firePlannedWeapons(state, unit, target, "alpha");
      break;
    case "fireExplosive":
      combatDrift();
      firePlannedWeapons(state, unit, target, "explosive");
      break;
    case "fireLongRange":
      combatDrift();
      firePlannedWeapons(state, unit, target, "longRange");
      break;
    case "shootRight":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "rightArm"), target);
      break;
    case "shootLeft": {
      const leftWeapon = weaponByHardpoint(unit, "leftArm");
      if (leftWeapon?.weaponKind === "blade") {
        const bladeReach = player.radius + target.radius + 118;
        if (toTarget.distance > bladeReach) {
          applyThrust(player, toTarget.x, toTarget.y, 1.15);
          break;
        }

        applyThrust(player, toTarget.x, toTarget.y, 0.58);
        firePlayerWeapon(state, unit, leftWeapon, target);
        break;
      }

      combatDrift();
      firePlayerWeapon(state, unit, leftWeapon, target);
      break;
    }
    case "fireLeftShoulder":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "leftShoulder"), target);
      break;
    case "fireRightShoulder":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "rightShoulder"), target);
      break;
    case "fireBothShoulders":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "bothShoulders"), target);
      break;
    case "fireShoulder":
    case "fireMissile":
      combatDrift();
      firePlayerWeapon(state, unit, firstReadyShoulderWeapon(unit, target), target, true);
      break;
    case "guard":
      player.guard = true;
      applyThrust(player, -toTarget.x, -toTarget.y, 0.2);
      break;
    case "idle":
      combatDrift();
      break;
  }
};

const updateEnemy = (state: CombatState, enemy: CombatActor, dt: number): void => {
  const targetUnit = nearestPlayerUnit(state, enemy);
  if (!targetUnit) {
    return;
  }
  const player = targetUnit.actor;
  const toPlayer = normalize(player.x - enemy.x, player.y - enemy.y);
  enemy.facingX = toPlayer.x;
  enemy.facingY = toPlayer.y;
  enemy.ax = 0;
  enemy.ay = 0;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  enemy.boostCooldown = Math.max(0, enemy.boostCooldown - dt);

  if (isEntryBoosting(enemy)) {
    enemy.entryBoostTime = Math.max(0, (enemy.entryBoostTime ?? 0) - dt);
    enemy.entryBoostPulse = Math.max(0, (enemy.entryBoostPulse ?? 0) - dt);

    const entryAnchor = {
      x: clamp(enemy.x, 112, state.width - 112),
      y: clamp(enemy.y, 92, state.height - 92),
    };
    const toArena = normalize(entryAnchor.x - enemy.x, entryAnchor.y - enemy.y);
    const thrust = enemy.rank === "boss" ? 1.05 : enemy.rank === "elite" ? 1.65 : 1.9;
    applyThrust(enemy, toArena.x, toArena.y, thrust);

    if ((enemy.entryBoostPulse ?? 0) <= 0) {
      pushBoostBurst(state, enemy, toArena, enemy.rank === "elite" ? "#d889ff" : "#ff9d42");
      state.soundEvents.push("boost");
      enemy.entryBoostPulse = 0.18;
    }

    const inside =
      enemy.x > 44 &&
      enemy.x < state.width - 44 &&
      enemy.y > 44 &&
      enemy.y < state.height - 44;
    if (!inside) {
      enemy.entryBoostTime = Math.max(enemy.entryBoostTime ?? 0, 0.05);
      return;
    }

    enemy.entryBoostTime = 0;
    enemy.entryBoostPulse = undefined;
  }

  const threat = nearestPlayerProjectileThreat(state, enemy);
  if (threat && enemy.boostCooldown <= 0) {
    const dodgeSide = Math.sin(state.time * 3.1 + enemy.x * 0.013) > 0 ? 1 : -1;
    const dodge = { x: -threat.y * dodgeSide, y: threat.x * dodgeSide };
    enemy.vx += dodge.x * enemy.moveSpeed * (enemy.rank === "boss" ? 1.1 : 1.55);
    enemy.vy += dodge.y * enemy.moveSpeed * (enemy.rank === "boss" ? 1.1 : 1.55);
    applyThrust(enemy, dodge.x, dodge.y, enemy.rank === "boss" ? 0.65 : 0.85);
    pushBoostBurst(state, enemy, dodge, enemy.rank === "elite" ? "#d889ff" : "#ff9d42");
    state.soundEvents.push("boost");
    enemy.boostCooldown = enemy.rank === "boss" ? 1.05 : enemy.rank === "elite" ? 0.85 : 1.25;
  }

  const desiredBand =
    enemy.enemyRole === "sniper"
      ? { min: enemy.range * 0.68, max: enemy.range * 0.92 }
      : enemy.enemyRole === "bruiser"
        ? { min: enemy.range * 0.28, max: enemy.range * 0.62 }
        : enemy.enemyRole === "scout"
          ? { min: enemy.range * 0.35, max: enemy.range * 0.74 }
          : { min: enemy.range * 0.46, max: enemy.range * 0.82 };

  if (toPlayer.distance > desiredBand.max) {
    applyThrust(enemy, toPlayer.x, toPlayer.y, enemy.enemyRole === "scout" ? 0.62 : 0.42);
  } else if (toPlayer.distance < desiredBand.min) {
    applyThrust(enemy, -toPlayer.x, -toPlayer.y, enemy.enemyRole === "sniper" ? 0.52 : 0.28);
  } else {
    const drift = Math.sin(state.time * 1.5 + enemy.x * 0.01) > 0 ? 1 : -1;
    const pressure = enemy.enemyRole === "bruiser" ? 0.16 : enemy.enemyRole === "sniper" ? -0.18 : 0.06;
    applyThrust(enemy, -toPlayer.y * drift * 0.38 + toPlayer.x * pressure, toPlayer.x * drift * 0.38 + toPlayer.y * pressure, 0.24);
  }

  if (toPlayer.distance <= enemy.range && enemy.cooldown <= 0) {
    const missile =
      enemy.rank === "boss" ||
      enemy.enemyRole === "sniper" ||
      (enemy.rank === "elite" && Math.sin(state.time * 2) > 0.35);
    fireProjectile(
      state,
      enemy,
      player,
      missile ? enemy.attack * 1.35 : enemy.attack,
      missile ? 215 : 410,
      missile ? "missile" : "bullet",
      missile ? "#ff7a37" : "#ff5f42",
      missile ? 6.5 : 4.3,
      missile ? player.id : undefined,
    );
    enemy.cooldown = enemy.cooldownMax;
  }
};

const updateEffects = (state: CombatState, dt: number): void => {
  state.effects = state.effects
    .map((effect) => ({ ...effect, life: effect.life - dt }))
    .filter((effect) => effect.life > 0);
};

export const stepCombat = (
  state: CombatState,
  dt: number,
  rulesByUnit: AiRule[][],
  targetPrioritiesByUnit: TargetPriorityId[] = [],
): CombatState => {
  if (state.status !== "running") {
    return state;
  }

  state.soundEvents = [];
  state.time += dt;

  for (let unitIndex = 0; unitIndex < state.players.length; unitIndex += 1) {
    const unit = state.players[unitIndex];
    const player = unit.actor;
    if (player.hp <= 0) {
      unit.activeAction = "idle";
      unit.activeRuleId = undefined;
      player.ax = 0;
      player.ay = 0;
      player.guard = false;
      continue;
    }

    player.en = Math.min(player.maxEn, player.en + player.enRegen * dt);
    for (const weapon of unit.weapons) {
      weapon.cooldownRemaining = Math.max(0, weapon.cooldownRemaining - dt);
    }
    unit.boostCooldown = Math.max(0, unit.boostCooldown - dt);

    const target = selectEnemyTarget(state, player, targetPrioritiesByUnit[unit.unitIndex] ?? "nearest");
    const targetDistance = target
      ? Math.hypot(target.x - player.x, target.y - player.y)
      : Number.POSITIVE_INFINITY;
    const threatDistance = nearestEnemyDistance(state, player);
    const rules = rulesByUnit[unit.unitIndex] ?? rulesByUnit[0] ?? [];
    const rightWeapon = weaponByHardpoint(unit, "rightArm");
    const leftWeapon = weaponByHardpoint(unit, "leftArm");
    const leftShoulderWeapon = weaponByHardpoint(unit, "leftShoulder");
    const rightShoulderWeapon = weaponByHardpoint(unit, "rightShoulder");
    const bothShoulderWeapon = weaponByHardpoint(unit, "bothShoulders");
    const decision = evaluateAiRules(rules, {
      en: player.en,
      hpPercent: player.hp / player.maxHp,
      enPercent: player.en / player.maxEn,
      nearestEnemyDistance: threatDistance,
      clusteredEnemyCount: clusteredEnemyCount(state, target),
      rightCooldown: rightWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      leftCooldown: leftWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      leftShoulderCooldown: leftShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      rightShoulderCooldown: rightShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      bothShoulderCooldown: bothShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      rightCanPay: canAutoUseWeapon(unit, rightWeapon),
      leftCanPay: canAutoUseWeapon(unit, leftWeapon),
      leftShoulderCanPay: canAutoUseWeapon(unit, leftShoulderWeapon),
      rightShoulderCanPay: canAutoUseWeapon(unit, rightShoulderWeapon),
      bothShoulderCanPay: canAutoUseWeapon(unit, bothShoulderWeapon),
      enemyProjectileDistance: nearestEnemyProjectileDistance(state, player),
    });

    const bladeEngageDistance = target ? player.radius + target.radius + 284 : 0;
    const hasDefensiveDecision = decision.some(
      (item) => item.action === "retreat" || item.action === "guard" || item.action === "boostDodge",
    );
    if (
      target &&
      leftWeapon?.weaponKind === "blade" &&
      leftWeapon.autoUse &&
      leftWeapon.cooldownRemaining <= 0 &&
      targetDistance <= bladeEngageDistance &&
      !hasDefensiveDecision
    ) {
      decision.push({
        action: "shootLeft",
        ruleId: "blade-priority",
        condition: "leftReady",
      });
    }

    player.ax = 0;
    player.ay = 0;
    player.guard = false;
    unit.activeAction = decision[0].action;
    unit.activeRuleId = decision[0].ruleId;
    for (const item of decision) {
      if (item.ruleId) {
        const unitRuleHits = state.report.ruleHitsByUnit[unit.unitIndex] ?? {};
        unitRuleHits[item.ruleId] = (unitRuleHits[item.ruleId] ?? 0) + 1;
        state.report.ruleHitsByUnit[unit.unitIndex] = unitRuleHits;
      }
      applyPlayerAction(state, unit, item.action, target);
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.hp > 0) {
      updateEnemy(state, enemy, dt);
    }
  }

  updatePositions(state, dt);
  resolveActorCollisions(state);
  updateHits(state, dt, uid);
  updateEnemyDestructions(state, dt, uid);
  updateEffects(state, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 || (enemy.deathTimer ?? 0) > 0);
  refillEnemyWave(state);

  if (livingPlayerUnits(state).length === 0) {
    state.status = "defeat";
    state.soundEvents.push("defeat");
  } else if (state.enemies.length === 0 && state.enemyQueue.length === 0) {
    state.status = "victory";
  }

  return state;
};
