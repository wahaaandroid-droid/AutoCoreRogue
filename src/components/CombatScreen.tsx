import { useEffect, useMemo, useRef, useState } from "react";
import { getActionLabel, getConditionLabel } from "../data/aiRules";
import { CombatActor, CombatState, createCombatState, stepCombat } from "../game/combat";
import { Effect, Projectile } from "../game/projectiles";
import { playCombatSoundEvents } from "../game/sound";
import { AiRule, DerivedStats, LegType } from "../types";
import arenaFloorUrl from "../assets/arena-floor.png";
import boostBurstUrl from "../assets/boost-burst.png";
import combatSpritesUrl from "../assets/combat-sprites.png";

interface CombatScreenProps {
  stage: number;
  stats: DerivedStats;
  rules: AiRule[];
  onVictory: () => void;
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

const drawMech = (
  ctx: CanvasRenderingContext2D,
  actor: CombatActor,
  isPlayer: boolean,
  legType: LegType = "biped",
) => {
  ctx.save();
  ctx.translate(actor.x, actor.y);
  const spriteIndex = isPlayer ? 0 : actor.rank === "boss" ? 3 : actor.rank === "elite" ? 2 : 1;
  if (drawAtlasSprite(ctx, spriteIndex, actor.radius * (actor.rank === "boss" ? 3.6 : actor.rank === "elite" ? 3.4 : 3.1))) {
    ctx.restore();
    drawBar(ctx, actor.x - 24, actor.y - actor.radius - 15, 48, hpPercent(actor), isPlayer ? "#54f4a7" : "#ff6848");
    return;
  }
  const angle = Math.atan2(actor.vy, actor.vx || (isPlayer ? -0.2 : 0.2));
  ctx.rotate(Number.isFinite(angle) ? angle : 0);
  ctx.shadowColor = actor.color;
  ctx.shadowBlur = isPlayer ? 18 : 10;
  ctx.lineWidth = 2;
  ctx.strokeStyle = isPlayer ? "#b8ecff" : actor.color;
  ctx.fillStyle = isPlayer ? "#d7f1ff" : "#7c6b52";

  if (legType === "tank") {
    ctx.fillRect(-22, -16, 44, 32);
    ctx.fillStyle = isPlayer ? "#68d6ff" : actor.color;
    ctx.fillRect(-26, 10, 52, 11);
    ctx.fillRect(-26, -21, 52, 11);
  } else if (legType === "quad") {
    ctx.fillRect(-15, -15, 30, 30);
    ctx.strokeRect(-27, -24, 16, 17);
    ctx.strokeRect(-27, 7, 16, 17);
    ctx.strokeRect(11, -24, 16, 17);
    ctx.strokeRect(11, 7, 16, 17);
  } else if (legType === "reverse") {
    ctx.fillRect(-14, -16, 28, 32);
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
    ctx.fillRect(-14, -17, 28, 34);
    ctx.strokeRect(-21, 12, 13, 21);
    ctx.strokeRect(8, 12, 13, 21);
  }

  ctx.strokeStyle = isPlayer ? "#3ed5ff" : "#ff8d4d";
  ctx.beginPath();
  ctx.moveTo(14, -9);
  ctx.lineTo(34, -17);
  ctx.moveTo(14, 9);
  ctx.lineTo(34, 17);
  ctx.stroke();
  ctx.restore();

  drawBar(ctx, actor.x - 24, actor.y - actor.radius - 15, 48, hpPercent(actor), isPlayer ? "#54f4a7" : "#ff6848");
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

const drawCombat = (ctx: CanvasRenderingContext2D, state: CombatState, stats: DerivedStats) => {
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
  drawMech(ctx, state.player, true, stats.legType);

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
  stats,
  rules,
  onVictory,
  onDefeat,
  onOpenAssemble,
  onOpenAi,
}: CombatScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<CombatState>(createCombatState(stage, stats));
  const resolvedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<CombatState>(() => stateRef.current);
  const rulesById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules]);
  const activeRule = snapshot.activeRuleId ? rulesById.get(snapshot.activeRuleId) : undefined;

  useEffect(() => {
    stateRef.current = createCombatState(stage, stats);
    resolvedRef.current = false;
    setSnapshot(stateRef.current);
  }, [stage, stats]);

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
      const current = stepCombat(stateRef.current, dt, stats, rules);
      playCombatSoundEvents(current.soundEvents);
      drawCombat(ctx, current, stats);

      if (now - lastSnapshot > 110) {
        setSnapshot({ ...current, player: { ...current.player }, enemies: [...current.enemies] });
        lastSnapshot = now;
      }

      if (!resolvedRef.current && current.status !== "running") {
        resolvedRef.current = true;
        window.setTimeout(() => {
          if (current.status === "victory") {
            onVictory();
          } else {
            onDefeat();
          }
        }, 850);
      }

      animation = requestAnimationFrame(frame);
    };

    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [onDefeat, onVictory, rules, stage, stats]);

  return (
    <main className="combat-layout">
      <section className="combat-hud left">
        <div className="panel compact">
          <div className="section-title">STAGE {stage}</div>
          <strong>{stage === 7 ? "BOSS" : stage === 5 ? "ELITE" : "WAVE"}</strong>
          <small>敵を全て撃破</small>
        </div>
        <div className="panel compact">
          <div className="section-title">STATUS</div>
          <div className="meter-label">
            <span>HP</span>
            <b>
              {Math.ceil(snapshot.player.hp)} / {snapshot.player.maxHp}
            </b>
          </div>
          <div className="meter hp"><span style={{ width: `${hpPercent(snapshot.player) * 100}%` }} /></div>
          <div className="meter-label">
            <span>EN</span>
            <b>
              {Math.ceil(snapshot.player.en)} / {snapshot.player.maxEn}
            </b>
          </div>
          <div className="meter en"><span style={{ width: `${(snapshot.player.en / snapshot.player.maxEn) * 100}%` }} /></div>
        </div>
        <div className="panel compact">
          <div className="section-title">CURRENT ACTION</div>
          <strong className="active-action">{getActionLabel(snapshot.activeAction)}</strong>
          <small>{activeRule ? getConditionLabel(activeRule.condition) : "NO RULE"}</small>
        </div>
        <div className="panel compact">
          <div className="section-title">WEAPON COOL</div>
          <div className="cool-row">
            <span>右腕</span>
            <b>{snapshot.rightCooldown.toFixed(1)} / {resourceLabel(snapshot.rightResource, snapshot.rightAmmo, snapshot.rightAmmoMax, snapshot.rightEnergyCost)}</b>
          </div>
          <div className="coolbar"><span style={{ width: `${cooldownPercent(snapshot.rightCooldown, stats.rightCooldown) * 100}%` }} /></div>
          {snapshot.rightCooldown <= 0 && snapshot.rightResource === "energy" && snapshot.player.en < snapshot.rightEnergyCost && (
            <div className="shortage-line">右腕 EN不足</div>
          )}
          {snapshot.rightCooldown <= 0 && snapshot.rightResource === "ballistic" && snapshot.rightAmmo <= 0 && (
            <div className="shortage-line">右腕 弾切れ</div>
          )}
          <div className="cool-row">
            <span>左腕</span>
            <b>{snapshot.leftCooldown.toFixed(1)} / {resourceLabel(snapshot.leftResource, snapshot.leftAmmo, snapshot.leftAmmoMax, snapshot.leftEnergyCost)}</b>
          </div>
          <div className="coolbar green"><span style={{ width: `${cooldownPercent(snapshot.leftCooldown, stats.leftCooldown) * 100}%` }} /></div>
          {snapshot.leftCooldown <= 0 && snapshot.leftResource === "energy" && snapshot.player.en < snapshot.leftEnergyCost && (
            <div className="shortage-line">左腕 EN不足</div>
          )}
          {snapshot.leftCooldown <= 0 && snapshot.leftResource === "ballistic" && snapshot.leftAmmo <= 0 && (
            <div className="shortage-line">左腕 弾切れ</div>
          )}
          <div className="cool-row">
            <span>ミサイル</span>
            <b>{snapshot.missileCooldown.toFixed(1)} / EN {snapshot.missileEnergyCost}</b>
          </div>
          <div className="coolbar orange"><span style={{ width: `${cooldownPercent(snapshot.missileCooldown, stats.missileCooldown) * 100}%` }} /></div>
        </div>
      </section>

      <section className="combat-canvas-wrap">
        <canvas ref={canvasRef} width={980} height={570} />
      </section>

      <section className="combat-hud right">
        <div className="panel compact radar-panel">
          <div className="section-title">RADAR</div>
          <div className="radar">
            <span className="radar-player" />
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
