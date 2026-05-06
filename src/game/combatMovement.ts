import type { CombatActor, CombatState } from "./combat";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const isEntryBoosting = (actor: CombatActor): boolean =>
  actor.team === "enemy" && (actor.entryBoostTime ?? 0) > 0;

const maxSpeedFor = (actor: CombatActor): number => {
  if (actor.team === "enemy") {
    if (actor.rivalAi) {
      const legBonus =
        actor.legType === "reverse" ? 1.18 : actor.legType === "hover" ? 1.1 : actor.legType === "tank" ? 0.88 : 1;
      return actor.moveSpeed * legBonus * (isEntryBoosting(actor) ? 1.42 : 1);
    }
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
    if (actor.rivalAi) {
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
    }
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

export const updatePositions = (state: CombatState, dt: number): void => {
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

export const resolveActorCollisions = (state: CombatState): void => {
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
