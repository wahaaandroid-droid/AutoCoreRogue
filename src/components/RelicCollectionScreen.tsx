import {
  getRelicEffectText,
  getRelicLevel,
  relicDefinitions,
} from "../data/relics";
import { ClearStartBonusChoice, MetaSaveState } from "../types";

interface RelicCollectionScreenProps {
  metaState: MetaSaveState;
  onBack: () => void;
  onChangeClearBonus: (choice: ClearStartBonusChoice) => void;
}

const clearChoices: { id: ClearStartBonusChoice; label: string; description: string }[] = [
  { id: "credits", label: "初期CR", description: "新ランの開幕資金を増やす。" },
  { id: "rewardReroll", label: "再抽選", description: "各ワールドの報酬再抽選を1回増やす。" },
  { id: "shopDiscount", label: "割引", description: "ショップ価格を少し下げる。" },
];

export default function RelicCollectionScreen({
  metaState,
  onBack,
  onChangeClearBonus,
}: RelicCollectionScreenProps) {
  const hasClearKey = getRelicLevel(metaState, "clear-auth-key") > 0;
  const ownedCount = relicDefinitions.filter((definition) => getRelicLevel(metaState, definition.id) > 0).length;

  return (
    <main className="relic-collection-screen focused-mode-screen">
      <section className="panel focused-mode-panel relic-panel">
        <div className="section-title">RELIC COLLECTION</div>
        <div className="relic-reward-head">
          <div>
            <h1>遺物コレクション</h1>
            <p>所持 {ownedCount} / {relicDefinitions.length} ・ 遺物片 {metaState.duplicateDust}</p>
          </div>
          <button onClick={onBack}>戻る</button>
        </div>

        {hasClearKey && (
          <div className="clear-bonus-panel">
            <strong>クリア認証キー 開幕ボーナス</strong>
            <div>
              {clearChoices.map((choice) => (
                <button
                  key={choice.id}
                  className={metaState.clearStartBonusChoice === choice.id ? "active" : ""}
                  onClick={() => onChangeClearBonus(choice.id)}
                >
                  <strong>{choice.label}</strong>
                  <small>{choice.description}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relic-grid collection-grid">
          {relicDefinitions.map((definition) => {
            const level = getRelicLevel(metaState, definition.id);
            return (
              <div
                key={definition.id}
                className={`relic-card relic-${definition.rarity} ${level > 0 ? "" : "locked"}`}
              >
                <span>{definition.rarity.toUpperCase()}</span>
                <strong>{definition.name}</strong>
                <small>{level > 0 ? `Lv${level} / ${definition.maxLevel}` : "LOCKED"}</small>
                <p>{getRelicEffectText(definition, level)}</p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
