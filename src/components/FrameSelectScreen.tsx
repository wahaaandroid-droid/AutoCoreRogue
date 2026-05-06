import { frameChoicesForUnit } from "../data/frames";
import { BaseFrameId } from "../types";
import frameLineupUrl from "../assets/base-frame-lineup.png";
import playerDirectionSpritesUrl from "../assets/player-direction-sprites.png";

interface FrameSelectScreenProps {
  unitIndex: number;
  stage: number;
  lastOutcome?: string;
  onSelectFrame: (frameId: BaseFrameId) => void;
}

const FRAME_PREVIEW_COLUMN = 2;

const framePreviewRow = (frameId: BaseFrameId): number => {
  switch (frameId) {
    case "light":
      return 1;
    case "heavy":
      return 2;
    case "quad":
      return 3;
    case "tank":
      return 4;
    case "medium":
    default:
      return 0;
  }
};

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

      {isFirstUnit && (
        <section className="frame-brief-strip">
          <div>
            <span>CORE LOOP</span>
            <strong>{"組む -> AIを決める -> 自動戦闘"}</strong>
          </div>
          <div>
            <span>BUILD</span>
            <strong>重量は速度とクールダウンに影響</strong>
          </div>
          <div>
            <span>RUN</span>
            <strong>STAGE 2 / 5 で小隊が拡張</strong>
          </div>
        </section>
      )}

      <section className="frame-card-grid">
        {choices.map((frame) => (
          <button
            key={frame.id}
            className={`frame-card accent-${frame.accent}`}
            onClick={() => onSelectFrame(frame.id)}
          >
            <div className="frame-card-head">
              <span className="frame-type">{frame.typeLabel}</span>
              <div
                className={`frame-card-image frame-${frame.id}`}
                style={{
                  backgroundImage: `url(${playerDirectionSpritesUrl})`,
                  backgroundPosition: `${(FRAME_PREVIEW_COLUMN / 3) * 100}% ${(framePreviewRow(frame.id) / 4) * 100}%`,
                }}
                role="img"
                aria-label={`${frame.name} 機体画像`}
              />
            </div>
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
