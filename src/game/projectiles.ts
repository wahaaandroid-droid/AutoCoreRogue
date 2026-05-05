export type ProjectileOwner = "player" | "enemy";

export type ProjectileKind = "bullet" | "pulse" | "missile";

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
  life: number;
  color: string;
  targetId?: string;
  sourceUnitIndex?: number;
}

export interface Effect {
  id: string;
  kind: "explosion" | "boost" | "muzzle" | "slash";
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  rotation?: number;
}

export interface HomingTarget {
  id: string;
  x: number;
  y: number;
  hp: number;
}

export const createProjectile = (projectile: Projectile): Projectile => projectile;

export const createEffect = (effect: Effect): Effect => effect;

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
          const desiredSpeed = Math.max(160, Math.hypot(projectile.vx, projectile.vy));
          vx = vx * 0.9 + (dx / distance) * desiredSpeed * 0.1;
          vy = vy * 0.9 + (dy / distance) * desiredSpeed * 0.1;
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
