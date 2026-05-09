import {
  getRelicDefinition,
  getRelicEffectText,
  getRelicLevel,
} from "../data/relics";
import { MetaSaveState, PendingRelicReward, RelicRewardOption } from "../types";

interface RelicRewardScreenProps {
  pending: PendingRelicReward;
  metaState: MetaSaveState;
  onPickRelic: (option: RelicRewardOption) => void;
  onSkip: () => void;
}

const rewardTitle = (pending: PendingRelicReward): string => {
  if (pending.reason === "clear" && pending.phase === "clear") {
    return "全クリア認証";
  }
  return pending.reason === "clear" ? "通常遺物選択" : "撤退遺物選択";
};

export default function RelicRewardScreen({
  pending,
  metaState,
  onPickRelic,
  onSkip,
}: RelicRewardScreenProps) {
  return (
    <main className="relic-reward-screen focused-mode-screen">
      <section className="panel focused-mode-panel relic-panel">
        <div className="section-title">RELIC REWARD</div>
        <div className="relic-reward-head">
          <div>
            <h1>{rewardTitle(pending)}</h1>
            <p>
              到達 WORLD {pending.reachedWorld} / STAGE {pending.reachedStage}
              {"  "}CLEAR {pending.clearedStages}
            </p>
          </div>
          <strong>{pending.picksRemaining} PICK</strong>
        </div>

        <div className="relic-grid">
          {pending.options.map((option) => {
            const definition = getRelicDefinition(option.relicId);
            const currentLevel = getRelicLevel(metaState, option.relicId);
            const capped = option.dust > 0;
            return (
              <button
                key={option.id}
                className={`relic-card relic-${definition.rarity}`}
                onClick={() => onPickRelic(option)}
              >
                <span>{definition.rarity.toUpperCase()}</span>
                <strong>{definition.name}</strong>
                <small>
                  {capped
                    ? "MAX -> 遺物片 +1"
                    : currentLevel > 0
                      ? `Lv${currentLevel} -> Lv${option.nextLevel}`
                      : "NEW"}
                </small>
                <p>{getRelicEffectText(definition, Math.max(option.nextLevel, currentLevel))}</p>
              </button>
            );
          })}
        </div>

        {pending.options.length === 0 && (
          <div className="warning-line">獲得できる遺物候補がありません。</div>
        )}

        <div className="screen-actions">
          <button onClick={onSkip}>新ランへ戻る</button>
        </div>
      </section>
    </main>
  );
}
