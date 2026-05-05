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
  guard: boolean;
  legType?: LegType;
  color: string;
  rank: "normal" | "elite" | "boss";
}

export type CombatSoundEvent = "shoot" | "missile" | "boost" | "blade" | "hit" | "defeat";

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
  rightResource: WeaponResource;
  leftResource: WeaponResource;
  rightAmmo: number;
  rightAmmoMax: number;
  leftAmmo: number;
  leftAmmoMax: number;
  rightEnergyCost: number;
  leftEnergyCost: number;
  missileEnergyCost: number;
  soundEvents: CombatSoundEvent[];
  status: "running" | "victory" | "defeat";
}

const ARENA_WIDTH = 980;
const ARENA_HEIGHT = 570;
const ENEMY_HP_MULTIPLIER = 9;
const PLAYER_DAMAGE_MULTIPLIER = 0.48;
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
  const teamScale = target.team === "enemy" ? PLAYER_DAMAGE_MULTIPLIER : 1;
  return Math.max(2, raw * teamScale * (1 - mitigation) * guard);
};

const applyThrust = (actor: CombatActor, x: number, y: number, strength = 1): void => {
  actor.ax += x * actor.moveSpeed * 4.85 * strength;
  actor.ay += y * actor.moveSpeed * 4.85 * strength;
};

const maxSpeedFor = (actor: CombatActor): number => {
  if (actor.team === "enemy") {
    return actor.moveSpeed * (actor.rank === "boss" ? 0.82 : 0.96);
  }

  const legBonus =
    actor.legType === "reverse" ? 1.18 : actor.legType === "hover" ? 1.1 : actor.legType === "tank" ? 0.88 : 1;
  return actor.moveSpeed * legBonus;
};

const dragFor = (actor: CombatActor): number => {
  if (actor.team === "enemy") {
    return actor.rank === "boss" ? 2.2 : 2.6;
  }

  switch (actor.legType) {
    case "hover":
      return 1.15;
    case "tank":
      return 1.8;
    case "reverse":
      return 2.65;
    case "quad":
      return 2.25;
    default:
      return 2.4;
  }
};

const createPlayer = (stats: DerivedStats): CombatActor => ({
  id: "player",
  name: "AutoCore",
  team: "player",
  x: ARENA_WIDTH * 0.5,
  y: ARENA_HEIGHT * 0.55,
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
  guard: false,
  legType: stats.legType,
  color: "#8ad8ff",
  rank: "normal",
});

const createEnemy = (stage: number, index: number, rank: CombatActor["rank"]): CombatActor => {
  const angle = -Math.PI * 0.85 + index * 0.55;
  const distance = rank === "boss" ? 235 : 215 + index * 16;
  const hpScale = (rank === "boss" ? 3.1 : rank === "elite" ? 1.85 : 1) * ENEMY_HP_MULTIPLIER;
  const attackScale = rank === "boss" ? 1.65 : rank === "elite" ? 1.28 : 1;
  const baseHp = 128 + stage * 34;
  const baseAttack = 10 + stage * 2.2;

  return {
    id: uid("enemy"),
    name: rank === "boss" ? "Signal Tyrant" : rank === "elite" ? "Gatebreaker" : "Drone Frame",
    team: "enemy",
    x: ARENA_WIDTH * 0.5 + Math.cos(angle) * distance,
    y: ARENA_HEIGHT * 0.45 + Math.sin(angle) * distance * 0.7,
    ax: 0,
    ay: 0,
    vx: 0,
    vy: 0,
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
  rightResource: stats.rightResource,
  leftResource: stats.leftResource,
  rightAmmo: stats.rightAmmoMax,
  rightAmmoMax: stats.rightAmmoMax,
  leftAmmo: stats.leftAmmoMax,
  leftAmmoMax: stats.leftAmmoMax,
  rightEnergyCost: stats.rightEnergyCost,
  leftEnergyCost: stats.leftEnergyCost,
  missileEnergyCost: stats.missileEnergyCost,
  soundEvents: [],
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
  const backX = actor.x - direction.x * (actor.radius + 16);
  const backY = actor.y - direction.y * (actor.radius + 16);

  pushMoveEffect(state, backX, backY, color, 34, 0.34, angle);
  pushMoveEffect(state, backX - direction.x * 15 + side.x * 9, backY - direction.y * 15 + side.y * 9, "#8af6ff", 18, 0.26, angle);
  pushMoveEffect(state, backX - direction.x * 18 - side.x * 9, backY - direction.y * 18 - side.y * 9, "#ffb35a", 15, 0.22, angle);
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
  state: CombatState,
  side: "right" | "left",
): boolean => {
  if (side === "right") {
    return state.rightResource === "ballistic"
      ? state.rightAmmo > 0
      : state.player.en >= state.rightEnergyCost;
  }

  return state.leftResource === "ballistic"
    ? state.leftAmmo > 0
    : state.player.en >= state.leftEnergyCost;
};

const consumeWeapon = (
  state: CombatState,
  side: "right" | "left",
): boolean => {
  if (side === "right") {
    if (state.rightResource === "ballistic") {
      if (state.rightAmmo <= 0) {
        return false;
      }
      state.rightAmmo -= 1;
      return true;
    }
    return spendEnergy(state.player, state.rightEnergyCost);
  }

  if (state.leftResource === "ballistic") {
    if (state.leftAmmo <= 0) {
      return false;
    }
    state.leftAmmo -= 1;
    return true;
  }
  return spendEnergy(state.player, state.leftEnergyCost);
};

const applyPlayerAction = (
  state: CombatState,
  stats: DerivedStats,
  action: AiActionId,
  target: CombatActor | undefined,
): void => {
  const player = state.player;
  player.ax = 0;
  player.ay = 0;
  player.guard = false;

  if (!target) {
    return;
  }

  const toTarget = normalize(target.x - player.x, target.y - player.y);
  const strafeDirection = Math.sin(state.time * 2.7) > 0 ? 1 : -1;
  const perpendicular = { x: -toTarget.y * strafeDirection, y: toTarget.x * strafeDirection };
  const rangeBias = toTarget.distance > 285 ? 0.44 : toTarget.distance < 118 ? -0.62 : 0.05;
  const combatDrift = () => {
    applyThrust(player, perpendicular.x + toTarget.x * rangeBias, perpendicular.y + toTarget.y * rangeBias, 0.78);
  };

  switch (action) {
    case "approach":
      applyThrust(player, toTarget.x, toTarget.y, 1.1);
      break;
    case "retreat":
      applyThrust(player, -toTarget.x, -toTarget.y, 1.0);
      break;
    case "strafe":
      applyThrust(player, perpendicular.x + toTarget.x * rangeBias, perpendicular.y + toTarget.y * rangeBias, 1.0);
      break;
    case "boostDodge": {
      const cost = player.legType === "reverse" ? 12 : player.legType === "tank" ? 22 : 16;
      if (spendEnergy(player, cost)) {
        player.vx += perpendicular.x * player.moveSpeed * 2.08;
        player.vy += perpendicular.y * player.moveSpeed * 2.08;
        applyThrust(player, perpendicular.x, perpendicular.y, 1.28);
        pushBoostBurst(state, player, perpendicular);
        state.soundEvents.push("boost");
      }
      break;
    }
    case "shootRight":
      combatDrift();
      if (state.rightCooldown <= 0 && consumeWeapon(state, "right")) {
        const ballistic = state.rightResource === "ballistic";
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
        state.rightCooldown = stats.rightCooldown;
      }
      break;
    case "shootLeft":
      if (stats.leftWeaponKind === "blade") {
        const bladeReach = player.radius + target.radius + 118;
        if (toTarget.distance > bladeReach) {
          applyThrust(player, toTarget.x, toTarget.y, 1.72);
          break;
        }

        applyThrust(player, toTarget.x, toTarget.y, 0.85);
        if (state.leftCooldown <= 0 && consumeWeapon(state, "left")) {
          player.vx += toTarget.x * player.moveSpeed * 0.88;
          player.vy += toTarget.y * player.moveSpeed * 0.88;
          performBladeAttack(state, player, target, stats.leftAttack * 1.55, bladeReach);
          state.leftCooldown = stats.leftCooldown;
        }
        break;
      }

      combatDrift();
      if (state.leftCooldown <= 0 && consumeWeapon(state, "left")) {
        const ballistic = state.leftResource === "ballistic";
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
        state.leftCooldown = stats.leftCooldown;
      }
      break;
    case "fireMissile":
      combatDrift();
      if (state.missileCooldown <= 0 && spendEnergy(player, state.missileEnergyCost)) {
        fireProjectile(state, player, target, stats.missileAttack, 220, "missile", "#ffb13b", 5.8, target.id);
        state.missileCooldown = stats.missileCooldown;
      }
      break;
    case "guard":
      player.guard = true;
      applyThrust(player, -toTarget.x, -toTarget.y, 0.3);
      break;
    case "idle":
      combatDrift();
      break;
  }
};

const updateEnemy = (state: CombatState, enemy: CombatActor, dt: number): void => {
  const player = state.player;
  const toPlayer = normalize(player.x - enemy.x, player.y - enemy.y);
  enemy.ax = 0;
  enemy.ay = 0;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);

  if (toPlayer.distance > enemy.range * 0.82) {
    applyThrust(enemy, toPlayer.x, toPlayer.y, 0.8);
  } else {
    const drift = Math.sin(state.time * 1.5 + enemy.x * 0.01) > 0 ? 1 : -1;
    const pressure = toPlayer.distance < enemy.range * 0.46 ? -0.45 : 0.08;
    applyThrust(enemy, -toPlayer.y * drift + toPlayer.x * pressure, toPlayer.x * drift + toPlayer.y * pressure, 0.46);
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
    actor.x = clamp(nextX, minX, maxX);
    actor.y = clamp(nextY, minY, maxY);

    if (actor.x === minX || actor.x === maxX) {
      actor.vx *= -0.38;
    }
    if (actor.y === minY || actor.y === maxY) {
      actor.vy *= -0.38;
    }

    const drag = Math.exp(-dragFor(actor) * dt);
    actor.vx *= drag;
    actor.vy *= drag;
    actor.ax = 0;
    actor.ay = 0;
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

export const stepCombat = (state: CombatState, dt: number, stats: DerivedStats, rules: AiRule[]): CombatState => {
  if (state.status !== "running") {
    return state;
  }

  state.soundEvents = [];
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
    en: state.player.en,
    hpPercent: state.player.hp / state.player.maxHp,
    enPercent: state.player.en / state.player.maxEn,
    nearestEnemyDistance: targetDistance,
    rightCooldown: state.rightCooldown,
    leftCooldown: state.leftCooldown,
    missileCooldown: state.missileCooldown,
    rightCanPay: canPayWeapon(state, "right"),
    leftCanPay: canPayWeapon(state, "left"),
    enemyProjectileDistance: nearestEnemyProjectileDistance(state),
  });

  const bladeEngageDistance = target ? state.player.radius + target.radius + 284 : 0;
  if (
    target &&
    stats.leftWeaponKind === "blade" &&
    state.leftCooldown <= 0 &&
    targetDistance <= bladeEngageDistance &&
    decision.action !== "retreat" &&
    decision.action !== "guard" &&
    decision.action !== "boostDodge"
  ) {
    decision.action = "shootLeft";
    decision.ruleId = "blade-priority";
    decision.condition = "leftReady";
  }

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
    state.soundEvents.push("defeat");
  } else if (state.enemies.length === 0) {
    state.status = "victory";
  }

  return state;
};
