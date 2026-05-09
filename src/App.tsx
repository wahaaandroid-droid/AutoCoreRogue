import { useEffect, useMemo, useState } from "react";
import AssembleScreen from "./components/AssembleScreen";
import AiEditorScreen from "./components/AiEditorScreen";
import CombatScreen from "./components/CombatScreen";
import FrameSelectScreen from "./components/FrameSelectScreen";
import RewardScreen from "./components/RewardScreen";
import RestScreen from "./components/RestScreen";
import RunCompleteScreen from "./components/RunCompleteScreen";
import ShopScreen from "./components/ShopScreen";
import StageMapScreen from "./components/StageMapScreen";
import {
  createAiPresetRules,
  createInitialAiRules,
  defaultAiPresetForFrame,
  ensureAiRuleSlots,
  getAiPresetDefinition,
} from "./data/aiRules";
import {
  STARTER_AI_SLOT_COUNT,
  aiUnlockPackages,
  createInitialUnlockedAiPackageIds,
  getAiUnlockPackage,
  getAiUnlockState,
  isAiRuleUnlocked,
  normalizeAiUnlockPackageIds,
  normalizeRulesForCombat,
} from "./data/aiUnlocks";
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
import { generateRewardOptions, generateShopOffers, RewardOption, ShopOffer } from "./data/rewards";
import {
  CombatStageType,
  TOTAL_STAGES,
  createStageChoices,
  getStagePlan,
  isCombatStageType,
  worldForStage,
} from "./data/stages";
import { CombatReport } from "./game/combat";
import { playUiSound, unlockCombatAudio } from "./game/sound";
import {
  AiRule,
  AiUnlockPackageId,
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
const SAVE_VERSION = 4;
const SAVE_KEY = `autocore-rogue-run-v${SAVE_VERSION}`;
const LEGACY_SAVE_KEYS = ["autocore-rogue-run-v3", "autocore-rogue-run-v2", "autocore-rogue-run-v1"];
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
  selectedStageNodeId?: string;
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
  unlockedAiPackageIds: AiUnlockPackageId[];
  targetPrioritiesByUnit: TargetPriorityId[];
  weaponAutoUseByUnit: WeaponAutoUse[];
  unitHpByUnit: number[];
  sortieEnabled: boolean[];
  repairKitStock: number;
  credits: number;
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
  const [selectedStageNodeId, setSelectedStageNodeId] = useState<string | undefined>(
    () => savedRun?.selectedStageNodeId,
  );
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
  const [unlockedAiPackageIds, setUnlockedAiPackageIds] = useState<AiUnlockPackageId[]>(() =>
    normalizeAiUnlockPackageIds(savedRun?.unlockedAiPackageIds),
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
  const [credits, setCredits] = useState(() => savedRun?.credits ?? 0);
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
  const aiUnlockState = useMemo(
    () => getAiUnlockState(unlockedAiPackageIds),
    [unlockedAiPackageIds],
  );
  const equippedCounts = useMemo(
    () => equippedPartCounts(loadouts, unlockedUnitCount),
    [loadouts, unlockedUnitCount],
  );
  const normalizedRulesByUnit = useMemo(
    () =>
      aiRulesByUnit.map((rules, index) =>
        ensureAiRuleSlots(rules, aiSlotCounts[index] ?? STARTER_AI_SLOT_COUNT),
      ),
    [aiRulesByUnit, aiSlotCounts],
  );
  const combatRulesByUnit = useMemo(
    () => normalizedRulesByUnit.map((rules) => normalizeRulesForCombat(rules, aiUnlockState)),
    [aiUnlockState, normalizedRulesByUnit],
  );
  const combatTargetPrioritiesByUnit = useMemo(
    () =>
      targetPrioritiesByUnit.map((priority) =>
        aiUnlockState.targetPriorities.has(priority) ? priority : "nearest",
      ),
    [aiUnlockState, targetPrioritiesByUnit],
  );
  const sortieReady = useMemo(
    () =>
      statsByUnit.slice(0, unlockedUnitCount).some((stats, index) =>
        (sortieEnabled[index] ?? false) && (unitHpByUnit[index] ?? stats.hpMax) > 0,
      ),
    [sortieEnabled, statsByUnit, unitHpByUnit, unlockedUnitCount],
  );
  const stageChoices = useMemo(() => createStageChoices(stage), [stage]);
  const currentStagePlan = useMemo(
    () => getStagePlan(stage, selectedStageNodeId),
    [stage, selectedStageNodeId],
  );
  const currentCombatStageType: CombatStageType = isCombatStageType(currentStagePlan.type)
    ? currentStagePlan.type
    : "normal";
  const shopOffers = useMemo(
    () =>
      generateShopOffers(
        stage,
        partInventory,
        aiSlotCounts[activeUnitIndex] ?? STARTER_AI_SLOT_COUNT,
        unlockedAiPackageIds,
      ),
    [activeUnitIndex, aiSlotCounts, partInventory, stage, unlockedAiPackageIds],
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
      selectedStageNodeId,
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
      unlockedAiPackageIds,
      targetPrioritiesByUnit,
      weaponAutoUseByUnit,
      unitHpByUnit,
      sortieEnabled,
      repairKitStock,
      credits,
      rewardOptions,
      lastCombatReport,
      lastOutcome,
    });
  }, [
    activeUnitIndex,
    aiPresetsByUnit,
    aiRulesByUnit,
    aiSlotCounts,
    credits,
    lastCombatReport,
    lastOutcome,
    loadouts,
    partInventory,
    pendingUnitIndex,
    repairKitStock,
    rewardOptions,
    screen,
    selectedStageNodeId,
    sortieEnabled,
    stage,
    targetPrioritiesByUnit,
    unitFrameIds,
    unitHpByUnit,
    unlockedUnitCount,
    unlockedAiPackageIds,
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
        index === activeUnitIndex ? createAiPresetRules(preset, slotCount, unlockedAiPackageIds) : unitRules,
      ),
    );
    setTargetPrioritiesByUnit((current) =>
      current.map((unitPriority, index) =>
        index === activeUnitIndex && aiUnlockState.targetPriorities.has(definition.targetPriority)
          ? definition.targetPriority
          : unitPriority,
      ),
    );
  };

  const changeActiveTargetPriority = (priority: TargetPriorityId) => {
    if (!aiUnlockState.targetPriorities.has(priority)) {
      playUiSound("error");
      setLastOutcome(`${priority} は未解放のターゲット優先です`);
      return;
    }
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
    setSelectedStageNodeId(undefined);
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
    setUnlockedAiPackageIds(createInitialUnlockedAiPackageIds());
    setTargetPrioritiesByUnit(createInitialTargetPriorities());
    setWeaponAutoUseByUnit(createInitialWeaponAutoUseByUnit());
    setUnitHpByUnit(createInitialUnitHp());
    setSortieEnabled(createInitialSortieEnabled());
    setRepairKitStock(0);
    setCredits(0);
    setRewardOptions([]);
    setLastCombatReport(undefined);
  };

  const selectFrame = (frameId: BaseFrameId) => {
    playUiSound("confirm");
    const unitIndex = pendingUnitIndex;
    const frame = getBaseFrameById(frameId);
    const frameLoadout = createInitialLoadoutForFrame(frameId);
    const framePreset = defaultAiPresetForFrame(frameId);
    const frameRules = createAiPresetRules(framePreset, STARTER_AI_SLOT_COUNT, unlockedAiPackageIds);
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
        index === unitIndex && aiUnlockState.targetPriorities.has(framePresetDefinition.targetPriority)
          ? framePresetDefinition.targetPriority
          : unitPriority,
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
    if (stage >= TOTAL_STAGES) {
      playUiSound("runComplete");
      setRewardOptions([]);
      setLastOutcome("RUN COMPLETE: 3ワールド全ステージ制圧");
      setScreen("complete");
      return;
    }
    playUiSound("stageClear");
    setRewardOptions(
      generateRewardOptions(
        stage,
        partInventory,
        aiSlotCounts[activeUnitIndex] ?? STARTER_AI_SLOT_COUNT,
        currentStagePlan.type,
        unlockedAiPackageIds,
      ),
    );
    setLastOutcome(`WORLD ${worldForStage(stage)} / STAGE ${stage} CLEAR`);
    setScreen("reward");
  };

  const handleDefeat = () => {
    resetRun();
    setLastOutcome("機体大破: ランを最初から再開");
    setScreen("frameSelect");
  };

  const unitUnlockIndexForStage = (nextStage: number): number | undefined => {
    if (nextStage === 8) {
      return 1;
    }
    if (nextStage === 15) {
      return 2;
    }
    return undefined;
  };

  const advanceToNextStage = (outcome: string) => {
    const nextStage = stage + 1;
    setSelectedStageNodeId(undefined);
    setRewardOptions([]);

    if (nextStage > TOTAL_STAGES) {
      setLastOutcome("RUN COMPLETE: 3ワールド全ステージ制圧");
      setScreen("complete");
      return;
    }

    setStage(nextStage);
    const unlockIndex = unitUnlockIndexForStage(nextStage);
    if (unlockIndex !== undefined && unlockedUnitCount < unlockIndex + 1) {
      setPendingUnitIndex(unlockIndex);
      setLastOutcome(`${outcome} / UNIT ${unlockIndex + 1} 配備選択`);
      setScreen("frameSelect");
      return;
    }

    setLastOutcome(outcome);
    setScreen("map");
  };

  const healAllUnits = (percent: number) => {
    setUnitHpByUnit((current) =>
      current.map((hp, index) => {
        if (index >= unlockedUnitCount) {
          return hp;
        }
        const maxHp = statsByUnit[index]?.hpMax ?? hp;
        const currentHp = Math.max(0, hp ?? maxHp);
        return Math.min(maxHp, currentHp + maxHp * percent);
      }),
    );
    setSortieEnabled((current) =>
      current.map((enabled, index) =>
        index < unlockedUnitCount ? true : enabled,
      ),
    );
  };

  const unlockAiPackage = (packageId: AiUnlockPackageId) => {
    if (unlockedAiPackageIds.includes(packageId)) {
      return;
    }

    const item = getAiUnlockPackage(packageId);
    const nextUnlockedPackageIds = [...unlockedAiPackageIds, packageId];
    const nextUnlockState = getAiUnlockState(nextUnlockedPackageIds);
    setUnlockedAiPackageIds(nextUnlockedPackageIds);
    setAiRulesByUnit((current) =>
      current.map((rules, unitIndex) => {
        if (unitIndex >= unlockedUnitCount || item.recommendedRules.length === 0) {
          return rules;
        }
        const slotCount = aiSlotCounts[unitIndex] ?? STARTER_AI_SLOT_COUNT;
        const normalized = ensureAiRuleSlots(rules, slotCount);
        const nextRules = [...normalized];
        for (const recommendedRule of item.recommendedRules) {
          if (!isAiRuleUnlocked(recommendedRule, nextUnlockState)) {
            continue;
          }
          const duplicate = nextRules.some(
            (rule) =>
              rule.condition === recommendedRule.condition &&
              rule.action === recommendedRule.action,
          );
          if (duplicate) {
            continue;
          }
          const insertIndex = nextRules.findIndex((rule) => rule.action === "idle" || !rule.enabled);
          if (insertIndex < 0) {
            continue;
          }
          nextRules[insertIndex] = {
            ...recommendedRule,
            id: `${recommendedRule.id}-u${unitIndex + 1}`,
          };
        }
        return nextRules;
      }),
    );
    setLastOutcome(`${item.name} をAIチップとして解放`);
  };

  const applyRewardPayload = (payload: RewardOption["payload"]) => {
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

    if (payload.kind === "aiUnlock") {
      unlockAiPackage(payload.packageId);
    }

    if (payload.kind === "repairKit") {
      setRepairKitStock((current) => current + payload.amount);
    }

    if (payload.kind === "credits") {
      setCredits((current) => current + payload.amount);
    }
  };

  const applyReward = (reward: RewardOption) => {
    playUiSound("reward");
    applyRewardPayload(reward.payload);

    if (stage >= TOTAL_STAGES) {
      setRewardOptions([]);
      setLastOutcome("RUN COMPLETE: 3ワールド全ステージ制圧");
      setScreen("complete");
      return;
    }

    advanceToNextStage(`${reward.title} を獲得`);
  };

  const selectStageNode = (nodeId: string) => {
    playUiSound("select");
    setSelectedStageNodeId(nodeId);
  };

  const resolveRestSite = () => {
    playUiSound("repair");
    healAllUnits(0.5);
    advanceToNextStage(`休憩地点で全機HPを50%回復`);
  };

  const buyShopOffer = (offer: ShopOffer) => {
    if (credits < offer.cost) {
      playUiSound("error");
      setLastOutcome(`${offer.title}: クレジット不足`);
      return;
    }

    playUiSound("reward");
    setCredits((current) => Math.max(0, current - offer.cost));
    if (offer.payload.kind === "repairAll") {
      healAllUnits(offer.payload.percent);
    } else {
      applyRewardPayload(offer.payload);
    }
    setLastOutcome(`${offer.title} を購入`);
  };

  const leaveShop = () => {
    playUiSound("confirm");
    advanceToNextStage("商人ノードを通過");
  };

  const startCombat = () => {
    if (runComplete) {
      playUiSound("error");
      setLastOutcome("RUN COMPLETE: 新しいランを開始できます");
      return;
    }
    if (currentStagePlan.type === "rest") {
      playUiSound("select");
      setScreen("rest");
      return;
    }
    if (currentStagePlan.type === "shop") {
      playUiSound("select");
      setLastOutcome("商人ノード: 購入または通過を選択");
      setScreen("shop");
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
  const runComplete = stage >= TOTAL_STAGES && lastOutcome?.startsWith("RUN COMPLETE") === true;
  const selectActiveUnit = (index: number) => {
    playUiSound("select");
    setActiveUnitIndex(index);
  };
  const openScreen = (nextScreen: ScreenId) => {
    playUiSound("select");
    setScreen(nextScreen);
  };
  const topBar = (
    <header className="app-header mode-header">
      <div>
        <span className="brand-mark">ACR</span>
        <strong>AutoCore Rogue</strong>
        <small>WORLD {worldForStage(stage)} / STAGE {stage}</small>
        <small className="save-chip">AUTO SAVE</small>
      </div>
      <div className="mode-stat-strip">
        <span>{screen.toUpperCase()}</span>
        <span>{credits} CR</span>
        <span>AI {unlockedAiPackageIds.length}/{aiUnlockPackages.length}</span>
      </div>
    </header>
  );

  return (
    <div className="app-shell">
      {topBar}
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
          slotCount={aiSlotCounts[activeUnitIndex] ?? STARTER_AI_SLOT_COUNT}
          activeUnitIndex={activeUnitIndex}
          unlockedUnitCount={unlockedUnitCount}
          statsByUnit={statsByUnit}
          aiPreset={aiPresetsByUnit[activeUnitIndex] ?? "custom"}
          targetPriority={targetPrioritiesByUnit[activeUnitIndex] ?? "nearest"}
          unlockedAiPackageIds={unlockedAiPackageIds}
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
          stageNodeId={currentStagePlan.id}
          stageType={currentCombatStageType}
          statsByUnit={statsByUnit}
          unitHpByUnit={unitHpByUnit}
          sortieEnabled={sortieEnabled}
          unlockedUnitCount={unlockedUnitCount}
          rulesByUnit={combatRulesByUnit}
          targetPrioritiesByUnit={combatTargetPrioritiesByUnit}
          weaponAutoUseByUnit={weaponAutoUseByUnit}
          activeUnitIndex={activeUnitIndex}
          onSelectUnit={selectActiveUnit}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
        />
      )}
      {screen === "reward" && (
        <RewardScreen
          stage={stage}
          credits={credits}
          rewards={rewardOptions}
          report={lastCombatReport}
          rulesByUnit={combatRulesByUnit}
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
          selectedNodeId={currentStagePlan.id}
          stageChoices={stageChoices}
          lastOutcome={lastOutcome}
          unlockedUnitCount={unlockedUnitCount}
          unitHpByUnit={unitHpByUnit}
          statsByUnit={statsByUnit}
          credits={credits}
          canStartStage={sortieReady || !isCombatStageType(currentStagePlan.type)}
          onSelectStageNode={selectStageNode}
          onOpenAssemble={() => openScreen("assemble")}
          onOpenAi={() => openScreen("ai")}
          onStartCombat={startCombat}
        />
      )}
      {screen === "shop" && hasUnit && (
        <ShopScreen
          stage={stage}
          plan={currentStagePlan}
          credits={credits}
          shopOffers={shopOffers}
          onBuyShopOffer={buyShopOffer}
          onLeaveShop={leaveShop}
          onBackMap={() => openScreen("map")}
        />
      )}
      {screen === "rest" && hasUnit && (
        <RestScreen
          stage={stage}
          plan={currentStagePlan}
          unlockedUnitCount={unlockedUnitCount}
          unitHpByUnit={unitHpByUnit}
          statsByUnit={statsByUnit}
          onRest={resolveRestSite}
          onBackMap={() => openScreen("map")}
        />
      )}
    </div>
  );
}
