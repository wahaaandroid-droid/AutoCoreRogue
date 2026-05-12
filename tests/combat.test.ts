import { strict as assert } from "node:assert";
import {
  activateOverdrive,
  createCombatState,
  overdrivePhaseFor,
  reactionIntervalFor,
  stepCombat,
} from "../src/game/combat";
import { applyDamageToActor, damageAfterDefense } from "../src/game/combatDamage";
import { createEnemyRanks, isRivalAmbushStage } from "../src/game/enemyWaves";
import {
  createAiPresetRules,
  getAvailableActionDefinitions,
  getAvailableConditionDefinitions,
} from "../src/data/aiRules";
import {
  EMPTY_LEFT_ARM_PART_ID,
  EMPTY_RIGHT_ARM_PART_ID,
  baseUpgrades,
  calculateDerivedStats,
  getPartById,
  initialLoadout,
  normalizeLoadout,
} from "../src/data/parts";
import { generateRewardOptions, generateShopOffers } from "../src/data/rewards";
import {
  calculateRelicBonuses,
  createInitialMetaSaveState,
  createPendingRelicReward,
  grantRelicToMeta,
} from "../src/data/relics";
import {
  STAGES_PER_WORLD,
  TOTAL_STAGES,
  createStageChoices,
  worldStageForStage,
} from "../src/data/stages";
import {
  buildSimpleStats,
  createInitialUnitGrowth,
  createPrepUpgradeOptions,
  curvedGrowthPoints,
  joinIndexForStage,
} from "../src/data/simpleRogue";
import type { AiRule, DerivedStats, UnitGrowth, WeaponStats } from "../src/types";
import { EQUIP_SLOTS } from "../src/types";

const rules: AiRule[][] = [[]];

const testStats: DerivedStats = {
  frameId: "medium",
  frameName: "Test Frame",
  hpMax: 1200,
  enMax: 800,
  enRegen: 40,
  defense: 120,
  moveSpeed: 120,
  turnSpeed: 100,
  weight: 4000,
  loadLimit: 6000,
  overloadRatio: 0,
  legType: "biped",
  boostSpeed: 260,
  quickBoostThrust: 260,
  quickBoostCooldown: 0.5,
  quickBoostCost: 16,
  quickBoostDuration: 0.18,
  aiReaction: 32,
  rightRange: 320,
  leftRange: 260,
  rightAttack: 60,
  leftAttack: 40,
  rightCooldown: 0.7,
  leftCooldown: 0.4,
  rightResource: "energy",
  leftResource: "energy",
  rightWeaponKind: "rifle",
  leftWeaponKind: "pulse",
  rightEnergyCost: 6,
  leftEnergyCost: 5,
  rightAmmoMax: 0,
  leftAmmoMax: 0,
  canGuard: false,
  guardProfile: "balanced",
  weapons: [],
};

const createOneUnitState = (stage: number) =>
  createCombatState(stage, [testStats], [testStats.hpMax], [true], 1, []);

type TestCombatState = ReturnType<typeof createCombatState>;

const placeFirstEnemyNear = (state: TestCombatState, xOffset = 160) => {
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies[0];
  assert.ok(enemy);
  const player = state.players[0].actor;
  state.enemyQueue = [];
  enemy.x = player.x + xOffset;
  enemy.y = player.y;
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.moveSpeed = 0;
  enemy.cooldown = 999;
  enemy.entryBoostTime = 0;
  return enemy;
};

const testWeapon = (patch: Partial<WeaponStats> & Pick<WeaponStats, "hardpoint" | "slot" | "partId" | "label">): WeaponStats => ({
  range: 360,
  attack: 60,
  cooldown: 0.08,
  resource: "energy",
  weaponKind: "rifle",
  energyCost: 0,
  ammoMax: 0,
  blastRadius: 0,
  firePattern: "single",
  magazineSize: 0,
  reloadTime: 0,
  heatPerShot: 10,
  heatLimit: 100,
  coolingRate: 36,
  burstCount: 1,
  burstInterval: 0.08,
  spinUpTime: 0,
  sustainTime: 0,
  ...patch,
});

const bladeStats: DerivedStats = {
  ...testStats,
  leftRange: 86,
  leftAttack: 126,
  leftCooldown: 0.3,
  leftWeaponKind: "blade",
  leftEnergyCost: 0,
  weapons: [
    testWeapon({
      hardpoint: "leftArm",
      slot: "L-ARM",
      partId: "test-blade",
      label: "Test Blade",
      range: 86,
      attack: 100,
      cooldown: 0.3,
      resource: "energy",
      weaponKind: "blade",
      energyCost: 0,
      ammoMax: 0,
      blastRadius: 0,
    }),
  ],
};

const statsWithWeapon = (weapon: WeaponStats): DerivedStats => ({
  ...testStats,
  rightRange: weapon.hardpoint === "rightArm" ? weapon.range : testStats.rightRange,
  rightAttack: weapon.hardpoint === "rightArm" ? weapon.attack : testStats.rightAttack,
  rightCooldown: weapon.hardpoint === "rightArm" ? weapon.cooldown : testStats.rightCooldown,
  rightResource: weapon.hardpoint === "rightArm" ? weapon.resource : testStats.rightResource,
  rightWeaponKind: weapon.hardpoint === "rightArm" ? weapon.weaponKind : testStats.rightWeaponKind,
  rightEnergyCost: weapon.hardpoint === "rightArm" ? weapon.energyCost : testStats.rightEnergyCost,
  rightAmmoMax: weapon.hardpoint === "rightArm" ? weapon.magazineSize : testStats.rightAmmoMax,
  weapons: [weapon],
});

const statsWithSpecial = (special: NonNullable<DerivedStats["special"]>): DerivedStats => ({
  ...testStats,
  special,
});

const run = (name: string, test: () => void) => {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

run("automatic AI exposes tactical and expert actions from the start", () => {
  const actions = getAvailableActionDefinitions().map((item) => item.id);
  const conditions = getAvailableConditionDefinitions().map((item) => item.id);
  assert.ok(actions.includes("boostDodge"));
  assert.ok(actions.includes("alphaStrike"));
  assert.ok(actions.includes("interceptMissile"));
  assert.ok(conditions.includes("enemyProjectileNear"));
  assert.ok(conditions.includes("incomingBeamLock"));
});

run("AI blueprints use advanced behavior without unlock packages", () => {
  const preset = createAiPresetRules("assault", 6);
  assert.ok(preset.some((rule) => rule.action === "boostDodge"));
  assert.ok(preset.some((rule) => rule.action === "alphaStrike"));
});

run("rewards and shop offers exclude shoulder slots and AI chip payloads", () => {
  assert.deepEqual(EQUIP_SLOTS, ["HEAD", "BODY", "BOOSTER", "L-ARM", "R-ARM", "SPECIAL"]);

  const rewardOptions = generateRewardOptions(2, {}, "normal", { aiRewardBonusCount: 1 });
  assert.ok(
    rewardOptions.every((reward) => {
      const kind = (reward.payload as { kind: string }).kind;
      return kind !== "aiUnlock" && kind !== "aiSlot";
    }),
  );
  assert.ok(
    rewardOptions
      .filter((reward) => reward.payload.kind === "part")
      .every((reward) => !getPartById(reward.payload.partId).slot.includes("SHOULDER")),
  );

  const shopOffers = generateShopOffers(3, {}, { aiShopDiscount: 0.12 });
  assert.ok(
    shopOffers.every((offer) => {
      const kind = (offer.payload as { kind: string }).kind;
      return kind !== "aiUnlock" && kind !== "aiSlot";
    }),
  );
  assert.ok(
    shopOffers
      .filter((offer) => offer.payload.kind === "part")
      .every((offer) => getPartById(offer.payload.partId).slot !== "SPECIAL" || offer.accent === "purple"),
  );
});

run("legacy shoulder loadouts normalize into the SPECIAL slot", () => {
  const legacy = normalizeLoadout({
    ...initialLoadout,
    "L-SHOULDER": "legacy-missile",
    "R-SHOULDER": "legacy-pod",
  } as Partial<typeof initialLoadout> & Record<string, string>);
  assert.deepEqual(Object.keys(legacy), [...EQUIP_SLOTS]);
  assert.equal(legacy.SPECIAL, initialLoadout.SPECIAL);
});

run("defeat relic rewards require at least one cleared battle", () => {
  const meta = createInitialMetaSaveState();
  assert.equal(createPendingRelicReward("defeat", 1, 0, meta), undefined);

  const pending = createPendingRelicReward("defeat", 2, 1, meta);
  assert.ok(pending);
  assert.equal(pending.options.length, 3);
  assert.equal(pending.reachedWorld, 1);
});

run("duplicate relics level to cap and then become dust", () => {
  let meta = createInitialMetaSaveState();
  let grant = grantRelicToMeta(meta, "boot-log");
  meta = grant.metaState;
  assert.equal(meta.ownedRelics["boot-log"], 1);

  grant = grantRelicToMeta(meta, "boot-log");
  meta = grant.metaState;
  grant = grantRelicToMeta(meta, "boot-log");
  meta = grant.metaState;
  assert.equal(meta.ownedRelics["boot-log"], 3);

  grant = grantRelicToMeta(meta, "boot-log");
  meta = grant.metaState;
  assert.equal(meta.ownedRelics["boot-log"], 3);
  assert.equal(meta.duplicateDust, 1);
  assert.equal(grant.dustGained, 1);
});

run("relic bonuses affect only run-start style modifiers", () => {
  const meta = {
    ...createInitialMetaSaveState(),
    ownedRelics: {
      "boot-log": 2,
      "armor-sample": 1,
      "merchant-tag": 3,
    },
  };
  const bonuses = calculateRelicBonuses(meta);
  assert.equal(bonuses.initialCredits, 70);
  assert.ok(Math.abs(bonuses.unitOneHpMultiplier - 1.03) < 0.001);
  assert.ok(Math.abs(bonuses.aiShopDiscount - 0.2) < 0.001);
});

run("full clear relic flow grants a normal relic and then the clear key", () => {
  const meta = createInitialMetaSaveState();
  const pending = createPendingRelicReward("clear", TOTAL_STAGES, TOTAL_STAGES, meta);
  assert.ok(pending);
  assert.equal(pending.phase, "normal");
  assert.equal(pending.picksRemaining, 2);
  assert.ok(pending.options.every((option) => option.relicId !== "clear-auth-key"));

  const granted = grantRelicToMeta(meta, pending.options[0].relicId);
  const clearPending = createPendingRelicReward(
    "clear",
    TOTAL_STAGES,
    TOTAL_STAGES,
    granted.metaState,
    "clear",
    [pending.options[0].relicId],
  );
  assert.ok(clearPending);
  assert.deepEqual(clearPending.options.map((option) => option.relicId), ["clear-auth-key"]);
});

run("relic bonuses can widen rewards, discount shops, and reveal scanner routes", () => {
  const eliteRewards = generateRewardOptions(
    5,
    {},
    "elite",
    { eliteRewardBonusCount: 1, aiRewardBonusCount: 1 },
  );
  assert.equal(eliteRewards.length, 5);

  const baseShopCost = generateShopOffers(3, {})[0].cost;
  const discountedShopCost = generateShopOffers(3, {}, { partShopDiscount: 0.12 })[0].cost;
  assert.ok(discountedShopCost < baseShopCost);

  assert.equal(createStageChoices(2).length, 3);
  assert.equal(createStageChoices(2, { extraRouteChoice: true }).length, 3);
});

run("simple rogue run uses twelve stages with boss gates and unit joins", () => {
  assert.equal(STAGES_PER_WORLD, 4);
  assert.equal(TOTAL_STAGES, 12);
  assert.equal(worldStageForStage(4), 4);
  assert.equal(createStageChoices(4)[0].type, "boss");
  assert.equal(createStageChoices(8)[0].type, "boss");
  assert.equal(createStageChoices(12)[0].type, "boss");
  assert.equal(joinIndexForStage(5), 1);
  assert.equal(joinIndexForStage(9), 2);
  assert.equal(joinIndexForStage(1), undefined);
  assert.equal(createPrepUpgradeOptions(3, 2, ["evasive", "cutter", undefined]).length, 3);
});

run("danger routes make prep cards visibly stronger", () => {
  const totalGrowth = (option: ReturnType<typeof createPrepUpgradeOptions>[number]) =>
    (option.effect.reflex ?? 0)
    + (option.effect.boost ?? 0)
    + (option.effect.cutting ?? 0)
    + (option.effect.trigger ?? 0)
    + (option.effect.sync ?? 0);
  const normal = createPrepUpgradeOptions(2, 1, ["evasive", undefined, undefined], "normal");
  const elite = createPrepUpgradeOptions(2, 1, ["evasive", undefined, undefined], "elite");

  assert.deepEqual(elite.map((option) => option.id), normal.map((option) => option.id));
  assert.ok(Math.max(...elite.map(totalGrowth)) > Math.max(...normal.map(totalGrowth)));
});

run("overdrive consumes a core, accelerates briefly, then enters backlash", () => {
  const stats = buildSimpleStats("rapid", {
    reflex: 6,
    boost: 6,
    cutting: 0,
    trigger: 6,
    sync: 2,
  });
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, [], "normal", 1);
  const weapon = state.players[0].weapons[0];
  assert.ok(weapon);
  weapon.cooldownRemaining = 1;

  assert.equal(activateOverdrive(state), true);
  assert.equal(state.overdrive.cores, 0);
  assert.equal(state.report.overdriveCoresSpent, 1);
  assert.equal(overdrivePhaseFor(state), "active");
  stepCombat(state, 0.1, rules);
  assert.ok(weapon.cooldownRemaining < 0.8);

  state.overdrive.activeRemaining = 0.01;
  stepCombat(state, 0.02, rules);
  assert.equal(overdrivePhaseFor(state), "backlash");
  weapon.cooldownRemaining = 1;
  stepCombat(state, 0.1, rules);
  assert.ok(weapon.cooldownRemaining > 0.93);
  assert.equal(activateOverdrive(state), false);
});

run("exponential growth starts modest and ends superhuman", () => {
  const starter = buildSimpleStats("evasive", createInitialUnitGrowth("evasive"));
  const mid = buildSimpleStats("evasive", {
    reflex: 6,
    boost: 6,
    cutting: 0,
    trigger: 6,
    sync: 2,
  });
  const max = buildSimpleStats("evasive", {
    reflex: 12,
    boost: 12,
    cutting: 0,
    trigger: 12,
    sync: 12,
  });

  assert.ok(curvedGrowthPoints(2) * 2 < curvedGrowthPoints(8));
  assert.ok(reactionIntervalFor(starter) > 0.3);
  assert.ok(reactionIntervalFor(mid) < reactionIntervalFor(starter));
  assert.ok(reactionIntervalFor(max) <= 0.05);
  assert.ok(max.quickBoostCooldown < starter.quickBoostCooldown);
  assert.ok(max.weapons[0].cooldown < starter.weapons[0].cooldown);
});

run("enemy pressure and rival ambushes ramp toward the end", () => {
  const opening = createEnemyRanks(1, 1, "normal");
  const finale = createEnemyRanks(12, 3, "normal");
  assert.ok(opening.length < finale.length);
  assert.ok(isRivalAmbushStage(6));
  assert.ok(isRivalAmbushStage(10));
  assert.equal(createEnemyRanks(6, 2, "normal").slice(-1)[0], "elite");
  assert.equal(createEnemyRanks(10, 3, "normal").slice(-1)[0], "elite");

  const state = createCombatState(6, [testStats, testStats], [testStats.hpMax, testStats.hpMax], [true, true], 2, []);
  state.enemyQueue = ["elite"];
  state.enemyTotal = 1;
  state.spawnedEnemyCount = 0;
  stepCombat(state, 0.016, rules);
  const rival = state.enemies[0];
  assert.ok(rival);
  assert.equal(rival.rank, "elite");
  assert.equal(rival.enemyRole, "rival");
  assert.ok(rival.rivalAi);
  assert.ok(state.effects.some((effect) => effect.kind === "alert" && effect.label === rival.name));
});

run("initial enemies wait outside the active arena", () => {
  const state = createOneUnitState(1);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.enemyQueue.length, state.enemyTotal);
});

run("enemy waves spawn in staggered batches", () => {
  const state = createOneUnitState(5);
  stepCombat(state, 0.016, rules);
  assert.ok(state.enemies.length > 0);
  assert.ok(state.enemies.length < 5);
  assert.ok(state.enemyQueue.length > 0);
});

run("normal enemy boost sounds are quiet", () => {
  const state = createOneUnitState(1);
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies.find((item) => item.rank === "normal");
  assert.ok(enemy);

  enemy.entryBoostTime = 0;
  enemy.entryBoostSoundPlayed = true;
  enemy.boostCooldown = 0;
  state.projectiles.push({
    id: "test-threat",
    owner: "player",
    kind: "bullet",
    x: enemy.x + 70,
    y: enemy.y,
    vx: -120,
    vy: 0,
    damage: 1,
    damageKind: "ballistic",
    radius: 1,
    life: 1,
    color: "#8ad8ff",
    sourceUnitIndex: 0,
  });

  stepCombat(state, 0.016, rules);
  assert.ok(state.soundEvents.includes("boostQuiet"));
  assert.ok(!state.soundEvents.includes("boost"));
});

run("elite route queues elite enemies and boss route queues a single giant boss last", () => {
  const eliteRanks = createEnemyRanks(5, 3, "elite");
  const firstEliteSpecialIndex = eliteRanks.findIndex((rank) => rank !== "normal");
  assert.ok(firstEliteSpecialIndex > 0);
  assert.ok(eliteRanks.slice(firstEliteSpecialIndex).every((rank) => rank === "elite"));

  const ranks = createEnemyRanks(7, 3, "boss");
  const firstSpecialIndex = ranks.findIndex((rank) => rank !== "normal");
  assert.ok(firstSpecialIndex > 0);
  assert.deepEqual(ranks.slice(firstSpecialIndex), ["boss"]);
});

run("rival boss spawns with player-style weapons and alert effect", () => {
  const state = createOneUnitState(4);
  state.enemyQueue = ["boss"];
  state.enemyTotal = 1;
  stepCombat(state, 0.016, rules);

  const boss = state.enemies[0];
  assert.ok(boss);
  assert.equal(boss.rank, "boss");
  assert.equal(boss.enemyRole, "rival");
  assert.ok(boss.rivalAi);
  assert.deepEqual(
    boss.rivalAi.weapons.map((weapon) => weapon.hardpoint),
    ["rightArm", "leftArm", "rightShoulder"],
  );
  assert.equal(boss.bossArt, "world1");
  assert.ok(state.effects.some((effect) => effect.kind === "alert" && effect.label === boss.name));
  assert.ok(state.soundEvents.includes("alert"));
});

run("boss boost sounds use the standard boost event", () => {
  const state = createOneUnitState(4);
  state.enemyQueue = ["boss"];
  state.enemyTotal = 1;
  stepCombat(state, 0.016, rules);

  const boss = state.enemies[0];
  assert.ok(boss);
  assert.equal(boss.rank, "boss");
  assert.ok(boss.rivalAi);

  boss.x = 520;
  boss.y = 300;
  boss.entryBoostTime = 0;
  boss.entryBoostSoundPlayed = true;
  boss.boostCooldown = 0;
  boss.rivalAi.boostCooldown = 0;
  boss.en = boss.maxEn;
  state.projectiles.push({
    id: "boss-test-threat",
    owner: "player",
    kind: "bullet",
    x: boss.x + 70,
    y: boss.y,
    vx: -120,
    vy: 0,
    damage: 1,
    damageKind: "ballistic",
    radius: 1,
    life: 1,
    color: "#8ad8ff",
    sourceUnitIndex: 0,
  });

  stepCombat(state, 0.016, rules);
  assert.ok(state.soundEvents.includes("boost"));
  assert.ok(!state.soundEvents.includes("boostQuiet"));
});

run("guard action requires shield capability", () => {
  const guardRules: AiRule[][] = [[{ id: "guard-test", condition: "always", action: "guard", enabled: true }]];
  const unshielded = createOneUnitState(1);
  stepCombat(unshielded, 0.016, rules);
  unshielded.players[0].decisionCooldown = 0;
  stepCombat(unshielded, 0.016, guardRules);
  assert.equal(unshielded.players[0].actor.guard, false);

  const shielded = createCombatState(1, [{ ...testStats, canGuard: true }], [testStats.hpMax], [true], 1, []);
  stepCombat(shielded, 0.016, rules);
  shielded.players[0].decisionCooldown = 0;
  stepCombat(shielded, 0.016, guardRules);
  assert.equal(shielded.players[0].actor.guard, true);
});

run("AI reaction changes how quickly new threats are evaluated", () => {
  const idleRules: AiRule[][] = [[{ id: "idle-first", condition: "always", action: "idle", enabled: true }]];
  const dodgeRules: AiRule[][] = [[{ id: "dodge-threat", condition: "enemyProjectileNear", action: "boostDodge", enabled: true }]];
  const low = createCombatState(1, [{ ...testStats, aiReaction: 8 }], [testStats.hpMax], [true], 1, []);
  const high = createCombatState(1, [{ ...testStats, aiReaction: 60 }], [testStats.hpMax], [true], 1, []);
  stepCombat(low, 0.016, idleRules);
  stepCombat(high, 0.016, idleRules);

  const addThreat = (state: TestCombatState) => {
    const player = state.players[0].actor;
    state.enemyQueue = [];
    state.projectiles.push({
      id: `reaction-threat-${state.time}`,
      owner: "enemy",
      kind: "bullet",
      x: player.x + 42,
      y: player.y,
      vx: 0,
      vy: 0,
      damage: 10,
      damageKind: "ballistic",
      radius: 4,
      life: 1,
      color: "#ff5f42",
    });
  };
  addThreat(low);
  addThreat(high);

  stepCombat(low, 0.18, dodgeRules);
  stepCombat(high, 0.18, dodgeRules);
  assert.equal(low.players[0].activeAction, "idle");
  assert.equal(high.players[0].activeAction, "boostDodge");
});

run("AI growth pushes reaction speed into superhuman timing", () => {
  const starterGrowth: UnitGrowth = createInitialUnitGrowth("evasive");
  const evolvedGrowth: UnitGrowth = {
    reflex: 10,
    boost: 8,
    cutting: 0,
    trigger: 6,
    sync: 4,
  };
  const starter = buildSimpleStats("evasive", starterGrowth);
  const evolved = buildSimpleStats("evasive", evolvedGrowth);

  assert.ok(reactionIntervalFor(evolved) < reactionIntervalFor(starter));
  assert.ok(reactionIntervalFor(evolved) <= 0.06);
});

run("boost growth shortens quick boost recovery after a dodge", () => {
  const dodgeRules: AiRule[][] = [[{ id: "growth-dodge", condition: "enemyProjectileNear", action: "boostDodge", enabled: true }]];
  const baseStats = buildSimpleStats("evasive", createInitialUnitGrowth("evasive"));
  const grownStats = buildSimpleStats("evasive", {
    reflex: 8,
    boost: 10,
    cutting: 0,
    trigger: 3,
    sync: 3,
  });
  const base = createCombatState(1, [baseStats], [baseStats.hpMax], [true], 1, []);
  const grown = createCombatState(1, [grownStats], [grownStats.hpMax], [true], 1, []);
  stepCombat(base, 0.016, rules);
  stepCombat(grown, 0.016, rules);
  base.enemyQueue = [];
  grown.enemyQueue = [];
  base.players[0].decisionCooldown = 0;
  grown.players[0].decisionCooldown = 0;
  if (base.enemies[0]) {
    base.enemies[0].entryBoostTime = 0;
    base.enemies[0].cooldown = 999;
  }
  if (grown.enemies[0]) {
    grown.enemies[0].entryBoostTime = 0;
    grown.enemies[0].cooldown = 999;
  }
  const addThreat = (state: TestCombatState) => {
    const player = state.players[0].actor;
    state.projectiles.push({
      id: `boost-threat-${state.time}`,
      owner: "enemy",
      kind: "bullet",
      x: player.x + 42,
      y: player.y,
      vx: -120,
      vy: 0,
      damage: 10,
      damageKind: "ballistic",
      radius: 4,
      life: 1,
      color: "#ff5f42",
    });
  };

  addThreat(base);
  addThreat(grown);
  stepCombat(base, 0.016, dodgeRules);
  stepCombat(grown, 0.016, dodgeRules);

  assert.equal(base.players[0].activeAction, "boostDodge");
  assert.equal(grown.players[0].activeAction, "boostDodge");
  assert.ok(grown.players[0].boostCooldown < base.players[0].boostCooldown);
});

run("blade growth cuts nearby enemy shots before impact", () => {
  const cutterStats = buildSimpleStats("cutter", {
    reflex: 6,
    boost: 2,
    cutting: 7,
    trigger: 2,
    sync: 1,
  });
  const state = createCombatState(1, [cutterStats], [cutterStats.hpMax], [true], 1, []);
  const player = state.players[0].actor;
  state.enemyQueue = [];
  state.projectiles.push({
    id: "cut-me",
    owner: "enemy",
    kind: "bullet",
    x: player.x + 44,
    y: player.y,
    vx: -80,
    vy: 0,
    damage: 100,
    damageKind: "ballistic",
    radius: 4,
    life: 1,
    color: "#ff5f42",
  });

  stepCombat(state, 0.016, [[{ id: "cut-idle", condition: "always", action: "idle", enabled: true }]]);

  assert.equal(state.projectiles.some((projectile) => projectile.id === "cut-me"), false);
  assert.ok(state.players[0].bladeCutCooldown > 0);
  assert.ok(state.effects.some((effect) => effect.kind === "slash" && effect.label === "CUT"));
  assert.ok(state.soundEvents.includes("intercept"));
});

run("blade cutting waits for reuse and scales sharply with growth", () => {
  const addCuttableProjectile = (state: TestCombatState, id: string) => {
    const player = state.players[0].actor;
    state.projectiles.push({
      id,
      owner: "enemy",
      kind: "bullet",
      x: player.x + 36,
      y: player.y,
      vx: -90,
      vy: 0,
      damage: 100,
      damageKind: "ballistic",
      radius: 4,
      life: 1,
      color: "#ff5f42",
    });
  };
  const lowStats = buildSimpleStats("cutter", {
    reflex: 1,
    boost: 1,
    cutting: 2,
    trigger: 1,
    sync: 0,
  });
  const highStats = buildSimpleStats("cutter", {
    reflex: 12,
    boost: 4,
    cutting: 12,
    trigger: 4,
    sync: 12,
  });
  const low = createCombatState(1, [lowStats], [lowStats.hpMax], [true], 1, []);
  const high = createCombatState(1, [highStats], [highStats.hpMax], [true], 1, []);

  addCuttableProjectile(low, "low-1");
  addCuttableProjectile(high, "high-1");
  stepCombat(low, 0.016, [[{ id: "low-idle", condition: "always", action: "idle", enabled: true }]]);
  stepCombat(high, 0.016, [[{ id: "high-idle", condition: "always", action: "idle", enabled: true }]]);

  const lowCooldown = low.players[0].bladeCutCooldown;
  const highCooldown = high.players[0].bladeCutCooldown;
  assert.ok(lowCooldown > 1.35);
  assert.ok(highCooldown < lowCooldown * 0.3);

  addCuttableProjectile(low, "low-2");
  stepCombat(low, 0.016, [[{ id: "low-wait", condition: "always", action: "idle", enabled: true }]]);
  assert.equal(low.projectiles.some((projectile) => projectile.id === "low-2"), true);

  stepCombat(low, low.players[0].bladeCutCooldown + 0.08, [[{ id: "low-ready", condition: "always", action: "idle", enabled: true }]]);
  assert.equal(low.projectiles.some((projectile) => projectile.id === "low-2"), false);
});

run("defensive special equipment can create shields and damage reduction", () => {
  const shieldState = createCombatState(
    1,
    [
      statsWithSpecial({
        partId: "test-shield",
        name: "Test Shield",
        kind: "shield",
        trigger: "hpLow",
        threshold: 0.9,
        cooldown: 1,
        duration: 4,
        shieldHp: 80,
      }),
    ],
    [testStats.hpMax * 0.5],
    [true],
    1,
    [],
  );
  shieldState.players[0].special!.cooldownRemaining = 0;
  stepCombat(shieldState, 0.016, rules);
  const shielded = shieldState.players[0].actor;
  assert.equal(shielded.shieldHp, 80);
  const hpBeforeShieldHit = shielded.hp;
  applyDamageToActor(shielded, 50);
  assert.equal(shielded.hp, hpBeforeShieldHit);
  assert.equal(shielded.shieldHp, 30);

  const barrierState = createCombatState(
    1,
    [
      statsWithSpecial({
        partId: "test-barrier",
        name: "Test Barrier",
        kind: "barrier",
        trigger: "incomingThreat",
        cooldown: 1,
        duration: 3,
        damageReduction: 0.5,
      }),
    ],
    [testStats.hpMax],
    [true],
    1,
    [],
  );
  const barrierActor = barrierState.players[0].actor;
  barrierState.players[0].special!.cooldownRemaining = 0;
  barrierState.projectiles.push({
    id: "barrier-threat",
    owner: "enemy",
    kind: "bullet",
    x: barrierActor.x + 60,
    y: barrierActor.y,
    vx: 0,
    vy: 0,
    damage: 10,
    damageKind: "ballistic",
    radius: 4,
    life: 1,
    color: "#ff5f42",
  });
  stepCombat(barrierState, 0.016, rules);
  const hpBeforeBarrierHit = barrierActor.hp;
  applyDamageToActor(barrierActor, 100);
  assert.ok(barrierActor.hp > hpBeforeBarrierHit - 70);
});

run("attack special equipment deploys bits, handles bit HP, and fires automatically", () => {
  const state = createCombatState(
    1,
    [
      statsWithSpecial({
        partId: "test-bit",
        name: "Test Bit",
        kind: "bit",
        trigger: "enemyPresent",
        cooldown: 1,
        duration: 3,
        bitHp: 60,
        bitCount: 1,
        fireInterval: 0.1,
        range: 380,
        damage: 20,
      }),
    ],
    [testStats.hpMax],
    [true],
    1,
    [],
  );
  const enemy = placeFirstEnemyNear(state, 160);
  state.players[0].special!.cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;
  stepCombat(state, 0.016, rules);
  assert.equal(state.supportBits.length, 1);
  assert.equal(state.supportBits[0].hp, 60);

  stepCombat(state, 0.2, rules);
  assert.ok(enemy.hp < enemy.maxHp || (state.report.damageByUnit[0] ?? 0) > 0);

  const bit = state.supportBits[0];
  const bitHpBefore = bit.hp;
  state.projectiles.push({
    id: "bit-hit",
    owner: "enemy",
    kind: "bullet",
    x: bit.x,
    y: bit.y,
    vx: 0,
    vy: 0,
    damage: 80,
    damageKind: "ballistic",
    radius: 5,
    life: 1,
    color: "#ff5f42",
  });
  stepCombat(state, 0, rules);
  assert.ok(bit.hp < bitHpBefore);
});

run("large bomb special damages clustered enemies", () => {
  const state = createCombatState(
    1,
    [
      statsWithSpecial({
        partId: "test-bomb",
        name: "Test Bomb",
        kind: "bomb",
        trigger: "enemyClustered",
        cooldown: 1,
        range: 320,
        damage: 240,
        blastRadius: 150,
      }),
    ],
    [testStats.hpMax],
    [true],
    1,
    [],
  );
  const enemy = placeFirstEnemyNear(state, 150);
  const second = { ...enemy, id: "bomb-secondary", hp: enemy.maxHp, x: enemy.x + 42, y: enemy.y };
  state.enemies.push(second);
  state.players[0].special!.cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;
  stepCombat(state, 0.016, rules);
  const bomb = state.projectiles.find((projectile) => projectile.kind === "grenade" && projectile.owner === "player");
  assert.ok(bomb);
  bomb.x = enemy.x;
  bomb.y = enemy.y;
  stepCombat(state, 0, rules);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.ok(second.hp < second.maxHp);
});

run("status special equipment applies stun and corrosion damage", () => {
  const stunState = createCombatState(
    1,
    [
      statsWithSpecial({
        partId: "test-stun",
        name: "Test Stun",
        kind: "stun",
        trigger: "enemyMid",
        cooldown: 1,
        range: 320,
        damage: 10,
        statusDuration: 1.2,
      }),
    ],
    [testStats.hpMax],
    [true],
    1,
    [],
  );
  const stunEnemy = placeFirstEnemyNear(stunState, 170);
  stunState.players[0].special!.cooldownRemaining = 0;
  stunState.players[0].decisionCooldown = 0;
  stepCombat(stunState, 0.016, rules);
  const stunProjectile = stunState.projectiles.find((projectile) => projectile.statusEffect?.kind === "stun");
  assert.ok(stunProjectile);
  stunProjectile.x = stunEnemy.x;
  stunProjectile.y = stunEnemy.y;
  stepCombat(stunState, 0, rules);
  assert.ok((stunEnemy.stunRemaining ?? 0) > 0);

  const poisonState = createCombatState(
    1,
    [
      statsWithSpecial({
        partId: "test-poison",
        name: "Test Poison",
        kind: "poison",
        trigger: "enemyMid",
        cooldown: 1,
        range: 320,
        damage: 8,
        statusDuration: 2,
        dotDamagePerSecond: 30,
      }),
    ],
    [testStats.hpMax],
    [true],
    1,
    [],
  );
  const poisonEnemy = placeFirstEnemyNear(poisonState, 170);
  poisonState.players[0].special!.cooldownRemaining = 0;
  poisonState.players[0].decisionCooldown = 0;
  stepCombat(poisonState, 0.016, rules);
  const poisonProjectile = poisonState.projectiles.find((projectile) => projectile.statusEffect?.kind === "poison");
  assert.ok(poisonProjectile);
  poisonProjectile.x = poisonEnemy.x;
  poisonProjectile.y = poisonEnemy.y;
  stepCombat(poisonState, 0, rules);
  assert.ok((poisonEnemy.poisonRemaining ?? 0) > 0);
  const poisonHpBefore = poisonEnemy.hp;
  stepCombat(poisonState, 0.5, rules);
  assert.ok(poisonEnemy.hp < poisonHpBefore);
});

run("weapon weight affects mobility and empty arms lighten the build", () => {
  const armed = calculateDerivedStats(initialLoadout, baseUpgrades, "medium");
  const emptyArms = calculateDerivedStats(
    {
      ...initialLoadout,
      "L-ARM": EMPTY_LEFT_ARM_PART_ID,
      "R-ARM": EMPTY_RIGHT_ARM_PART_ID,
    },
    baseUpgrades,
    "medium",
  );

  assert.ok(emptyArms.weight < armed.weight);
  assert.ok(emptyArms.moveSpeed > armed.moveSpeed);
});

run("booster choice changes quick boost apart from normal movement", () => {
  const lowCost = calculateDerivedStats(
    {
      ...initialLoadout,
      BOOSTER: "booster-sparrow",
    },
    baseUpgrades,
    "medium",
  );
  const highThrust = calculateDerivedStats(
    {
      ...initialLoadout,
      BOOSTER: "booster-hammer",
    },
    baseUpgrades,
    "medium",
  );

  assert.ok(highThrust.quickBoostThrust > lowCost.quickBoostThrust);
  assert.ok(lowCost.quickBoostCooldown < highThrust.quickBoostCooldown);
  assert.ok(lowCost.quickBoostCost < highThrust.quickBoostCost);
  assert.ok(Math.abs(highThrust.moveSpeed - lowCost.moveSpeed) < highThrust.quickBoostThrust - lowCost.quickBoostThrust);
});

run("blade slash effect records the attack direction", () => {
  const state = createCombatState(5, [bladeStats], [bladeStats.hpMax], [true], 1, []);
  stepCombat(state, 0.016, rules);

  const player = state.players[0].actor;
  const enemy = state.enemies[0];
  assert.ok(enemy);

  state.enemyQueue = [];
  player.x = 420;
  player.y = 320;
  player.vx = 0;
  player.vy = 0;
  enemy.x = player.x;
  enemy.y = player.y - 58;
  enemy.vx = 0;
  enemy.vy = 0;
  state.players[0].weapons[0].cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;

  stepCombat(state, 0.016, [[{ id: "blade-direction", condition: "always", action: "shootLeft", enabled: true }]]);

  const slash = state.effects.find((effect) => effect.kind === "slash");
  assert.ok(slash);
  assert.ok(Math.abs((slash.rotation ?? 0) + Math.PI / 2) < 0.001);
});

run("ballistic weapons reload their magazine instead of exhausting stage ammo", () => {
  const weapon = testWeapon({
    hardpoint: "rightArm",
    slot: "R-ARM",
    partId: "test-ballistic",
    label: "Test Ballistic",
    resource: "ballistic",
    weaponKind: "rifle",
    ammoMax: 2,
    magazineSize: 2,
    reloadTime: 0.08,
  });
  const stats = statsWithWeapon(weapon);
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, []);
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies[0];
  assert.ok(enemy);
  const playerWeapon = state.players[0].weapons[0];
  playerWeapon.cooldownRemaining = 0;
  playerWeapon.magazine = 1;
  playerWeapon.ammo = 1;
  state.players[0].decisionCooldown = 0;

  stepCombat(state, 0.016, [[{ id: "reload-shot", condition: "always", action: "shootRight", enabled: true }]]);
  assert.equal(playerWeapon.magazine, 0);
  assert.ok(playerWeapon.reloadRemaining > 0);

  state.players[0].activeAction = "idle";
  state.players[0].decisionCooldown = 0;
  stepCombat(state, 0.12, [[{ id: "reload-idle", condition: "always", action: "idle", enabled: true }]]);
  assert.equal(playerWeapon.magazine, playerWeapon.magazineSize);
  assert.equal(playerWeapon.reloadRemaining, 0);
});

run("energy weapons overheat and recover after cooling", () => {
  const weapon = testWeapon({
    hardpoint: "rightArm",
    slot: "R-ARM",
    partId: "test-heat",
    label: "Test Heat",
    resource: "energy",
    weaponKind: "pulse",
    energyCost: 0,
    cooldown: 0.01,
    heatPerShot: 12,
    heatLimit: 20,
    coolingRate: 100,
  });
  const stats = statsWithWeapon(weapon);
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, []);
  stepCombat(state, 0.016, rules);
  const playerWeapon = state.players[0].weapons[0];
  playerWeapon.cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;

  stepCombat(state, 0.016, [[{ id: "heat-shot", condition: "always", action: "shootRight", enabled: true }]]);
  playerWeapon.cooldownRemaining = 0;
  stepCombat(state, 0.016, [[{ id: "heat-shot-2", condition: "always", action: "shootRight", enabled: true }]]);
  assert.equal(playerWeapon.overheated, true);

  state.players[0].activeAction = "idle";
  state.players[0].decisionCooldown = 0;
  stepCombat(state, 0.1, [[{ id: "heat-idle", condition: "always", action: "idle", enabled: true }]]);
  assert.equal(playerWeapon.overheated, false);
  assert.ok(playerWeapon.heat < playerWeapon.heatLimit);
});

run("beam laser weapons deal direct sustained damage and draw a beam effect", () => {
  const weapon = testWeapon({
    hardpoint: "rightArm",
    slot: "R-ARM",
    partId: "test-beam",
    label: "Test Beam",
    resource: "energy",
    weaponKind: "beamLaser",
    firePattern: "sustain",
    energyCost: 0,
    cooldown: 0.1,
    heatPerShot: 1,
    heatLimit: 100,
    coolingRate: 20,
    burstInterval: 0.01,
    spinUpTime: 0,
    sustainTime: 0.05,
    range: 500,
    attack: 80,
  });
  const stats = statsWithWeapon(weapon);
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, []);
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies[0];
  assert.ok(enemy);
  enemy.x = 620;
  enemy.y = 300;
  state.players[0].actor.x = 300;
  state.players[0].actor.y = 300;
  state.players[0].weapons[0].cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;

  stepCombat(state, 0.016, [[{ id: "beam-start", condition: "always", action: "shootRight", enabled: true }]]);
  stepCombat(state, 0.02, [[{ id: "beam-idle", condition: "always", action: "idle", enabled: true }]]);

  assert.ok(enemy.hp < enemy.maxHp);
  assert.ok(state.effects.some((effect) => effect.kind === "beam"));
});

run("beam laser warns before damage and misses targets that dodge off the locked line", () => {
  const weapon = testWeapon({
    hardpoint: "rightArm",
    slot: "R-ARM",
    partId: "test-beam-dodge",
    label: "Test Beam Dodge",
    resource: "energy",
    weaponKind: "beamLaser",
    firePattern: "sustain",
    energyCost: 0,
    cooldown: 0.1,
    heatPerShot: 1,
    heatLimit: 100,
    coolingRate: 20,
    burstInterval: 0.03,
    spinUpTime: 0.08,
    sustainTime: 0.08,
    range: 500,
    attack: 90,
  });
  const stats = statsWithWeapon(weapon);
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, []);
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies[0];
  assert.ok(enemy);
  enemy.x = 620;
  enemy.y = 300;
  enemy.cooldown = 999;
  state.enemyQueue = [];
  state.players[0].actor.x = 300;
  state.players[0].actor.y = 300;
  state.players[0].weapons[0].cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;

  stepCombat(state, 0.016, [[{ id: "beam-warn-start", condition: "always", action: "shootRight", enabled: true }]]);
  const hpBeforeWarning = enemy.hp;
  stepCombat(state, 0.03, [[{ id: "beam-warn-idle", condition: "always", action: "idle", enabled: true }]]);

  assert.equal(enemy.hp, hpBeforeWarning);
  assert.ok(state.effects.some((effect) => effect.kind === "beamWarning"));

  enemy.y = 390;
  stepCombat(state, 0.06, [[{ id: "beam-dodge-idle", condition: "always", action: "idle", enabled: true }]]);

  assert.equal(enemy.hp, hpBeforeWarning);
  assert.ok(state.effects.some((effect) => effect.kind === "beam"));
});

run("guard profiles clearly counter different damage kinds", () => {
  const state = createOneUnitState(1);
  const target = state.players[0].actor;
  target.guard = true;

  target.guardProfile = "kinetic";
  const kineticVsBallistic = damageAfterDefense(100, target, "ballistic");
  const kineticVsEnergy = damageAfterDefense(100, target, "energy");

  target.guardProfile = "energy";
  const energyVsBallistic = damageAfterDefense(100, target, "ballistic");
  const energyVsEnergy = damageAfterDefense(100, target, "energy");

  assert.ok(kineticVsBallistic < energyVsBallistic);
  assert.ok(energyVsEnergy < kineticVsEnergy);
});

run("missiles can be intercepted by hostile projectiles and explode in the air", () => {
  const state = createOneUnitState(1);
  const player = state.players[0].actor;
  player.x = 450;
  player.y = 300;
  state.enemyQueue = [];
  state.projectiles.push(
    {
      id: "intercept-missile",
      owner: "enemy",
      kind: "missile",
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      damage: 70,
      damageKind: "missile",
      radius: 6,
      blastRadius: 34,
      life: 1,
      color: "#ff9c35",
      interceptable: true,
      interceptHp: 4,
      interceptDamage: 12,
    },
    {
      id: "intercept-bullet",
      owner: "player",
      kind: "bullet",
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      damage: 10,
      damageKind: "ballistic",
      radius: 4,
      life: 1,
      color: "#ffb15a",
      sourceUnitIndex: 0,
      interceptDamage: 10,
    },
  );

  stepCombat(state, 0.016, [[{ id: "intercept-idle", condition: "always", action: "idle", enabled: true }]]);
  assert.ok(!state.projectiles.some((projectile) => projectile.id === "intercept-missile"));
  assert.ok(state.effects.some((effect) => effect.kind === "explosion"));
  assert.ok(state.soundEvents.includes("intercept"));
  assert.ok(player.hp < player.maxHp);
});

run("incoming missile AI can fire an intercept shot", () => {
  const weapon = testWeapon({
    hardpoint: "rightArm",
    slot: "R-ARM",
    partId: "test-interceptor-rifle",
    label: "Test Interceptor Rifle",
    resource: "ballistic",
    weaponKind: "rifle",
    firePattern: "single",
    magazineSize: 8,
    ammoMax: 8,
    reloadTime: 1,
    range: 360,
    attack: 80,
  });
  const stats = statsWithWeapon(weapon);
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, []);
  const player = state.players[0].actor;
  player.x = 450;
  player.y = 300;
  state.enemyQueue = [];
  state.enemyTotal = 0;
  state.players[0].weapons[0].cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;
  state.projectiles.push({
    id: "ai-intercept-missile",
    owner: "enemy",
    kind: "missile",
    x: player.x + 80,
    y: player.y,
    vx: 0,
    vy: 0,
    damage: 70,
    damageKind: "missile",
    radius: 6,
    blastRadius: 34,
    life: 1,
    color: "#ff9c35",
    interceptable: true,
    interceptHp: 4,
    interceptDamage: 12,
  });

  stepCombat(state, 0.08, [[{ id: "ai-intercept", condition: "incomingMissile", action: "interceptMissile", enabled: true }]]);

  assert.ok(!state.projectiles.some((projectile) => projectile.id === "ai-intercept-missile"));
  assert.ok(state.soundEvents.includes("intercept"));
});

run("burst weapons fire queued follow-up shots", () => {
  const weapon = testWeapon({
    hardpoint: "rightArm",
    slot: "R-ARM",
    partId: "test-burst",
    label: "Test Burst",
    resource: "ballistic",
    weaponKind: "rifle",
    firePattern: "burst",
    magazineSize: 5,
    ammoMax: 5,
    reloadTime: 1,
    burstCount: 3,
    burstInterval: 0.02,
  });
  const stats = statsWithWeapon(weapon);
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, []);
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies[0];
  assert.ok(enemy);
  enemy.x = 620;
  enemy.y = 300;
  state.players[0].actor.x = 300;
  state.players[0].actor.y = 300;
  state.players[0].weapons[0].cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;

  stepCombat(state, 0.016, [[{ id: "burst-start", condition: "always", action: "shootRight", enabled: true }]]);
  stepCombat(state, 0.03, [[{ id: "burst-idle", condition: "always", action: "idle", enabled: true }]]);
  stepCombat(state, 0.03, [[{ id: "burst-idle-2", condition: "always", action: "idle", enabled: true }]]);

  assert.ok(state.projectiles.filter((projectile) => projectile.owner === "player").length >= 3);
  assert.equal(state.players[0].weapons[0].magazine, 2);
});

run("gatling weapons spin up before sustained fire", () => {
  const weapon = testWeapon({
    hardpoint: "rightArm",
    slot: "R-ARM",
    partId: "test-gatling",
    label: "Test Gatling",
    resource: "ballistic",
    weaponKind: "machineGun",
    firePattern: "sustain",
    magazineSize: 10,
    ammoMax: 10,
    reloadTime: 1,
    burstInterval: 0.03,
    spinUpTime: 0.04,
    sustainTime: 0.12,
  });
  const stats = statsWithWeapon(weapon);
  const state = createCombatState(1, [stats], [stats.hpMax], [true], 1, []);
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies[0];
  assert.ok(enemy);
  enemy.x = 620;
  enemy.y = 300;
  state.players[0].actor.x = 300;
  state.players[0].actor.y = 300;
  state.players[0].weapons[0].cooldownRemaining = 0;
  state.players[0].decisionCooldown = 0;

  stepCombat(state, 0.016, [[{ id: "gatling-start", condition: "always", action: "shootRight", enabled: true }]]);
  assert.equal(state.projectiles.filter((projectile) => projectile.owner === "player").length, 0);
  stepCombat(state, 0.05, [[{ id: "gatling-idle", condition: "always", action: "idle", enabled: true }]]);
  stepCombat(state, 0.04, [[{ id: "gatling-idle-2", condition: "always", action: "idle", enabled: true }]]);

  assert.ok(state.projectiles.filter((projectile) => projectile.owner === "player").length >= 2);
});

run("grenade blast radius damages clustered enemies", () => {
  const state = createOneUnitState(1);
  stepCombat(state, 0.016, rules);
  const firstEnemy = state.enemies[0];
  assert.ok(firstEnemy);
  firstEnemy.x = 560;
  firstEnemy.y = 300;
  const secondEnemy = { ...firstEnemy, id: "grenade-secondary", hp: firstEnemy.maxHp, x: 635, y: 300 };
  state.enemies.push(secondEnemy);
  state.enemyQueue = [];
  state.projectiles.push({
    id: "test-grenade",
    owner: "player",
    kind: "grenade",
    x: firstEnemy.x,
    y: firstEnemy.y,
    vx: 0,
    vy: 0,
    damage: 160,
    damageKind: "explosive",
    radius: 8,
    blastRadius: 120,
    life: 1,
    color: "#ffc45f",
    sourceUnitIndex: 0,
    interceptDamage: 120,
  });

  stepCombat(state, 0.016, [[{ id: "grenade-idle", condition: "always", action: "idle", enabled: true }]]);
  assert.ok(firstEnemy.hp < firstEnemy.maxHp);
  assert.ok(secondEnemy.hp < secondEnemy.maxHp);
});

run("enemy defeat plays destruction before removal", () => {
  const state = createOneUnitState(1);
  stepCombat(state, 0.016, rules);
  const enemy = state.enemies[0];
  assert.ok(enemy);

  enemy.hp = 0;
  stepCombat(state, 0.016, rules);
  assert.equal(state.defeatedEnemyCount, 1);
  assert.ok(state.soundEvents.includes("explosion"));
  assert.ok(state.effects.some((effect) => effect.kind === "explosion"));
  assert.ok(state.enemies.some((item) => item.id === enemy.id));

  for (let index = 0; index < 80; index += 1) {
    stepCombat(state, 0.016, rules);
  }
  assert.ok(!state.enemies.some((item) => item.id === enemy.id));
});

run("empty combat resolves as victory", () => {
  const state = createOneUnitState(1);
  state.enemyQueue = [];
  stepCombat(state, 0.016, rules);
  assert.equal(state.status, "victory");
});
