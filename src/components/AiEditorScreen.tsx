import { useMemo, useState } from "react";
import {
  actionDefinitions,
  aiPresetDefinitions,
  conditionDefinitions,
  ensureAiRuleSlots,
  getActionLabel,
  getAiPresetDefinition,
  getAvailableActionDefinitions,
  getAvailableConditionDefinitions,
  getAvailableTargetPriorityDefinitions,
  getConditionLabel,
  getTargetPriorityLabel,
  targetPriorityDefinitions,
} from "../data/aiRules";
import { aiUnlockPackages, getAiUnlockState, getLockedAiUnlockPackages, isAiRuleUnlocked } from "../data/aiUnlocks";
import {
  AiActionId,
  AiConditionId,
  AiPresetId,
  AiRule,
  AiUnlockPackageId,
  DerivedStats,
  TargetPriorityId,
} from "../types";

interface AiEditorScreenProps {
  rules: AiRule[];
  slotCount: number;
  activeUnitIndex: number;
  unlockedUnitCount: number;
  statsByUnit: DerivedStats[];
  aiPreset: AiPresetId;
  targetPriority: TargetPriorityId;
  unlockedAiPackageIds: AiUnlockPackageId[];
  onSelectUnit: (index: number) => void;
  onChangeAiPreset: (preset: AiPresetId) => void;
  onChangeRules: (rules: AiRule[]) => void;
  onChangeTargetPriority: (priority: TargetPriorityId) => void;
  onOpenAssemble: () => void;
  onOpenMap: () => void;
  onStartCombat: () => void;
}

type AiView = "rules" | "blueprints" | "unlocks";

const includeCurrentCondition = (
  available: typeof conditionDefinitions,
  condition: AiConditionId,
) =>
  available.some((item) => item.id === condition)
    ? available
    : [
        ...available,
        conditionDefinitions.find((item) => item.id === condition) ?? conditionDefinitions[0],
      ];

const includeCurrentAction = (
  available: typeof actionDefinitions,
  action: AiActionId,
) =>
  available.some((item) => item.id === action)
    ? available
    : [
        ...available,
        actionDefinitions.find((item) => item.id === action) ?? actionDefinitions[0],
      ];

export default function AiEditorScreen({
  rules,
  slotCount,
  activeUnitIndex,
  unlockedUnitCount,
  statsByUnit,
  aiPreset,
  targetPriority,
  unlockedAiPackageIds,
  onSelectUnit,
  onChangeAiPreset,
  onChangeRules,
  onChangeTargetPriority,
  onOpenAssemble,
  onOpenMap,
  onStartCombat,
}: AiEditorScreenProps) {
  const [activeView, setActiveView] = useState<AiView>("rules");
  const unlockState = useMemo(() => getAiUnlockState(unlockedAiPackageIds), [unlockedAiPackageIds]);
  const normalizedRules = ensureAiRuleSlots(rules, slotCount);
  const presetDefinition = getAiPresetDefinition(aiPreset);
  const availableConditions = getAvailableConditionDefinitions(unlockedAiPackageIds);
  const availableActions = getAvailableActionDefinitions(unlockedAiPackageIds);
  const availableTargetPriorities = getAvailableTargetPriorityDefinitions(unlockedAiPackageIds);
  const lockedPackages = getLockedAiUnlockPackages(unlockedAiPackageIds);
  const unlockedPackages = aiUnlockPackages.filter((item) => unlockState.packageIds.has(item.id));
  const currentTargetPriorityOptions = availableTargetPriorities.some((item) => item.id === targetPriority)
    ? availableTargetPriorities
    : [
        ...availableTargetPriorities,
        targetPriorityDefinitions.find((item) => item.id === targetPriority) ?? targetPriorityDefinitions[0],
      ];

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

  const presetUnlockCount = (preset: AiPresetId) => {
    const definition = getAiPresetDefinition(preset);
    if (definition.id === "custom") {
      return { total: normalizedRules.length, unlocked: normalizedRules.filter((rule) => isAiRuleUnlocked(rule, unlockState)).length };
    }
    return {
      total: definition.rules.length,
      unlocked: definition.rules.filter((rule) => isAiRuleUnlocked(rule, unlockState)).length,
    };
  };

  return (
    <main className="ai-screen ai-focused-screen">
      <section className="panel ai-mode-panel">
        <div className="section-title">AI LOGIC</div>
        <div className="mode-tab-row">
          <button className={activeView === "rules" ? "active" : ""} onClick={() => setActiveView("rules")}>
            Rules
          </button>
          <button className={activeView === "blueprints" ? "active" : ""} onClick={() => setActiveView("blueprints")}>
            Blueprints
          </button>
          <button className={activeView === "unlocks" ? "active" : ""} onClick={() => setActiveView("unlocks")}>
            Unlocks
          </button>
        </div>

        {activeView === "rules" && (
          <div className="ai-view-stack">
            <div className="unit-switcher compact-switcher">
              {statsByUnit.map((unitStats, index) => (
                <button
                  key={index}
                  className={`${activeUnitIndex === index ? "active" : ""} ${index >= unlockedUnitCount ? "locked" : ""}`}
                  onClick={() => onSelectUnit(index)}
                  disabled={index >= unlockedUnitCount}
                >
                  <strong>UNIT {index + 1}</strong>
                  <small>{index >= unlockedUnitCount ? "未配備" : `SPD ${unitStats.moveSpeed}`}</small>
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
                {currentTargetPriorityOptions.map((priority) => (
                  <option
                    key={priority.id}
                    value={priority.id}
                    disabled={!unlockState.targetPriorities.has(priority.id)}
                  >
                    {priority.label}{unlockState.targetPriorities.has(priority.id) ? "" : "（ロック中）"}
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
              {normalizedRules.map((rule, index) => {
                const conditionLocked = !unlockState.conditions.has(rule.condition);
                const actionLocked = !unlockState.actions.has(rule.action);
                return (
                  <div className={`ai-row ${conditionLocked || actionLocked ? "locked-rule" : ""}`} key={rule.id}>
                    <strong>{index + 1}</strong>
                    <select
                      value={rule.condition}
                      onChange={(event) =>
                        updateRule(index, { condition: event.target.value as AiConditionId })
                      }
                    >
                      {includeCurrentCondition(availableConditions, rule.condition).map((condition) => (
                        <option
                          key={condition.id}
                          value={condition.id}
                          disabled={!unlockState.conditions.has(condition.id)}
                        >
                          {condition.label}{unlockState.conditions.has(condition.id) ? "" : "（ロック中）"}
                        </option>
                      ))}
                    </select>
                    <select
                      value={rule.action}
                      onChange={(event) => updateRule(index, { action: event.target.value as AiActionId })}
                    >
                      {includeCurrentAction(availableActions, rule.action).map((action) => (
                        <option key={action.id} value={action.id} disabled={!unlockState.actions.has(action.id)}>
                          {action.label}{unlockState.actions.has(action.id) ? "" : "（ロック中）"}
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
                    {(conditionLocked || actionLocked) && (
                      <small className="locked-rule-note">未解放のため戦闘中は待機扱い</small>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeView === "blueprints" && (
          <div className="ai-view-stack">
            <div className="target-priority-panel">
              <div>
                <span>AI設計図</span>
                <strong>{presetDefinition.label}</strong>
              </div>
              <select
                value={aiPreset}
                onChange={(event) => onChangeAiPreset(event.target.value as AiPresetId)}
              >
                {aiPresetDefinitions.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <small>{presetDefinition.description}</small>
            </div>
            <div className="ai-preset-grid blueprint-grid">
              {aiPresetDefinitions.filter((preset) => preset.id !== "custom").map((preset) => {
                const count = presetUnlockCount(preset.id);
                return (
                  <button
                    key={preset.id}
                    className={aiPreset === preset.id ? "active" : ""}
                    onClick={() => onChangeAiPreset(preset.id)}
                  >
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                    <span className="unlock-count">{count.unlocked}/{count.total} rules ready</span>
                  </button>
                );
              })}
            </div>
            <div className="ai-flow-list">
              <div className="ai-flow-card target-card">
                <span className="priority-dot">T</span>
                <span>ターゲット</span>
                <span className="flow-arrow">LOCK</span>
                <strong>{getTargetPriorityLabel(targetPriority)}</strong>
              </div>
              {normalizedRules.map((rule, index) => (
                <div
                  className={`ai-flow-card ${rule.enabled ? "" : "disabled"} ${isAiRuleUnlocked(rule, unlockState) ? "" : "locked-rule"}`}
                  key={rule.id}
                >
                  <span className="priority-dot">{index + 1}</span>
                  <span>{getConditionLabel(rule.condition)}</span>
                  <span className="flow-arrow">THEN</span>
                  <strong>{isAiRuleUnlocked(rule, unlockState) ? getActionLabel(rule.action) : "待機（ロック中）"}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === "unlocks" && (
          <div className="ai-view-stack">
            <div className="unlock-summary">
              <div>
                <span>解放済みAIチップ</span>
                <strong>{unlockedPackages.length}</strong>
              </div>
              <div>
                <span>ロック中</span>
                <strong>{lockedPackages.length}</strong>
              </div>
            </div>
            <div className="ai-unlock-grid">
              {lockedPackages.map((item) => (
                <article className={`ai-unlock-card locked accent-${item.rarity}`} key={item.id}>
                  <span>WORLD {item.world}</span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </article>
              ))}
              {unlockedPackages.map((item) => (
                <article className={`ai-unlock-card unlocked accent-${item.rarity}`} key={item.id}>
                  <span>UNLOCKED / WORLD {item.world}</span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="screen-actions">
          <button onClick={onOpenMap}>MAPへ戻る</button>
          <button onClick={onOpenAssemble}>ASSEMBLE</button>
          <button className="primary" onClick={onStartCombat}>戦闘開始</button>
        </div>
      </section>
    </main>
  );
}
