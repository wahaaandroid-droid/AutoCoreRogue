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

  for (const projectile of moved) {
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
        projectile.kind === "missile" || projectile.kind === "rocket" || projectile.kind === "grenade"
          ? "hitExplosive"
          : "hit",
      );
      state.effects.push(
        createEffect({
          id: createId("effect"),
          kind: "explosion",
          x: projectile.x,
          y: projectile.y,
          life: projectile.kind === "missile" || projectile.kind === "rocket" || projectile.kind === "grenade" ? 0.36 : 0.18,
          maxLife: projectile.kind === "missile" || projectile.kind === "rocket" || projectile.kind === "grenade" ? 0.36 : 0.18,
          color: projectile.color,
          size: blastRadius > 0 ? Math.max(30, blastRadius * 0.72) : projectile.kind === "missile" ? 30 : 18,
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
