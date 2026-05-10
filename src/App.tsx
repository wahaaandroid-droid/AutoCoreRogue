import { useEffect, useMemo, useState } from "react";
import AssembleScreen from "./components/AssembleScreen";
import BriefingScreen from "./components/BriefingScreen";
import CombatScreen from "./components/CombatScreen";
import FrameSelectScreen from "./components/FrameSelectScreen";
import RewardScreen from "./components/RewardScreen";
import RelicCollectionScreen from "./components/RelicCollectionScreen";
import RelicRewardScreen from "./components/RelicRewardScreen";
import RestScreen from "./components/RestScreen";
import RunCompleteScreen from "./components/RunCompleteScreen";
import ShopScreen from "./components/ShopScreen";
import StageMapScreen from "./components/StageMapScreen";
import { createAutoCombatRules, createAutoTargetPriority } from "./data/aiRules";
import { getBaseFrameById, initialFrameId } from "./data/frames";
import {
  baseUpgrades,
  calculateDerivedStats,
  createEmptyPartInventory,
  createInitialLoadoutForFrame,
  ensureStarterKit,
  equippedPartCounts,
  getPartById,
  grantStarterKit,
  initialLoadout,
  isFreePart,
  normalizeLoadout,
} from "./data/parts";
import { generateRewardOptions, generateShopOffers, RewardOption, ShopOffer } from "./data/rewards";
import {
  appendRunHistory,
  applyRelicBonusesToStats,
  calculateRelicBonuses,
  createInitialMetaSaveState,
  createPendingRelicReward,
  emptyRelicBonuses,
  grantRelicToMeta,
  normalizeMetaSaveState,
} from "./data/relics";
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
  BaseFrameId,
  ClearStartBonusChoice,
  EQUIP_SLOTS,
  EquipSlot,
  Loadout,
  MetaSaveState,
  PartInventory,
  PendingRelicReward,
  PilotUpgrades,
  RelicRewardOption,
  ScreenId,
  SQUAD_SIZE,
  WEAPON_HARDPOINTS,
  WeaponAutoUse,
} from "./types";

const cloneLoadout = (): Loadout => ({ ...initialLoadout });
const cloneUpgrades = (): PilotUpgrades => ({ ...baseUpgrades });
const SAVE_VERSION = 6;
const SAVE_KEY = `autocore-rogue-run-v${SAVE_VERSION}`;
const LEGACY_SAVE_KEYS = [
  "autocore-rogue-run-v5",
  "autocore-rogue-run-v4",
  "autocore-rogue-run-v3",
  "autocore-rogue-run-v2",
  "autocore-rogue-run-v1",
];
const META_SAVE_VERSION = 1;
const META_SAVE_KEY = `autocore-rogue-meta-v${META_SAVE_VERSION}`;
const createInitialLoadouts = (): Loadout[] =>
  Array.from({ length: SQUAD_SIZE }, () => cloneLoadout());
const createInitialFrameIds = (): BaseFrameId[] =>
  Array.from({ length: SQUAD_SIZE }, () => initialFrameId);
const createWeaponAutoUse = (): WeaponAutoUse =>
  WEAPON_HARDPOINTS.reduce((config, hardpoint) => {
    config[hardpoint] = true;
    return config;
  }, {} as WeaponAutoUse);
const createInitialWeaponAutoUseByUnit = (): WeaponAutoUse[] =>
  Array.from({ length: SQUAD_SIZE }, () => createWeaponAutoUse());
const createInitialUnitHp = (bonuses = emptyRelicBonuses): number[] =>
  createInitialLoadouts().map((unitLoadout, index) =>
    applyRelicBonusesToStats(
      calculateDerivedStats(unitLoadout, baseUpgrades, initialFrameId),
      index,
      bonuses,
    ).hpMax,
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
  weaponAutoUseByUnit: WeaponAutoUse[];
  unitHpByUnit: number[];
  sortieEnabled: boolean[];
  repairKitStock: number;
  credits: number;
  rewardOptions: RewardOption[];
  rewardRerollsUsedByWorld: number[];
  pendingRelicReward?: PendingRelicReward;
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

interface MetaSavePayload {
  version: number;
  savedAt: string;
  state: MetaSaveState;
}

const readMetaSaveState = (): MetaSaveState => {
  if (typeof window === "undefined") {
    return createInitialMetaSaveState();
  }

  try {
    const raw = window.localStorage.getItem(META_SAVE_KEY);
    if (!raw) {
      return createInitialMetaSaveState();
    }
    const payload = JSON.parse(raw) as Partial<MetaSavePayload>;
    return normalizeMetaSaveState(payload.state);
  } catch {
    return createInitialMetaSaveState();
  }
};

const saveMetaState = (state: MetaSaveState): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: MetaSavePayload = {
      version: META_SAVE_VERSION,
      savedAt: new Date().toISOString(),
      state: normalizeMetaSaveState(state),
    };
    window.localStorage.setItem(META_SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Meta progression is best-effort for the same reason as run autosave.
  }
};

const normalizeSavedArray = <T,>(value: T[] | undefined, fallback: T[]): T[] =>
  Array.isArray(value) ? fallback.map((item, index) => value[index] ?? item) : fallback;

const normalizeSavedLoadouts = (value: Loadout[] | undefined): Loadout[] =>
  normalizeSavedArray(value, createInitialLoadouts()).map((loadout) => normalizeLoadout(loadout));

const restoreScreen = (screen: ScreenId | undefined, hasSavedUnit: boolean): ScreenId => {
  if (screen === "ai") {
    return hasSavedUnit ? "assemble" : "frameSelect";
  }
  if (screen === "relicReward" || screen === "relicCollection") {
    return screen;
  }
  if (!hasSavedUnit) {
    return "frameSelect";
  }
  return screen === "combat" ? "briefing" : screen ?? "map";
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

export default function App() {
  const savedRun = useMemo(() => readSavedRunState(), []);
  const savedMeta = useMemo(() => readMetaSaveState(), []);
  const [metaState, setMetaState] = useState<MetaSaveState>(() => savedMeta);
  const relicBonuses = useMemo(() => calculateRelicBonuses(metaState), [metaState]);
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
  const [weaponAutoUseByUnit, setWeaponAutoUseByUnit] = useState<WeaponAutoUse[]>(() =>
    normalizeSavedArray(savedRun?.weaponAutoUseByUnit, createInitialWeaponAutoUseByUnit()),
  );
  const [unitHpByUnit, setUnitHpByUnit] = useState<number[]>(() =>
    normalizeSavedArray(savedRun?.unitHpByUnit, createInitialUnitHp(relicBonuses)),
  );
  const [sortieEnabled, setSortieEnabled] = useState<boolean[]>(() =>
    normalizeSavedArray(savedRun?.sortieEnabled, createInitialSortieEnabled()),
  );
  const [repairKitStock, setRepairKitStock] = useState(() => savedRun?.repairKitStock ?? 0);
  const [credits, setCredits] = useState(() => savedRun?.credits ?? relicBonuses.initialCredits);
  const [rewardOptions, setRewardOptions] = useState<RewardOption[]>(() => savedRun?.rewardOptions ?? []);
  const [rewardRerollsUsedByWorld, setRewardRerollsUsedByWorld] = useState<number[]>(() =>
    normalizeSavedArray(savedRun?.rewardRerollsUsedByWorld, [0, 0, 0]),
  );
  const [pendingRelicReward, setPendingRelicReward] = useState<PendingRelicReward | undefined>(
    () => savedRun?.pendingRelicReward,
  );
  const [lastCombatReport, setLastCombatReport] = useState<CombatReport | undefined>(
    () => savedRun?.lastCombatReport,
  );
  const [lastOutcome, setLastOutcome] = useState<string | undefined>(() => savedRun?.lastOutcome);

  const statsByUnit = useMemo(
    () =>
      loadouts.map((unitLoadout, index) =>
        applyRelicBonusesToStats(
          calculateDerivedStats(unitLoadout, upgrades, unitFrameIds[index] ?? initialFrameId),
          index,
          relicBonuses,
        ),
      ),
    [loadouts, relicBonuses, upgrades, unitFrameIds],
  );
  const equippedCounts = useMemo(
    () => equippedPartCounts(loadouts, unlockedUnitCount),
    [loadouts, unlockedUnitCount],
  );
  const combatRulesByUnit = useMemo(
    () => statsByUnit.map((stats) => createAutoCombatRules(stats)),
    [statsByUnit],
  );
  const combatTargetPrioritiesByUnit = useMemo(
    () => statsByUnit.map((stats) => createAutoTargetPriority(stats)),
    [statsByUnit],
  );
  const sortieReady = useMemo(
    () =>
      statsByUnit.slice(0, unlockedUnitCount).some((stats, index) =>
        (sortieEnabled[index] ?? false) && (unitHpByUnit[index] ?? stats.hpMax) > 0,
      ),
    [sortieEnabled, statsByUnit, unitHpByUnit, unlockedUnitCount],
  );
  const stageChoices = useMemo(() => createStageChoices(stage, relicBonuses), [relicBonuses, stage]);
  const currentStagePlan = useMemo(
    () => getStagePlan(stage, selectedStageNodeId, relicBonuses),
    [relicBonuses, stage, selectedStageNodeId],
  );
  const currentCombatStageType: CombatStageType = isCombatStageType(currentStagePlan.type)
    ? currentStagePlan.type
    : "normal";
  const shopOffers = useMemo(
    () =>
      generateShopOffers(
        stage,
        partInventory,
        relicBonuses,
      ),
    [partInventory, relicBonuses, stage],
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
    if (screen === "relicReward" && !pendingRelicReward) {
      setScreen("frameSelect");
    }
  }, [pendingRelicReward, screen]);

  useEffect(() => {
    if (screen === "briefing" && !isCombatStageType(currentStagePlan.type)) {
      setScreen("map");
    }
  }, [currentStagePlan.type, screen]);

  useEffect(() => {
    saveMetaState(metaState);
  }, [metaState]);

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
      weaponAutoUseByUnit,
      unitHpByUnit,
      sortieEnabled,
      repairKitStock,
      credits,
      rewardOptions,
      rewardRerollsUsedByWorld,
      pendingRelicReward,
      lastCombatReport,
      lastOutcome,
    });
  }, [
    activeUnitIndex,
    credits,
    lastCombatReport,
    lastOutcome,
    loadouts,
    pendingRelicReward,
    partInventory,
    pendingUnitIndex,
    repairKitStock,
    rewardOptions,
    rewardRerollsUsedByWorld,
    screen,
    selectedStageNodeId,
    sortieEnabled,
    stage,
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
          return normalizeLoadout({
            ...unitLoadout,
            [slot]: partId,
          });
        }
        if (index === donorIndex) {
          return normalizeLoadout({
            ...unitLoadout,
            [slot]: previousPartId,
          });
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

  const applyRecommendedPrep = () => {
    const repairCandidate = statsByUnit
      .slice(0, unlockedUnitCount)
      .map((stats, index) => {
        const hp = Math.ceil(Math.min(unitHpByUnit[index] ?? stats.hpMax, stats.hpMax));
        return { index, hp, ratio: stats.hpMax > 0 ? hp / stats.hpMax : 0 };
      })
      .filter((unit) => unit.hp < (statsByUnit[unit.index]?.hpMax ?? unit.hp))
      .sort((a, b) => a.ratio - b.ratio)[0];

    if (repairCandidate && repairKitStock > 0 && repairCandidate.ratio <= 0.55) {
      useRepairKit(repairCandidate.index);
      return;
    }

    const disabledReadyIndex = statsByUnit
      .slice(0, unlockedUnitCount)
      .findIndex((stats, index) =>
        !(sortieEnabled[index] ?? false) && (unitHpByUnit[index] ?? stats.hpMax) > 0,
      );

    if (disabledReadyIndex >= 0) {
      playUiSound("toggle");
      setSortieEnabled((current) =>
        current.map((enabled, index) => (index === disabledReadyIndex ? true : enabled)),
      );
      setLastOutcome(`UNIT ${disabledReadyIndex + 1} を出撃ON`);
      return;
    }

    const hasReadyUnit = statsByUnit
      .slice(0, unlockedUnitCount)
      .some((stats, index) => (unitHpByUnit[index] ?? stats.hpMax) > 0);

    if (!hasReadyUnit) {
      playUiSound("error");
      setLastOutcome("全機大破: リペアキットの確保が必要です");
      return;
    }

    const overloadedIndex = statsByUnit
      .slice(0, unlockedUnitCount)
      .findIndex((stats) => stats.overloadRatio > 0);

    if (overloadedIndex >= 0) {
      playUiSound("select");
      setActiveUnitIndex(overloadedIndex);
      setLastOutcome(`UNIT ${overloadedIndex + 1}: 積載超過を整備室で調整できます`);
      setScreen("assemble");
      return;
    }

    if (repairCandidate && repairKitStock > 0) {
      setLastOutcome(`UNIT ${repairCandidate.index + 1}: 軽微な損耗。必要なら修理できます`);
      return;
    }

    playUiSound("select");
    setLastOutcome("準備完了: このまま出撃できます");
  };

  const resetRun = (options?: { preservePendingRelic?: boolean; nextMetaState?: MetaSaveState }) => {
    const startingBonuses = calculateRelicBonuses(options?.nextMetaState ?? metaState);
    setStage(1);
    setSelectedStageNodeId(undefined);
    setLoadouts(createInitialLoadouts());
    setUnitFrameIds(createInitialFrameIds());
    setUnlockedUnitCount(0);
    setPendingUnitIndex(0);
    setActiveUnitIndex(0);
    setPartInventory(createEmptyPartInventory());
    setUpgrades(cloneUpgrades());
    setWeaponAutoUseByUnit(createInitialWeaponAutoUseByUnit());
    setUnitHpByUnit(createInitialUnitHp(startingBonuses));
    setSortieEnabled(createInitialSortieEnabled());
    setRepairKitStock(0);
    setCredits(startingBonuses.initialCredits);
    setRewardOptions([]);
    setRewardRerollsUsedByWorld([0, 0, 0]);
    if (!options?.preservePendingRelic) {
      setPendingRelicReward(undefined);
    }
    setLastCombatReport(undefined);
  };

  const selectFrame = (frameId: BaseFrameId) => {
    playUiSound("confirm");
    const unitIndex = pendingUnitIndex;
    const frame = getBaseFrameById(frameId);
    const frameLoadout = createInitialLoadoutForFrame(frameId);
    const unitStats = applyRelicBonusesToStats(
      calculateDerivedStats(frameLoadout, upgrades, frameId),
      unitIndex,
      relicBonuses,
    );

    setLoadouts((current) =>
      current.map((unitLoadout, index) => (index === unitIndex ? frameLoadout : unitLoadout)),
    );
    setUnitFrameIds((current) =>
      current.map((currentFrameId, index) => (index === unitIndex ? frameId : currentFrameId)),
    );
    setPartInventory((current) => grantStarterKit(current));
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
    setScreen("briefing");
  };

  const handleVictory = (remainingHpByUnit: number[], report: CombatReport) => {
    setUnitHpByUnit((current) =>
      current.map((hp, index) => remainingHpByUnit[index] ?? hp),
    );
    setLastCombatReport(report);
    if (stage >= TOTAL_STAGES) {
      playUiSound("runComplete");
      const pending = createPendingRelicReward("clear", TOTAL_STAGES, TOTAL_STAGES, metaState);
      resetRun({ preservePendingRelic: true });
      if (pending) {
        setPendingRelicReward(pending);
        setLastOutcome("RUN COMPLETE: 遺物を選択してください");
        setScreen("relicReward");
      } else {
        setLastOutcome("RUN COMPLETE: 新しいランを開始できます");
        setScreen("frameSelect");
      }
      return;
    }
    playUiSound("stageClear");
    setRewardOptions(
      generateRewardOptions(
        stage,
        partInventory,
        currentStagePlan.type,
        relicBonuses,
      ),
    );
    setLastOutcome(`WORLD ${worldForStage(stage)} / STAGE ${stage} CLEAR`);
    setScreen("reward");
  };

  const handleDefeat = () => {
    const clearedStages = Math.max(0, stage - 1);
    const pending = createPendingRelicReward("defeat", stage, clearedStages, metaState);
    resetRun({ preservePendingRelic: true });
    if (pending) {
      playUiSound("reward");
      setPendingRelicReward(pending);
      setLastOutcome(`機体大破: STAGE ${stage} 到達遺物を選択`);
      setScreen("relicReward");
      return;
    }
    setPendingRelicReward(undefined);
    setLastOutcome("機体大破: 1戦未勝利のため遺物なし");
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
      if (relicBonuses.worldEntryHealPercent > 0) {
        healAllUnits(relicBonuses.worldEntryHealPercent);
      }
      setPendingUnitIndex(unlockIndex);
      setLastOutcome(
        `${outcome} / UNIT ${unlockIndex + 1} 配備選択${
          relicBonuses.worldEntryHealPercent > 0
            ? ` / 補給ビーコン +${Math.round(relicBonuses.worldEntryHealPercent * 100)}%`
            : ""
        }`,
      );
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
              ? normalizeLoadout({
                  ...unitLoadout,
                  [slot]: part.id,
                })
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

    if (payload.kind === "repairKit") {
      setRepairKitStock((current) => current + payload.amount);
    }

    if (payload.kind === "credits") {
      setCredits((current) => current + payload.amount);
    }
  };

  const rewardOutcomeText = (reward: RewardOption): string => {
    const payload = reward.payload;
    if (payload.kind !== "part") {
      return `${reward.title} を獲得`;
    }

    const part = getPartById(payload.partId);
    if (activeUnitIndex < unlockedUnitCount && EQUIP_SLOTS.includes(part.slot as EquipSlot)) {
      return `UNIT ${activeUnitIndex + 1}: ${part.name} を自動装備`;
    }
    return `${part.name} を獲得`;
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

    advanceToNextStage(rewardOutcomeText(reward));
  };

  const rerollRewardOptions = () => {
    const worldIndex = worldForStage(stage) - 1;
    const used = rewardRerollsUsedByWorld[worldIndex] ?? 0;
    if (used >= relicBonuses.rewardRerollsPerWorld) {
      playUiSound("error");
      setLastOutcome("報酬再抽選はこのWORLDでは使用済み");
      return;
    }
    playUiSound("select");
    const nextUsed = used + 1;
    setRewardRerollsUsedByWorld((current) =>
      current.map((count, index) => (index === worldIndex ? nextUsed : count)),
    );
    setRewardOptions(
      generateRewardOptions(
        stage,
        partInventory,
        currentStagePlan.type,
        relicBonuses,
        nextUsed * 17,
      ),
    );
    setLastOutcome(`報酬フィルタ: WORLD ${worldForStage(stage)} 再抽選`);
  };

  const selectStageNode = (nodeId: string) => {
    playUiSound("select");
    setSelectedStageNodeId(nodeId);
  };

  const resolveRestSite = () => {
    playUiSound("repair");
    const healPercent = 0.5 + relicBonuses.restHealBonus;
    healAllUnits(healPercent);
    advanceToNextStage(`休憩地点で全機HPを${Math.round(healPercent * 100)}%回復`);
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
      setLastOutcome("出撃前確認: 修理または出撃ONが必要です");
      setScreen(unlockedUnitCount === 0 ? "frameSelect" : "briefing");
      return;
    }
    if (screen !== "briefing") {
      playUiSound("select");
      setScreen("briefing");
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

  const finishRelicFlow = (nextMetaState: MetaSaveState, pending: PendingRelicReward) => {
    const finalizedMeta = appendRunHistory(nextMetaState, pending, new Date().toISOString());
    setMetaState(finalizedMeta);
    resetRun({ nextMetaState: finalizedMeta });
    setLastOutcome("遺物を保存: 新しいランを開始できます");
    setScreen("frameSelect");
  };

  const pickRelicReward = (option: RelicRewardOption) => {
    if (!pendingRelicReward) {
      return;
    }

    playUiSound("reward");
    const granted = grantRelicToMeta(metaState, option.relicId);
    const nextGrantedRelicIds = [...pendingRelicReward.grantedRelicIds, option.relicId];
    const nextPendingBase: PendingRelicReward = {
      ...pendingRelicReward,
      grantedRelicIds: nextGrantedRelicIds,
      picksRemaining: Math.max(0, pendingRelicReward.picksRemaining - 1),
    };

    if (pendingRelicReward.reason === "clear" && pendingRelicReward.phase === "normal") {
      const nextPending = createPendingRelicReward(
        "clear",
        pendingRelicReward.reachedStage,
        pendingRelicReward.clearedStages,
        granted.metaState,
        "clear",
        nextGrantedRelicIds,
      );
      if (nextPending) {
        setMetaState(granted.metaState);
        setPendingRelicReward(nextPending);
        setLastOutcome("全クリア専用遺物を選択してください");
        return;
      }
    }

    finishRelicFlow(granted.metaState, nextPendingBase);
  };

  const skipRelicReward = () => {
    playUiSound("confirm");
    setPendingRelicReward(undefined);
    resetRun();
    setLastOutcome("遺物選択を終了: 新しいランを開始できます");
    setScreen("frameSelect");
  };

  const changeClearStartBonus = (choice: ClearStartBonusChoice) => {
    playUiSound("select");
    setMetaState((current) => ({
      ...normalizeMetaSaveState(current),
      clearStartBonusChoice: choice,
    }));
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
  const openRelicCollection = () => openScreen("relicCollection");
  const closeRelicCollection = () => {
    playUiSound("select");
    setScreen(hasUnit ? "map" : "frameSelect");
  };
  const rewardRerollsRemaining = Math.max(
    0,
    relicBonuses.rewardRerollsPerWorld - (rewardRerollsUsedByWorld[worldForStage(stage) - 1] ?? 0),
  );
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
        {screen !== "combat" && screen !== "relicReward" && screen !== "relicCollection" && (
          <button onClick={openRelicCollection}>遺物</button>
        )}
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
          onSelectUnit={selectActiveUnit}
          onChangeLoadout={changeLoadout}
          onToggleSortie={toggleSortie}
          onUseRepairKit={useRepairKit}
          onOpenMap={() => openScreen("map")}
          onStartCombat={startCombat}
          canStartCombat={sortieReady}
        />
      )}
      {screen === "briefing" && hasUnit && isCombatStageType(currentStagePlan.type) && (
        <BriefingScreen
          stage={stage}
          plan={currentStagePlan}
          stageType={currentCombatStageType}
          statsByUnit={statsByUnit}
          unitHpByUnit={unitHpByUnit}
          sortieEnabled={sortieEnabled}
          unlockedUnitCount={unlockedUnitCount}
          repairKitStock={repairKitStock}
          targetPrioritiesByUnit={combatTargetPrioritiesByUnit}
          canStartCombat={sortieReady}
          lastOutcome={lastOutcome}
          onOpenMap={() => openScreen("map")}
          onOpenMaintenance={() => openScreen("assemble")}
          onRecommendedPrep={applyRecommendedPrep}
          onQuickRepair={useRepairKit}
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
          rerollsRemaining={rewardRerollsRemaining}
          onRerollRewards={rerollRewardOptions}
          onPickReward={applyReward}
        />
      )}
      {screen === "relicReward" && pendingRelicReward && (
        <RelicRewardScreen
          pending={pendingRelicReward}
          metaState={metaState}
          onPickRelic={pickRelicReward}
          onSkip={skipRelicReward}
        />
      )}
      {screen === "relicCollection" && (
        <RelicCollectionScreen
          metaState={metaState}
          onBack={closeRelicCollection}
          onChangeClearBonus={changeClearStartBonus}
        />
      )}
      {screen === "complete" && hasUnit && (
        <RunCompleteScreen
          report={lastCombatReport}
          rulesByUnit={combatRulesByUnit}
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
          canStartStage={hasUnit}
          onSelectStageNode={selectStageNode}
          onOpenAssemble={() => openScreen("assemble")}
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
          healPercent={0.5 + relicBonuses.restHealBonus}
          onRest={resolveRestSite}
          onBackMap={() => openScreen("map")}
        />
      )}
    </div>
  );
}
