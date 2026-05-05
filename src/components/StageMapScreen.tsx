import { getStagePlan, stagePlans } from "../data/stages";

interface StageMapScreenProps {
  stage: number;
  lastOutcome?: string;
  unlockedUnitCount: number;
  onOpenAssemble: () => void;
  onOpenAi: () => void;
  onStartCombat: () => void;
}

export default function StageMapScreen({
  stage,
  lastOutcome,
  unlockedUnitCount,
  onOpenAssemble,
  onOpenAi,
  onStartCombat,
}: StageMapScreenProps) {
  const currentPlan = getStagePlan(stage);

  return (
    <main className="map-screen">
      <section className="panel map-panel">
        <div className="section-title">RUN MAP</div>
        <div className="map-track">
          {stagePlans.map((plan) => {
            return (
              <div
                key={plan.stage}
                className={`map-node ${plan.type} ${plan.stage < stage ? "cleared" : ""} ${plan.stage === stage ? "current" : ""}`}
              >
                <span>{plan.stage}</span>
                <small>{plan.label}</small>
              </div>
            );
          })}
        </div>
        {lastOutcome && <div className="outcome-line">{lastOutcome}</div>}
      </section>

      <section className="panel run-panel">
        <div className="section-title">RUN INFO</div>
        <dl className="status-list">
          <div>
            <dt>ラン総数</dt>
            <dd>7</dd>
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
            <dt>戦闘種別</dt>
            <dd>{currentPlan.label}</dd>
          </div>
        </dl>
        <div className="legend">
          <span className="legend-normal">通常戦闘</span>
          <span className="legend-elite">エリート戦</span>
          <span className="legend-boss">ボス戦</span>
        </div>
        <div className="screen-actions">
          <button onClick={onOpenAssemble}>ASSEMBLE</button>
          <button onClick={onOpenAi}>AI EDIT</button>
          <button className="primary" onClick={onStartCombat}>出撃</button>
        </div>
      </section>
    </main>
  );
}
