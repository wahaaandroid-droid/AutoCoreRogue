import { evaluateAiRules } from "./aiController";
import {
  advanceProjectiles,
  createEffect,
  createProjectile,
  Effect,
  Projectile,
} from "./projectiles";
import { AiActionId, AiRule, DerivedStats, LegType, WeaponResource } from "../types";

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
  legType?: LegType;
  color: string;
  rank: "normal" | "elite" | "boss";
  entryBoostTime?: number;
  entryBoostPulse?: number;
}

export interface PlayerCombatUnit {
  actor: CombatActor;
  stats: DerivedStats;
  activeAction: AiActionId;
  activeRuleId?: string;
  rightCooldown: number;
  leftCooldown: number;
  missileCooldown: number;
  boostCooldown: number;
  rightResource: WeaponResource;
  leftResource: WeaponResource;
  rightAmmo: number;
  rightAmmoMax: number;
  leftAmmo: number;
  leftAmmoMax: number;
  rightEnergyCost: number;
  leftEnergyCost: number;
  missileEnergyCost: number;
}

export type CombatSoundEvent = "shoot" | "missile" | "boost" | "blade" | "hit" | "defeat";

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
  projectiles: Projectile[];
  effects: Effect[];
  soundEvents: CombatSoundEvent[];
  status: "running" | "victory" | "defeat";
}

const ARENA_WIDTH = 980;
const ARENA_HEIGHT = 570;
const PLAYER_DAMAGE_MULTIPLIER = 0.48;
let nextId = 1;

const uid = (prefix: string): string => `${prefix}-${nextId++}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isEntryBoosting = (actor: CombatActor): boolean =>
  actor.team === "enemy" && (actor.entryBoostTime ?? 0) > 0;

const normalize = (dx: number, dy: number): { x: number; y: number; distance: number } => {
  const distance = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / distance, y: dy / distance, distance };
};

const damageAfterDefense = (raw: number, target: CombatActor): number => {
  const mitigation = Math.min(0.68, target.defense / (target.defense + 380));
  const guard = target.guard ? 0.72 : 1;
  const teamScale = target.team === "enemy" ? PLAYER_DAMAGE_MULTIPLIER : 1;
  return Math.max(2, raw * teamScale * (1 - mitigation) * guard);
};

const applyThrust = (actor: CombatActor, x: number, y: number, strength = 1): void => {
  actor.ax += x * actor.moveSpeed * 3.15 * strength;
  actor.ay += y * actor.moveSpeed * 3.15 * strength;
};

const maxSpeedFor = (actor: CombatActor): number => {
  if (actor.team === "enemy") {
    if (isEntryBoosting(actor)) {
      return actor.moveSpeed * (actor.rank === "boss" ? 1.25 : actor.rank === "elite" ? 1.72 : 1.92);
    }
    return actor.moveSpeed * (actor.rank === "boss" ? 0.82 : 0.96);
  }

  const legBonus =
    actor.legType === "reverse" ? 1.18 : actor.legType === "hover" ? 1.1 : actor.legType === "tank" ? 0.88 : 1;
  return actor.moveSpeed * legBonus;
};

const dragFor = (actor: CombatActor): number => {
  if (actor.team === "enemy") {
    return actor.rank === "boss" ? 1.35 : 1.55;
  }

  switch (actor.legType) {
    case "hover":
      return 0.88;
    case "tank":
      return 1.18;
    case "reverse":
      return 1.75;
    case "quad":
      return 1.5;
    default:
      return 1.58;
  }
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
  range: Math.max(stats.rightRange, stats.leftRange),
  attack: Math.max(stats.rightAttack, stats.leftAttack),
  cooldown: 0,
  cooldownMax: 1,
  boostCooldown: 0,
  guard: false,
  legType: stats.legType,
  color: PLAYER_COLORS[index] ?? PLAYER_COLORS[0],
  rank: "normal",
});

const createPlayerUnit = (stats: DerivedStats, index: number): PlayerCombatUnit => ({
  actor: createPlayerActor(stats, index),
  stats,
  activeAction: "idle",
  rightCooldown: 0.2 + index * 0.08,
  leftCooldown: 0.35 + index * 0.08,
  missileCooldown: 1.5 + index * 0.16,
  boostCooldown: 0,
  rightResource: stats.rightResource,
  leftResource: stats.leftResource,
  rightAmmo: stats.rightAmmoMax,
  rightAmmoMax: stats.rightAmmoMax,
  leftAmmo: stats.leftAmmoMax,
  leftAmmoMax: stats.leftAmmoMax,
  rightEnergyCost: stats.rightEnergyCost,
  leftEnergyCost: stats.leftEnergyCost,
  missileEnergyCost: stats.missileEnergyCost,
});

const createEnemy = (
  stage: number,
  index: number,
  rank: CombatActor["rank"],
  total: number,
  enterFromOffscreen = false,
): CombatActor => {
  const angle = -Math.PI * 0.94 + ((index + 0.5) / Math.max(1, total)) * Math.PI * 1.88;
  const distance = rank === "boss" ? 235 : 228 + (index % 3) * 28;
  const hpScale = rank === "boss" ? 3.1 : rank === "elite" ? 1.85 : 1;
  const attackScale = rank === "boss" ? 1.65 : rank === "elite" ? 1.28 : 1;
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
    name: rank === "boss" ? "Signal Tyrant" : rank === "elite" ? "Gatebreaker" : "Drone Frame",
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
    defense: rank === "boss" ? 78 + stage * 6 : rank === "elite" ? 56 + stage * 5 : 30 + stage * 4,
    moveSpeed: rank === "boss" ? 48 : rank === "elite" ? 66 : 76 + stage * 1.5,
    range: rank === "boss" ? 380 : rank === "elite" ? 330 : 275,
    attack: baseAttack * attackScale,
    cooldown: 0.4 + index * 0.35,
    cooldownMax: rank === "boss" ? 0.82 : rank === "elite" ? 1.0 : 1.18,
    boostCooldown: 1.1 + index * 0.18,
    guard: false,
    color: rank === "boss" ? "#ff6a42" : rank === "elite" ? "#d889ff" : "#f1b15b",
    rank,
    entryBoostTime: enterFromOffscreen ? 1.15 : undefined,
    entryBoostPulse: enterFromOffscreen ? 0 : undefined,
  };
};

const createEnemyRanks = (stage: number): CombatActor["rank"][] => {
  if (stage === 7) {
    return [
      "boss",
      "elite",
      "elite",
      "elite",
      ...Array.from({ length: 20 }, () => "normal" as const),
    ];
  }
  if (stage === 5) {
    return [
      "elite",
      "elite",
      "elite",
      ...Array.from({ length: 17 }, () => "normal" as const),
    ];
  }

  const normalCountByStage = [0, 14, 17, 20, 23, 23, 26, 26];
  const normalCount = normalCountByStage[stage] ?? 26;
  const eliteCount = stage >= 6 ? 3 : 0;
  return [
    ...Array.from({ length: eliteCount }, () => "elite" as const),
    ...Array.from({ length: normalCount }, () => "normal" as const),
  ];
};

const activeEnemyCap = (stage: number): number =>
  stage >= 7 ? 11 : stage >= 5 ? 10 : stage >= 3 ? 8 : 7;

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
): { enemies: CombatActor[]; enemyQueue: CombatActor["rank"][]; enemyTotal: number; spawnedEnemyCount: number } => {
  const ranks = createEnemyRanks(stage);
  const initialCount = Math.min(activeEnemyCap(stage), ranks.length);

  return {
    enemies: spawnEnemies(stage, ranks.slice(0, initialCount), 0, ranks.length),
    enemyQueue: ranks.slice(initialCount),
    enemyTotal: ranks.length,
    spawnedEnemyCount: initialCount,
  };
};

const refillEnemyWave = (state: CombatState): void => {
  const capacity = activeEnemyCap(state.stage) - state.enemies.length;
  if (capacity <= 0 || state.enemyQueue.length === 0) {
    return;
  }

  const incoming = state.enemyQueue.splice(0, capacity);
  state.enemies.push(
    ...spawnEnemies(state.stage, incoming, state.spawnedEnemyCount, state.enemyTotal, true),
  );
  state.spawnedEnemyCount += incoming.length;
};

export const createCombatState = (stage: number, statsByUnit: DerivedStats[]): CombatState => {
  const wave = createInitialEnemies(stage);

  return {
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    time: 0,
    stage,
    players: statsByUnit.map((stats, index) => createPlayerUnit(stats, index)),
    enemies: wave.enemies,
    enemyQueue: wave.enemyQueue,
    enemyTotal: wave.enemyTotal,
    spawnedEnemyCount: wave.spawnedEnemyCount,
    projectiles: [],
    effects: [],
    soundEvents: [],
    status: "running",
  };
};

const livingPlayerUnits = (state: CombatState): PlayerCombatUnit[] =>
  state.players.filter((unit) => unit.actor.hp > 0);

const livingPlayerActors = (state: CombatState): CombatActor[] =>
  livingPlayerUnits(state).map((unit) => unit.actor);

const nearestEnemy = (state: CombatState, player: CombatActor): CombatActor | undefined => {
  let best: CombatActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
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
      life: kind === "missile" ? 2.9 : 1.55,
      color,
      targetId,
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
  state.soundEvents.push(kind === "missile" ? "missile" : "shoot");
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

  target.hp = Math.max(0, target.hp - damageAfterDefense(damage, target));
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

const canPayWeapon = (
  unit: PlayerCombatUnit,
  side: "right" | "left",
): boolean => {
  if (side === "right") {
    return unit.rightResource === "ballistic"
      ? unit.rightAmmo > 0
      : unit.actor.en >= unit.rightEnergyCost;
  }

  return unit.leftResource === "ballistic"
    ? unit.leftAmmo > 0
    : unit.actor.en >= unit.leftEnergyCost;
};

const consumeWeapon = (
  unit: PlayerCombatUnit,
  side: "right" | "left",
): boolean => {
  if (side === "right") {
    if (unit.rightResource === "ballistic") {
      if (unit.rightAmmo <= 0) {
        return false;
      }
      unit.rightAmmo -= 1;
      return true;
    }
    return spendEnergy(unit.actor, unit.rightEnergyCost);
  }

  if (unit.leftResource === "ballistic") {
    if (unit.leftAmmo <= 0) {
      return false;
    }
    unit.leftAmmo -= 1;
    return true;
  }
  return spendEnergy(unit.actor, unit.leftEnergyCost);
};

const applyPlayerAction = (
  state: CombatState,
  unit: PlayerCombatUnit,
  action: AiActionId,
  target: CombatActor | undefined,
): void => {
  const player = unit.actor;
  const stats = unit.stats;
  if (!target) {
    return;
  }

  const toTarget = normalize(target.x - player.x, target.y - player.y);
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
        unit.boostCooldown = 0.5;
        state.soundEvents.push("boost");
      } else {
        applyThrust(player, perpendicular.x * 0.35 + toTarget.x * rangeBias, perpendicular.y * 0.35 + toTarget.y * rangeBias, 0.32);
      }
      break;
    }
    case "shootRight":
      combatDrift();
      if (unit.rightCooldown <= 0 && consumeWeapon(unit, "right")) {
        const ballistic = unit.rightResource === "ballistic";
        fireProjectile(
          state,
          player,
          target,
          stats.rightAttack,
          ballistic ? 640 : 585,
          ballistic ? "bullet" : "pulse",
          ballistic ? "#ff9d42" : "#63cfff",
          ballistic ? 4.6 : 4.2,
        );
        unit.rightCooldown = stats.rightCooldown;
      }
      break;
    case "shootLeft":
      if (stats.leftWeaponKind === "blade") {
        const bladeReach = player.radius + target.radius + 118;
        if (toTarget.distance > bladeReach) {
          applyThrust(player, toTarget.x, toTarget.y, 1.15);
          break;
        }

        applyThrust(player, toTarget.x, toTarget.y, 0.58);
        if (unit.leftCooldown <= 0 && consumeWeapon(unit, "left")) {
          player.vx += toTarget.x * player.moveSpeed * 0.88;
          player.vy += toTarget.y * player.moveSpeed * 0.88;
          performBladeAttack(state, player, target, stats.leftAttack * 1.55, bladeReach);
          unit.leftCooldown = stats.leftCooldown;
        }
        break;
      }

      combatDrift();
      if (unit.leftCooldown <= 0 && consumeWeapon(unit, "left")) {
        const ballistic = unit.leftResource === "ballistic";
        const kind = stats.leftWeaponKind === "missile" ? "missile" : ballistic ? "bullet" : "pulse";
        fireProjectile(
          state,
          player,
          target,
          stats.leftAttack,
          kind === "missile" ? 245 : ballistic ? 610 : 465,
          kind,
          kind === "missile" ? "#ff9c35" : ballistic ? "#ffb15a" : "#54f4a7",
          kind === "missile" ? 6 : ballistic ? 4.5 : 4.8,
          kind === "missile" ? target.id : undefined,
        );
        unit.leftCooldown = stats.leftCooldown;
      }
      break;
    case "fireMissile":
      combatDrift();
      if (unit.missileCooldown <= 0 && spendEnergy(player, unit.missileEnergyCost)) {
        fireProjectile(state, player, target, stats.missileAttack, 220, "missile", "#ffb13b", 5.8, target.id);
        unit.missileCooldown = stats.missileCooldown;
      }
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

  if (toPlayer.distance > enemy.range * 0.82) {
    applyThrust(enemy, toPlayer.x, toPlayer.y, 0.42);
  } else {
    const drift = Math.sin(state.time * 1.5 + enemy.x * 0.01) > 0 ? 1 : -1;
    const pressure = toPlayer.distance < enemy.range * 0.46 ? -0.32 : 0.06;
    applyThrust(enemy, -toPlayer.y * drift * 0.38 + toPlayer.x * pressure, toPlayer.x * drift * 0.38 + toPlayer.y * pressure, 0.24);
  }

  if (toPlayer.distance <= enemy.range && enemy.cooldown <= 0) {
    const missile = enemy.rank === "boss" && Math.sin(state.time * 2) > 0.35;
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

const updatePositions = (state: CombatState, dt: number): void => {
  const actors = [...state.players.map((unit) => unit.actor), ...state.enemies];
  for (const actor of actors) {
    if (actor.hp <= 0) {
      continue;
    }
    actor.vx += actor.ax * dt;
    actor.vy += actor.ay * dt;

    const speed = Math.hypot(actor.vx, actor.vy);
    const maxSpeed = maxSpeedFor(actor);
    if (speed > maxSpeed) {
      actor.vx = (actor.vx / speed) * maxSpeed;
      actor.vy = (actor.vy / speed) * maxSpeed;
    }

    const minX = 36;
    const maxX = state.width - 36;
    const minY = 36;
    const maxY = state.height - 36;
    const nextX = actor.x + actor.vx * dt;
    const nextY = actor.y + actor.vy * dt;
    const entryPadding = isEntryBoosting(actor) ? 132 : 0;
    actor.x = clamp(nextX, minX - entryPadding, maxX + entryPadding);
    actor.y = clamp(nextY, minY - entryPadding, maxY + entryPadding);

    if (!isEntryBoosting(actor) && (actor.x === minX || actor.x === maxX)) {
      actor.vx *= -0.38;
    }
    if (!isEntryBoosting(actor) && (actor.y === minY || actor.y === maxY)) {
      actor.vy *= -0.38;
    }

    const drag = Math.exp(-dragFor(actor) * dt);
    actor.vx *= drag;
    actor.vy *= drag;
    actor.ax = 0;
    actor.ay = 0;
  }
};

const resolveActorCollisions = (state: CombatState): void => {
  const actors = [...state.players.map((unit) => unit.actor), ...state.enemies].filter((actor) => actor.hp > 0);
  const minX = 36;
  const maxX = state.width - 36;
  const minY = 36;
  const maxY = state.height - 36;

  for (let pass = 0; pass < 2; pass += 1) {
    for (let a = 0; a < actors.length; a += 1) {
      for (let b = a + 1; b < actors.length; b += 1) {
        const first = actors[a];
        const second = actors[b];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const minimum = first.radius + second.radius + 3;
        if (distance >= minimum) {
          continue;
        }

        const normalX = distance > 0.001 ? dx / distance : Math.cos(a + b);
        const normalY = distance > 0.001 ? dy / distance : Math.sin(a + b);
        const overlap = minimum - Math.max(distance, 0.001);
        const firstMass = first.radius * (first.team === "player" ? 1.15 : first.rank === "boss" ? 1.8 : 1);
        const secondMass = second.radius * (second.team === "player" ? 1.15 : second.rank === "boss" ? 1.8 : 1);
        const totalMass = firstMass + secondMass;
        const firstPush = (overlap * secondMass) / totalMass;
        const secondPush = (overlap * firstMass) / totalMass;

        first.x = clamp(first.x - normalX * firstPush, minX, maxX);
        first.y = clamp(first.y - normalY * firstPush, minY, maxY);
        second.x = clamp(second.x + normalX * secondPush, minX, maxX);
        second.y = clamp(second.y + normalY * secondPush, minY, maxY);

        const relativeVelocity = (second.vx - first.vx) * normalX + (second.vy - first.vy) * normalY;
        if (relativeVelocity < 0) {
          const impulse = relativeVelocity * -0.42;
          first.vx -= normalX * impulse * (secondMass / totalMass);
          first.vy -= normalY * impulse * (secondMass / totalMass);
          second.vx += normalX * impulse * (firstMass / totalMass);
          second.vy += normalY * impulse * (firstMass / totalMass);
        }
      }
    }
  }
};

const updateHits = (state: CombatState, dt: number): void => {
  const getTarget = (targetId: string | undefined) => {
    if (!targetId) {
      return undefined;
    }
    const player = state.players.find((unit) => unit.actor.id === targetId)?.actor;
    if (player) {
      return player;
    }
    return state.enemies.find((enemy) => enemy.id === targetId);
  };

  const moved = advanceProjectiles(state.projectiles, dt, getTarget);
  const survivors: Projectile[] = [];

  for (const projectile of moved) {
    const targets = projectile.owner === "player" ? state.enemies : livingPlayerActors(state);
    const hitTarget = targets.find(
      (target) =>
        target.hp > 0 &&
        Math.hypot(projectile.x - target.x, projectile.y - target.y) <= projectile.radius + target.radius,
    );

    if (hitTarget) {
      hitTarget.hp = Math.max(0, hitTarget.hp - damageAfterDefense(projectile.damage, hitTarget));
      state.soundEvents.push("hit");
      state.effects.push(
        createEffect({
          id: uid("effect"),
          kind: "explosion",
          x: projectile.x,
          y: projectile.y,
          life: projectile.kind === "missile" ? 0.36 : 0.18,
          maxLife: projectile.kind === "missile" ? 0.36 : 0.18,
          color: projectile.color,
          size: projectile.kind === "missile" ? 30 : 18,
        }),
      );
      continue;
    }

    if (
      projectile.x > -30 &&
      projectile.x < state.width + 30 &&
      projectile.y > -30 &&
      projectile.y < state.height + 30
    ) {
      survivors.push(projectile);
    }
  }

  state.projectiles = survivors;
};

const updateEffects = (state: CombatState, dt: number): void => {
  state.effects = state.effects
    .map((effect) => ({ ...effect, life: effect.life - dt }))
    .filter((effect) => effect.life > 0);
};

export const stepCombat = (state: CombatState, dt: number, rulesByUnit: AiRule[][]): CombatState => {
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
    unit.rightCooldown = Math.max(0, unit.rightCooldown - dt);
    unit.leftCooldown = Math.max(0, unit.leftCooldown - dt);
    unit.missileCooldown = Math.max(0, unit.missileCooldown - dt);
    unit.boostCooldown = Math.max(0, unit.boostCooldown - dt);

    const target = nearestEnemy(state, player);
    const targetDistance = target
      ? Math.hypot(target.x - player.x, target.y - player.y)
      : Number.POSITIVE_INFINITY;
    const rules = rulesByUnit[unitIndex] ?? rulesByUnit[0] ?? [];
    const decision = evaluateAiRules(rules, {
      en: player.en,
      hpPercent: player.hp / player.maxHp,
      enPercent: player.en / player.maxEn,
      nearestEnemyDistance: targetDistance,
      rightCooldown: unit.rightCooldown,
      leftCooldown: unit.leftCooldown,
      missileCooldown: unit.missileCooldown,
      rightCanPay: canPayWeapon(unit, "right"),
      leftCanPay: canPayWeapon(unit, "left"),
      enemyProjectileDistance: nearestEnemyProjectileDistance(state, player),
    });

    const bladeEngageDistance = target ? player.radius + target.radius + 284 : 0;
    const hasDefensiveDecision = decision.some(
      (item) => item.action === "retreat" || item.action === "guard" || item.action === "boostDodge",
    );
    if (
      target &&
      unit.stats.leftWeaponKind === "blade" &&
      unit.leftCooldown <= 0 &&
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
  updateHits(state, dt);
  updateEffects(state, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  refillEnemyWave(state);

  if (livingPlayerUnits(state).length === 0) {
    state.status = "defeat";
    state.soundEvents.push("defeat");
  } else if (state.enemies.length === 0 && state.enemyQueue.length === 0) {
    state.status = "victory";
  }

  return state;
};
