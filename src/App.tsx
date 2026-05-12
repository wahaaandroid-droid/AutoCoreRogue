import { useEffect, useMemo, useState } from "react";
import CombatScreen from "./components/CombatScreen";
import {
  ARCHETYPE_IDS,
  UNIT_GROWTH_MAX,
  UPGRADE_PROGRESS_PIPS,
  archetypeLabels,
  applyPrepUpgradeToGrowths,
  buildSimpleStats,
  createEmptyGrowth,
  createInitialUnitGrowth,
  createPrepUpgradeOptions,
  createSimpleCombatRules,
  growthKeysForUpgrade,
  joinIndexForStage,
  targetPriorityForArchetype,
} from "./data/simpleRogue";
import {
  CombatStageType,
  StagePlan,
  TOTAL_STAGES,
  createStageChoices,
  getStagePlan,
  isCombatStageType,
  worldForStage,
  worldStageForStage,
} from "./data/stages";
import { CombatReport, MAX_OVERDRIVE_CORES } from "./game/combat";
import { playUiSound, unlockCombatAudio } from "./game/sound";
import {
  PrepUpgradeIcon,
  PrepUpgradeOption,
  ScreenId,
  SQUAD_SIZE,
  UnitArchetypeId,
  UnitGrowth,
} from "./types";

const SAVE_VERSION = 8;
const SAVE_KEY = `autocore-rogue-run-v${SAVE_VERSION}`;

interface SavedRunState {
  screen: ScreenId;
  stage: number;
  selectedStageNodeId?: string;
  unitArchetypes: (UnitArchetypeId | undefined)[];
  unitGrowths: UnitGrowth[];
  unlockedUnitCount: number;
  unitHpByUnit: number[];
  overdriveCores: number;
  pendingJoinIndex?: number;
  prepOptions: PrepUpgradeOption[];
  prepPicked: boolean;
  lastOutcome?: string;
  runResult?: "clear" | "defeat";
}

interface SavedRunPayload {
  version: number;
  savedAt: string;
  state: SavedRunState;
}

const firstArchetypes = (): (UnitArchetypeId | undefined)[] => ["evasive", undefined, undefined];

const firstGrowths = (): UnitGrowth[] => [
  createInitialUnitGrowth("evasive"),
  createEmptyGrowth(),
  createEmptyGrowth(),
];

const normalizeGrowth = (growth: Partial<UnitGrowth> | undefined): UnitGrowth => ({
  reflex: Math.max(0, growth?.reflex ?? 0),
  boost: Math.max(0, growth?.boost ?? 0),
  cutting: Math.max(0, growth?.cutting ?? 0),
  trigger: Math.max(0, growth?.trigger ?? 0),
  sync: Math.max(0, growth?.sync ?? 0),
});

const buildStatsByUnit = (
  archetypes: (UnitArchetypeId | undefined)[],
  growths: UnitGrowth[],
) =>
  Array.from({ length: SQUAD_SIZE }, (_, index) => {
    const archetype = archetypes[index] ?? "evasive";
    const growth = growths[index] ?? createEmptyGrowth();
    return buildSimpleStats(archetype, growth);
  });

const createInitialHp = (
  archetypes: (UnitArchetypeId | undefined)[],
  growths: UnitGrowth[],
): number[] =>
  buildStatsByUnit(archetypes, growths).map((stats) => stats.hpMax);

const createInitialRun = (): SavedRunState => {
  const archetypes = firstArchetypes();
  const growths = firstGrowths();
  return {
    screen: "prep",
    stage: 1,
    selectedStageNodeId: undefined,
    unitArchetypes: archetypes,
    unitGrowths: growths,
    unlockedUnitCount: 1,
    unitHpByUnit: createInitialHp(archetypes, growths),
    overdriveCores: 1,
    pendingJoinIndex: undefined,
    prepOptions: createPrepUpgradeOptions(1, 1, archetypes, "normal"),
    prepPicked: false,
    lastOutcome: "弱い1機から起動。まずは反応を育てよう。",
    runResult: undefined,
  };
};

const normalizeScreen = (screen: unknown): ScreenId =>
  screen === "map" || screen === "complete" ? screen : "prep";

const readSavedRun = (): SavedRunState | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return undefined;
    }
    const payload = JSON.parse(raw) as Partial<SavedRunPayload>;
    if (payload.version !== SAVE_VERSION || !payload.state) {
      return undefined;
    }
    const initial = createInitialRun();
    const state = payload.state;
    const unitArchetypes = firstArchetypes().map((fallback, index) => {
      const value = state.unitArchetypes?.[index];
      return value && ARCHETYPE_IDS.includes(value) ? value : fallback;
    });
    const unitGrowths = firstGrowths().map((fallback, index) =>
      normalizeGrowth(state.unitGrowths?.[index] ?? fallback),
    );
    const stage = Math.min(TOTAL_STAGES, Math.max(1, state.stage ?? 1));
    const unlockedUnitCount = Math.min(SQUAD_SIZE, Math.max(1, state.unlockedUnitCount ?? 1));
    const restoredPlan = getStagePlan(stage, state.selectedStageNodeId);
    const hpFallback = createInitialHp(unitArchetypes, unitGrowths);
    return {
      ...initial,
      ...state,
      screen: normalizeScreen(state.screen),
      stage,
      unitArchetypes,
      unitGrowths,
      unlockedUnitCount,
      unitHpByUnit: hpFallback.map((hp, index) => state.unitHpByUnit?.[index] ?? hp),
      overdriveCores: Math.min(MAX_OVERDRIVE_CORES, Math.max(0, state.overdriveCores ?? 1)),
      pendingJoinIndex:
        state.pendingJoinIndex !== undefined
          ? Math.min(SQUAD_SIZE - 1, Math.max(0, state.pendingJoinIndex))
          : undefined,
      prepOptions: createPrepUpgradeOptions(stage, unlockedUnitCount, unitArchetypes, restoredPlan.type),
      prepPicked: Boolean(state.prepPicked),
    };
  } catch {
    return undefined;
  }
};

const saveRun = (state: SavedRunState): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        state,
      } satisfies SavedRunPayload),
    );
  } catch {
    // Autosave is best-effort; gameplay should keep running if storage is blocked.
  }
};

const combatStageTypeFor = (plan: StagePlan): CombatStageType =>
  isCombatStageType(plan.type) ? plan.type : "normal";

const routeIcon = (type: StagePlan["type"]): string => {
  if (type === "elite") {
    return "危";
  }
  if (type === "rest") {
    return "修";
  }
  if (type === "boss") {
    return "王";
  }
  return "進";
};

const upgradeIconText = (icon: PrepUpgradeIcon): string => {
  switch (icon) {
    case "eye":
      return "反";
    case "boost":
      return "避";
    case "slash":
      return "斬";
    case "burst":
      return "速";
    case "sync":
      return "同";
    case "repair":
    default:
      return "修";
  }
};

function PrepScreen({
  stage,
  plan,
  unitArchetypes,
  unitGrowths,
  unitHpByUnit,
  overdriveCores,
  unlockedUnitCount,
  pendingJoinIndex,
  prepOptions,
  prepPicked,
  lastOutcome,
  onPickUpgrade,
  onSelectJoin,
  onOpenMap,
  onStartCombat,
}: {
  stage: number;
  plan: StagePlan;
  unitArchetypes: (UnitArchetypeId | undefined)[];
  unitGrowths: UnitGrowth[];
  unitHpByUnit: number[];
  overdriveCores: number;
  unlockedUnitCount: number;
  pendingJoinIndex?: number;
  prepOptions: PrepUpgradeOption[];
  prepPicked: boolean;
  lastOutcome?: string;
  onPickUpgrade: (option: PrepUpgradeOption) => void;
  onSelectJoin: (archetype: UnitArchetypeId) => void;
  onOpenMap: () => void;
  onStartCombat: () => void;
}) {
  const statsByUnit = buildStatsByUnit(unitArchetypes, unitGrowths);
  const world = worldForStage(stage);
  const worldStage = worldStageForStage(stage);
  const canOpenMap = stage > 1;
  const canSortie = !pendingJoinIndex && prepPicked;
  const progressForOption = (option: PrepUpgradeOption) => {
    const keys = growthKeysForUpgrade(option);
    const key = keys[0] ?? "reflex";
    const targetIndex = option.target === "unit" ? option.unitIndex ?? 0 : 0;
    const current =
      option.target === "all"
        ? unitGrowths
            .slice(0, unlockedUnitCount)
            .reduce((sum, growth) => sum + growth[key], 0) / Math.max(1, unlockedUnitCount)
        : unitGrowths[targetIndex]?.[key] ?? 0;
    const filled = Math.min(
      UPGRADE_PROGRESS_PIPS,
      Math.ceil((Math.min(UNIT_GROWTH_MAX, current) / UNIT_GROWTH_MAX) * UPGRADE_PROGRESS_PIPS),
    );
    return { filled, key, full: current >= UNIT_GROWTH_MAX };
  };

  return (
    <main className="simple-screen prep-screen-simple">
      <section className="simple-hero prep-hero">
        <div>
          <span>準備</span>
          <strong>WORLD {world}-{worldStage}</strong>
        </div>
        <p>{plan.threat}</p>
        <div className="simple-core-stock" aria-label={`覚醒コア ${overdriveCores}`}>
          {Array.from({ length: MAX_OVERDRIVE_CORES }, (_, index) => (
            <i className={index < overdriveCores ? "filled" : ""} key={index} />
          ))}
          <b>覚醒コア</b>
        </div>
      </section>

      <section className="simple-squad">
        {Array.from({ length: SQUAD_SIZE }, (_, index) => {
          const archetype = unitArchetypes[index];
          const active = index < unlockedUnitCount && archetype;
          const labels = active ? archetypeLabels[archetype] : undefined;
          const stats = statsByUnit[index];
          const hpRatio = Math.max(0, Math.min(1, (unitHpByUnit[index] ?? 0) / stats.hpMax));
          const growth = unitGrowths[index] ?? createEmptyGrowth();
          const aiLevel = Math.max(
            1,
            Math.ceil((growth.reflex + growth.boost + growth.cutting + growth.trigger + growth.sync) / 3),
          );
          return (
            <article className={`simple-unit ${active ? "active" : "locked"}`} key={index}>
              <b>U{index + 1}</b>
              <strong>{labels?.name ?? "未加入"}</strong>
              <span>{labels?.short ?? "次の世界で合流"}</span>
              {active && <div className="simple-hp"><i style={{ width: `${hpRatio * 100}%` }} /></div>}
              {active && <small>AIレベル {aiLevel}</small>}
            </article>
          );
        })}
      </section>

      {pendingJoinIndex !== undefined ? (
        <section className="join-panel-simple">
          <div className="simple-section-title">機体 {pendingJoinIndex + 1} 加入</div>
          <div className="join-choice-grid">
            {ARCHETYPE_IDS.map((archetype) => (
              <button key={archetype} onClick={() => onSelectJoin(archetype)}>
                <span>{archetypeLabels[archetype].icon}</span>
                <strong>{archetypeLabels[archetype].name}</strong>
                <small>{archetypeLabels[archetype].short}</small>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="upgrade-grid-simple">
          {prepOptions.map((option) => (
            (() => {
              const progress = progressForOption(option);
              return (
                <button
                  className={`upgrade-card-simple icon-${option.icon} track-${progress.key}`}
                  disabled={prepPicked}
                  key={option.id}
                  onClick={() => onPickUpgrade(option)}
                >
                  <span>{upgradeIconText(option.icon)}</span>
                  <strong>{option.title}</strong>
                  <small>{option.shortText}</small>
                  <div className="upgrade-pips" aria-label={`${option.title} ${progress.full ? "最大" : "成長中"}`}>
                    {Array.from({ length: UPGRADE_PROGRESS_PIPS }, (_, index) => (
                      <i className={index < progress.filled ? "filled" : ""} key={index} />
                    ))}
                    {progress.full && <b>MAX</b>}
                  </div>
                </button>
              );
            })()
          ))}
        </section>
      )}

      {lastOutcome && <div className="simple-outcome">{lastOutcome}</div>}

      <section className={`simple-action-row ${canOpenMap ? "" : "solo"}`}>
        {canOpenMap && <button onClick={onOpenMap}>ルート</button>}
        <button className="primary" onClick={onStartCombat} disabled={!canSortie}>
          出撃
        </button>
      </section>
    </main>
  );
}

function MapScreen({
  stage,
  selectedStageNodeId,
  lastOutcome,
  onSelectStageNode,
}: {
  stage: number;
  selectedStageNodeId?: string;
  lastOutcome?: string;
  onSelectStageNode: (nodeId: string) => void;
}) {
  const choices = createStageChoices(stage);
  const current = getStagePlan(stage, selectedStageNodeId);

  return (
    <main className="simple-screen map-screen-simple">
      <section className="simple-hero map-hero-simple">
        <div>
          <span>ルート</span>
          <strong>次 {stage}/{TOTAL_STAGES}</strong>
        </div>
        <p>{current.brief}</p>
      </section>
      <section className="simple-progress">
        {Array.from({ length: TOTAL_STAGES }, (_, index) => (
          <i className={index + 1 < stage ? "done" : index + 1 === stage ? "now" : ""} key={index} />
        ))}
      </section>
      <section className="route-grid-simple">
        {choices.map((choice) => (
          <button
            className={`route-card-simple ${choice.type}`}
            key={choice.id}
            onClick={() => onSelectStageNode(choice.id)}
          >
            <span>{routeIcon(choice.type)}</span>
            <strong>{choice.threat}</strong>
            <small>{choice.focus}</small>
          </button>
        ))}
      </section>
      {lastOutcome && <div className="simple-outcome">{lastOutcome}</div>}
    </main>
  );
}

function CompleteScreen({
  result,
  report,
  onNewRun,
}: {
  result?: "clear" | "defeat";
  report?: CombatReport;
  onNewRun: () => void;
}) {
  const totalDamage = report?.damageByUnit.reduce((sum, value) => sum + value, 0) ?? 0;

  return (
    <main className={`simple-screen complete-screen-simple ${result === "clear" ? "clear" : "defeat"}`}>
      <section className={`complete-panel-simple ${result === "clear" ? "clear" : "defeat"}`}>
        <span>{result === "clear" ? "クリア" : "大破"}</span>
        <h1>{result === "clear" ? "完全制圧" : "小隊大破"}</h1>
        <p>{result === "clear" ? "超反応AIが戦域を突破した。" : "次のランで反応を育て直そう。"}</p>
        <strong>{Math.round(totalDamage).toLocaleString()} ダメージ</strong>
        <button className="primary" onClick={onNewRun}>
          新しいラン
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const savedRun = useMemo(() => readSavedRun(), []);
  const initial = useMemo(() => savedRun ?? createInitialRun(), [savedRun]);
  const [screen, setScreen] = useState<ScreenId>(initial.screen === "combat" ? "prep" : initial.screen);
  const [stage, setStage] = useState(initial.stage);
  const [selectedStageNodeId, setSelectedStageNodeId] = useState<string | undefined>(initial.selectedStageNodeId);
  const [unitArchetypes, setUnitArchetypes] = useState<(UnitArchetypeId | undefined)[]>(initial.unitArchetypes);
  const [unitGrowths, setUnitGrowths] = useState<UnitGrowth[]>(initial.unitGrowths);
  const [unlockedUnitCount, setUnlockedUnitCount] = useState(initial.unlockedUnitCount);
  const [unitHpByUnit, setUnitHpByUnit] = useState<number[]>(initial.unitHpByUnit);
  const [overdriveCores, setOverdriveCores] = useState(initial.overdriveCores);
  const [pendingJoinIndex, setPendingJoinIndex] = useState<number | undefined>(initial.pendingJoinIndex);
  const [prepOptions, setPrepOptions] = useState<PrepUpgradeOption[]>(initial.prepOptions);
  const [prepPicked, setPrepPicked] = useState(initial.prepPicked);
  const [lastOutcome, setLastOutcome] = useState<string | undefined>(initial.lastOutcome);
  const [runResult, setRunResult] = useState<"clear" | "defeat" | undefined>(initial.runResult);
  const [lastCombatReport, setLastCombatReport] = useState<CombatReport | undefined>();

  const statsByUnit = useMemo(
    () => buildStatsByUnit(unitArchetypes, unitGrowths),
    [unitArchetypes, unitGrowths],
  );
  const currentPlan = useMemo(
    () => getStagePlan(stage, selectedStageNodeId),
    [selectedStageNodeId, stage],
  );
  const combatStageType = combatStageTypeFor(currentPlan);
  const sortieEnabled = useMemo(
    () => Array.from({ length: SQUAD_SIZE }, (_, index) => index < unlockedUnitCount),
    [unlockedUnitCount],
  );
  const rulesByUnit = useMemo(() => statsByUnit.map(createSimpleCombatRules), [statsByUnit]);
  const targetPrioritiesByUnit = useMemo(
    () =>
      unitArchetypes.map((archetype) =>
        targetPriorityForArchetype(archetype ?? "evasive"),
      ),
    [unitArchetypes],
  );

  useEffect(() => {
    setUnitHpByUnit((current) =>
      statsByUnit.map((stats, index) =>
        index < unlockedUnitCount
          ? Math.min(current[index] ?? stats.hpMax, stats.hpMax)
          : stats.hpMax,
      ),
    );
  }, [statsByUnit, unlockedUnitCount]);

  useEffect(() => {
    saveRun({
      screen,
      stage,
      selectedStageNodeId,
      unitArchetypes,
      unitGrowths,
      unlockedUnitCount,
      unitHpByUnit,
      overdriveCores,
      pendingJoinIndex,
      prepOptions,
      prepPicked,
      lastOutcome,
      runResult,
    });
  }, [
    lastOutcome,
    overdriveCores,
    pendingJoinIndex,
    prepOptions,
    prepPicked,
    runResult,
    screen,
    selectedStageNodeId,
    stage,
    unitArchetypes,
    unitGrowths,
    unitHpByUnit,
    unlockedUnitCount,
  ]);

  const healAll = (percent: number) => {
    setUnitHpByUnit((current) =>
      current.map((hp, index) =>
        index < unlockedUnitCount
          ? Math.min(statsByUnit[index].hpMax, hp + statsByUnit[index].hpMax * percent)
          : hp,
      ),
    );
  };

  const resetRun = () => {
    const next = createInitialRun();
    setScreen(next.screen);
    setStage(next.stage);
    setSelectedStageNodeId(next.selectedStageNodeId);
    setUnitArchetypes(next.unitArchetypes);
    setUnitGrowths(next.unitGrowths);
    setUnlockedUnitCount(next.unlockedUnitCount);
    setUnitHpByUnit(next.unitHpByUnit);
    setOverdriveCores(next.overdriveCores);
    setPendingJoinIndex(next.pendingJoinIndex);
    setPrepOptions(next.prepOptions);
    setPrepPicked(next.prepPicked);
    setLastOutcome(next.lastOutcome);
    setRunResult(undefined);
    setLastCombatReport(undefined);
    playUiSound("confirm");
  };

  const openMap = () => {
    playUiSound("select");
    setScreen("map");
  };

  const selectStageNode = (nodeId: string) => {
    const plan = createStageChoices(stage).find((choice) => choice.id === nodeId) ?? createStageChoices(stage)[0];
    playUiSound("select");
    setSelectedStageNodeId(plan.id);
    setPrepPicked(false);

    if (plan.type === "rest") {
      healAll(0.42);
      setOverdriveCores((current) => Math.min(MAX_OVERDRIVE_CORES, current + 1));
      setLastOutcome("修理ルート: 回復して覚醒コア補充");
    } else if (plan.type === "elite") {
      setLastOutcome("危険ルート: 敵は強いがAI強化が濃い");
    } else if (plan.type === "boss") {
      setLastOutcome("ボス接近: ここを抜ければ次のWORLD");
    } else {
      setLastOutcome("通常ルート: 安定して進む");
    }

    const joinIndex = joinIndexForStage(stage);
    if (joinIndex !== undefined && joinIndex >= unlockedUnitCount) {
      setPendingJoinIndex(joinIndex);
      setPrepOptions([]);
    } else {
      setPendingJoinIndex(undefined);
      setPrepOptions(createPrepUpgradeOptions(stage, unlockedUnitCount, unitArchetypes, plan.type));
    }
    setScreen("prep");
  };

  const selectJoinArchetype = (archetype: UnitArchetypeId) => {
    if (pendingJoinIndex === undefined) {
      return;
    }

    playUiSound("confirm");
    const nextArchetypes = [...unitArchetypes];
    const nextGrowths = [...unitGrowths];
    nextArchetypes[pendingJoinIndex] = archetype;
    nextGrowths[pendingJoinIndex] = createInitialUnitGrowth(archetype);
    const nextUnlocked = Math.max(unlockedUnitCount, pendingJoinIndex + 1);
    const joinedStats = buildSimpleStats(archetype, nextGrowths[pendingJoinIndex]);
    setUnitArchetypes(nextArchetypes);
    setUnitGrowths(nextGrowths);
    setUnlockedUnitCount(nextUnlocked);
    setUnitHpByUnit((current) =>
      current.map((hp, index) => (index === pendingJoinIndex ? joinedStats.hpMax : hp)),
    );
    setPendingJoinIndex(undefined);
    setPrepOptions(createPrepUpgradeOptions(stage, nextUnlocked, nextArchetypes, currentPlan.type));
    setPrepPicked(false);
    setLastOutcome(`機体 ${pendingJoinIndex + 1}: ${archetypeLabels[archetype].name} が合流`);
  };

  const pickPrepUpgrade = (option: PrepUpgradeOption) => {
    if (prepPicked) {
      return;
    }

    playUiSound("reward");
    setUnitGrowths((current) => applyPrepUpgradeToGrowths(current, option, unlockedUnitCount));
    if (option.effect.healPercent) {
      healAll(option.effect.healPercent);
    }
    setPrepPicked(true);
    setLastOutcome(`${option.title}: ${option.shortText}`);
  };

  const startCombat = () => {
    if (pendingJoinIndex !== undefined || !prepPicked) {
      playUiSound("error");
      setLastOutcome(pendingJoinIndex !== undefined ? "先に加入タイプを選ぼう" : "強化カードを1つ選ぼう");
      return;
    }
    playUiSound("confirm");
    unlockCombatAudio();
    setScreen("combat");
  };

  const applyOverdriveResult = (report: CombatReport, clearedPlan: StagePlan, grantRouteReward: boolean) => {
    setOverdriveCores((current) => {
      const spent = report.overdriveCoresSpent ?? 0;
      const afterSpend = Math.max(0, current - spent);
      const reward = grantRouteReward && clearedPlan.type === "elite" ? 1 : 0;
      return Math.min(MAX_OVERDRIVE_CORES, afterSpend + reward);
    });
  };

  const handleVictory = (remainingHpByUnit: number[], report: CombatReport) => {
    playUiSound("stageClear");
    setUnitHpByUnit((current) =>
      current.map((hp, index) => remainingHpByUnit[index] ?? hp),
    );
    setLastCombatReport(report);
    applyOverdriveResult(report, currentPlan, true);

    if (stage >= TOTAL_STAGES) {
      setRunResult("clear");
      setLastOutcome("ラン制覇");
      setScreen("complete");
      return;
    }

    const nextStage = stage + 1;
    setStage(nextStage);
    setSelectedStageNodeId(undefined);
    setPrepPicked(false);
    setPrepOptions([]);
    setPendingJoinIndex(undefined);
    setLastOutcome(currentPlan.type === "elite" ? `戦闘 ${stage} クリア: 覚醒コア獲得` : `戦闘 ${stage} クリア`);
    setScreen("map");
  };

  const handleDefeat = (report: CombatReport) => {
    playUiSound("runComplete");
    setLastCombatReport(report);
    applyOverdriveResult(report, currentPlan, false);
    setRunResult("defeat");
    setLastOutcome(`戦闘 ${stage} で大破`);
    setScreen("complete");
  };

  return (
    <div className="simple-app-shell">
      {screen === "prep" && (
        <PrepScreen
          stage={stage}
          plan={currentPlan}
          unitArchetypes={unitArchetypes}
          unitGrowths={unitGrowths}
          unitHpByUnit={unitHpByUnit}
          overdriveCores={overdriveCores}
          unlockedUnitCount={unlockedUnitCount}
          pendingJoinIndex={pendingJoinIndex}
          prepOptions={prepOptions}
          prepPicked={prepPicked}
          lastOutcome={lastOutcome}
          onPickUpgrade={pickPrepUpgrade}
          onSelectJoin={selectJoinArchetype}
          onOpenMap={openMap}
          onStartCombat={startCombat}
        />
      )}
      {screen === "map" && (
        <MapScreen
          stage={stage}
          selectedStageNodeId={selectedStageNodeId}
          lastOutcome={lastOutcome}
          onSelectStageNode={selectStageNode}
        />
      )}
      {screen === "combat" && (
        <CombatScreen
          stage={stage}
          stageNodeId={currentPlan.id}
          stageType={combatStageType}
          statsByUnit={statsByUnit}
          unitHpByUnit={unitHpByUnit}
          overdriveCores={overdriveCores}
          sortieEnabled={sortieEnabled}
          unlockedUnitCount={unlockedUnitCount}
          rulesByUnit={rulesByUnit}
          targetPrioritiesByUnit={targetPrioritiesByUnit}
          weaponAutoUseByUnit={[]}
          activeUnitIndex={0}
          onSelectUnit={() => undefined}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
        />
      )}
      {screen === "complete" && (
        <CompleteScreen result={runResult} report={lastCombatReport} onNewRun={resetRun} />
      )}
    </div>
  );
}
