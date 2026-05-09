import { StagePlan, worldForStage, worldStageForStage } from "../data/stages";
import { DerivedStats } from "../types";
import mapEventsUrl from "../assets/map-events.png";

interface RestScreenProps {
  stage: number;
  plan: StagePlan;
  unlockedUnitCount: number;
  unitHpByUnit: number[];
  statsByUnit: DerivedStats[];
  healPercent: number;
  onRest: () => void;
  onBackMap: () => void;
}

const eventImageStyle = {
  backgroundImage: `url(${mapEventsUrl})`,
  backgroundPosition: "0% 50%",
};

export default function RestScreen({
  stage,
  plan,
  unlockedUnitCount,
  unitHpByUnit,
  statsByUnit,
  healPercent,
  onRest,
  onBackMap,
}: RestScreenProps) {
  return (
    <main className="rest-screen focused-mode-screen">
      <section className="panel focused-mode-panel rest-panel">
        <div className="section-title">REST</div>
        <div className="focused-mode-hero">
          <div
            className="map-event-visual"
            style={eventImageStyle}
            role="img"
            aria-label="休憩地点の修理ベイ"
          />
          <div>
            <span>WORLD {worldForStage(stage)} / {worldStageForStage(stage)}</span>
            <h1>{plan.threat}</h1>
            <p>{plan.brief}</p>
            <strong>全配備UNITのHPを{Math.round(healPercent * 100)}%回復</strong>
          </div>
        </div>
        <div className="rest-unit-list">
          {statsByUnit.slice(0, unlockedUnitCount).map((stats, index) => {
            const hp = Math.ceil(Math.min(unitHpByUnit[index] ?? stats.hpMax, stats.hpMax));
            return (
              <div key={index}>
                <span>UNIT {index + 1}</span>
                <strong>{hp} / {stats.hpMax}</strong>
              </div>
            );
          })}
        </div>
        <div className="screen-actions">
          <button onClick={onBackMap}>MAPへ戻る</button>
          <button className="primary" onClick={onRest}>休憩する</button>
        </div>
      </section>
    </main>
  );
}
