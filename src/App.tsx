import { useMemo, useState } from "react";
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
import { AiRule, Loadout, PartSlot, PilotUpgrades, ScreenId, SQUAD_SIZE } from "./types";

const cloneLoadout = (): Loadout => ({ ...initialLoadout });
const cloneUpgrades = (): PilotUpgrades => ({ ...baseUpgrades });
const createInitialLoadouts = (): Loadout[] =>
  Array.from({ length: SQUAD_SIZE }, () => cloneLoadout());
const createInitialAiSlotCounts = (): number[] =>
  Array.from({ length: SQUAD_SIZE }, () => 5);
const createInitialAiRulesByUnit = (): AiRule[][] =>
  Array.from({ length: SQUAD_SIZE }, () => createInitialAiRules());

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("assemble");
  const [stage, setStage] = useState(1);
  const [loadouts, setLoadouts] = useState<Loadout[]>(() => createInitialLoadouts());
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [unlockedPartIds, setUnlockedPartIds] = useState<string[]>(() => [...initialUnlockedPartIds]);
  const [upgrades, setUpgrades] = useState<PilotUpgrades>(() => cloneUpgrades());
  const [aiSlotCounts, setAiSlotCounts] = useState<number[]>(() => createInitialAiSlotCounts());
  const [aiRulesByUnit, setAiRulesByUnit] = useState<AiRule[][]>(() => createInitialAiRulesByUnit());
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

  const resetRun = () => {
    setStage(1);
    setLoadouts(createInitialLoadouts());
    setActiveUnitIndex(0);
    setUnlockedPartIds([...initialUnlockedPartIds]);
    setUpgrades(cloneUpgrades());
    setAiSlotCounts(createInitialAiSlotCounts());
    setAiRulesByUnit(createInitialAiRulesByUnit());
    setRewardOptions([]);
  };

  const handleVictory = () => {
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
        <button className="primary" onClick={startCombat}>
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
          activeUnitIndex={activeUnitIndex}
          onSelectUnit={setActiveUnitIndex}
          onChangeLoadout={changeLoadout}
          onOpenAi={() => setScreen("ai")}
          onOpenMap={() => setScreen("map")}
          onStartCombat={startCombat}
        />
      )}
      {screen === "ai" && (
        <AiEditorScreen
          rules={normalizedRulesByUnit[activeUnitIndex]}
          slotCount={aiSlotCounts[activeUnitIndex] ?? 5}
          activeUnitIndex={activeUnitIndex}
          statsByUnit={statsByUnit}
          onSelectUnit={setActiveUnitIndex}
          onChangeRules={changeActiveAiRules}
          onOpenAssemble={() => setScreen("assemble")}
          onOpenMap={() => setScreen("map")}
          onStartCombat={startCombat}
        />
      )}
      {screen === "combat" && (
        <CombatScreen
          stage={stage}
          statsByUnit={statsByUnit}
          rulesByUnit={normalizedRulesByUnit}
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
