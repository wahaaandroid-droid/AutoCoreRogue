import {
  STAGES_PER_WORLD,
  TOTAL_STAGES,
  StagePlan,
  worldForStage,
  worldStageForStage,
} from "../data/stages";
import { DerivedStats } from "../types";

interface StageMapScreenProps {
  stage: number;
  selectedNodeId: string;
  stageChoices: StagePlan[];
  lastOutcome?: string;
  unlockedUnitCount: number;
  unitHpByUnit: number[];
  statsByUnit: DerivedStats[];
  credits: number;
  canStartStage: boolean;
  onSelectStageNode: (nodeId: string) => void;
  onOpenAssemble: () => void;
  onStartCombat: () => void;
}

const typeText: Record<StagePlan["type"], string> = {
  normal: "通常戦闘",
  elite: "エリート",
  rest: "休憩",
  shop: "商人",
  boss: "ボス",
};

const actionText: Record<StagePlan["type"], string> = {
  normal: "準備へ",
  elite: "準備へ",
  rest: "休憩する",
  shop: "商人を見る",
  boss: "準備へ",
};

const worldStageNumbers = (world: number): number[] =>
  Array.from({ length: STAGES_PER_WORLD }, (_, index) => (world - 1) * STAGES_PER_WORLD + index + 1);

export default function StageMapScreen({
  stage,
  selectedNodeId,
  stageChoices,
  lastOutcome,
  unlockedUnitCount,
  unitHpByUnit,
  statsByUnit,
  credits,
  canStartStage,
  onSelectStageNode,
  onOpenAssemble,
  onStartCombat,
}: StageMapScreenProps) {
  const currentPlan = stageChoices.find((choice) => choice.id === selectedNodeId) ?? stageChoices[0];
  const world = worldForStage(stage);
  const worldStage = worldStageForStage(stage);
  const currentUnitHp = statsByUnit
    .slice(0, unlockedUnitCount)
    .map((stats, index) => `${Math.ceil(Math.min(unitHpByUnit[index] ?? stats.hpMax, stats.hpMax))}/${stats.hpMax}`)
    .join("  ");

  return (
    <main className="map-screen">
      <section className="panel map-panel">
        <div className="section-title">RUN MAP</div>
        <div className="world-map-grid">
          {[1, 2, 3].map((mapWorld) => (
            <div className={`world-row ${mapWorld === world ? "active" : ""}`} key={mapWorld}>
              <strong>WORLD {mapWorld}</strong>
              <div className="world-node-row">
                {worldStageNumbers(mapWorld).map((stageNumber) => {
                  const nodeType =
                    stageNumber === stage
                      ? currentPlan.type
                      : worldStageForStage(stageNumber) === 7
                        ? "boss"
                        : "normal";
                  return (
                    <span
                      key={stageNumber}
                      className={`map-node ${nodeType} ${stageNumber < stage ? "cleared" : ""} ${stageNumber === stage ? "current" : ""}`}
                    >
                      <b>{worldStageForStage(stageNumber)}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="route-choice-grid">
          {stageChoices.map((choice) => (
            <button
              key={choice.id}
              className={`route-choice ${choice.type} ${choice.id === currentPlan.id ? "active" : ""}`}
              onClick={() => onSelectStageNode(choice.id)}
            >
              <span>{typeText[choice.type]}</span>
              <strong>{choice.threat}</strong>
              <small>{choice.brief}</small>
            </button>
          ))}
        </div>

        <div className="stage-brief-grid">
          <div>
            <span>THREAT</span>
            <strong>{currentPlan.threat}</strong>
            <small>{currentPlan.brief}</small>
          </div>
          <div>
            <span>FOCUS</span>
            <strong>{currentPlan.focus}</strong>
            <small>WORLD {world} / {worldStage} - {typeText[currentPlan.type]}</small>
          </div>
        </div>
        {lastOutcome && <div className="outcome-line">{lastOutcome}</div>}
      </section>

      <section className="panel run-panel">
        <div className="section-title">RUN INFO</div>
        <dl className="status-list">
          <div>
            <dt>ラン総数</dt>
            <dd>{TOTAL_STAGES}</dd>
          </div>
          <div>
            <dt>現在</dt>
            <dd>STAGE {stage}</dd>
          </div>
          <div>
            <dt>小隊</dt>
            <dd>{unlockedUnitCount} / 3</dd>
          </div>
          <div>
            <dt>資金</dt>
            <dd>{credits} CR</dd>
          </div>
          <div>
            <dt>HP</dt>
            <dd>{currentUnitHp || "-"}</dd>
          </div>
        </dl>

        <div className="legend">
          <span className="legend-normal">通常戦闘</span>
          <span className="legend-elite">エリート戦</span>
          <span className="legend-rest">休憩</span>
          <span className="legend-shop">商人</span>
          <span className="legend-boss">ボス戦</span>
        </div>
        <div className="screen-actions">
          <button onClick={onOpenAssemble}>整備室</button>
          <button className="primary" onClick={onStartCombat} disabled={!canStartStage}>
            {actionText[currentPlan.type]}
          </button>
        </div>
      </section>
    </main>
  );
}
