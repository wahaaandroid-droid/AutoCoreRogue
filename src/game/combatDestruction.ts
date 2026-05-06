import { createEffect } from "./projectiles";
import type { CombatActor, CombatState } from "./combat";

const triggerEnemyDestruction = (
  state: CombatState,
  enemy: CombatActor,
  createId: (prefix: string) => string,
): void => {
  if (enemy.deathEffectPlayed) {
    return;
  }

  enemy.deathEffectPlayed = true;
  enemy.deathTimer = enemy.rank === "boss" ? 0.68 : enemy.rank === "elite" ? 0.52 : 0.38;
  enemy.vx *= 0.12;
  enemy.vy *= 0.12;
  enemy.ax = 0;
  enemy.ay = 0;
  state.defeatedEnemyCount += 1;
  state.soundEvents.push("explosion");
  state.effects.push(
    createEffect({
      id: createId("effect"),
      kind: "explosion",
      x: enemy.x,
      y: enemy.y,
      life: enemy.rank === "boss" ? 0.62 : enemy.rank === "elite" ? 0.5 : 0.42,
      maxLife: enemy.rank === "boss" ? 0.62 : enemy.rank === "elite" ? 0.5 : 0.42,
      color: enemy.color,
      size: enemy.radius * (enemy.rank === "boss" ? 5.2 : enemy.rank === "elite" ? 4.4 : 3.5),
    }),
  );

  if (enemy.rank !== "normal") {
    const offset = enemy.radius * 0.62;
    state.effects.push(
      createEffect({
        id: createId("effect"),
        kind: "explosion",
        x: enemy.x - offset,
        y: enemy.y + offset * 0.45,
        life: 0.38,
        maxLife: 0.38,
        color: enemy.color,
        size: enemy.radius * 2.8,
      }),
      createEffect({
        id: createId("effect"),
        kind: "explosion",
        x: enemy.x + offset * 0.72,
        y: enemy.y - offset * 0.5,
        life: 0.34,
        maxLife: 0.34,
        color: enemy.color,
        size: enemy.radius * 2.45,
      }),
    );
  }
};

export const updateEnemyDestructions = (
  state: CombatState,
  dt: number,
  createId: (prefix: string) => string,
): void => {
  for (const enemy of state.enemies) {
    if (enemy.hp > 0) {
      continue;
    }

    triggerEnemyDestruction(state, enemy, createId);
    enemy.deathTimer = Math.max(0, (enemy.deathTimer ?? 0) - dt);
  }
};
