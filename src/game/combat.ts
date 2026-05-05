import { evaluateAiRules } from "./aiController";
import {
  advanceProjectiles,
  createEffect,
  createProjectile,
  Effect,
  Projectile,
} from "./projectiles";
import { AiActionId, AiRule, DerivedStats, LegType } from "../types";

export interface CombatActor {
  id: string;
  name: string;
  team: "player" | "enemy";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  en: number;
  maxEn: number;
  enRegen: number;
  defense: number;
  moveSpeed: number;
  range: number;
  attack: number;
  cooldown: number;
  cooldownMax: number;
  guard: boolean;
  legType?: LegType;
  color: string;
  rank: "normal" | "elite" | "boss";
}

export interface CombatState {
  width: number;
  height: number;
  time: number;
  stage: number;
  player: CombatActor;
  enemies: CombatActor[];
  projectiles: Projectile[];
  effects: Effect[];
  activeAction: AiActionId;
  activeRuleId?: string;
  rightCooldown: number;
  leftCooldown: number;
  missileCooldown: number;
  status: "running" | "victory" | "defeat";
}

const ARENA_WIDTH = 980;
const ARENA_HEIGHT = 570;
let nextId = 1;

const uid = (prefix: string): string => `${prefix}-${nextId++}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalize = (dx: number, dy: number): { x: number; y: number; distance: number } => {
  const distance = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / distance, y: dy / distance, distance };
};

const damageAfterDefense = (raw: number, target: CombatActor): number => {
  const mitigation = Math.min(0.68, target.defense / (target.defense + 380));
  const guard = target.guard ? 0.72 : 1;
  return Math.max(2, raw * (1 - mitigation) * guard);
};

const createPlayer = (stats: DerivedStats): CombatActor => ({
  id: "player",
  name: "AutoCore",
  team: "player",
  x: ARENA_WIDTH * 0.5,
  y: ARENA_HEIGHT * 0.55,
  vx: 0,
  vy: 0,
  radius: stats.legType === "tank" ? 20 : 17,
  hp: stats.hpMax,
  maxHp: stats.hpMax,
  en: stats.enMax,
  maxEn: stats.enMax,
  enRegen: stats.enRegen,
  defense: stats.defense,
  moveSpeed: stats.moveSpeed,
  range: Math.max(stats.rightRange, stats.leftRange),
  attack: Math.max(stats.rightAttack, stats.leftAttack),
  cooldown: 0,
  cooldownMax: 1,
  guard: false,
  legType: stats.legType,
  color: "#8ad8ff",
  rank: "normal",
});

const createEnemy = (stage: number, index: number, rank: CombatActor["rank"]): CombatActor => {
  const angle = -Math.PI * 0.85 + index * 0.55;
  const distance = rank === "boss" ? 235 : 215 + index * 16;
  const hpScale = rank === "boss" ? 3.1 : rank === "elite" ? 1.85 : 1;
  const attackScale = rank === "boss" ? 1.65 : rank === "elite" ? 1.28 : 1;
  const baseHp = 128 + stage * 34;
  const baseAttack = 20 + stage * 4.5;

  return {
    id: uid("enemy"),
    name: rank === "boss" ? "Signal Tyrant" : rank === "elite" ? "Gatebreaker" : "Drone Frame",
    team: "enemy",
    x: ARENA_WIDTH * 0.5 + Math.cos(angle) * distance,
    y: ARENA_HEIGHT * 0.45 + Math.sin(angle) * distance * 0.7,
    vx: 0,
    vy: 0,
    radius: rank === "boss" ? 27 : rank === "elite" ? 22 : 16,
    hp: baseHp * hpScale,
    maxHp: baseHp * hpScale,
    en: 0,
    maxEn: 0,
    enRegen: 0,
    defense: rank === "boss" ? 78 + stage * 6 : rank === "elite" ? 56 + stage * 5 : 30 + stage * 4,
    moveSpeed: rank === "boss" ? 48 : rank === "elite" ? 66 : 76 + stage * 1.5,
    range: rank === "boss" ? 380 : rank === "elite" ? 330 : 275,
    attack: baseAttack * attackScale,
    cooldown: 0.4 + index * 0.35,
    cooldownMax: rank === "boss" ? 0.82 : rank === "elite" ? 1.0 : 1.18,
    guard: false,
    color: rank === "boss" ? "#ff6a42" : rank === "elite" ? "#d889ff" : "#f1b15b",
    rank,
  };
};

const createEnemies = (stage: number): CombatActor[] => {
  if (stage === 7) {
    return [createEnemy(stage, 0, "boss"), createEnemy(stage, 1, "normal"), createEnemy(stage, 2, "normal")];
  }
  if (stage === 5) {
    return [createEnemy(stage, 0, "elite"), createEnemy(stage, 1, "normal")];
  }

  const count = Math.min(4, 1 + Math.ceil(stage / 2));
  return Array.from({ length: count }, (_, index) => createEnemy(stage, index, "normal"));
};

export const createCombatState = (stage: number, stats: DerivedStats): CombatState => ({
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  time: 0,
  stage,
  player: createPlayer(stats),
  enemies: createEnemies(stage),
  projectiles: [],
  effects: [],
  activeAction: "idle",
  rightCooldown: 0.2,
  leftCooldown: 0.35,
  missileCooldown: 1.5,
  status: "running",
});

const nearestEnemy = (state: CombatState): CombatActor | undefined => {
  let best: CombatActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }
    const distance = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
};

const nearestEnemyProjectileDistance = (state: CombatState): number => {
  let best = Number.POSITIVE_INFINITY;
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "enemy") {
      continue;
    }
    best = Math.min(best, Math.hypot(projectile.x - state.player.x, projectile.y - state.player.y));
  }
  return best;
};

const pushMoveEffect = (state: CombatState, x: number, y: number, color: string, size = 13): void => {
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "boost",
      x,
      y,
      life: 0.22,
      maxLife: 0.22,
      color,
      size,
    }),
  );
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
};

const spendEnergy = (actor: CombatActor, amount: number): boolean => {
  if (actor.en < amount) {
    return false;
  }
  actor.en -= amount;
  return true;
};

const applyPlayerAction = (
  state: CombatState,
  stats: DerivedStats,
  action: AiActionId,
  target: CombatActor | undefined,
): void => {
  const player = state.player;
  player.vx = 0;
  player.vy = 0;
  player.guard = false;

  if (!target) {
    return;
  }

  const toTarget = normalize(target.x - player.x, target.y - player.y);
  const strafeDirection = Math.sin(state.time * 2.7) > 0 ? 1 : -1;
  const perpendicular = { x: -toTarget.y * strafeDirection, y: toTarget.x * strafeDirection };

  switch (action) {
    case "approach":
      player.vx = toTarget.x * player.moveSpeed;
      player.vy = toTarget.y * player.moveSpeed;
      break;
    case "retreat":
      player.vx = -toTarget.x * player.moveSpeed * 0.88;
      player.vy = -toTarget.y * player.moveSpeed * 0.88;
      break;
    case "strafe":
      player.vx = perpendicular.x * player.moveSpeed * 0.86;
      player.vy = perpendicular.y * player.moveSpeed * 0.86;
      break;
    case "boostDodge": {
      const cost = player.legType === "reverse" ? 24 : player.legType === "tank" ? 44 : 32;
      if (spendEnergy(player, cost)) {
        player.vx = perpendicular.x * player.moveSpeed * 2.35;
        player.vy = perpendicular.y * player.moveSpeed * 2.35;
        pushMoveEffect(state, player.x - perpendicular.x * 18, player.y - perpendicular.y * 18, "#21e0ff", 22);
      }
      break;
    }
    case "shootRight":
      if (state.rightCooldown <= 0 && spendEnergy(player, 16)) {
        fireProjectile(state, player, target, stats.rightAttack, 585, "bullet", "#63cfff", 4.2);
        state.rightCooldown = stats.rightCooldown;
      }
      break;
    case "shootLeft":
      if (state.leftCooldown <= 0 && spendEnergy(player, 18)) {
        const kind = stats.leftCooldown > 1.2 ? "missile" : "pulse";
        fireProjectile(
          state,
          player,
          target,
          stats.leftAttack,
          kind === "missile" ? 245 : 465,
          kind,
          kind === "missile" ? "#ff9c35" : "#54f4a7",
          kind === "missile" ? 6 : 4.8,
          kind === "missile" ? target.id : undefined,
        );
        state.leftCooldown = stats.leftCooldown;
      }
      break;
    case "fireMissile":
      if (state.missileCooldown <= 0 && spendEnergy(player, 26)) {
        fireProjectile(state, player, target, stats.missileAttack, 220, "missile", "#ffb13b", 5.8, target.id);
        state.missileCooldown = stats.missileCooldown;
      }
      break;
    case "guard":
      player.guard = true;
      player.vx = -toTarget.x * player.moveSpeed * 0.18;
      player.vy = -toTarget.y * player.moveSpeed * 0.18;
      break;
    case "idle":
      break;
  }
};

const updateEnemy = (state: CombatState, enemy: CombatActor, dt: number): void => {
  const player = state.player;
  const toPlayer = normalize(player.x - enemy.x, player.y - enemy.y);
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);

  if (toPlayer.distance > enemy.range * 0.82) {
    enemy.vx = toPlayer.x * enemy.moveSpeed;
    enemy.vy = toPlayer.y * enemy.moveSpeed;
  } else {
    const drift = Math.sin(state.time * 1.5 + enemy.x * 0.01) > 0 ? 1 : -1;
    enemy.vx = -toPlayer.y * enemy.moveSpeed * 0.34 * drift;
    enemy.vy = toPlayer.x * enemy.moveSpeed * 0.34 * drift;
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
  const actors = [state.player, ...state.enemies];
  for (const actor of actors) {
    if (actor.hp <= 0) {
      continue;
    }
    actor.x = clamp(actor.x + actor.vx * dt, 36, state.width - 36);
    actor.y = clamp(actor.y + actor.vy * dt, 36, state.height - 36);
  }
};

const updateHits = (state: CombatState, dt: number): void => {
  const getTarget = (targetId: string | undefined) => {
    if (!targetId) {
      return undefined;
    }
    if (targetId === state.player.id) {
      return state.player;
    }
    return state.enemies.find((enemy) => enemy.id === targetId);
  };

  const moved = advanceProjectiles(state.projectiles, dt, getTarget);
  const survivors: Projectile[] = [];

  for (const projectile of moved) {
    const targets = projectile.owner === "player" ? state.enemies : [state.player];
    const hitTarget = targets.find(
      (target) =>
        target.hp > 0 &&
        Math.hypot(projectile.x - target.x, projectile.y - target.y) <= projectile.radius + target.radius,
    );

    if (hitTarget) {
      hitTarget.hp = Math.max(0, hitTarget.hp - damageAfterDefense(projectile.damage, hitTarget));
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

export const stepCombat = (state: CombatState, dt: number, stats: DerivedStats, rules: AiRule[]): CombatState => {
  if (state.status !== "running") {
    return state;
  }

  state.time += dt;
  state.player.en = Math.min(state.player.maxEn, state.player.en + state.player.enRegen * dt);
  state.rightCooldown = Math.max(0, state.rightCooldown - dt);
  state.leftCooldown = Math.max(0, state.leftCooldown - dt);
  state.missileCooldown = Math.max(0, state.missileCooldown - dt);

  const target = nearestEnemy(state);
  const targetDistance = target
    ? Math.hypot(target.x - state.player.x, target.y - state.player.y)
    : Number.POSITIVE_INFINITY;
  const decision = evaluateAiRules(rules, {
    hpPercent: state.player.hp / state.player.maxHp,
    enPercent: state.player.en / state.player.maxEn,
    nearestEnemyDistance: targetDistance,
    rightCooldown: state.rightCooldown,
    leftCooldown: state.leftCooldown,
    missileCooldown: state.missileCooldown,
    enemyProjectileDistance: nearestEnemyProjectileDistance(state),
  });

  state.activeAction = decision.action;
  state.activeRuleId = decision.ruleId;
  applyPlayerAction(state, stats, decision.action, target);

  for (const enemy of state.enemies) {
    if (enemy.hp > 0) {
      updateEnemy(state, enemy, dt);
    }
  }

  updatePositions(state, dt);
  updateHits(state, dt);
  updateEffects(state, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);

  if (state.player.hp <= 0) {
    state.status = "defeat";
  } else if (state.enemies.length === 0) {
    state.status = "victory";
  }

  return state;
};
