import { frameChoicesForUnit } from "../data/frames";
import { BaseFrameId } from "../types";
import frameLineupUrl from "../assets/base-frame-lineup.png";

interface FrameSelectScreenProps {
  unitIndex: number;
  stage: number;
  lastOutcome?: string;
  onSelectFrame: (frameId: BaseFrameId) => void;
}

export default function FrameSelectScreen({
  unitIndex,
  stage,
  lastOutcome,
  onSelectFrame,
}: FrameSelectScreenProps) {
  const choices = frameChoicesForUnit(unitIndex);
  const isFirstUnit = unitIndex === 0;

  return (
    <main className="frame-select-screen">
      <section className="frame-hero">
        <img src={frameLineupUrl} alt="" />
        <div className="frame-hero-overlay">
          <div className="section-title">{isFirstUnit ? "INITIAL FRAME" : `STAGE ${stage} REINFORCEMENT`}</div>
          <h1>{isFirstUnit ? "UNIT 1 ベース機体選択" : `UNIT ${unitIndex + 1} 加入`}</h1>
          {lastOutcome && <div className="outcome-line">{lastOutcome}</div>}
        </div>
      </section>

      <section className="frame-card-grid">
        {choices.map((frame) => (
          <button
            key={frame.id}
            className={`frame-card accent-${frame.accent}`}
            onClick={() => onSelectFrame(frame.id)}
          >
            <span className="frame-type">{frame.typeLabel}</span>
            <strong>{frame.name}</strong>
            <small>{frame.role}</small>
            <p>{frame.description}</p>
            <dl>
              <div>
                <dt>HP</dt>
                <dd>{frame.stats.hp}</dd>
              </div>
              <div>
                <dt>SPD</dt>
                <dd>{frame.stats.moveSpeed}</dd>
              </div>
              <div>
                <dt>DEF</dt>
                <dd>{frame.stats.defense}</dd>
              </div>
              <div>
                <dt>LOAD</dt>
                <dd>{frame.stats.loadLimit}</dd>
              </div>
            </dl>
          </button>
        ))}
      </section>

    </main>
  );
}
