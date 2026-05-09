export type ProjectileOwner = "player" | "enemy";

export type ProjectileKind = "bullet" | "pulse" | "missile" | "rocket" | "grenade";

export interface Projectile {
  id: string;
  owner: ProjectileOwner;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  blastRadius?: number;
  life: number;
  color: string;
  targetId?: string;
  sourceUnitIndex?: number;
  interceptable?: boolean;
  interceptHp?: number;
  interceptDamage?: number;
}

export interface Effect {
  id: string;
  kind: "explosion" | "boost" | "muzzle" | "slash" | "alert";
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  rotation?: number;
  label?: string;
}

export interface HomingTarget {
  id: string;
  x: number;
  y: number;
  hp: number;
}

export const createProjectile = (projectile: Projectile): Projectile => projectile;

export const createEffect = (effect: Effect): Effect => effect;

const MISSILE_MIN_SPEED = 160;
const MISSILE_MAX_TURN_RATE = 2.6;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const shortestAngleDelta = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

export const advanceProjectiles = (
  projectiles: Projectile[],
  dt: number,
  getTarget: (targetId: string | undefined) => HomingTarget | undefined,
): Projectile[] =>
  projectiles
    .map((projectile) => {
      let { vx, vy } = projectile;

      if (projectile.kind === "missile") {
        const target = getTarget(projectile.targetId);
        if (target && target.hp > 0) {
          const dx = target.x - projectile.x;
          const dy = target.y - projectile.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const speed = Math.max(MISSILE_MIN_SPEED, Math.hypot(projectile.vx, projectile.vy));
          const currentAngle = Math.atan2(projectile.vy, projectile.vx);
          const desiredAngle = Math.atan2(dy / distance, dx / distance);
          const maxTurn = MISSILE_MAX_TURN_RATE * dt;
          const nextAngle = currentAngle + clamp(shortestAngleDelta(currentAngle, desiredAngle), -maxTurn, maxTurn);
          vx = Math.cos(nextAngle) * speed;
          vy = Math.sin(nextAngle) * speed;
        }
      }

      return {
        ...projectile,
        vx,
        vy,
        x: projectile.x + vx * dt,
        y: projectile.y + vy * dt,
        life: projectile.life - dt,
      };
    })
    .filter((projectile) => projectile.life > 0);
