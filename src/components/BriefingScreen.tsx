import { getTargetPriorityLabel } from "../data/aiRules";
import { getBaseFrameById } from "../data/frames";
import {
  CombatStageType,
  StagePlan,
  worldForStage,
  worldStageForStage,
} from "../data/stages";
import { DerivedStats, TargetPriorityId } from "../types";
import playerDirectionSpritesUrl from "../assets/player-direction-sprites.png";

interface BriefingScreenProps {
  stage: number;
  plan: StagePlan;
  stageType: CombatStageType;
  statsByUnit: DerivedStats[];
  unitHpByUnit: number[];
  sortieEnabled: boolean[];
  unlockedUnitCount: number;
  repairKitStock: number;
  targetPrioritiesByUnit: TargetPriorityId[];
  canStartCombat: boolean;
  lastOutcome?: string;
  onOpenMap: () => void;
  onOpenMaintenance: () => void;
  onRecommendedPrep: () => void;
  onQuickRepair: (unitIndex: number) => void;
  onStartCombat: () => void;
}

const FRAME_PREVIEW_COLUMN = 1;

const framePreviewRow = (frameId: DerivedStats["frameId"]): number => {
  switch (frameId) {
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

const typeText: Record<CombatStageType, string> = {
  normal: "通常戦闘",
  elite: "エリート",
  boss: "ボス",
};

const roleForStats = (stats: DerivedStats): string => {
  const hasWeapon = (kind: string): boolean => stats.weapons.some((weapon) => weapon.weaponKind === kind);
  const hasExplosive = stats.weapons.some((weapon) =>
    weapon.weaponKind === "rocket" || weapon.weaponKind === "grenade" || weapon.blastRadius > 0,
  );
  const longestRange = Math.max(...stats.weapons.map((weapon) => weapon.range), stats.rightRange, stats.leftRange);

  if (stats.canGuard && stats.defense >= 150) {
    return "前衛";
  }
  if (hasExplosive) {
    return "爆撃";
  }
  if (hasWeapon("missile") || longestRange >= 430) {
    return "支援";
  }
  if (hasWeapon("machineGun") || hasWeapon("pulse")) {
    return "制圧";
  }
  if (hasWeapon("blade")) {
    return "近接";
  }
  return "火力";
};

const issueForUnit = (
  stats: DerivedStats,
  hp: number,
  sortieEnabled: boolean,
  repairKitStock: number,
): { label: string; tone: "ok" | "warn" | "danger" } => {
  const hpRatio = stats.hpMax > 0 ? hp / stats.hpMax : 0;

  if (hp <= 0) {
    return { label: repairKitStock > 0 ? "修理可能" : "大破", tone: "danger" };
  }
  if (hpRatio <= 0.45) {
    return { label: repairKitStock > 0 ? "修理推奨" : "損耗大", tone: "warn" };
  }
  if (stats.overloadRatio > 0) {
    return { label: "積載超過", tone: "warn" };
  }
  if (!sortieEnabled) {
    return { label: "待機中", tone: "warn" };
  }
  return { label: "戦闘可", tone: "ok" };
};

const lowestHpRepairCandidate = (
  statsByUnit: DerivedStats[],
  unitHpByUnit: number[],
  unlockedUnitCount: number,
): number => {
  let candidate = -1;
  let lowestRatio = 1;

  statsByUnit.slice(0, unlockedUnitCount).forEach((stats, index) => {
    const hp = Math.ceil(Math.min(unitHpByUnit[index] ?? stats.hpMax, stats.hpMax));
    const ratio = stats.hpMax > 0 ? hp / stats.hpMax : 0;
    if (hp < stats.hpMax && ratio <= lowestRatio) {
      candidate = index;
      lowestRatio = ratio;
    }
  });

  return candidate;
};

export default function BriefingScreen({
  stage,
  plan,
  stageType,
  statsByUnit,
  unitHpByUnit,
  sortieEnabled,
  unlockedUnitCount,
  repairKitStock,
  targetPrioritiesByUnit,
  canStartCombat,
  lastOutcome,
  onOpenMap,
  onOpenMaintenance,
  onRecommendedPrep,
  onQuickRepair,
  onStartCombat,
}: BriefingScreenProps) {
  const world = worldForStage(stage);
  const worldStage = worldStageForStage(stage);
  const units = statsByUnit.slice(0, unlockedUnitCount);
  const repairCandidate = repairKitStock > 0
    ? lowestHpRepairCandidate(statsByUnit, unitHpByUnit, unlockedUnitCount)
    : -1;
  const activeUnits = units.filter((stats, index) =>
    (sortieEnabled[index] ?? false) && (unitHpByUnit[index] ?? stats.hpMax) > 0,
  ).length;
  const warningCount = units.filter((stats, index) => {
    const hp = Math.ceil(Math.min(unitHpByUnit[index] ?? stats.hpMax, stats.hpMax));
    return issueForUnit(stats, hp, sortieEnabled[index] ?? false, repairKitStock).tone !== "ok";
  }).length;
  const recommendedLabel = !canStartCombat
    ? "おすすめ調整"
    : repairCandidate >= 0
      ? `UNIT ${repairCandidate + 1} 修理`
      : warningCount > 0
        ? "おすすめ調整"
        : "準備完了";

  return (
    <main className="briefing-screen">
      <section className="panel briefing-mission-panel">
        <div className="section-title">READY</div>
        <div className={`briefing-threat briefing-${stageType}`}>
          <span>{typeText[stageType]}</span>
          <strong>{plan.threat}</strong>
          <small>WORLD {world} / {worldStage}</small>
        </div>
        <div className="briefing-focus">
          <span>FOCUS</span>
          <strong>{plan.focus}</strong>
          <small>{plan.brief}</small>
        </div>
        <div className="briefing-readout-grid">
          <div>
            <span>出撃</span>
            <strong>{activeUnits} / {unlockedUnitCount}</strong>
          </div>
          <div>
            <span>リペア</span>
            <strong>{repairKitStock}</strong>
          </div>
          <div>
            <span>警告</span>
            <strong>{warningCount}</strong>
          </div>
        </div>
        {lastOutcome && <div className="outcome-line compact-outcome">{lastOutcome}</div>}
      </section>

      <section className="panel briefing-squad-panel">
        <div className="section-title">SQUAD</div>
        <div className="briefing-unit-list">
          {units.map((stats, index) => {
            const hp = Math.ceil(Math.min(unitHpByUnit[index] ?? stats.hpMax, stats.hpMax));
            const issue = issueForUnit(stats, hp, sortieEnabled[index] ?? false, repairKitStock);
            const frame = getBaseFrameById(stats.frameId);
            const framePreviewStyle = {
              backgroundImage: `url(${playerDirectionSpritesUrl})`,
              backgroundPosition: `${(FRAME_PREVIEW_COLUMN / 3) * 100}% ${(framePreviewRow(stats.frameId) / 4) * 100}%`,
            };

            return (
              <div className={`briefing-unit-card issue-${issue.tone}`} key={index}>
                <div
                  className={`frame-preview-image frame-${stats.frameId}`}
                  style={framePreviewStyle}
                  role="img"
                  aria-label={`${frame.name} 機体画像`}
                />
                <div>
                  <span>UNIT {index + 1} / {roleForStats(stats)}</span>
                  <strong>{frame.typeLabel}</strong>
                  <small>方針 {getTargetPriorityLabel(targetPrioritiesByUnit[index] ?? "nearest")}</small>
                  <div className="briefing-hp-bar">
                    <span style={{ width: `${Math.max(0, Math.min(100, (hp / stats.hpMax) * 100))}%` }} />
                  </div>
                </div>
                <div className="briefing-unit-state">
                  <strong>{hp} / {stats.hpMax}</strong>
                  <small>{issue.label}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel briefing-action-bar">
        <button onClick={onOpenMap}>MAP</button>
        <button onClick={onRecommendedPrep}>{recommendedLabel}</button>
        <button onClick={() => repairCandidate >= 0 && onQuickRepair(repairCandidate)} disabled={repairCandidate < 0}>
          修理
        </button>
        <button onClick={onOpenMaintenance}>整備室</button>
        <button className="primary" onClick={onStartCombat} disabled={!canStartCombat}>
          出撃
        </button>
      </section>
    </main>
  );
}
