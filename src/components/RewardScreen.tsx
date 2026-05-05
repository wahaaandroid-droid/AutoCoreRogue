import { getPartById } from "../data/parts";
import { RewardOption } from "../data/rewards";

interface RewardScreenProps {
  stage: number;
  rewards: RewardOption[];
  onPickReward: (reward: RewardOption) => void;
}

const rewardGlyph = (reward: RewardOption): string => {
  if (reward.payload.kind === "part") {
    return getPartById(reward.payload.partId).slot;
  }
  if (reward.payload.kind === "aiSlot") {
    return "AI";
  }
  if (reward.payload.kind === "cooldown") {
    return "CD";
  }
  return reward.payload.stat.toUpperCase();
};

export default function RewardScreen({ stage, rewards, onPickReward }: RewardScreenProps) {
  return (
    <main className="reward-screen">
      <section className="panel reward-panel">
        <div className="section-title">STAGE {stage} CLEAR</div>
        <h1>報酬選択</h1>
        <div className="reward-grid">
          {rewards.map((reward) => (
            <button
              key={reward.id}
              className={`reward-card accent-${reward.accent}`}
              onClick={() => onPickReward(reward)}
            >
              <span className="reward-glyph">{rewardGlyph(reward)}</span>
              <strong>{reward.title}</strong>
              <small>{reward.subtitle}</small>
              <p>{reward.description}</p>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
