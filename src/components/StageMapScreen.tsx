interface StageMapScreenProps {
  stage: number;
  lastOutcome?: string;
  onOpenAssemble: () => void;
  onOpenAi: () => void;
  onStartCombat: () => void;
}

const stageType = (stage: number): "normal" | "elite" | "boss" => {
  if (stage === 7) {
    return "boss";
  }
  if (stage === 5) {
    return "elite";
  }
  return "normal";
};

export default function StageMapScreen({
  stage,
  lastOutcome,
  onOpenAssemble,
  onOpenAi,
  onStartCombat,
}: StageMapScreenProps) {
  const nodes = Array.from({ length: 7 }, (_, index) => index + 1);

  return (
    <main className="map-screen">
      <section className="panel map-panel">
        <div className="section-title">RUN MAP</div>
        <div className="map-track">
          {nodes.map((node) => {
            const type = stageType(node);
            return (
              <div
                key={node}
                className={`map-node ${type} ${node < stage ? "cleared" : ""} ${node === stage ? "current" : ""}`}
              >
                <span>{node}</span>
                <small>{type === "boss" ? "BOSS" : type === "elite" ? "ELITE" : "BATTLE"}</small>
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
            <dt>戦闘種別</dt>
            <dd>{stageType(stage).toUpperCase()}</dd>
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
