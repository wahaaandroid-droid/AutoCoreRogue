import {
  advanceProjectiles,
  createEffect,
  Projectile,
} from "./projectiles";
import type { CombatActor, CombatState } from "./combat";

const PLAYER_DAMAGE_MULTIPLIER = 0.48;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const damageAfterDefense = (raw: number, target: CombatActor): number => {
  const mitigation = Math.min(0.68, target.defense / (target.defense + 380));
  const guard = target.guard ? 0.72 : 1;
  const teamScale = target.team === "enemy" ? PLAYER_DAMAGE_MULTIPLIER : 1;
  return Math.max(2, raw * teamScale * (1 - mitigation) * guard);
};

const livingPlayerActors = (state: CombatState): CombatActor[] =>
  state.players.filter((unit) => unit.actor.hp > 0).map((unit) => unit.actor);

const livingCombatActors = (state: CombatState): CombatActor[] => [
  ...livingPlayerActors(state),
  ...state.enemies.filter((enemy) => enemy.hp > 0),
];

const isExplosiveProjectile = (projectile: Projectile): boolean =>
  projectile.kind === "missile" || projectile.kind === "rocket" || projectile.kind === "grenade";

const applyBlastDamage = (
  state: CombatState,
  projectile: Projectile,
  x: number,
  y: number,
  blastRadius: number,
  damageScale: number,
): void => {
  for (const target of livingCombatActors(state)) {
    const distance = Math.hypot(x - target.x, y - target.y);
    if (distance > blastRadius + target.radius) {
      continue;
    }

    const falloff = clamp(1 - distance / Math.max(1, blastRadius), 0.22, 1);
    const damage = damageAfterDefense(projectile.damage * damageScale * falloff, target);
    target.hp = Math.max(0, target.hp - damage);
    if (projectile.owner === "player" && target.team === "enemy" && projectile.sourceUnitIndex !== undefined) {
      state.report.damageByUnit[projectile.sourceUnitIndex] =
        (state.report.damageByUnit[projectile.sourceUnitIndex] ?? 0) + damage;
    }
  }
};

export const updateHits = (
  state: CombatState,
  dt: number,
  createId: (prefix: string) => string,
): void => {
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
  const destroyed = new Set<string>();

  const triggerInterceptExplosion = (projectile: Projectile): void => {
    const blastRadius = Math.max(42, (projectile.blastRadius ?? 0) * 0.78);
    destroyed.add(projectile.id);
    applyBlastDamage(state, projectile, projectile.x, projectile.y, blastRadius, 0.42);
    state.soundEvents.push("intercept");
    state.effects.push(
      createEffect({
        id: createId("effect"),
        kind: "explosion",
        x: projectile.x,
        y: projectile.y,
        life: 0.28,
        maxLife: 0.28,
        color: "#ffd56a",
        size: Math.max(38, blastRadius * 0.9),
      }),
    );
  };

  for (let outer = 0; outer < moved.length; outer += 1) {
    const first = moved[outer];
    if (destroyed.has(first.id)) {
      continue;
    }

    for (let inner = outer + 1; inner < moved.length; inner += 1) {
      const second = moved[inner];
      if (destroyed.has(second.id) || first.owner === second.owner) {
        continue;
      }

      const missile = first.kind === "missile" && first.interceptable
        ? first
        : second.kind === "missile" && second.interceptable
          ? second
          : undefined;
      if (!missile) {
        continue;
      }

      const hitter = missile.id === first.id ? second : first;
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (distance > first.radius + second.radius + 8) {
        continue;
      }

      destroyed.add(hitter.id);
      missile.interceptHp = (missile.interceptHp ?? 1) - (hitter.interceptDamage ?? hitter.damage * 0.5);
      if ((missile.interceptHp ?? 0) <= 0) {
        triggerInterceptExplosion(missile);
        break;
      }
    }
  }

  for (const projectile of moved) {
    if (destroyed.has(projectile.id)) {
      continue;
    }

    const targets = projectile.owner === "player" ? state.enemies : livingPlayerActors(state);
    const hitTarget = targets.find(
      (target) =>
        target.hp > 0 &&
        Math.hypot(projectile.x - target.x, projectile.y - target.y) <= projectile.radius + target.radius,
    );

    if (hitTarget) {
      const blastRadius = projectile.blastRadius ?? 0;
      const impactedTargets = blastRadius > 0
        ? targets.filter(
            (target) =>
              target.hp > 0 &&
              Math.hypot(projectile.x - target.x, projectile.y - target.y) <= blastRadius + target.radius,
          )
        : [hitTarget];

      for (const target of impactedTargets) {
        const distance = Math.hypot(projectile.x - target.x, projectile.y - target.y);
        const falloff = blastRadius > 0
          ? clamp(1 - distance / Math.max(1, blastRadius), 0.34, 1)
          : 1;
        const damage = damageAfterDefense(projectile.damage * falloff, target);
        target.hp = Math.max(0, target.hp - damage);
        if (projectile.owner === "player" && projectile.sourceUnitIndex !== undefined) {
          state.report.damageByUnit[projectile.sourceUnitIndex] =
            (state.report.damageByUnit[projectile.sourceUnitIndex] ?? 0) + damage;
        }
      }
      state.soundEvents.push(
        isExplosiveProjectile(projectile)
          ? "hitExplosive"
          : "hit",
      );
      state.effects.push(
        createEffect({
          id: createId("effect"),
          kind: "explosion",
          x: projectile.x,
          y: projectile.y,
          life: isExplosiveProjectile(projectile) ? 0.36 : 0.18,
          maxLife: isExplosiveProjectile(projectile) ? 0.36 : 0.18,
          color: projectile.color,
          size: blastRadius > 0
            ? Math.max(30, blastRadius * (projectile.kind === "grenade" ? 0.95 : 0.78))
            : projectile.kind === "missile" ? 30 : 18,
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
