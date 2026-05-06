import { useEffect, useMemo, useState } from "react";
import AssembleScreen from "./components/AssembleScreen";
import AiEditorScreen from "./components/AiEditorScreen";
import CombatScreen from "./components/CombatScreen";
import FrameSelectScreen from "./components/FrameSelectScreen";
import RewardScreen from "./components/RewardScreen";
import StageMapScreen from "./components/StageMapScreen";
import { createInitialAiRules, ensureAiRuleSlots } from "./data/aiRules";
import { getBaseFrameById, initialFrameId } from "./data/frames";
import {
  baseUpgrades,
  calculateDerivedStats,
  createEmptyPartInventory,
  createInitialLoadoutForFrame,
  EMPTY_BOTH_SHOULDER_PART_ID,
  EMPTY_LEFT_SHOULDER_PART_ID,
  EMPTY_RIGHT_SHOULDER_PART_ID,
  equippedPartCounts,
  getPartById,
  grantStarterKit,
  initialLoadout,
  isFreePart,
  isShoulderSlotBlocked,
  normalizeShoulderLoadout,
} from "./data/parts";
import { generateRewardOptions, RewardOption } from "./data/rewards";
import { CombatReport } from "./game/combat";
import { unlockCombatAudio } from "./game/sound";
import {
  AiRule,
  BaseFrameId,
  EQUIP_SLOTS,
  EquipSlot,
  Loadout,
  PartInventory,
  PilotUpgrades,
  ScreenId,
  SQUAD_SIZE,
  TargetPriorityId,
  WEAPON_HARDPOINTS,
  WeaponAutoUse,
  WeaponHardpoint,
} from "./types";

const cloneLoadout = (): Loadout => ({ ...initialLoadout });
const cloneUpgrades = (): PilotUpgrades => ({ ...baseUpgrades });
const createInitialLoadouts = (): Loadout[] =>
  Array.from({ length: SQUAD_SIZE }, () => cloneLoadout());
const createInitialFrameIds = (): BaseFrameId[] =>
  Array.from({ length: SQUAD_SIZE }, () => initialFrameId);
const createInitialAiSlotCounts = (): number[] =>
  Array.from({ length: SQUAD_SIZE }, () => createInitialAiRules(initialFrameId).length);
const createInitialAiRulesByUnit = (): AiRule[][] =>
  Array.from({ length: SQUAD_SIZE }, () => createInitialAiRules(initialFrameId));
const createInitialTargetPriorities = (): TargetPriorityId[] =>
  Array.from({ length: SQUAD_SIZE }, () => "nearest");
const createWeaponAutoUse = (): WeaponAutoUse =>
  WEAPON_HARDPOINTS.reduce((config, hardpoint) => {
    config[hardpoint] = true;
    return config;
  }, {} as WeaponAutoUse);
const createInitialWeaponAutoUseByUnit = (): WeaponAutoUse[] =>
  Array.from({ length: SQUAD_SIZE }, () => createWeaponAutoUse());
const createInitialUnitHp = (): number[] =>
  createInitialLoadouts().map((unitLoadout) =>
    calculateDerivedStats(unitLoadout, baseUpgrades, initialFrameId).hpMax,
  );
const createInitialSortieEnabled = (): boolean[] =>
  Array.from({ length: SQUAD_SIZE }, () => false);

const countEquippedPart = (loadouts: Loadout[], unlockedUnitCount: number, partId: string): number =>
  loadouts.slice(0, unlockedUnitCount).reduce((count, loadout) => {
    if (isFreePart(partId)) {
      return count;
    }
    const normalizedLoadout = normalizeShoulderLoadout(loadout);
    const slotCount = EQUIP_SLOTS.filter((slot) => normalizedLoadout[slot] === partId).length;
    return count + slotCount;
  }, 0);

const applyShoulderCompatibility = (
  loadout: Loadout,
  slot: EquipSlot,
  partId: string,
): Loadout => {
  const next = {
    ...normalizeShoulderLoadout(loadout),
    [slot]: partId,
  };

  if (slot === "B-SHOULDER" && !isFreePart(partId)) {
    next["L-SHOULDER"] = EMPTY_LEFT_SHOULDER_PART_ID;
    next["R-SHOULDER"] = EMPTY_RIGHT_SHOULDER_PART_ID;
  }

  if ((slot === "L-SHOULDER" || slot === "R-SHOULDER") && !isFreePart(partId)) {
    next["B-SHOULDER"] = EMPTY_BOTH_SHOULDER_PART_ID;
  }

  return normalizeShoulderLoadout(next);
};

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("frameSelect");
  const [stage, setStage] = useState(1);
  const [loadouts, setLoadouts] = useState<Loadout[]>(() => createInitialLoadouts());
  const [unitFrameIds, setUnitFrameIds] = useState<BaseFrameId[]>(() => createInitialFrameIds());
  const [unlockedUnitCount, setUnlockedUnitCount] = useState(0);
  const [pendingUnitIndex, setPendingUnitIndex] = useState(0);
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [partInventory, setPartInventory] = useState<PartInventory>(() => createEmptyPartInventory());
  const [upgrades, setUpgrades] = useState<PilotUpgrades>(() => cloneUpgrades());
  const [aiSlotCounts, setAiSlotCounts] = useState<number[]>(() => createInitialAiSlotCounts());
  const [aiRulesByUnit, setAiRulesByUnit] = useState<AiRule[][]>(() => createInitialAiRulesByUnit());
  const [targetPrioritiesByUnit, setTargetPrioritiesByUnit] = useState<TargetPriorityId[]>(() =>
    createInitialTargetPriorities(),
  );
  const [weaponAutoUseByUnit, setWeaponAutoUseByUnit] = useState<WeaponAutoUse[]>(() =>
    createInitialWeaponAutoUseByUnit(),
  );
  const [unitHpByUnit, setUnitHpByUnit] = useState<number[]>(() => createInitialUnitHp());
  const [sortieEnabled, setSortieEnabled] = useState<boolean[]>(() => createInitialSortieEnabled());
  const [repairKitStock, setRepairKitStock] = useState(0);
  const [rewardOptions, setRewardOptions] = useState<RewardOption[]>([]);
  const [lastCombatReport, setLastCombatReport] = useState<CombatReport | undefined>();
  const [lastOutcome, setLastOutcome] = useState<string | undefined>();

  const statsByUnit = useMemo(
    () =>
      loadouts.map((unitLoadout, index) =>
        calculateDerivedStats(unitLoadout, upgrades, unitFrameIds[index] ?? initialFrameId),
      ),
    [loadouts, upgrades, unitFrameIds],
  );
  const equippedCounts = useMemo(
    () => equippedPartCounts(loadouts, unlockedUnitCount),
    [loadouts, unlockedUnitCount],
  );
  const normalizedRulesByUnit = useMemo(
    () =>
      aiRulesByUnit.map((rules, index) =>
        ensureAiRuleSlots(rules, aiSlotCounts[index] ?? 5),
      ),
    [aiRulesByUnit, aiSlotCounts],
  );
  const sortieReady = useMemo(
    () =>
      statsByUnit.slice(0, unlockedUnitCount).some((stats, index) =>
        (sortieEnabled[index] ?? false) && (unitHpByUnit[index] ?? stats.hpMax) > 0,
      ),
    [sortieEnabled, statsByUnit, unitHpByUnit, unlockedUnitCount],
  );

  useEffect(() => {
    setUnitHpByUnit((current) =>
      statsByUnit.map((stats, index) => Math.min(current[index] ?? stats.hpMax, stats.hpMax)),
    );
  }, [statsByUnit]);

  useEffect(() => {
    if (unlockedUnitCount > 0 && activeUnitIndex >= unlockedUnitCount) {
      setActiveUnitIndex(unlockedUnitCount - 1);
    }
  }, [activeUnitIndex, unlockedUnitCount]);

  const changeLoadout = (slot: EquipSlot, partId: string) => {
    if (activeUnitIndex >= unlockedUnitCount) {
      return;
    }

    const part = getPartById(partId);
    if (part.slot !== slot) {
      setLastOutcome("このスロットには装備できません");
      return;
    }

    const activeLoadout = loadouts[activeUnitIndex]
      ? normalizeShoulderLoadout(loadouts[activeUnitIndex])
      : undefined;
    if (!activeLoadout || activeLoadout[slot] === partId) {
      return;
    }

    if (isShoulderSlotBlocked(activeLoadout, slot) && !isFreePart(partId)) {
      setLastOutcome("両肩武装を装備中のため、左右肩武装は装備できません");
      return;
    }

    const owned = partInventory[partId] ?? 0;
    const used = countEquippedPart(loadouts, unlockedUnitCount, partId);
    const available = isFreePart(partId) ? 1 : owned - used;
    const donorIndex = isFreePart(partId)
      ? -1
      : loadouts.findIndex(
          (unitLoadout, index) =>
            index < unlockedUnitCount &&
            index !== activeUnitIndex &&
            normalizeShoulderLoadout(unitLoadout)[slot] === partId,
        );

    if (available <= 0 && donorIndex < 0) {
      setLastOutcome(`${part.name} の空き在庫がありません`);
      return;
    }

    const previousPartId = activeLoadout[slot];
    setLoadouts((current) =>
      current.map((unitLoadout, index) => {
        if (index === activeUnitIndex) {
          return applyShoulderCompatibility(unitLoadout, slot, partId);
        }
        if (index === donorIndex) {
          return applyShoulderCompatibility(unitLoadout, slot, previousPartId);
        }
        return normalizeShoulderLoadout(unitLoadout);
      }),
    );

    setLastOutcome(
      donorIndex >= 0
        ? `UNIT ${donorIndex + 1} から ${part.name} を付け替え`
        : `${part.name} を装備`,
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

  const toggleWeaponAutoUse = (hardpoint: WeaponHardpoint) => {
    setWeaponAutoUseByUnit((current) =>
      current.map((config, index) =>
        index === activeUnitIndex
          ? {
              ...config,
              [hardpoint]: !config[hardpoint],
            }
          : config,
      ),
    );
  };

  const toggleSortie = (unitIndex: number) => {
    if (unitIndex >= unlockedUnitCount) {
      setLastOutcome(`UNIT ${unitIndex + 1} は未配備です`);
      return;
    }

    const unitHp = unitHpByUnit[unitIndex] ?? statsByUnit[unitIndex]?.hpMax ?? 0;
    if (unitHp <= 0) {
      setLastOutcome(`UNIT ${unitIndex + 1} は大破中: リペアキットが必要`);
      return;
    }

    setSortieEnabled((current) => {
      const next = current.map((enabled, index) => (index === unitIndex ? !enabled : enabled));
      const hasReadyUnit = next.some((enabled, index) =>
        index < unlockedUnitCount && enabled && (unitHpByUnit[index] ?? statsByUnit[index]?.hpMax ?? 0) > 0,
      );
      if (!hasReadyUnit) {
        setLastOutcome("最低1体は出撃ONにしてください");
        return current;
      }
      return next;
    });
  };

  const useRepairKit = (unitIndex: number) => {
    if (unitIndex >= unlockedUnitCount) {
      return;
    }
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
    setUnitFrameIds(createInitialFrameIds());
    setUnlockedUnitCount(0);
    setPendingUnitIndex(0);
    setActiveUnitIndex(0);
    setPartInventory(createEmptyPartInventory());
    setUpgrades(cloneUpgrades());
    setAiSlotCounts(createInitialAiSlotCounts());
    setAiRulesByUnit(createInitialAiRulesByUnit());
    setTargetPrioritiesByUnit(createInitialTargetPriorities());
    setWeaponAutoUseByUnit(createInitialWeaponAutoUseByUnit());
    setUnitHpByUnit(createInitialUnitHp());
    setSortieEnabled(createInitialSortieEnabled());
    setRepairKitStock(0);
    setRewardOptions([]);
    setLastCombatReport(undefined);
  };

  const selectFrame = (frameId: BaseFrameId) => {
    const unitIndex = pendingUnitIndex;
    const frame = getBaseFrameById(frameId);
    const frameLoadout = createInitialLoadoutForFrame(frameId);
    const frameRules = createInitialAiRules(frameId);
    const unitStats = calculateDerivedStats(frameLoadout, upgrades, frameId);

    setLoadouts((current) =>
      current.map((unitLoadout, index) => (index === unitIndex ? frameLoadout : unitLoadout)),
    );
    setUnitFrameIds((current) =>
      current.map((currentFrameId, index) => (index === unitIndex ? frameId : currentFrameId)),
    );
    setPartInventory((current) => grantStarterKit(current));
    setAiRulesByUnit((current) =>
      current.map((unitRules, index) => (index === unitIndex ? frameRules : unitRules)),
    );
    setAiSlotCounts((current) =>
      current.map((slotCount, index) => (index === unitIndex ? frameRules.length : slotCount)),
    );
    setWeaponAutoUseByUnit((current) =>
      current.map((config, index) => (index === unitIndex ? createWeaponAutoUse() : config)),
    );
    setUnlockedUnitCount((current) => Math.max(current, unitIndex + 1));
    setSortieEnabled((current) =>
      current.map((enabled, index) => (index === unitIndex ? true : enabled)),
    );
    setUnitHpByUnit((current) =>
      current.map((hp, index) => (index === unitIndex ? unitStats.hpMax : hp)),
    );
    setActiveUnitIndex(unitIndex);
    setLastOutcome(`UNIT ${unitIndex + 1}: ${frame.name} 配備`);
    setScreen(unitIndex === 0 ? "assemble" : "map");
  };

  const handleVictory = (remainingHpByUnit: number[], report: CombatReport) => {
    setUnitHpByUnit((current) =>
      current.map((hp, index) => remainingHpByUnit[index] ?? hp),
    );
    setLastCombatReport(report);
    setRewardOptions(generateRewardOptions(stage, partInventory, aiSlotCounts[activeUnitIndex] ?? 5));
    setLastOutcome(`STAGE ${stage} CLEAR`);
    setScreen("reward");
  };

  const handleDefeat = () => {
    resetRun();
    setLastOutcome("機体大破: ランを最初から再開");
    setScreen("frameSelect");
  };

  const applyReward = (reward: RewardOption) => {
    const payload = reward.payload;

    if (payload.kind === "part") {
      const part = getPartById(payload.partId);
      setPartInventory((current) => ({
        ...current,
        [part.id]: (current[part.id] ?? 0) + 1,
      }));
      if (activeUnitIndex < unlockedUnitCount && EQUIP_SLOTS.includes(part.slot as EquipSlot)) {
        const slot = part.slot as EquipSlot;
        setLoadouts((current) =>
          current.map((unitLoadout, index) =>
            index === activeUnitIndex
              ? applyShoulderCompatibility(unitLoadout, slot, part.id)
              : unitLoadout,
          ),
        );
      }
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
      setScreen("frameSelect");
      return;
    }

    const nextStage = stage + 1;
    setStage(nextStage);

    if (stage === 2 && unlockedUnitCount < 2) {
      setPendingUnitIndex(1);
      setLastOutcome(`${reward.title} を獲得 / UNIT 2 配備選択`);
      setScreen("frameSelect");
      return;
    }

    if (stage === 5 && unlockedUnitCount < 3) {
      setPendingUnitIndex(2);
      setLastOutcome(`${reward.title} を獲得 / UNIT 3 配備選択`);
      setScreen("frameSelect");
      return;
    }

    setLastOutcome(`${reward.title} を獲得`);
    setScreen("map");
  };

  const startCombat = () => {
    if (!sortieReady) {
      setLastOutcome("出撃可能なユニットがありません");
      setScreen(unlockedUnitCount === 0 ? "frameSelect" : "assemble");
      return;
    }
    unlockCombatAudio();
    setScreen("combat");
  };

  const hasUnit = unlockedUnitCount > 0;
  const topNav = (
    <header className="app-header">
      <div>
        <span className="brand-mark">ACR</span>
        <strong>AutoCore Rogue</strong>
        <small>browser prototype</small>
      </div>
      <nav>
        <button
          className={screen === "assemble" ? "active" : ""}
          onClick={() => setScreen("assemble")}
          disabled={!hasUnit}
        >
          ASSEMBLE
        </button>
        <button className={screen === "ai" ? "active" : ""} onClick={() => setScreen("ai")} disabled={!hasUnit}>
          AI
        </button>
        <button className={screen === "map" ? "active" : ""} onClick={() => setScreen("map")} disabled={!hasUnit}>
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
      {screen === "frameSelect" && (
        <FrameSelectScreen
          unitIndex={pendingUnitIndex}
          stage={stage}
          lastOutcome={lastOutcome}
          onSelectFrame={selectFrame}
        />
      )}
      {screen === "assemble" && hasUnit && (
        <AssembleScreen
          loadouts={loadouts}
          unitFrameIds={unitFrameIds}
          unlockedUnitCount={unlockedUnitCount}
          partInventory={partInventory}
          equippedCounts={equippedCounts}
          statsByUnit={statsByUnit}
          unitHpByUnit={unitHpByUnit}
          sortieEnabled={sortieEnabled}
          repairKitStock={repairKitStock}
          activeUnitIndex={activeUnitIndex}
          lastOutcome={lastOutcome}
          weaponAutoUse={weaponAutoUseByUnit[activeUnitIndex] ?? createWeaponAutoUse()}
          onSelectUnit={setActiveUnitIndex}
          onChangeLoadout={changeLoadout}
          onToggleWeaponAutoUse={toggleWeaponAutoUse}
          onToggleSortie={toggleSortie}
          onUseRepairKit={useRepairKit}
          onOpenAi={() => setScreen("ai")}
          onOpenMap={() => setScreen("map")}
          onStartCombat={startCombat}
          canStartCombat={sortieReady}
        />
      )}
      {screen === "ai" && hasUnit && (
        <AiEditorScreen
          rules={normalizedRulesByUnit[activeUnitIndex]}
          slotCount={aiSlotCounts[activeUnitIndex] ?? 5}
          activeUnitIndex={activeUnitIndex}
          unlockedUnitCount={unlockedUnitCount}
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
      {screen === "combat" && hasUnit && (
        <CombatScreen
          stage={stage}
          statsByUnit={statsByUnit}
          unitHpByUnit={unitHpByUnit}
          sortieEnabled={sortieEnabled}
          unlockedUnitCount={unlockedUnitCount}
          rulesByUnit={normalizedRulesByUnit}
          targetPrioritiesByUnit={targetPrioritiesByUnit}
          weaponAutoUseByUnit={weaponAutoUseByUnit}
          activeUnitIndex={activeUnitIndex}
          onSelectUnit={setActiveUnitIndex}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          onOpenAssemble={() => setScreen("assemble")}
          onOpenAi={() => setScreen("ai")}
        />
      )}
      {screen === "reward" && (
        <RewardScreen
          stage={stage}
          rewards={rewardOptions}
          report={lastCombatReport}
          rulesByUnit={normalizedRulesByUnit}
          onPickReward={applyReward}
        />
      )}
      {screen === "map" && hasUnit && (
        <StageMapScreen
          stage={stage}
          lastOutcome={lastOutcome}
          unlockedUnitCount={unlockedUnitCount}
          onOpenAssemble={() => setScreen("assemble")}
          onOpenAi={() => setScreen("ai")}
          onStartCombat={startCombat}
        />
      )}
    </div>
  );
}
