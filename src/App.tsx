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
import { AiRule, Loadout, PartSlot, PilotUpgrades, ScreenId } from "./types";

const cloneLoadout = (): Loadout => ({ ...initialLoadout });
const cloneUpgrades = (): PilotUpgrades => ({ ...baseUpgrades });

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("assemble");
  const [stage, setStage] = useState(1);
  const [loadout, setLoadout] = useState<Loadout>(() => cloneLoadout());
  const [unlockedPartIds, setUnlockedPartIds] = useState<string[]>(() => [...initialUnlockedPartIds]);
  const [upgrades, setUpgrades] = useState<PilotUpgrades>(() => cloneUpgrades());
  const [aiSlotCount, setAiSlotCount] = useState(5);
  const [aiRules, setAiRules] = useState<AiRule[]>(() => createInitialAiRules());
  const [rewardOptions, setRewardOptions] = useState<RewardOption[]>([]);
  const [lastOutcome, setLastOutcome] = useState<string | undefined>();

  const stats = useMemo(() => calculateDerivedStats(loadout, upgrades), [loadout, upgrades]);
  const normalizedRules = useMemo(
    () => ensureAiRuleSlots(aiRules, aiSlotCount),
    [aiRules, aiSlotCount],
  );

  const changeLoadout = (slot: PartSlot, partId: string) => {
    setLoadout((current) => ({ ...current, [slot]: partId }));
  };

  const resetRun = () => {
    setStage(1);
    setLoadout(cloneLoadout());
    setUnlockedPartIds([...initialUnlockedPartIds]);
    setUpgrades(cloneUpgrades());
    setAiSlotCount(5);
    setAiRules(createInitialAiRules());
    setRewardOptions([]);
  };

  const handleVictory = () => {
    setRewardOptions(generateRewardOptions(stage, unlockedPartIds, aiSlotCount));
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
      setLoadout((current) => ({ ...current, [part.slot]: part.id }));
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
      setAiSlotCount((current) => Math.min(8, current + payload.amount));
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
          loadout={loadout}
          unlockedPartIds={unlockedPartIds}
          stats={stats}
          onChangeLoadout={changeLoadout}
          onOpenAi={() => setScreen("ai")}
          onOpenMap={() => setScreen("map")}
          onStartCombat={startCombat}
        />
      )}
      {screen === "ai" && (
        <AiEditorScreen
          rules={normalizedRules}
          slotCount={aiSlotCount}
          onChangeRules={setAiRules}
          onOpenAssemble={() => setScreen("assemble")}
          onOpenMap={() => setScreen("map")}
          onStartCombat={startCombat}
        />
      )}
      {screen === "combat" && (
        <CombatScreen
          stage={stage}
          stats={stats}
          rules={normalizedRules}
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
