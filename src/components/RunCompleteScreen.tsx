import { getActionLabel, getConditionLabel } from "../data/aiRules";
import { CombatReport } from "../game/combat";
import { AiRule } from "../types";

interface RunCompleteScreenProps {
  report?: CombatReport;
  rulesByUnit: AiRule[][];
  onNewRun: () => void;
}

const topRuleLine = (report: CombatReport | undefined, rules: AiRule[], unitIndex: number): string => {
  const hits = report?.ruleHitsByUnit[unitIndex] ?? {};
  const [ruleId, count] = Object.entries(hits).sort((a, b) => b[1] - a[1])[0] ?? [];
  const rule = rules.find((item) => item.id === ruleId);
  if (!rule || !count) {
    return "戦闘記録なし";
  }
  return `${getConditionLabel(rule.condition)} -> ${getActionLabel(rule.action)} x${count}`;
};

export default function RunCompleteScreen({
  report,
  rulesByUnit,
  onNewRun,
}: RunCompleteScreenProps) {
  const reportUnits = report
    ? report.damageByUnit
        .map((damage, unitIndex) => ({ damage, unitIndex }))
        .filter((unit) => unit.damage > 0 || Object.keys(report.ruleHitsByUnit[unit.unitIndex] ?? {}).length > 0)
    : [];

  return (
    <main className="run-complete-screen">
      <section className="panel run-complete-panel">
        <div className="section-title">RUN COMPLETE</div>
        <h1>全ステージ制圧</h1>
        <p>最終戦を突破しました。戦域ログを確定しました。</p>

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

        <div className="screen-actions">
          <button className="primary" onClick={onNewRun}>NEW RUN</button>
        </div>
      </section>
    </main>
  );
}
