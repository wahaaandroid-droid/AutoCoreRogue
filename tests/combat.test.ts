import { strict as assert } from "node:assert";
import { createCombatState, stepCombat } from "../src/game/combat";
import { createEnemyRanks } from "../src/game/enemyWaves";
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
  weapons: [],
};

const createOneUnitState = (stage: number) =>
  createCombatState(stage, [testStats], [testStats.hpMax], [true], 1, []);

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
