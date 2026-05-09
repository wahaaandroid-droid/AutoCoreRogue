import { ShopOffer } from "../data/rewards";
import {
  STAGES_PER_WORLD,
  TOTAL_STAGES,
  StagePlan,
  worldForStage,
  worldStageForStage,
} from "../data/stages";
import { DerivedStats } from "../types";
import mapEventsUrl from "../assets/map-events.png";

interface StageMapScreenProps {
  stage: number;
  selectedNodeId: string;
  stageChoices: StagePlan[];
  lastOutcome?: string;
  unlockedUnitCount: number;
  unitHpByUnit: number[];
  statsByUnit: DerivedStats[];
  credits: number;
  shopOffers: ShopOffer[];
  canStartStage: boolean;
  onSelectStageNode: (nodeId: string) => void;
  onRest: () => void;
  onBuyShopOffer: (offer: ShopOffer) => void;
  onLeaveShop: () => void;
  onOpenAssemble: () => void;
  onOpenAi: () => void;
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
  normal: "出撃",
  elite: "エリート戦へ",
  rest: "休憩する",
  shop: "商人を見る",
  boss: "ボス戦へ",
};

const worldStageNumbers = (world: number): number[] =>
  Array.from({ length: STAGES_PER_WORLD }, (_, index) => (world - 1) * STAGES_PER_WORLD + index + 1);

const eventImageStyle = (type: "rest" | "shop") => ({
  backgroundImage: `url(${mapEventsUrl})`,
  backgroundPosition: type === "rest" ? "0% 50%" : "100% 50%",
});

export default function StageMapScreen({
  stage,
  selectedNodeId,
  stageChoices,
  lastOutcome,
  unlockedUnitCount,
  unitHpByUnit,
  statsByUnit,
  credits,
  shopOffers,
  canStartStage,
  onSelectStageNode,
  onRest,
  onBuyShopOffer,
  onLeaveShop,
  onOpenAssemble,
  onOpenAi,
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

        {currentPlan.type === "rest" && (
          <div className="map-event-panel rest-event">
            <div
              className="map-event-visual"
              style={eventImageStyle("rest")}
              role="img"
              aria-label="休憩地点の修理ベイ"
            />
            <strong>休憩地点</strong>
            <small>全配備UNITのHPを最大値の50%ぶん回復します。</small>
            <button className="primary" onClick={onRest}>休憩する</button>
          </div>
        )}

        {currentPlan.type === "shop" && (
          <div className="map-event-panel shop-event">
            <div
              className="map-event-visual"
              style={eventImageStyle("shop")}
              role="img"
              aria-label="商人の武器市場"
            />
            <strong>商人</strong>
            <small>{credits} CR</small>
            <div className="shop-offer-list">
              {shopOffers.map((offer) => (
                <button
                  key={offer.id}
                  className={`shop-offer accent-${offer.accent}`}
                  onClick={() => onBuyShopOffer(offer)}
                  disabled={credits < offer.cost}
                >
                  <span>{offer.cost} CR</span>
                  <strong>{offer.title}</strong>
                  <small>{offer.subtitle}</small>
                </button>
              ))}
            </div>
            <button onClick={onLeaveShop}>通過</button>
          </div>
        )}

        <div className="legend">
          <span className="legend-normal">通常戦闘</span>
          <span className="legend-elite">エリート戦</span>
          <span className="legend-rest">休憩</span>
          <span className="legend-shop">商人</span>
          <span className="legend-boss">ボス戦</span>
        </div>
        <div className="screen-actions">
          <button onClick={onOpenAssemble}>ASSEMBLE</button>
          <button onClick={onOpenAi}>AI EDIT</button>
          <button className="primary" onClick={onStartCombat} disabled={!canStartStage}>
            {actionText[currentPlan.type]}
          </button>
        </div>
      </section>
    </main>
  );
}
