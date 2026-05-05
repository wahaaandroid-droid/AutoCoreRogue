import { useEffect, useMemo, useRef, useState } from "react";
import { getActionLabel, getConditionLabel } from "../data/aiRules";
import { getStagePlan } from "../data/stages";
import { CombatActor, CombatReport, CombatState, PlayerCombatUnit, createCombatState, stepCombat } from "../game/combat";
import { Effect, Projectile } from "../game/projectiles";
import { playCombatSoundEvents } from "../game/sound";
import { AiRule, DerivedStats, LegType, TargetPriorityId } from "../types";
import arenaFloorUrl from "../assets/arena-floor.png";
import boostBurstUrl from "../assets/boost-burst.png";
import combatSpritesUrl from "../assets/combat-sprites.png";

interface CombatScreenProps {
  stage: number;
  statsByUnit: DerivedStats[];
  unitHpByUnit: number[];
  sortieEnabled: boolean[];
  unlockedUnitCount: number;
  rulesByUnit: AiRule[][];
  targetPrioritiesByUnit: TargetPriorityId[];
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
const boostBurstImage = new Image();
boostBurstImage.src = boostBurstUrl;
const combatSpritesImage = new Image();
combatSpritesImage.src = combatSpritesUrl;

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

const drawMech = (
  ctx: CanvasRenderingContext2D,
  actor: CombatActor,
  isPlayer: boolean,
  legType: LegType = "biped",
  label?: string,
) => {
  ctx.save();
  ctx.translate(actor.x, actor.y);
  const spriteIndex = isPlayer ? 0 : actor.rank === "boss" ? 3 : actor.rank === "elite" ? 2 : 1;
  if (!isPlayer && drawAtlasSprite(ctx, spriteIndex, actor.radius * (actor.rank === "boss" ? 3.6 : actor.rank === "elite" ? 3.4 : 3.1))) {
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
  ctx.fillStyle = isPlayer ? "rgba(216, 242, 248, .96)" : "#7c6b52";
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

const drawProjectile = (ctx: CanvasRenderingContext2D, projectile: Projectile) => {
  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  const angle = Math.atan2(projectile.vy, projectile.vx) + Math.PI / 2;
  ctx.rotate(Number.isFinite(angle) ? angle : 0);
  const spriteIndex = projectile.kind === "missile" ? 6 : projectile.color.toLowerCase().startsWith("#ff") ? 5 : 4;
  if (drawAtlasSprite(ctx, spriteIndex, projectile.kind === "missile" ? 36 : 22)) {
    ctx.restore();
    return;
  }
  ctx.translate(-projectile.x, -projectile.y);
  ctx.strokeStyle = projectile.color;
  ctx.fillStyle = projectile.color;
  ctx.shadowColor = projectile.color;
  ctx.shadowBlur = 16;
  ctx.lineWidth = projectile.kind === "missile" ? 3 : 2;
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
  if (effect.kind === "explosion" && drawAtlasSprite(ctx, 7, effect.size * (1.4 + progress * 1.3))) {
    ctx.restore();
    return;
  }
  ctx.strokeStyle = effect.color;
  ctx.fillStyle = effect.color;
  ctx.shadowColor = effect.color;
  ctx.shadowBlur = 20;

  if (effect.kind === "slash") {
    ctx.rotate(effect.rotation ?? 0);
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

const resourceLabel = (resource: string, ammo: number, ammoMax: number, energyCost: number) =>
  resource === "ballistic" ? `${ammo} / ${ammoMax}` : `EN ${energyCost}`;

const drawCombat = (ctx: CanvasRenderingContext2D, state: CombatState) => {
  drawGrid(ctx, state);
  for (const projectile of state.projectiles) {
    drawProjectile(ctx, projectile);
  }
  for (const effect of state.effects) {
    drawEffect(ctx, effect);
  }
  for (const enemy of state.enemies) {
    drawMech(ctx, enemy, false, enemy.rank === "boss" ? "tank" : enemy.rank === "elite" ? "quad" : "biped");
  }
  state.players.forEach((unit) => {
    drawMech(ctx, unit.actor, true, unit.stats.legType, `U${unit.unitIndex + 1}`);
  });

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
  activeUnitIndex,
  onSelectUnit,
  onVictory,
  onDefeat,
  onOpenAssemble,
  onOpenAi,
}: CombatScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<CombatState>(createCombatState(stage, statsByUnit, unitHpByUnit, sortieEnabled, unlockedUnitCount));
  const resolvedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<CombatState>(() => stateRef.current);
  const activeUnit = snapshot.players.find((unit) => unit.unitIndex === activeUnitIndex) ?? snapshot.players[0];
  const selectedUnitIndex = activeUnit?.unitIndex ?? 0;
  const activeStats = statsByUnit[selectedUnitIndex] ?? statsByUnit[0];
  const activeRules = rulesByUnit[selectedUnitIndex] ?? rulesByUnit[0] ?? [];
  const stagePlan = getStagePlan(stage);
  const rulesById = useMemo(() => new Map(activeRules.map((rule) => [rule.id, rule])), [activeRules]);
  const activeRule = activeUnit?.activeRuleId ? rulesById.get(activeUnit.activeRuleId) : undefined;

  useEffect(() => {
    stateRef.current = createCombatState(stage, statsByUnit, unitHpByUnit, sortieEnabled, unlockedUnitCount);
    resolvedRef.current = false;
    setSnapshot(stateRef.current);
  }, [stage, statsByUnit, unitHpByUnit, sortieEnabled, unlockedUnitCount]);

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
      const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
      last = now;
      const current = stepCombat(stateRef.current, dt, rulesByUnit, targetPrioritiesByUnit);
      playCombatSoundEvents(current.soundEvents);
      drawCombat(ctx, current);

      if (now - lastSnapshot > 110) {
        setSnapshot({
          ...current,
          players: current.players.map((unit): PlayerCombatUnit => ({
            ...unit,
            actor: { ...unit.actor },
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
        window.setTimeout(() => {
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
    return () => cancelAnimationFrame(animation);
  }, [onDefeat, onVictory, rulesByUnit, stage, targetPrioritiesByUnit]);

  if (!activeUnit || !activeStats) {
    return null;
  }

  const activeActor = activeUnit.actor;

  return (
    <main className="combat-layout">
      <section className="combat-hud left">
        <div className="panel compact">
          <div className="section-title">STAGE {stage}</div>
          <strong>{stagePlan.label}</strong>
          <small>
            敵 {snapshot.enemyTotal - snapshot.enemyQueue.length - snapshot.enemies.length}/{snapshot.enemyTotal} 撃破
          </small>
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
          <div className="cool-row">
            <span>右腕</span>
            <b>{activeUnit.rightCooldown.toFixed(1)} / {resourceLabel(activeUnit.rightResource, activeUnit.rightAmmo, activeUnit.rightAmmoMax, activeUnit.rightEnergyCost)}</b>
          </div>
          <div className="coolbar"><span style={{ width: `${cooldownPercent(activeUnit.rightCooldown, activeStats.rightCooldown) * 100}%` }} /></div>
          {activeUnit.rightCooldown <= 0 && activeUnit.rightResource === "energy" && activeActor.en < activeUnit.rightEnergyCost && (
            <div className="shortage-line">右腕 EN不足</div>
          )}
          {activeUnit.rightCooldown <= 0 && activeUnit.rightResource === "ballistic" && activeUnit.rightAmmo <= 0 && (
            <div className="shortage-line">右腕 弾切れ</div>
          )}
          <div className="cool-row">
            <span>左腕</span>
            <b>{activeUnit.leftCooldown.toFixed(1)} / {resourceLabel(activeUnit.leftResource, activeUnit.leftAmmo, activeUnit.leftAmmoMax, activeUnit.leftEnergyCost)}</b>
          </div>
          <div className="coolbar green"><span style={{ width: `${cooldownPercent(activeUnit.leftCooldown, activeStats.leftCooldown) * 100}%` }} /></div>
          {activeUnit.leftCooldown <= 0 && activeUnit.leftResource === "energy" && activeActor.en < activeUnit.leftEnergyCost && (
            <div className="shortage-line">左腕 EN不足</div>
          )}
          {activeUnit.leftCooldown <= 0 && activeUnit.leftResource === "ballistic" && activeUnit.leftAmmo <= 0 && (
            <div className="shortage-line">左腕 弾切れ</div>
          )}
          <div className="cool-row">
            <span>ミサイル</span>
            <b>{activeUnit.missileCooldown.toFixed(1)} / EN {activeUnit.missileEnergyCost}</b>
          </div>
          <div className="coolbar orange"><span style={{ width: `${cooldownPercent(activeUnit.missileCooldown, activeStats.missileCooldown) * 100}%` }} /></div>
        </div>
      </section>

      <section className="combat-canvas-wrap">
        <canvas ref={canvasRef} width={980} height={570} />
      </section>

      <section className="combat-hud right">
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
            {snapshot.enemies.map((enemy) => (
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
          {snapshot.enemies.map((enemy) => (
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
