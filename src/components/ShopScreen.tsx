import { ShopOffer } from "../data/rewards";
import { StagePlan, worldForStage, worldStageForStage } from "../data/stages";
import mapEventsUrl from "../assets/map-events.png";

interface ShopScreenProps {
  stage: number;
  plan: StagePlan;
  credits: number;
  shopOffers: ShopOffer[];
  onBuyShopOffer: (offer: ShopOffer) => void;
  onLeaveShop: () => void;
  onBackMap: () => void;
}

const eventImageStyle = {
  backgroundImage: `url(${mapEventsUrl})`,
  backgroundPosition: "100% 50%",
};

export default function ShopScreen({
  stage,
  plan,
  credits,
  shopOffers,
  onBuyShopOffer,
  onLeaveShop,
  onBackMap,
}: ShopScreenProps) {
  return (
    <main className="shop-screen focused-mode-screen">
      <section className="panel focused-mode-panel shop-panel">
        <div className="section-title">SHOP</div>
        <div className="focused-mode-hero">
          <div
            className="map-event-visual"
            style={eventImageStyle}
            role="img"
            aria-label="商人の武器市場"
          />
          <div>
            <span>WORLD {worldForStage(stage)} / {worldStageForStage(stage)}</span>
            <h1>{plan.threat}</h1>
            <p>{plan.brief}</p>
            <strong>{credits} CR</strong>
          </div>
        </div>
        <div className="shop-offer-list focused-shop-list">
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
              <small>{offer.description}</small>
            </button>
          ))}
        </div>
        <div className="screen-actions">
          <button onClick={onBackMap}>MAPへ戻る</button>
          <button className="primary" onClick={onLeaveShop}>通過</button>
        </div>
      </section>
    </main>
  );
}
