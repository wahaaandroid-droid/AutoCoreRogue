import { useEffect, useMemo, useRef, useState } from "react";
import { getActionLabel, getConditionLabel } from "../data/aiRules";
import { getWeaponKindLabel } from "../data/parts";
import { getStagePlan } from "../data/stages";
import {
  CombatActor,
  CombatReport,
  CombatState,
  PlayerCombatUnit,
  PlayerWeaponState,
  createCombatState,
  stepCombat,
} from "../game/combat";
import { isEntryBoosting } from "../game/combatMovement";
import { Effect, Projectile } from "../game/projectiles";
import { playCombatSoundEvents } from "../game/sound";
import { AiRule, DerivedStats, LegType, TargetPriorityId, WeaponAutoUse } from "../types";
import arenaFloorUrl from "../assets/arena-floor.png";
import bladeSlashEffectUrl from "../assets/blade-slash-effect.png";
import boostBurstUrl from "../assets/boost-burst.png";
import combatSpritesUrl from "../assets/combat-sprites.png";
import explosionBurstUrl from "../assets/explosion-burst.png";
import guardShieldEffectUrl from "../assets/guard-shield-effect.png";
import movementBoostTrailUrl from "../assets/movement-boost-trail.png";
import playerDirectionSpritesUrl from "../assets/player-direction-sprites.png";
import enemyDirectionSpritesUrl from "../assets/enemy-direction-sprites.png";
import projectileSpritesUrl from "../assets/projectile-sprites.png";

interface CombatScreenProps {
  stage: number;
  statsByUnit: DerivedStats[];
  unitHpByUnit: number[];
  sortieEnabled: boolean[];
  unlockedUnitCount: number;
  rulesByUnit: AiRule[][];
  targetPrioritiesByUnit: TargetPriorityId[];
  weaponAutoUseByUnit: WeaponAutoUse[];
  activeUnitIndex: number;
  onSelectUnit: (index: number) => void;
  onVictory: (unitHpByUnit: number[], report: CombatReport) => void;
  onDefeat: () => void;
  onOpenAssemble: () => void;
  onOpenAi: () => void;
}

const hpPercent = (actor: CombatActor): number => actor.hp / actor.maxHp;

const cooldownPercent = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, value / max));
};

const arenaFloorImage = new Image();
arenaFloorImage.src = arenaFloorUrl;
const bladeSlashEffectImage = new Image();
bladeSlashEffectImage.src = bladeSlashEffectUrl;
const boostBurstImage = new Image();
boostBurstImage.src = boostBurstUrl;
const combatSpritesImage = new Image();
combatSpritesImage.src = combatSpritesUrl;
const explosionBurstImage = new Image();
explosionBurstImage.src = explosionBurstUrl;
const guardShieldEffectImage = new Image();
guardShieldEffectImage.src = guardShieldEffectUrl;
const movementBoostTrailImage = new Image();
movementBoostTrailImage.src = movementBoostTrailUrl;
const playerDirectionSpritesImage = new Image();
playerDirectionSpritesImage.src = playerDirectionSpritesUrl;
const enemyDirectionSpritesImage = new Image();
enemyDirectionSpritesImage.src = enemyDirectionSpritesUrl;
const projectileSpritesImage = new Image();
projectileSpritesImage.src = projectileSpritesUrl;

const DIRECTION_COLUMNS = 4;
const PLAYER_SPRITE_ROWS = 5;
const ENEMY_SPRITE_ROWS = 7;
const PROJECTILE_SPRITE_COLUMNS = 5;
const BLADE_SLASH_IMAGE_REVERSE_OFFSET = Math.PI;

const spriteCell = (index: number) => ({
  column: index % 4,
  row: Math.floor(index / 4),
});

const drawAtlasSprite = (
  ctx: CanvasRenderingContext2D,
  index: number,
  size: number,
) => {
  if (!combatSpritesImage.complete || combatSpritesImage.naturalWidth === 0) {
    return false;
  }

  const cell = spriteCell(index);
  const cellWidth = combatSpritesImage.naturalWidth / 4;
  const cellHeight = combatSpritesImage.naturalHeight / 2;
  ctx.drawImage(
    combatSpritesImage,
    cell.column * cellWidth,
    cell.row * cellHeight,
    cellWidth,
    cellHeight,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  return true;
};

const directionIndexFor = (actor: CombatActor): number => {
  const hasFacing = Math.abs(actor.facingX) + Math.abs(actor.facingY) > 0.001;
  const facingX = hasFacing ? actor.facingX : actor.vx;
  const facingY = hasFacing ? actor.facingY : actor.vy;
  if (Math.abs(facingX) + Math.abs(facingY) <= 0.001) {
    return 0;
  }
  if (Math.abs(facingY) >= Math.abs(facingX)) {
    return facingY < 0 ? 0 : 1;
  }
  return facingX < 0 ? 2 : 3;
};

const playerSpriteRow = (actor: CombatActor): number => {
  switch (actor.frameId) {
    case "light":
      return 0;
    case "medium":
      return 1;
    case "heavy":
      return 2;
    case "quad":
      return 3;
    case "tank":
      return 4;
    default:
      return 1;
  }
};

const enemySpriteRow = (actor: CombatActor): number => {
  if (actor.rank === "boss") {
    return 6;
  }
  if (actor.rank === "elite") {
    return actor.enemyRole === "bruiser" ? 5 : 4;
  }
  switch (actor.enemyRole) {
    case "scout":
      return 1;
    case "sniper":
      return 2;
    case "bruiser":
      return 3;
    case "drone":
    default:
      return 0;
  }
};

const drawDirectionalSprite = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rows: number,
  row: number,
  direction: number,
  size: number,
): boolean => {
  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return false;
  }

  const cellWidth = image.naturalWidth / DIRECTION_COLUMNS;
  const cellHeight = image.naturalHeight / rows;
  ctx.drawImage(
    image,
    direction * cellWidth,
    row * cellHeight,
    cellWidth,
    cellHeight,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  return true;
};

const drawGrid = (ctx: CanvasRenderingContext2D, state: CombatState) => {
  if (arenaFloorImage.complete && arenaFloorImage.naturalWidth > 0) {
    ctx.drawImage(arenaFloorImage, 0, 0, state.width, state.height);
    ctx.fillStyle = "rgba(2, 8, 10, .26)";
    ctx.fillRect(0, 0, state.width, state.height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, state.width, state.height);
    gradient.addColorStop(0, "#071015");
    gradient.addColorStop(0.58, "#10191d");
    gradient.addColorStop(1, "#170d0a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  ctx.strokeStyle = "rgba(107, 190, 215, .06)";
  ctx.lineWidth = 1;
  for (let x = 0; x < state.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height);
    ctx.stroke();
  }
  for (let y = 0; y < state.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 255, 255, .026)";
  for (let index = 0; index < 12; index += 1) {
    const x = (index * 137 + 90) % state.width;
    const y = (index * 83 + 70) % state.height;
    ctx.fillRect(x, y, 38 + (index % 3) * 18, 24 + (index % 4) * 10);
  }
};

const drawBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  percent: number,
  color: string,
) => {
  ctx.fillStyle = "rgba(0, 0, 0, .55)";
  ctx.fillRect(x, y, width, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, percent)), 5);
};

const drawUnitTag = (
  ctx: CanvasRenderingContext2D,
  actor: CombatActor,
  label: string,
) => {
  ctx.save();
  ctx.font = "700 11px system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = actor.color;
  ctx.shadowColor = "rgba(0, 0, 0, .8)";
  ctx.shadowBlur = 6;
  ctx.fillText(label, actor.x, actor.y - actor.radius - 20);
  ctx.restore();
};

const drawGuardShield = (ctx: CanvasRenderingContext2D, actor: CombatActor) => {
  if (!actor.guard || !guardShieldEffectImage.complete || guardShieldEffectImage.naturalWidth === 0) {
    return;
  }

  const size = actor.radius * (actor.frameId === "tank" ? 7.2 : actor.rank === "boss" ? 7.7 : 6.6);
  ctx.save();
  ctx.translate(actor.x, actor.y);
  ctx.globalAlpha = actor.team === "player" ? 0.62 : 0.54;
  ctx.shadowColor = actor.team === "player" ? "#63e8ff" : actor.color;
  ctx.shadowBlur = 18;
  ctx.drawImage(guardShieldEffectImage, -size / 2, -size / 2, size, size);
  ctx.restore();
};

const drawEntryBoost = (ctx: CanvasRenderingContext2D, actor: CombatActor) => {
  if (!isEntryBoosting(actor) || !boostBurstImage.complete || boostBurstImage.naturalWidth === 0) {
    return;
  }

  const angle = Math.atan2(actor.vy || actor.facingY, actor.vx || actor.facingX);
  const length = actor.radius * (actor.rank === "boss" ? 8.6 : actor.rank === "elite" ? 8.1 : 7.4);
  const width = actor.radius * (actor.rank === "boss" ? 3.6 : 3.1);
  ctx.save();
  ctx.translate(actor.x, actor.y);
  ctx.rotate(Number.isFinite(angle) ? angle : 0);
  ctx.globalAlpha = 0.82;
  ctx.shadowColor = actor.rank === "elite" ? "#d889ff" : "#ff9d42";
  ctx.shadowBlur = 24;
  ctx.drawImage(boostBurstImage, -length - actor.radius * 0.35, -width / 2, length, width);
  ctx.restore();
};

const drawMovementBoost = (ctx: CanvasRenderingContext2D, actor: CombatActor) => {
  if (
    actor.hp <= 0 ||
    isEntryBoosting(actor) ||
    !movementBoostTrailImage.complete ||
    movementBoostTrailImage.naturalWidth === 0
  ) {
    return;
  }

  const speed = Math.hypot(actor.vx, actor.vy);
  const threshold = actor.moveSpeed * (actor.quickBoostTime > 0 ? 0.12 : 0.28);
  if (speed < threshold) {
    return;
  }

  const direction = Math.atan2(actor.vy, actor.vx);
  const boostRatio = Math.min(1, speed / Math.max(actor.moveSpeed, actor.quickBoostMaxSpeed * 0.72));
  const quickBoosting = actor.quickBoostTime > 0;
  const length = actor.radius * (quickBoosting ? 4.2 : 2.7) * (0.68 + boostRatio * 0.38);
  const width = actor.radius * (quickBoosting ? 1.55 : 0.92);

  ctx.save();
  ctx.translate(actor.x, actor.y);
  ctx.rotate(Number.isFinite(direction) ? direction : 0);
  ctx.scale(-1, 1);
  ctx.globalAlpha = (quickBoosting ? 0.42 : 0.2) + boostRatio * (quickBoosting ? 0.18 : 0.1);
  ctx.shadowColor = actor.team === "player" ? "#21e0ff" : actor.color;
  ctx.shadowBlur = quickBoosting ? 18 : 10;
  ctx.drawImage(movementBoostTrailImage, actor.radius * 0.25, -width / 2, length, width);
  ctx.restore();
};

const drawMech = (
  ctx: CanvasRenderingContext2D,
  actor: CombatActor,
  isPlayer: boolean,
  legType: LegType = "biped",
  label?: string,
) => {
  ctx.save();
  ctx.translate(actor.x, actor.y);
  const direction = directionIndexFor(actor);
  const usesPlayerFrame = isPlayer || actor.enemyRole === "rival";
  const directionalImage = usesPlayerFrame ? playerDirectionSpritesImage : enemyDirectionSpritesImage;
  const directionalRows = usesPlayerFrame ? PLAYER_SPRITE_ROWS : ENEMY_SPRITE_ROWS;
  const directionalRow = usesPlayerFrame ? playerSpriteRow(actor) : enemySpriteRow(actor);
  const directionalSize =
    actor.radius *
    (usesPlayerFrame
      ? actor.frameId === "tank"
        ? 5.9
        : actor.frameId === "quad"
          ? 5.7
          : actor.frameId === "heavy"
            ? 5.4
            : 5.0
      : actor.rank === "boss"
        ? 6.1
        : actor.rank === "elite"
          ? 5.4
          : actor.enemyRole === "sniper"
            ? 5.0
            : 4.7);
  if (drawDirectionalSprite(ctx, directionalImage, directionalRows, directionalRow, direction, directionalSize)) {
    ctx.restore();
    drawBar(ctx, actor.x - 24, actor.y - actor.radius - 15, 48, hpPercent(actor), isPlayer ? "#54f4a7" : "#ff6848");
    if (label) {
      drawUnitTag(ctx, actor, label);
    }
    return;
  }
  const spriteIndex = actor.rank === "boss" ? 3 : actor.rank === "elite" ? 2 : 1;
  if (!usesPlayerFrame && drawAtlasSprite(ctx, spriteIndex, actor.radius * (actor.rank === "boss" ? 2.9 : actor.rank === "elite" ? 2.7 : 2.5))) {
    ctx.restore();
    drawBar(ctx, actor.x - 24, actor.y - actor.radius - 15, 48, hpPercent(actor), isPlayer ? "#54f4a7" : "#ff6848");
    if (label) {
      drawUnitTag(ctx, actor, label);
    }
    return;
  }
  const angle = Math.atan2(actor.vy, actor.vx || (isPlayer ? -0.2 : 0.2));
  ctx.rotate(Number.isFinite(angle) ? angle : 0);
  ctx.shadowColor = actor.color;
  ctx.shadowBlur = isPlayer ? 18 : 10;
  ctx.lineWidth = 2;
  ctx.strokeStyle = isPlayer ? actor.color : actor.color;
  ctx.fillStyle = isPlayer || actor.enemyRole === "rival" ? "rgba(216, 242, 248, .96)" : "#7c6b52";
  const frameId = actor.frameId ?? "medium";
  const coreWidth = frameId === "heavy" ? 40 : frameId === "tank" ? 46 : frameId === "light" ? 24 : 30;
  const coreHeight = frameId === "heavy" ? 38 : frameId === "tank" ? 34 : frameId === "light" ? 30 : 34;
  const weaponLength = frameId === "quad" || frameId === "tank" ? 42 : frameId === "light" ? 26 : 34;

  if (legType === "tank") {
    ctx.fillRect(-coreWidth / 2, -coreHeight / 2, coreWidth, coreHeight);
    ctx.fillStyle = isPlayer ? "#68d6ff" : actor.color;
    ctx.fillRect(-34, 11, 68, 12);
    ctx.fillRect(-34, -23, 68, 12);
  } else if (legType === "quad") {
    ctx.fillRect(-coreWidth / 2, -coreHeight / 2, coreWidth, coreHeight);
    ctx.strokeRect(-31, -26, 18, 18);
    ctx.strokeRect(-31, 8, 18, 18);
    ctx.strokeRect(13, -26, 18, 18);
    ctx.strokeRect(13, 8, 18, 18);
  } else if (legType === "reverse") {
    ctx.fillRect(-coreWidth / 2, -coreHeight / 2, coreWidth, coreHeight);
    ctx.beginPath();
    ctx.moveTo(-12, 12);
    ctx.lineTo(-28, 28);
    ctx.lineTo(-6, 23);
    ctx.moveTo(12, 12);
    ctx.lineTo(28, 28);
    ctx.lineTo(6, 23);
    ctx.stroke();
  } else if (legType === "hover") {
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#53ffbd";
    ctx.beginPath();
    ctx.arc(0, 0, 31, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    ctx.fillRect(-coreWidth / 2, -coreHeight / 2, coreWidth, coreHeight);
    ctx.strokeRect(-coreWidth / 2 - 7, 12, frameId === "heavy" ? 16 : 13, frameId === "heavy" ? 25 : 21);
    ctx.strokeRect(coreWidth / 2 - 6, 12, frameId === "heavy" ? 16 : 13, frameId === "heavy" ? 25 : 21);
  }

  ctx.strokeStyle = isPlayer ? "#3ed5ff" : "#ff8d4d";
  ctx.beginPath();
  ctx.moveTo(coreWidth / 2, -9);
  ctx.lineTo(coreWidth / 2 + weaponLength, -17);
  ctx.moveTo(coreWidth / 2, 9);
  ctx.lineTo(coreWidth / 2 + weaponLength, 17);
  ctx.stroke();
  ctx.restore();

  drawBar(ctx, actor.x - 24, actor.y - actor.radius - 15, 48, hpPercent(actor), isPlayer ? "#54f4a7" : "#ff6848");
  if (label) {
    drawUnitTag(ctx, actor, label);
  }
};

const projectileSpriteColumn = (projectile: Projectile): number => {
  switch (projectile.kind) {
    case "pulse":
      return 1;
    case "missile":
      return 2;
    case "rocket":
      return 3;
    case "grenade":
      return 4;
    case "bullet":
    default:
      return 0;
  }
};

const projectileSpriteSize = (projectile: Projectile): number => {
  switch (projectile.kind) {
    case "pulse":
      return 42;
    case "missile":
      return 50;
    case "rocket":
      return 54;
    case "grenade":
      return 58;
    case "bullet":
    default:
      return 38;
  }
};

const drawProjectileSprite = (
  ctx: CanvasRenderingContext2D,
  projectile: Projectile,
): boolean => {
  if (!projectileSpritesImage.complete || projectileSpritesImage.naturalWidth === 0) {
    return false;
  }

  const column = projectileSpriteColumn(projectile);
  const cellWidth = projectileSpritesImage.naturalWidth / PROJECTILE_SPRITE_COLUMNS;
  const cellHeight = projectileSpritesImage.naturalHeight;
  const size = projectileSpriteSize(projectile);
  ctx.drawImage(
    projectileSpritesImage,
    column * cellWidth,
    0,
    cellWidth,
    cellHeight,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  return true;
};

const drawProjectile = (ctx: CanvasRenderingContext2D, projectile: Projectile) => {
  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  const angle = Math.atan2(projectile.vy, projectile.vx) + Math.PI / 2;
  ctx.rotate(Number.isFinite(angle) ? angle : 0);
  if (drawProjectileSprite(ctx, projectile)) {
    ctx.restore();
    return;
  }
  const explosive = projectile.kind === "missile" || projectile.kind === "rocket" || projectile.kind === "grenade";
  const spriteIndex = explosive ? 6 : projectile.color.toLowerCase().startsWith("#ff") ? 5 : 4;
  if (drawAtlasSprite(ctx, spriteIndex, explosive ? 34 : 20)) {
    ctx.restore();
    return;
  }
  ctx.translate(-projectile.x, -projectile.y);
  ctx.strokeStyle = projectile.color;
  ctx.fillStyle = projectile.color;
  ctx.shadowColor = projectile.color;
  ctx.shadowBlur = 16;
  ctx.lineWidth = explosive ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(projectile.x, projectile.y);
  ctx.lineTo(projectile.x - projectile.vx * 0.035, projectile.y - projectile.vy * 0.035);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawEffect = (ctx: CanvasRenderingContext2D, effect: Effect) => {
  const progress = 1 - effect.life / effect.maxLife;
  ctx.save();
  ctx.translate(effect.x, effect.y);
  ctx.globalAlpha = Math.max(0, 1 - progress);
  if (effect.kind === "alert") {
    const pulse = 0.45 + Math.sin(progress * Math.PI * 8) * 0.18;
    ctx.translate(-effect.x, -effect.y);
    ctx.globalAlpha = Math.max(0, Math.min(1, (1 - progress) * 1.18));
    ctx.fillStyle = `rgba(255, 34, 58, ${pulse})`;
    ctx.fillRect(0, effect.y - 54, ctx.canvas.width, 4);
    ctx.fillRect(0, effect.y + 54, ctx.canvas.width, 4);
    ctx.fillStyle = "rgba(0, 0, 0, .62)";
    ctx.fillRect(0, effect.y - 46, ctx.canvas.width, 92);
    ctx.strokeStyle = effect.color;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 24;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, 54 + progress * 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, 92 + progress * 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffedf0";
    ctx.font = "800 31px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("WARNING", ctx.canvas.width / 2, effect.y - 8);
    ctx.font = "700 15px system-ui";
    ctx.fillStyle = effect.color;
    ctx.fillText(effect.label ?? "BOSS FRAME DETECTED", ctx.canvas.width / 2, effect.y + 23);
    ctx.restore();
    return;
  }
  if (effect.kind === "explosion" && explosionBurstImage.complete && explosionBurstImage.naturalWidth > 0) {
    const size = effect.size * (1.05 + progress * 0.85);
    ctx.drawImage(
      explosionBurstImage,
      -size / 2,
      -size / 2,
      size,
      size,
    );
    ctx.restore();
    return;
  }
  if (effect.kind === "explosion" && drawAtlasSprite(ctx, 7, effect.size * (1.4 + progress * 1.3))) {
    ctx.restore();
    return;
  }
  ctx.strokeStyle = effect.color;
  ctx.fillStyle = effect.color;
  ctx.shadowColor = effect.color;
  ctx.shadowBlur = 20;

  if (effect.kind === "slash") {
    ctx.rotate((effect.rotation ?? 0) + BLADE_SLASH_IMAGE_REVERSE_OFFSET);
    if (bladeSlashEffectImage.complete && bladeSlashEffectImage.naturalWidth > 0) {
      const length = effect.size * (2.45 + progress * 0.42);
      const height = effect.size * (1.65 + progress * 0.18);
      ctx.globalAlpha *= 0.92 - progress * 0.18;
      ctx.drawImage(bladeSlashEffectImage, -length * 0.45, -height * 0.5, length, height);
      ctx.restore();
      return;
    }
    ctx.lineCap = "round";
    ctx.lineWidth = 7 * (1 - progress * 0.35);
    ctx.beginPath();
    ctx.arc(10, 0, effect.size * (0.35 + progress * 0.2), -0.82, 0.82);
    ctx.stroke();
    ctx.globalAlpha *= 0.48;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(8, 0, effect.size * (0.62 + progress * 0.18), -0.68, 0.68);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (effect.kind === "boost") {
    ctx.rotate(effect.rotation ?? 0);
    if (boostBurstImage.complete && boostBurstImage.naturalWidth > 0) {
      const spriteWidth = effect.size * (4.1 + progress * 2.2) * 0.2;
      const spriteHeight = effect.size * (2.25 + progress * 1.1);
      ctx.save();
      ctx.globalAlpha *= 0.95 - progress * 0.22;
      ctx.shadowBlur = 28;
      ctx.drawImage(
        boostBurstImage,
        -spriteWidth * 0.86,
        -spriteHeight * 0.5,
        spriteWidth,
        spriteHeight,
      );
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  ctx.translate(-effect.x, -effect.y);
  if (effect.kind === "explosion") {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.size * progress, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.35;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.size * (1 - progress * 0.4), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

const resourceLabel = (weapon: PlayerWeaponState) =>
  weapon.resource === "ballistic" ? `${weapon.ammo} / ${weapon.ammoMax}` : `EN ${weapon.energyCost}`;

const coolbarClass = (weapon: PlayerWeaponState): string =>
  weapon.hardpoint === "leftArm"
    ? "coolbar green"
    : weapon.hardpoint.includes("Shoulder")
      ? "coolbar orange"
      : "coolbar";

const drawCombat = (ctx: CanvasRenderingContext2D, state: CombatState, paused = false) => {
  drawGrid(ctx, state);
  for (const projectile of state.projectiles) {
    drawProjectile(ctx, projectile);
  }
  for (const effect of state.effects.filter((item) => item.kind === "boost")) {
    drawEffect(ctx, effect);
  }
  for (const enemy of state.enemies) {
    ctx.save();
    if (enemy.hp <= 0) {
      ctx.globalAlpha = Math.max(0.18, Math.min(0.55, (enemy.deathTimer ?? 0.2) / 0.38));
    }
    drawMovementBoost(ctx, enemy);
    drawEntryBoost(ctx, enemy);
    drawGuardShield(ctx, enemy);
    drawMech(ctx, enemy, false, enemy.legType ?? (enemy.rank === "boss" ? "tank" : enemy.rank === "elite" ? "quad" : "biped"));
    ctx.restore();
  }
  state.players.forEach((unit) => {
    drawMovementBoost(ctx, unit.actor);
    drawGuardShield(ctx, unit.actor);
    drawMech(ctx, unit.actor, true, unit.stats.legType, `U${unit.unitIndex + 1}`);
  });
  for (const effect of state.effects.filter((item) => item.kind !== "boost")) {
    drawEffect(ctx, effect);
  }

  if (paused && state.status === "running") {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, .46)";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#8ce5ff";
    ctx.font = "700 42px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", state.width / 2, state.height / 2);
    ctx.restore();
  }

  if (state.status !== "running") {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, .55)";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.fillStyle = state.status === "victory" ? "#54f4a7" : "#ff6848";
    ctx.font = "700 42px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(state.status === "victory" ? "MISSION CLEAR" : "CORE LOST", state.width / 2, state.height / 2);
    ctx.restore();
  }
};

export default function CombatScreen({
  stage,
  statsByUnit,
  unitHpByUnit,
  sortieEnabled,
  unlockedUnitCount,
  rulesByUnit,
  targetPrioritiesByUnit,
  weaponAutoUseByUnit,
  activeUnitIndex,
  onSelectUnit,
  onVictory,
  onDefeat,
  onOpenAssemble,
  onOpenAi,
}: CombatScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<CombatState>(
    createCombatState(stage, statsByUnit, unitHpByUnit, sortieEnabled, unlockedUnitCount, weaponAutoUseByUnit),
  );
  const resolvedRef = useRef(false);
  const resolveTimeoutRef = useRef<number | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<CombatState>(() => stateRef.current);
  const [paused, setPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const activeUnit = snapshot.players.find((unit) => unit.unitIndex === activeUnitIndex) ?? snapshot.players[0];
  const selectedUnitIndex = activeUnit?.unitIndex ?? 0;
  const activeStats = statsByUnit[selectedUnitIndex] ?? statsByUnit[0];
  const activeRules = rulesByUnit[selectedUnitIndex] ?? rulesByUnit[0] ?? [];
  const stagePlan = getStagePlan(stage);
  const rulesById = useMemo(() => new Map(activeRules.map((rule) => [rule.id, rule])), [activeRules]);
  const activeRule = activeUnit?.activeRuleId ? rulesById.get(activeUnit.activeRuleId) : undefined;

  useEffect(() => {
    if (resolveTimeoutRef.current !== undefined) {
      window.clearTimeout(resolveTimeoutRef.current);
      resolveTimeoutRef.current = undefined;
    }
    stateRef.current = createCombatState(stage, statsByUnit, unitHpByUnit, sortieEnabled, unlockedUnitCount, weaponAutoUseByUnit);
    resolvedRef.current = false;
    setPaused(false);
    setSnapshot(stateRef.current);
  }, [stage, statsByUnit, unitHpByUnit, sortieEnabled, unlockedUnitCount, weaponAutoUseByUnit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }

    let animation = 0;
    let last = performance.now();
    let lastSnapshot = 0;

    const frame = (now: number) => {
      const dt = paused ? 0 : Math.min(0.033, Math.max(0.001, (now - last) / 1000)) * speedMultiplier;
      last = now;
      const current = paused
        ? stateRef.current
        : stepCombat(stateRef.current, dt, rulesByUnit, targetPrioritiesByUnit);
      if (!paused) {
        playCombatSoundEvents(current.soundEvents);
      }
      drawCombat(ctx, current, paused);

      if (now - lastSnapshot > 110) {
        setSnapshot({
          ...current,
          players: current.players.map((unit): PlayerCombatUnit => ({
            ...unit,
            actor: { ...unit.actor },
            weapons: unit.weapons.map((weapon) => ({ ...weapon })),
          })),
          enemies: [...current.enemies],
          enemyQueue: [...current.enemyQueue],
          report: {
            damageByUnit: [...current.report.damageByUnit],
            ruleHitsByUnit: current.report.ruleHitsByUnit.map((ruleHits) => ({ ...ruleHits })),
          },
        });
        lastSnapshot = now;
      }

      if (!resolvedRef.current && current.status !== "running") {
        resolvedRef.current = true;
        resolveTimeoutRef.current = window.setTimeout(() => {
          resolveTimeoutRef.current = undefined;
          if (current.status === "victory") {
            onVictory(
              current.players.reduce<number[]>((hpByUnit, unit) => {
                hpByUnit[unit.unitIndex] = unit.actor.hp;
                return hpByUnit;
              }, []),
              current.report,
            );
          } else {
            onDefeat();
          }
        }, 850);
      }

      animation = requestAnimationFrame(frame);
    };

    animation = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animation);
      if (resolveTimeoutRef.current !== undefined) {
        window.clearTimeout(resolveTimeoutRef.current);
        resolveTimeoutRef.current = undefined;
      }
    };
  }, [onDefeat, onVictory, paused, rulesByUnit, speedMultiplier, stage, targetPrioritiesByUnit]);

  if (!activeUnit || !activeStats) {
    return null;
  }

  const activeActor = activeUnit.actor;
  const livingEnemies = snapshot.enemies.filter((enemy) => enemy.hp > 0);
  const incomingEnemyCount = snapshot.enemyQueue.length;
  const defeatedEnemyCount = Math.min(snapshot.enemyTotal, snapshot.defeatedEnemyCount);

  return (
    <main className="combat-layout">
      <section className="combat-hud left">
        <div className="panel compact">
          <div className="section-title">STAGE {stage}</div>
          <strong>{stagePlan.label}</strong>
          <small>{stagePlan.threat}</small>
          <small>撃破 {defeatedEnemyCount}/{snapshot.enemyTotal}</small>
          <small>交戦中 {livingEnemies.length} / 増援待ち {incomingEnemyCount}</small>
        </div>
        <div className="panel compact">
          <div className="section-title">STATUS</div>
          <div className="squad-status-list">
            {snapshot.players.map((unit, index) => (
              <button
                key={unit.actor.id}
                className={`squad-status-row ${selectedUnitIndex === unit.unitIndex ? "active" : ""}`}
                onClick={() => onSelectUnit(unit.unitIndex)}
              >
                <span>UNIT {unit.unitIndex + 1}</span>
                <b>{unit.actor.hp > 0 ? Math.ceil(unit.actor.hp) : "DOWN"}</b>
              </button>
            ))}
          </div>
          <div className="meter-label">
            <span>HP</span>
            <b>
              {Math.ceil(activeActor.hp)} / {activeActor.maxHp}
            </b>
          </div>
          <div className="meter hp"><span style={{ width: `${hpPercent(activeActor) * 100}%` }} /></div>
          <div className="meter-label">
            <span>EN</span>
            <b>
              {Math.ceil(activeActor.en)} / {activeActor.maxEn}
            </b>
          </div>
          <div className="meter en"><span style={{ width: `${(activeActor.en / activeActor.maxEn) * 100}%` }} /></div>
        </div>
        <div className="panel compact">
          <div className="section-title">CURRENT ACTION</div>
          <strong className="active-action">{getActionLabel(activeUnit.activeAction)}</strong>
          <small>{activeRule ? getConditionLabel(activeRule.condition) : "NO RULE"}</small>
        </div>
        <div className="panel compact">
          <div className="section-title">WEAPON COOL</div>
          {activeUnit.weapons.map((weapon) => (
            <div className="weapon-cool-entry" key={weapon.hardpoint}>
              <div className="cool-row">
                <span>{weapon.label}</span>
                <b>{weapon.cooldownRemaining.toFixed(1)} / {resourceLabel(weapon)}</b>
              </div>
              <small>{getWeaponKindLabel(weapon.weaponKind)} / {weapon.autoUse ? "使用許可" : "使用停止"}</small>
              <div className={coolbarClass(weapon)}>
                <span style={{ width: `${cooldownPercent(weapon.cooldownRemaining, weapon.cooldownMax) * 100}%` }} />
              </div>
              {weapon.cooldownRemaining <= 0 && weapon.resource === "energy" && activeActor.en < weapon.energyCost && (
                <div className="shortage-line">{weapon.label} EN不足</div>
              )}
              {weapon.cooldownRemaining <= 0 && weapon.resource === "ballistic" && weapon.ammo <= 0 && (
                <div className="shortage-line">{weapon.label} 弾切れ</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="combat-canvas-wrap">
        <canvas ref={canvasRef} width={980} height={570} />
      </section>

      <section className="combat-hud right">
        <div className="panel compact combat-control-panel">
          <div className="section-title">TACTICS</div>
          <button className={paused ? "active" : ""} onClick={() => setPaused((current) => !current)}>
            {paused ? "再開" : "一時停止"}
          </button>
          <div className="speed-row">
            {[1, 1.5, 2].map((speed) => (
              <button
                key={speed}
                className={speedMultiplier === speed ? "active" : ""}
                onClick={() => setSpeedMultiplier(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
        <div className="panel compact radar-panel">
          <div className="section-title">RADAR</div>
          <div className="radar">
            {snapshot.players.map((unit) => (
              <span
                key={unit.actor.id}
                className={`radar-player ${unit.actor.hp <= 0 ? "down" : ""}`}
                style={{
                  left: `${(unit.actor.x / snapshot.width) * 100}%`,
                  top: `${(unit.actor.y / snapshot.height) * 100}%`,
                  background: unit.actor.color,
                  width: selectedUnitIndex === unit.unitIndex ? 10 : 8,
                  height: selectedUnitIndex === unit.unitIndex ? 10 : 8,
                }}
              />
            ))}
            {livingEnemies.map((enemy) => (
              <span
                key={enemy.id}
                className={`radar-enemy ${enemy.rank}`}
                style={{
                  left: `${(enemy.x / snapshot.width) * 100}%`,
                  top: `${(enemy.y / snapshot.height) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="panel compact enemy-list">
          <div className="section-title">TARGETS</div>
          {livingEnemies.map((enemy) => (
            <div className="enemy-row" key={enemy.id}>
              <span>{enemy.name}</span>
              <div className="meter hp mini"><span style={{ width: `${hpPercent(enemy) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="screen-actions vertical">
          <button onClick={onOpenAssemble}>ASSEMBLE</button>
          <button onClick={onOpenAi}>AI EDIT</button>
        </div>
      </section>
    </main>
  );
}
