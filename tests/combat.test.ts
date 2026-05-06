import { strict as assert } from "node:assert";
import { createCombatState, stepCombat } from "../src/game/combat";
import { createEnemyRanks } from "../src/game/enemyWaves";
import {
  EMPTY_LEFT_ARM_PART_ID,
  EMPTY_RIGHT_ARM_PART_ID,
  baseUpgrades,
  calculateDerivedStats,
  initialLoadout,
} from "../src/data/parts";
import type { AiRule, DerivedStats } from "../src/types";

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
  weapons: [],
};

const createOneUnitState = (stage: number) =>
  createCombatState(stage, [testStats], [testStats.hpMax], [true], 1, []);

const bladeStats: DerivedStats = {
  ...testStats,
  leftRange: 86,
  leftAttack: 126,
  leftCooldown: 0.3,
  leftWeaponKind: "blade",
  leftEnergyCost: 0,
  weapons: [
    {
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
    },
  ],
};

const run = (name: string, test: () => void) => {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

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

run("elite and boss stage special enemies are single rival bosses queued last", () => {
  const eliteRanks = createEnemyRanks(5, 3);
  const firstEliteSpecialIndex = eliteRanks.findIndex((rank) => rank !== "normal");
  assert.ok(firstEliteSpecialIndex > 0);
  assert.deepEqual(eliteRanks.slice(firstEliteSpecialIndex), ["boss"]);

  const ranks = createEnemyRanks(7, 3);
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
    ["rightArm", "leftArm", "leftShoulder", "rightShoulder"],
  );
  assert.ok(state.effects.some((effect) => effect.kind === "alert" && effect.label === boss.name));
  assert.ok(state.soundEvents.includes("alert"));
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
