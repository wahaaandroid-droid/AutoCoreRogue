import { getActionLabel, getConditionLabel } from "../data/aiRules";
import { getPartById, getSlotLabel } from "../data/parts";
import { CombatReport } from "../game/combat";
import { RewardOption } from "../data/rewards";
import { AiRule } from "../types";

interface RewardScreenProps {
  stage: number;
  rewards: RewardOption[];
  report?: CombatReport;
  rulesByUnit: AiRule[][];
  onPickReward: (reward: RewardOption) => void;
}

const rewardGlyph = (reward: RewardOption): string => {
  if (reward.payload.kind === "part") {
    return getSlotLabel(getPartById(reward.payload.partId).slot);
  }
  if (reward.payload.kind === "aiSlot") {
    return "AI";
  }
  if (reward.payload.kind === "cooldown") {
    return "CD";
  }
  if (reward.payload.kind === "repairKit") {
    return "KIT";
  }
  return reward.payload.stat.toUpperCase();
};

const topRuleLine = (report: CombatReport | undefined, rules: AiRule[], unitIndex: number): string => {
  const hits = report?.ruleHitsByUnit[unitIndex] ?? {};
  const [ruleId, count] = Object.entries(hits).sort((a, b) => b[1] - a[1])[0] ?? [];
  const rule = rules.find((item) => item.id === ruleId);
  if (!rule || !count) {
    return "AI記録なし";
  }
  return `${getConditionLabel(rule.condition)} -> ${getActionLabel(rule.action)} x${count}`;
};

export default function RewardScreen({ stage, rewards, report, rulesByUnit, onPickReward }: RewardScreenProps) {
  const reportUnits = report
    ? report.damageByUnit
        .map((damage, unitIndex) => ({ damage, unitIndex }))
        .filter((unit) => unit.damage > 0 || Object.keys(report.ruleHitsByUnit[unit.unitIndex] ?? {}).length > 0)
    : [];

  return (
    <main className="reward-screen">
      <section className="panel reward-panel">
        <div className="section-title">STAGE {stage} CLEAR</div>
        <h1>報酬選択</h1>
        {reportUnits.length > 0 && (
          <div className="combat-report">
            {reportUnits.map(({ damage, unitIndex }) => (
              <div key={unitIndex}>
                <strong>UNIT {unitIndex + 1}</strong>
                <span>DMG {Math.round(damage).toLocaleString()}</span>
                <small>{topRuleLine(report, rulesByUnit[unitIndex] ?? [], unitIndex)}</small>
              </div>
            ))}
          </div>
        )}
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
