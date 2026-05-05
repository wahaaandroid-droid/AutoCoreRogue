import {
  actionDefinitions,
  conditionDefinitions,
  ensureAiRuleSlots,
  getActionLabel,
  getConditionLabel,
} from "../data/aiRules";
import { AiActionId, AiConditionId, AiRule } from "../types";

interface AiEditorScreenProps {
  rules: AiRule[];
  slotCount: number;
  onChangeRules: (rules: AiRule[]) => void;
  onOpenAssemble: () => void;
  onOpenMap: () => void;
  onStartCombat: () => void;
}

export default function AiEditorScreen({
  rules,
  slotCount,
  onChangeRules,
  onOpenAssemble,
  onOpenMap,
  onStartCombat,
}: AiEditorScreenProps) {
  const normalizedRules = ensureAiRuleSlots(rules, slotCount);

  const updateRule = (index: number, patch: Partial<AiRule>) => {
    onChangeRules(
      normalizedRules.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    );
  };

  return (
    <main className="ai-screen">
      <section className="panel ai-table-panel">
        <div className="section-title">AI LOGIC</div>
        <div className="ai-table">
          <div className="ai-row ai-head">
            <span>優先度</span>
            <span>条件 IF</span>
            <span>行動 THEN</span>
            <span>ON</span>
          </div>
          {normalizedRules.map((rule, index) => (
            <div className="ai-row" key={rule.id}>
              <strong>{index + 1}</strong>
              <select
                value={rule.condition}
                onChange={(event) =>
                  updateRule(index, { condition: event.target.value as AiConditionId })
                }
              >
                {conditionDefinitions.map((condition) => (
                  <option key={condition.id} value={condition.id}>
                    {condition.label}
                  </option>
                ))}
              </select>
              <select
                value={rule.action}
                onChange={(event) => updateRule(index, { action: event.target.value as AiActionId })}
              >
                {actionDefinitions.map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.label}
                  </option>
                ))}
              </select>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => updateRule(index, { enabled: event.target.checked })}
                />
                <span />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="panel ai-flow-panel">
        <div className="section-title">PRIORITY STACK</div>
        <div className="ai-flow-list">
          {normalizedRules.map((rule, index) => (
            <div className={`ai-flow-card ${rule.enabled ? "" : "disabled"}`} key={rule.id}>
              <span className="priority-dot">{index + 1}</span>
              <span>{getConditionLabel(rule.condition)}</span>
              <span className="flow-arrow">THEN</span>
              <strong>{getActionLabel(rule.action)}</strong>
            </div>
          ))}
        </div>
        <div className="screen-actions">
          <button onClick={onOpenMap}>MAP</button>
          <button onClick={onOpenAssemble}>ASSEMBLE</button>
          <button className="primary" onClick={onStartCombat}>戦闘開始</button>
        </div>
      </section>
    </main>
  );
}
