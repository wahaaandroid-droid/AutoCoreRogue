import { useEffect, useMemo, useState } from "react";
import AssembleScreen from "./components/AssembleScreen";
import AiEditorScreen from "./components/AiEditorScreen";
import CombatScreen from "./components/CombatScreen";
import RewardScreen from "./components/RewardScreen";
import StageMapScreen from "./components/StageMapScreen";
import { createInitialAiRules, ensureAiRuleSlots } from "./data/aiRules";
import {
  baseUpgrades,
  calculateDerivedStats,
  getPartById,
  initialLoadout,
  initialUnlockedPartIds,
} from "./data/parts";
import { generateRewardOptions, RewardOption } from "./data/rewards";
import { unlockCombatAudio } from "./game/sound";
import { AiRule, Loadout, PartSlot, PilotUpgrades, ScreenId, SQUAD_SIZE, TargetPriorityId } from "./types";

const cloneLoadout = (): Loadout => ({ ...initialLoadout });
const cloneUpgrades = (): PilotUpgrades => ({ ...baseUpgrades });
const createInitialLoadouts = (): Loadout[] =>
  Array.from({ length: SQUAD_SIZE }, () => cloneLoadout());
const createInitialAiSlotCounts = (): number[] =>
  Array.from({ length: SQUAD_SIZE }, () => 5);
const createInitialAiRulesByUnit = (): AiRule[][] =>
  Array.from({ length: SQUAD_SIZE }, () => createInitialAiRules());
const createInitialTargetPriorities = (): TargetPriorityId[] =>
  Array.from({ length: SQUAD_SIZE }, () => "nearest");
const createInitialUnitHp = (): number[] =>
  createInitialLoadouts().map((unitLoadout) => calculateDerivedStats(unitLoadout, baseUpgrades).hpMax);
const createInitialSortieEnabled = (): boolean[] =>
  Array.from({ length: SQUAD_SIZE }, () => true);

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("assemble");
  const [stage, setStage] = useState(1);
  const [loadouts, setLoadouts] = useState<Loadout[]>(() => createInitialLoadouts());
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [unlockedPartIds, setUnlockedPartIds] = useState<string[]>(() => [...initialUnlockedPartIds]);
  const [upgrades, setUpgrades] = useState<PilotUpgrades>(() => cloneUpgrades());
  const [aiSlotCounts, setAiSlotCounts] = useState<number[]>(() => createInitialAiSlotCounts());
  const [aiRulesByUnit, setAiRulesByUnit] = useState<AiRule[][]>(() => createInitialAiRulesByUnit());
  const [targetPrioritiesByUnit, setTargetPrioritiesByUnit] = useState<TargetPriorityId[]>(() =>
    createInitialTargetPriorities(),
  );
  const [unitHpByUnit, setUnitHpByUnit] = useState<number[]>(() => createInitialUnitHp());
  const [sortieEnabled, setSortieEnabled] = useState<boolean[]>(() => createInitialSortieEnabled());
  const [repairKitStock, setRepairKitStock] = useState(0);
  const [rewardOptions, setRewardOptions] = useState<RewardOption[]>([]);
  const [lastOutcome, setLastOutcome] = useState<string | undefined>();

  const statsByUnit = useMemo(
    () => loadouts.map((unitLoadout) => calculateDerivedStats(unitLoadout, upgrades)),
    [loadouts, upgrades],
  );
  const normalizedRulesByUnit = useMemo(
    () =>
      aiRulesByUnit.map((rules, index) =>
        ensureAiRuleSlots(rules, aiSlotCounts[index] ?? 5),
      ),
    [aiRulesByUnit, aiSlotCounts],
  );
  const sortieReady = useMemo(
    () => statsByUnit.some((stats, index) =>
      (sortieEnabled[index] ?? true) && (unitHpByUnit[index] ?? stats.hpMax) > 0,
    ),
    [sortieEnabled, statsByUnit, unitHpByUnit],
  );

  useEffect(() => {
    setUnitHpByUnit((current) =>
      statsByUnit.map((stats, index) => Math.min(current[index] ?? stats.hpMax, stats.hpMax)),
    );
  }, [statsByUnit]);

  const changeLoadout = (slot: PartSlot, partId: string) => {
    setLoadouts((current) =>
      current.map((unitLoadout, index) =>
        index === activeUnitIndex ? { ...unitLoadout, [slot]: partId } : unitLoadout,
      ),
    );
  };

  const changeActiveAiRules = (rules: AiRule[]) => {
    setAiRulesByUnit((current) =>
      current.map((unitRules, index) => (index === activeUnitIndex ? rules : unitRules)),
    );
  };

  const changeActiveTargetPriority = (priority: TargetPriorityId) => {
    setTargetPrioritiesByUnit((current) =>
      current.map((unitPriority, index) => (index === activeUnitIndex ? priority : unitPriority)),
    );
  };

  const toggleSortie = (unitIndex: number) => {
    const unitHp = unitHpByUnit[unitIndex] ?? statsByUnit[unitIndex]?.hpMax ?? 0;
    if (unitHp <= 0) {
      setLastOutcome(`UNIT ${unitIndex + 1} は大破中: リペアキットが必要`);
      return;
    }

    setSortieEnabled((current) => {
      const next = current.map((enabled, index) => (index === unitIndex ? !enabled : enabled));
      const hasReadyUnit = next.some((enabled, index) =>
        enabled && (unitHpByUnit[index] ?? statsByUnit[index]?.hpMax ?? 0) > 0,
      );
      if (!hasReadyUnit) {
        setLastOutcome("最低1体は出撃ONにしてください");
        return current;
      }
      return next;
    });
  };

  const useRepairKit = (unitIndex: number) => {
    if (repairKitStock <= 0) {
      setLastOutcome("リペアキットのストックがありません");
      return;
    }

    const maxHp = statsByUnit[unitIndex]?.hpMax ?? 0;
    const currentHp = unitHpByUnit[unitIndex] ?? maxHp;
    if (currentHp >= maxHp) {
      setLastOutcome(`UNIT ${unitIndex + 1} は修理不要`);
      return;
    }

    setRepairKitStock((current) => Math.max(0, current - 1));
    setUnitHpByUnit((current) =>
      current.map((hp, index) => (index === unitIndex ? maxHp : hp)),
    );
    setSortieEnabled((current) =>
      current.map((enabled, index) => (index === unitIndex ? true : enabled)),
    );
    setLastOutcome(`UNIT ${unitIndex + 1} を全回復`);
  };

  const resetRun = () => {
    setStage(1);
    setLoadouts(createInitialLoadouts());
    setActiveUnitIndex(0);
    setUnlockedPartIds([...initialUnlockedPartIds]);
    setUpgrades(cloneUpgrades());
    setAiSlotCounts(createInitialAiSlotCounts());
    setAiRulesByUnit(createInitialAiRulesByUnit());
    setTargetPrioritiesByUnit(createInitialTargetPriorities());
    setUnitHpByUnit(createInitialUnitHp());
    setSortieEnabled(createInitialSortieEnabled());
    setRepairKitStock(0);
    setRewardOptions([]);
  };

  const handleVictory = (remainingHpByUnit: number[]) => {
    setUnitHpByUnit((current) =>
      current.map((hp, index) => remainingHpByUnit[index] ?? hp),
    );
    setRewardOptions(generateRewardOptions(stage, unlockedPartIds, aiSlotCounts[activeUnitIndex] ?? 5));
    setLastOutcome(`STAGE ${stage} CLEAR`);
    setScreen("reward");
  };

  const handleDefeat = () => {
    resetRun();
    setLastOutcome("機体大破: ランを最初から再開");
    setScreen("assemble");
  };

  const applyReward = (reward: RewardOption) => {
    const payload = reward.payload;

    if (payload.kind === "part") {
      const part = getPartById(payload.partId);
      setUnlockedPartIds((current) =>
        current.includes(part.id) ? current : [...current, part.id],
      );
      setLoadouts((current) =>
        current.map((unitLoadout, index) =>
          index === activeUnitIndex ? { ...unitLoadout, [part.slot]: part.id } : unitLoadout,
        ),
      );
    }

    if (payload.kind === "stat") {
      setUpgrades((current) => ({
        ...current,
        [payload.stat]: current[payload.stat] + payload.amount,
      }));
    }

    if (payload.kind === "cooldown") {
      setUpgrades((current) => ({
        ...current,
        cooldownMultiplier: Math.max(0.58, current.cooldownMultiplier * payload.multiplier),
      }));
    }

    if (payload.kind === "aiSlot") {
      setAiSlotCounts((current) =>
        current.map((slotCount, index) =>
          index === activeUnitIndex ? Math.min(8, slotCount + payload.amount) : slotCount,
        ),
      );
    }

    if (payload.kind === "repairKit") {
      setRepairKitStock((current) => current + payload.amount);
    }

    if (stage >= 7) {
      resetRun();
      setLastOutcome("RUN COMPLETE: 新しいランを開始");
      setScreen("assemble");
      return;
    }

    setStage((current) => current + 1);
    setLastOutcome(`${reward.title} を獲得`);
    setScreen("map");
  };

  const startCombat = () => {
    if (!sortieReady) {
      setLastOutcome("出撃可能なユニットがありません");
      setScreen("assemble");
      return;
    }
    unlockCombatAudio();
    setScreen("combat");
  };

  const topNav = (
    <header className="app-header">
      <div>
        <span className="brand-mark">ACR</span>
        <strong>AutoCore Rogue</strong>
        <small>browser prototype</small>
      </div>
      <nav>
        <button className={screen === "assemble" ? "active" : ""} onClick={() => setScreen("assemble")}>
          ASSEMBLE
        </button>
        <button className={screen === "ai" ? "active" : ""} onClick={() => setScreen("ai")}>
          AI
        </button>
        <button className={screen === "map" ? "active" : ""} onClick={() => setScreen("map")}>
          MAP
        </button>
        <button className="primary" onClick={startCombat} disabled={!sortieReady}>
          STAGE {stage}
        </button>
      </nav>
    </header>
  );

  return (
    <div className="app-shell">
      {topNav}
      {screen === "assemble" && (
        <AssembleScreen
          loadouts={loadouts}
          unlockedPartIds={unlockedPartIds}
          statsByUnit={statsByUnit}
          unitHpByUnit={unitHpByUnit}
          sortieEnabled={sortieEnabled}
          repairKitStock={repairKitStock}
          activeUnitIndex={activeUnitIndex}
          onSelectUnit={setActiveUnitIndex}
          onChangeLoadout={changeLoadout}
          onToggleSortie={toggleSortie}
          onUseRepairKit={useRepairKit}
          onOpenAi={() => setScreen("ai")}
          onOpenMap={() => setScreen("map")}
          onStartCombat={startCombat}
          canStartCombat={sortieReady}
        />
      )}
      {screen === "ai" && (
        <AiEditorScreen
          rules={normalizedRulesByUnit[activeUnitIndex]}
          slotCount={aiSlotCounts[activeUnitIndex] ?? 5}
          activeUnitIndex={activeUnitIndex}
          statsByUnit={statsByUnit}
          targetPriority={targetPrioritiesByUnit[activeUnitIndex] ?? "nearest"}
          onSelectUnit={setActiveUnitIndex}
          onChangeRules={changeActiveAiRules}
          onChangeTargetPriority={changeActiveTargetPriority}
          onOpenAssemble={() => setScreen("assemble")}
          onOpenMap={() => setScreen("map")}
          onStartCombat={startCombat}
        />
      )}
      {screen === "combat" && (
        <CombatScreen
          stage={stage}
          statsByUnit={statsByUnit}
          unitHpByUnit={unitHpByUnit}
          sortieEnabled={sortieEnabled}
          rulesByUnit={normalizedRulesByUnit}
          targetPrioritiesByUnit={targetPrioritiesByUnit}
          activeUnitIndex={activeUnitIndex}
          onSelectUnit={setActiveUnitIndex}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          onOpenAssemble={() => setScreen("assemble")}
          onOpenAi={() => setScreen("ai")}
        />
      )}
      {screen === "reward" && (
        <RewardScreen stage={stage} rewards={rewardOptions} onPickReward={applyReward} />
      )}
      {screen === "map" && (
        <StageMapScreen
          stage={stage}
          lastOutcome={lastOutcome}
          onOpenAssemble={() => setScreen("assemble")}
          onOpenAi={() => setScreen("ai")}
          onStartCombat={startCombat}
        />
      )}
    </div>
  );
}
