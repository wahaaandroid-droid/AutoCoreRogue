import { strict as assert } from "node:assert";
import { createCombatState, stepCombat } from "../src/game/combat";
import { damageAfterDefense } from "../src/game/combatDamage";
import { createEnemyRanks } from "../src/game/enemyWaves";
import {
  createAiPresetRules,
  getAvailableActionDefinitions,
  getAvailableConditionDefinitions,
} from "../src/data/aiRules";
import { getAiUnlockState, normalizeRulesForCombat } from "../src/data/aiUnlocks";
import {
  EMPTY_LEFT_ARM_PART_ID,
  EMPTY_RIGHT_ARM_PART_ID,
  baseUpgrades,
  calculateDerivedStats,
  initialLoadout,
} from "../src/data/parts";
import { generateRewardOptions, generateShopOffers } from "../src/data/rewards";
import type { AiRule, DerivedStats, WeaponStats } from "../src/types";

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

const run = (name: string, test: () => void) => {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

run("starter AI hides advanced actions until AI chips unlock them", () => {
  const starterActions = getAvailableActionDefinitions().map((item) => item.id);
  assert.ok(!starterActions.includes("boostDodge"));
  assert.ok(!starterActions.includes("alphaStrike"));
  assert.ok(!starterActions.includes("fireBothShoulders"));
  assert.ok(!starterActions.includes("interceptMissile"));

  const unlockedActions = getAvailableActionDefinitions(["w1-boost-dodge"]).map((item) => item.id);
  const unlockedConditions = getAvailableConditionDefinitions(["w1-boost-dodge"]).map((item) => item.id);
  assert.ok(unlockedActions.includes("boostDodge"));
  assert.ok(unlockedConditions.includes("enemyProjectileNear"));
});

run("locked AI rules are preserved for editing but become idle in combat", () => {
  const lockedRules: AiRule[] = [
    { id: "locked-alpha", condition: "enemyMid", action: "alphaStrike", enabled: true },
  ];
  const combatRules = normalizeRulesForCombat(lockedRules, getAiUnlockState());
  assert.equal(combatRules[0].condition, "enemyMid");
  assert.equal(combatRules[0].action, "idle");
});

run("AI blueprints only apply unlocked rules", () => {
  const starterPreset = createAiPresetRules("assault", 6);
  assert.ok(!starterPreset.some((rule) => rule.action === "boostDodge"));
  assert.ok(!starterPreset.some((rule) => rule.action === "alphaStrike"));

  const dodgePreset = createAiPresetRules("assault", 6, ["w1-boost-dodge"]);
  assert.ok(dodgePreset.some((rule) => rule.action === "boostDodge"));
  assert.ok(!dodgePreset.some((rule) => rule.action === "alphaStrike"));
});

run("AI chip rewards and shop offers skip already unlocked packages", () => {
  const rewardOptions = generateRewardOptions(2, {}, 4, "normal", ["w1-boost-dodge"]);
  assert.ok(
    !rewardOptions.some(
      (reward) => reward.payload.kind === "aiUnlock" && reward.payload.packageId === "w1-boost-dodge",
    ),
  );
  assert.ok(rewardOptions.some((reward) => reward.payload.kind === "aiUnlock"));

  const shopOffers = generateShopOffers(3, {}, 4, ["w1-boost-dodge"]);
  assert.ok(
    !shopOffers.some(
      (offer) => offer.payload.kind === "aiUnlock" && offer.payload.packageId === "w1-boost-dodge",
    ),
  );
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
  const state = createOneUnitState(5);
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
  const state = createOneUnitState(5);
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
  stepCombat(unshielded, 0.016, guardRules);
  assert.equal(unshielded.players[0].actor.guard, false);

  const shielded = createCombatState(1, [{ ...testStats, canGuard: true }], [testStats.hpMax], [true], 1, []);
  stepCombat(shielded, 0.016, rules);
  stepCombat(shielded, 0.016, guardRules);
  assert.equal(shielded.players[0].actor.guard, true);
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

  stepCombat(state, 0.016, [[{ id: "reload-shot", condition: "always", action: "shootRight", enabled: true }]]);
  assert.equal(playerWeapon.magazine, 0);
  assert.ok(playerWeapon.reloadRemaining > 0);

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

  stepCombat(state, 0.016, [[{ id: "heat-shot", condition: "always", action: "shootRight", enabled: true }]]);
  playerWeapon.cooldownRemaining = 0;
  stepCombat(state, 0.016, [[{ id: "heat-shot-2", condition: "always", action: "shootRight", enabled: true }]]);
  assert.equal(playerWeapon.overheated, true);

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
