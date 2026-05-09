import { useEffect, useMemo, useState } from "react";
import AssembleScreen from "./components/AssembleScreen";
import AiEditorScreen from "./components/AiEditorScreen";
import CombatScreen from "./components/CombatScreen";
import FrameSelectScreen from "./components/FrameSelectScreen";
import RewardScreen from "./components/RewardScreen";
import RunCompleteScreen from "./components/RunCompleteScreen";
import StageMapScreen from "./components/StageMapScreen";
import {
  createAiPresetRules,
  createInitialAiRules,
  defaultAiPresetForFrame,
  ensureAiRuleSlots,
  getAiPresetDefinition,
} from "./data/aiRules";
import { getBaseFrameById, initialFrameId } from "./data/frames";
import {
  baseUpgrades,
  calculateDerivedStats,
  createEmptyPartInventory,
  createInitialLoadoutForFrame,
  EMPTY_BOTH_SHOULDER_PART_ID,
  EMPTY_LEFT_SHOULDER_PART_ID,
  EMPTY_RIGHT_SHOULDER_PART_ID,
  ensureStarterKit,
  equippedPartCounts,
  getPartById,
  grantStarterKit,
  initialLoadout,
  isFreePart,
  isShoulderSlotBlocked,
  normalizeLoadout,
} from "./data/parts";
import { generateRewardOptions, RewardOption } from "./data/rewards";
import { CombatReport } from "./game/combat";
import { playUiSound, unlockCombatAudio } from "./game/sound";
import {
  AiRule,
  AiPresetId,
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
const SAVE_VERSION = 3;
const SAVE_KEY = `autocore-rogue-run-v${SAVE_VERSION}`;
const LEGACY_SAVE_KEYS = ["autocore-rogue-run-v2", "autocore-rogue-run-v1"];
const createInitialLoadouts = (): Loadout[] =>
  Array.from({ length: SQUAD_SIZE }, () => cloneLoadout());
const createInitialFrameIds = (): BaseFrameId[] =>
  Array.from({ length: SQUAD_SIZE }, () => initialFrameId);
const createInitialAiSlotCounts = (): number[] =>
  Array.from({ length: SQUAD_SIZE }, () => createInitialAiRules(initialFrameId).length);
const createInitialAiRulesByUnit = (): AiRule[][] =>
  Array.from({ length: SQUAD_SIZE }, () => createInitialAiRules(initialFrameId));
const createInitialAiPresets = (): AiPresetId[] =>
  Array.from({ length: SQUAD_SIZE }, () => defaultAiPresetForFrame(initialFrameId));
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

interface SavedRunState {
  screen: ScreenId;
  stage: number;
  loadouts: Loadout[];
  unitFrameIds: BaseFrameId[];
  unlockedUnitCount: number;
  pendingUnitIndex: number;
  activeUnitIndex: number;
  partInventory: PartInventory;
  upgrades: PilotUpgrades;
  aiSlotCounts: number[];
  aiRulesByUnit: AiRule[][];
  aiPresetsByUnit: AiPresetId[];
  targetPrioritiesByUnit: TargetPriorityId[];
  weaponAutoUseByUnit: WeaponAutoUse[];
  unitHpByUnit: number[];
  sortieEnabled: boolean[];
  repairKitStock: number;
  rewardOptions: RewardOption[];
  lastCombatReport?: CombatReport;
  lastOutcome?: string;
}

interface SavedRunPayload {
  version: number;
  savedAt: string;
  state: SavedRunState;
}

const readSavedRunState = (): Partial<SavedRunState> | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const payload = JSON.parse(raw) as Partial<SavedRunPayload>;
      if (payload.state) {
        return payload.state;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const saveRunState = (state: SavedRunState): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: SavedRunPayload = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      state,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Saving is best-effort; gameplay should continue even if storage is unavailable.
  }
};

const normalizeSavedArray = <T,>(value: T[] | undefined, fallback: T[]): T[] =>
  Array.isArray(value) ? fallback.map((item, index) => value[index] ?? item) : fallback;

const normalizeSavedLoadouts = (value: Loadout[] | undefined): Loadout[] =>
  normalizeSavedArray(value, createInitialLoadouts()).map((loadout) => normalizeLoadout(loadout));

const restoreScreen = (screen: ScreenId | undefined, hasSavedUnit: boolean): ScreenId => {
  if (!hasSavedUnit) {
    return "frameSelect";
  }
  return screen === "combat" ? "map" : screen ?? "map";
};

const countEquippedPart = (loadouts: Loadout[], unlockedUnitCount: number, partId: string): number =>
  loadouts.slice(0, unlockedUnitCount).reduce((count, loadout) => {
    if (isFreePart(partId)) {
      return count;
    }
    const normalizedLoadout = normalizeLoadout(loadout);
    const slotCount = EQUIP_SLOTS.filter((slot) => normalizedLoadout[slot] === partId).length;
    return count + slotCount;
  }, 0);

const applyShoulderCompatibility = (
  loadout: Loadout,
  slot: EquipSlot,
  partId: string,
): Loadout => {
  const next = {
    ...normalizeLoadout(loadout),
    [slot]: partId,
  };

  if (slot === "B-SHOULDER" && !isFreePart(partId)) {
    next["L-SHOULDER"] = EMPTY_LEFT_SHOULDER_PART_ID;
    next["R-SHOULDER"] = EMPTY_RIGHT_SHOULDER_PART_ID;
  }

  if ((slot === "L-SHOULDER" || slot === "R-SHOULDER") && !isFreePart(partId)) {
    next["B-SHOULDER"] = EMPTY_BOTH_SHOULDER_PART_ID;
  }

  return normalizeLoadout(next);
};

export default function App() {
  const savedRun = useMemo(() => readSavedRunState(), []);
  const savedUnlockedUnitCount = savedRun?.unlockedUnitCount ?? 0;
  const [screen, setScreen] = useState<ScreenId>(() =>
    restoreScreen(savedRun?.screen, savedUnlockedUnitCount > 0),
  );
  const [stage, setStage] = useState(() => savedRun?.stage ?? 1);
  const [loadouts, setLoadouts] = useState<Loadout[]>(() =>
    normalizeSavedLoadouts(savedRun?.loadouts),
  );
  const [unitFrameIds, setUnitFrameIds] = useState<BaseFrameId[]>(() =>
    normalizeSavedArray(savedRun?.unitFrameIds, createInitialFrameIds()),
  );
  const [unlockedUnitCount, setUnlockedUnitCount] = useState(savedUnlockedUnitCount);
  const [pendingUnitIndex, setPendingUnitIndex] = useState(() => savedRun?.pendingUnitIndex ?? 0);
  const [activeUnitIndex, setActiveUnitIndex] = useState(() => savedRun?.activeUnitIndex ?? 0);
  const [partInventory, setPartInventory] = useState<PartInventory>(() =>
    savedRun?.partInventory ? ensureStarterKit(savedRun.partInventory) : createEmptyPartInventory(),
  );
  const [upgrades, setUpgrades] = useState<PilotUpgrades>(() => ({
    ...cloneUpgrades(),
    ...savedRun?.upgrades,
  }));
  const [aiSlotCounts, setAiSlotCounts] = useState<number[]>(() =>
    normalizeSavedArray(savedRun?.aiSlotCounts, createInitialAiSlotCounts()),
  );
  const [aiRulesByUnit, setAiRulesByUnit] = useState<AiRule[][]>(() =>
    normalizeSavedArray(savedRun?.aiRulesByUnit, createInitialAiRulesByUnit()),
  );
  const [aiPresetsByUnit, setAiPresetsByUnit] = useState<AiPresetId[]>(() =>
    normalizeSavedArray(
      savedRun?.aiPresetsByUnit,
      savedRun?.aiRulesByUnit
        ? Array.from({ length: SQUAD_SIZE }, () => "custom" as AiPresetId)
        : createInitialAiPresets(),
    ),
  );
  const [targetPrioritiesByUnit, setTargetPrioritiesByUnit] = useState<TargetPriorityId[]>(() =>
    normalizeSavedArray(savedRun?.targetPrioritiesByUnit, createInitialTargetPriorities()),
  );
  const [weaponAutoUseByUnit, setWeaponAutoUseByUnit] = useState<WeaponAutoUse[]>(() =>
    normalizeSavedArray(savedRun?.weaponAutoUseByUnit, createInitialWeaponAutoUseByUnit()),
  );
  const [unitHpByUnit, setUnitHpByUnit] = useState<number[]>(() =>
    normalizeSavedArray(savedRun?.unitHpByUnit, createInitialUnitHp()),
  );
  const [sortieEnabled, setSortieEnabled] = useState<boolean[]>(() =>
    normalizeSavedArray(savedRun?.sortieEnabled, createInitialSortieEnabled()),
  );
  const [repairKitStock, setRepairKitStock] = useState(() => savedRun?.repairKitStock ?? 0);
  const [rewardOptions, setRewardOptions] = useState<RewardOption[]>(() => savedRun?.rewardOptions ?? []);
  const [lastCombatReport, setLastCombatReport] = useState<CombatReport | undefined>(
    () => savedRun?.lastCombatReport,
  );
  const [lastOutcome, setLastOutcome] = useState<string | undefined>(() => savedRun?.lastOutcome);

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

  useEffect(() => {
    saveRunState({
      screen,
      stage,
      loadouts,
      unitFrameIds,
      unlockedUnitCount,
      pendingUnitIndex,
      activeUnitIndex,
      partInventory,
      upgrades,
      aiSlotCounts,
      aiRulesByUnit,
      aiPresetsByUnit,
      targetPrioritiesByUnit,
      weaponAutoUseByUnit,
      unitHpByUnit,
      sortieEnabled,
      repairKitStock,
      rewardOptions,
      lastCombatReport,
      lastOutcome,
    });
  }, [
    activeUnitIndex,
    aiPresetsByUnit,
    aiRulesByUnit,
    aiSlotCounts,
    lastCombatReport,
    lastOutcome,
    loadouts,
    partInventory,
    pendingUnitIndex,
    repairKitStock,
    rewardOptions,
    screen,
    sortieEnabled,
    stage,
    targetPrioritiesByUnit,
    unitFrameIds,
    unitHpByUnit,
    unlockedUnitCount,
    upgrades,
    weaponAutoUseByUnit,
  ]);

  const changeLoadout = (slot: EquipSlot, partId: string) => {
    if (activeUnitIndex >= unlockedUnitCount) {
      return;
    }

    const part = getPartById(partId);
    if (part.slot !== slot) {
      playUiSound("error");
      setLastOutcome("このスロットには装備できません");
      return;
    }

    const activeLoadout = loadouts[activeUnitIndex]
      ? normalizeLoadout(loadouts[activeUnitIndex])
      : undefined;
    if (!activeLoadout || activeLoadout[slot] === partId) {
      return;
    }

    if (isShoulderSlotBlocked(activeLoadout, slot) && !isFreePart(partId)) {
      playUiSound("error");
      setLastOutcome("両肩武装を装備中のため、左右肩武装は装備できません");
      return;
    }

    const owned = partInventory[partId] ?? 0;
    const used = countEquippedPart(loadouts, unlockedUnitCount, partId);
    const available = isFreePart(partId) ? 1 : owned - used;
    const donorIndex = !isFreePart(partId) && available <= 0
      ? loadouts.findIndex(
          (unitLoadout, index) =>
            index < unlockedUnitCount &&
            index !== activeUnitIndex &&
            normalizeLoadout(unitLoadout)[slot] === partId,
        )
      : -1;

    if (available <= 0 && donorIndex < 0) {
      playUiSound("error");
      setLastOutcome(`${part.name} の空き在庫がありません`);
      return;
    }

    playUiSound("equip");
    const previousPartId = activeLoadout[slot];
    setLoadouts((current) =>
      current.map((unitLoadout, index) => {
        if (index === activeUnitIndex) {
          return applyShoulderCompatibility(unitLoadout, slot, partId);
        }
        if (index === donorIndex) {
          return applyShoulderCompatibility(unitLoadout, slot, previousPartId);
        }
        return normalizeLoadout(unitLoadout);
      }),
    );

    setLastOutcome(
      donorIndex >= 0
        ? `UNIT ${donorIndex + 1} から ${part.name} を付け替え`
        : `${part.name} を装備`,
    );
  };

  const changeActiveAiRules = (rules: AiRule[]) => {
    setAiPresetsByUnit((current) =>
      current.map((preset, index) => (index === activeUnitIndex ? "custom" : preset)),
    );
    setAiRulesByUnit((current) =>
      current.map((unitRules, index) => (index === activeUnitIndex ? rules : unitRules)),
    );
  };

  const changeActiveAiPreset = (preset: AiPresetId) => {
    playUiSound("select");
    setAiPresetsByUnit((current) =>
      current.map((unitPreset, index) => (index === activeUnitIndex ? preset : unitPreset)),
    );
    if (preset === "custom") {
      return;
    }

    const definition = getAiPresetDefinition(preset);
    const slotCount = aiSlotCounts[activeUnitIndex] ?? definition.rules.length;
    setAiRulesByUnit((current) =>
      current.map((unitRules, index) =>
        index === activeUnitIndex ? createAiPresetRules(preset, slotCount) : unitRules,
      ),
    );
    setTargetPrioritiesByUnit((current) =>
      current.map((unitPriority, index) =>
        index === activeUnitIndex ? definition.targetPriority : unitPriority,
      ),
    );
  };

  const changeActiveTargetPriority = (priority: TargetPriorityId) => {
    playUiSound("select");
    setAiPresetsByUnit((current) =>
      current.map((preset, index) => (index === activeUnitIndex ? "custom" : preset)),
    );
    setTargetPrioritiesByUnit((current) =>
      current.map((unitPriority, index) => (index === activeUnitIndex ? priority : unitPriority)),
    );
  };

  const toggleWeaponAutoUse = (hardpoint: WeaponHardpoint) => {
    playUiSound("toggle");
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
      playUiSound("error");
      setLastOutcome(`UNIT ${unitIndex + 1} は未配備です`);
      return;
    }

    const unitHp = unitHpByUnit[unitIndex] ?? statsByUnit[unitIndex]?.hpMax ?? 0;
    if (unitHp <= 0) {
      playUiSound("error");
      setLastOutcome(`UNIT ${unitIndex + 1} は大破中: リペアキットが必要`);
      return;
    }

    const next = sortieEnabled.map((enabled, index) => (index === unitIndex ? !enabled : enabled));
    const hasReadyUnit = next.some((enabled, index) =>
      index < unlockedUnitCount && enabled && (unitHpByUnit[index] ?? statsByUnit[index]?.hpMax ?? 0) > 0,
    );
    if (!hasReadyUnit) {
      playUiSound("error");
      setLastOutcome("最低1体は出撃ONにしてください");
      return;
    }
    playUiSound("toggle");
    setSortieEnabled(next);
  };

  const useRepairKit = (unitIndex: number) => {
    if (unitIndex >= unlockedUnitCount) {
      return;
    }
    if (repairKitStock <= 0) {
      playUiSound("error");
      setLastOutcome("リペアキットのストックがありません");
      return;
    }

    const maxHp = statsByUnit[unitIndex]?.hpMax ?? 0;
    const currentHp = unitHpByUnit[unitIndex] ?? maxHp;
    if (currentHp >= maxHp) {
      playUiSound("error");
      setLastOutcome(`UNIT ${unitIndex + 1} は修理不要`);
      return;
    }

    playUiSound("repair");
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
    setAiPresetsByUnit(createInitialAiPresets());
    setTargetPrioritiesByUnit(createInitialTargetPriorities());
    setWeaponAutoUseByUnit(createInitialWeaponAutoUseByUnit());
    setUnitHpByUnit(createInitialUnitHp());
    setSortieEnabled(createInitialSortieEnabled());
    setRepairKitStock(0);
    setRewardOptions([]);
    setLastCombatReport(undefined);
  };

  const selectFrame = (frameId: BaseFrameId) => {
    playUiSound("confirm");
    const unitIndex = pendingUnitIndex;
    const frame = getBaseFrameById(frameId);
    const frameLoadout = createInitialLoadoutForFrame(frameId);
    const framePreset = defaultAiPresetForFrame(frameId);
    const frameRules = createAiPresetRules(framePreset);
    const framePresetDefinition = getAiPresetDefinition(framePreset);
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
    setAiPresetsByUnit((current) =>
      current.map((unitPreset, index) => (index === unitIndex ? framePreset : unitPreset)),
    );
    setTargetPrioritiesByUnit((current) =>
      current.map((unitPriority, index) =>
        index === unitIndex ? framePresetDefinition.targetPriority : unitPriority,
      ),
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
    if (stage >= 7) {
      playUiSound("runComplete");
      setRewardOptions([]);
      setLastOutcome("RUN COMPLETE: 全ステージ制圧");
      setScreen("complete");
      return;
    }
    playUiSound("stageClear");
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
    playUiSound("reward");
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
      setRewardOptions([]);
      setLastOutcome("RUN COMPLETE: 全ステージ制圧");
      setScreen("complete");
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
    if (runComplete) {
      playUiSound("error");
      setLastOutcome("RUN COMPLETE: 新しいランを開始できます");
      return;
    }
    if (!sortieReady) {
      playUiSound("error");
      setLastOutcome("出撃可能なユニットがありません");
      setScreen(unlockedUnitCount === 0 ? "frameSelect" : "assemble");
      return;
    }
    playUiSound("confirm");
    unlockCombatAudio();
    setScreen("combat");
  };

  const startNewRun = () => {
    playUiSound("confirm");
    resetRun();
    setLastOutcome("新しいランを開始");
    setScreen("frameSelect");
  };

  const hasUnit = unlockedUnitCount > 0;
  const runComplete = stage >= 7 && lastOutcome?.startsWith("RUN COMPLETE") === true;
  const selectActiveUnit = (index: number) => {
    playUiSound("select");
    setActiveUnitIndex(index);
  };
  const openScreen = (nextScreen: ScreenId) => {
    playUiSound("select");
    setScreen(nextScreen);
  };
  const topNav = (
    <header className="app-header">
      <div>
        <span className="brand-mark">ACR</span>
        <strong>AutoCore Rogue</strong>
        <small>browser prototype</small>
        <small className="save-chip">AUTO SAVE</small>
      </div>
      <nav>
        <button
          className={screen === "assemble" ? "active" : ""}
          onClick={() => openScreen("assemble")}
          disabled={!hasUnit}
        >
          ASSEMBLE
        </button>
        <button className={screen === "ai" ? "active" : ""} onClick={() => openScreen("ai")} disabled={!hasUnit}>
          AI
        </button>
        <button className={screen === "map" ? "active" : ""} onClick={() => openScreen("map")} disabled={!hasUnit}>
          MAP
        </button>
        <button className="primary" onClick={startCombat} disabled={!sortieReady || runComplete}>
          {runComplete ? "RUN CLEAR" : `STAGE ${stage}`}
        </button>
        <button onClick={startNewRun} disabled={!hasUnit && stage === 1}>
          NEW RUN
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
          onSelectUnit={selectActiveUnit}
          onChangeLoadout={changeLoadout}
          onToggleWeaponAutoUse={toggleWeaponAutoUse}
          onToggleSortie={toggleSortie}
          onUseRepairKit={useRepairKit}
          onOpenAi={() => openScreen("ai")}
          onOpenMap={() => openScreen("map")}
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
          aiPreset={aiPresetsByUnit[activeUnitIndex] ?? "custom"}
          targetPriority={targetPrioritiesByUnit[activeUnitIndex] ?? "nearest"}
          onSelectUnit={selectActiveUnit}
          onChangeAiPreset={changeActiveAiPreset}
          onChangeRules={changeActiveAiRules}
          onChangeTargetPriority={changeActiveTargetPriority}
          onOpenAssemble={() => openScreen("assemble")}
          onOpenMap={() => openScreen("map")}
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
          onSelectUnit={selectActiveUnit}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          onOpenAssemble={() => openScreen("assemble")}
          onOpenAi={() => openScreen("ai")}
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
      {screen === "complete" && hasUnit && (
        <RunCompleteScreen
          report={lastCombatReport}
          rulesByUnit={normalizedRulesByUnit}
          onOpenAssemble={() => openScreen("assemble")}
          onOpenAi={() => openScreen("ai")}
          onNewRun={startNewRun}
        />
      )}
      {screen === "map" && hasUnit && (
        <StageMapScreen
          stage={stage}
          lastOutcome={lastOutcome}
          unlockedUnitCount={unlockedUnitCount}
          onOpenAssemble={() => openScreen("assemble")}
          onOpenAi={() => openScreen("ai")}
          onStartCombat={startCombat}
        />
      )}
    </div>
  );
}
