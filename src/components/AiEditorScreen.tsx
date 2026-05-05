import {
  actionDefinitions,
  conditionDefinitions,
  ensureAiRuleSlots,
  getActionLabel,
  getConditionLabel,
  getTargetPriorityLabel,
  targetPriorityDefinitions,
} from "../data/aiRules";
import { AiActionId, AiConditionId, AiRule, DerivedStats, TargetPriorityId } from "../types";

interface AiEditorScreenProps {
  rules: AiRule[];
  slotCount: number;
  activeUnitIndex: number;
  statsByUnit: DerivedStats[];
  targetPriority: TargetPriorityId;
  onSelectUnit: (index: number) => void;
  onChangeRules: (rules: AiRule[]) => void;
  onChangeTargetPriority: (priority: TargetPriorityId) => void;
  onOpenAssemble: () => void;
  onOpenMap: () => void;
  onStartCombat: () => void;
}

export default function AiEditorScreen({
  rules,
  slotCount,
  activeUnitIndex,
  statsByUnit,
  targetPriority,
  onSelectUnit,
  onChangeRules,
  onChangeTargetPriority,
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
        <div className="unit-switcher compact-switcher">
          {statsByUnit.map((unitStats, index) => (
            <button
              key={index}
              className={activeUnitIndex === index ? "active" : ""}
              onClick={() => onSelectUnit(index)}
            >
              <strong>UNIT {index + 1}</strong>
              <small>SPD {unitStats.moveSpeed}</small>
            </button>
          ))}
        </div>
        <div className="target-priority-panel">
          <div>
            <span>ターゲット優先</span>
            <strong>{getTargetPriorityLabel(targetPriority)}</strong>
          </div>
          <select
            value={targetPriority}
            onChange={(event) => onChangeTargetPriority(event.target.value as TargetPriorityId)}
          >
            {targetPriorityDefinitions.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.label}
              </option>
            ))}
          </select>
          <small>
            {targetPriorityDefinitions.find((priority) => priority.id === targetPriority)?.description}
          </small>
        </div>
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
          <div className="ai-flow-card target-card">
            <span className="priority-dot">T</span>
            <span>ターゲット</span>
            <span className="flow-arrow">LOCK</span>
            <strong>{getTargetPriorityLabel(targetPriority)}</strong>
          </div>
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
