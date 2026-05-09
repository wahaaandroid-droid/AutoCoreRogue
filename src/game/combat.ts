import { evaluateAiRules } from "./aiController";
import { damageAfterDefense, updateHits } from "./combatDamage";
import { updateEnemyDestructions } from "./combatDestruction";
import { isEntryBoosting, resolveActorCollisions, updatePositions } from "./combatMovement";
import { CombatStageType, worldForStage, worldStageForStage } from "../data/stages";
import {
  activeEnemyCap,
  createEnemyRanks,
  enemySpawnDelayFor,
  nextEnemyBatchSize,
} from "./enemyWaves";
import {
  createEffect,
  createProjectile,
  DamageKind,
  Effect,
  Projectile,
} from "./projectiles";
import {
  AiActionId,
  AiRule,
  BaseFrameId,
  DerivedStats,
  GuardProfile,
  LegType,
  TargetPriorityId,
  WeaponHardpoint,
  WeaponKind,
  WeaponAutoUse,
  WeaponResource,
  WeaponStats,
} from "../types";

export type WorldBossArt = "world1" | "world2" | "world3";

export interface CombatActor {
  id: string;
  name: string;
  team: "player" | "enemy";
  x: number;
  y: number;
  ax: number;
  ay: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  en: number;
  maxEn: number;
  rightAmmo: number;
  rightAmmoMax: number;
  leftAmmo: number;
  leftAmmoMax: number;
  enRegen: number;
  defense: number;
  moveSpeed: number;
  quickBoostThrust: number;
  quickBoostMaxSpeed: number;
  quickBoostTime: number;
  quickBoostDuration: number;
  range: number;
  attack: number;
  cooldown: number;
  cooldownMax: number;
  boostCooldown: number;
  guard: boolean;
  canGuard: boolean;
  guardProfile: GuardProfile;
  loadRatio: number;
  facingX: number;
  facingY: number;
  frameId?: BaseFrameId;
  legType?: LegType;
  color: string;
  rank: "normal" | "elite" | "boss";
  enemyRole?: "drone" | "scout" | "sniper" | "bruiser" | "jammer" | "rival";
  rivalAi?: RivalBossAi;
  bossArt?: WorldBossArt;
  entryBoostTime?: number;
  entryBoostSoundPlayed?: boolean;
  deathTimer?: number;
  deathEffectPlayed?: boolean;
}

export interface PlayerCombatUnit {
  unitIndex: number;
  actor: CombatActor;
  stats: DerivedStats;
  activeAction: AiActionId;
  activeRuleId?: string;
  weapons: PlayerWeaponState[];
  boostCooldown: number;
}

export interface PlayerWeaponState extends WeaponStats {
  cooldownRemaining: number;
  cooldownMax: number;
  ammo: number;
  magazine: number;
  reloadRemaining: number;
  heat: number;
  overheated: boolean;
  burstShotsRemaining: number;
  sequenceTimer: number;
  sustainRemaining: number;
  sequenceTargetId?: string;
  sequenceWarmupRemaining: number;
  beamAimX?: number;
  beamAimY?: number;
  autoUse: boolean;
}

export interface RivalBossAi {
  stats: DerivedStats;
  rules: AiRule[];
  activeAction: AiActionId;
  activeRuleId?: string;
  weapons: PlayerWeaponState[];
  boostCooldown: number;
  targetPriority: TargetPriorityId;
}

export type CombatSoundEvent =
  | "shoot"
  | "shootEnergy"
  | "shootBallistic"
  | "missile"
  | "boost"
  | "boostQuiet"
  | "blade"
  | "hit"
  | "hitExplosive"
  | "intercept"
  | "explosion"
  | "defeat"
  | "alert";

export interface CombatReport {
  damageByUnit: number[];
  ruleHitsByUnit: Record<string, number>[];
}

export interface CombatState {
  width: number;
  height: number;
  time: number;
  stage: number;
  stageType: CombatStageType;
  players: PlayerCombatUnit[];
  enemies: CombatActor[];
  enemyQueue: CombatActor["rank"][];
  enemyTotal: number;
  spawnedEnemyCount: number;
  defeatedEnemyCount: number;
  nextEnemySpawnAt: number;
  projectiles: Projectile[];
  effects: Effect[];
  soundEvents: CombatSoundEvent[];
  report: CombatReport;
  status: "running" | "victory" | "defeat";
}

const ARENA_WIDTH = 980;
const ARENA_HEIGHT = 570;
const BOOST_LOCK_BREAK_MIN_DISTANCE = 52;
const BOOST_LOCK_BREAK_MAX_DISTANCE = 108;
const BOOST_LOCK_BREAK_MIN_APPROACH = 0.35;
const BEAM_TRACK_TURN_RATE = 0.72;
const BEAM_WARNING_WIDTH = 34;
const BEAM_HIT_WIDTH = 8;
const BLADE_REACH_CAP = 86;
const BLADE_ENGAGE_BUFFER = 146;
let nextId = 1;

const uid = (prefix: string): string => `${prefix}-${nextId++}`;

const boostSoundForActor = (actor: CombatActor): CombatSoundEvent =>
  actor.team === "enemy" && actor.rank === "normal" ? "boostQuiet" : "boost";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalize = (dx: number, dy: number): { x: number; y: number; distance: number } => {
  const distance = Math.max(1, Math.hypot(dx, dy));
  return { x: dx / distance, y: dy / distance, distance };
};

const applyThrust = (actor: CombatActor, x: number, y: number, strength = 1): void => {
  actor.ax += x * actor.moveSpeed * 3.15 * strength;
  actor.ay += y * actor.moveSpeed * 3.15 * strength;
};

const statsLoadRatio = (stats: Pick<DerivedStats, "weight" | "loadLimit">): number =>
  stats.weight / Math.max(1, stats.loadLimit);

const actorBoostImpulseFor = (actor: CombatActor): number =>
  clamp(1.1 - actor.loadRatio * 0.22, 0.72, 1.05);

const PLAYER_FORMATION = [
  { x: 0.38, y: 0.64 },
  { x: 0.46, y: 0.52 },
  { x: 0.54, y: 0.64 },
  { x: 0.62, y: 0.52 },
] as const;

const PLAYER_COLORS = ["#8ad8ff", "#54f4a7", "#ffcf66", "#c878ff"] as const;

const createPlayerActor = (stats: DerivedStats, index: number): CombatActor => ({
  id: `player-${index + 1}`,
  name: `AutoCore ${index + 1}`,
  team: "player",
  x: ARENA_WIDTH * (PLAYER_FORMATION[index]?.x ?? 0.5),
  y: ARENA_HEIGHT * (PLAYER_FORMATION[index]?.y ?? 0.58),
  ax: 0,
  ay: 0,
  vx: 0,
  vy: 0,
  radius: stats.legType === "tank" ? 20 : 17,
  hp: stats.hpMax,
  maxHp: stats.hpMax,
  en: stats.enMax,
  maxEn: stats.enMax,
  rightAmmo: stats.rightAmmoMax,
  rightAmmoMax: stats.rightAmmoMax,
  leftAmmo: stats.leftAmmoMax,
  leftAmmoMax: stats.leftAmmoMax,
  enRegen: stats.enRegen,
  defense: stats.defense,
  moveSpeed: stats.moveSpeed,
  quickBoostThrust: stats.quickBoostThrust,
  quickBoostMaxSpeed: stats.boostSpeed,
  quickBoostTime: 0,
  quickBoostDuration: stats.quickBoostDuration,
  range: Math.max(...stats.weapons.map((weapon) => weapon.range), stats.rightRange, stats.leftRange),
  attack: Math.max(...stats.weapons.map((weapon) => weapon.attack), stats.rightAttack, stats.leftAttack),
  cooldown: 0,
  cooldownMax: 1,
  boostCooldown: 0,
  guard: false,
  canGuard: stats.canGuard,
  guardProfile: stats.guardProfile,
  loadRatio: statsLoadRatio(stats),
  facingX: 0,
  facingY: -1,
  frameId: stats.frameId,
  legType: stats.legType,
  color: PLAYER_COLORS[index] ?? PLAYER_COLORS[0],
  rank: "normal",
});

const createWeaponState = (
  weapon: WeaponStats,
  cooldownRemaining: number,
  autoUse = true,
): PlayerWeaponState => ({
  ...weapon,
  cooldownRemaining,
  cooldownMax: weapon.cooldown,
  ammo: weapon.magazineSize,
  magazine: weapon.magazineSize,
  reloadRemaining: 0,
  heat: 0,
  overheated: false,
  burstShotsRemaining: 0,
  sequenceTimer: 0,
  sustainRemaining: 0,
  sequenceWarmupRemaining: 0,
  beamAimX: undefined,
  beamAimY: undefined,
  autoUse,
});

const createPlayerUnit = (
  stats: DerivedStats,
  unitIndex: number,
  formationIndex: number,
  currentHp: number,
  weaponAutoUse?: WeaponAutoUse,
): PlayerCombatUnit => {
  const actor = createPlayerActor(stats, unitIndex);
  actor.x = ARENA_WIDTH * (PLAYER_FORMATION[formationIndex]?.x ?? 0.5);
  actor.y = ARENA_HEIGHT * (PLAYER_FORMATION[formationIndex]?.y ?? 0.58);
  actor.hp = clamp(currentHp, 0, stats.hpMax);
  const weapons = stats.weapons.map((weapon, weaponIndex): PlayerWeaponState =>
    createWeaponState(
      weapon,
      0.18 + formationIndex * 0.08 + weaponIndex * 0.12,
      weaponAutoUse?.[weapon.hardpoint] ?? true,
    ),
  );

  return {
    unitIndex,
    actor,
    stats,
    activeAction: "idle",
    weapons,
    boostCooldown: 0,
  };
};

interface RivalBossSpec {
  stats: DerivedStats;
  color: string;
  rules: AiRule[];
  targetPriority: TargetPriorityId;
  bossArt?: WorldBossArt;
  radius?: number;
}

const createRivalWeapon = (
  hardpoint: WeaponHardpoint,
  slot: WeaponStats["slot"],
  label: string,
  options: {
    range: number;
    attack: number;
    cooldown: number;
    resource: WeaponResource;
    weaponKind: WeaponKind;
    energyCost?: number;
    ammoMax?: number;
    blastRadius?: number;
    firePattern?: WeaponStats["firePattern"];
    magazineSize?: number;
    reloadTime?: number;
    heatPerShot?: number;
    heatLimit?: number;
    coolingRate?: number;
    burstCount?: number;
    burstInterval?: number;
    spinUpTime?: number;
    sustainTime?: number;
  },
): WeaponStats => ({
  hardpoint,
  slot,
  partId: `rival-${hardpoint}-${options.weaponKind}`,
  label,
  range: options.range,
  attack: options.attack,
  cooldown: options.cooldown,
  resource: options.resource,
  weaponKind: options.weaponKind,
  energyCost: options.energyCost ?? 0,
  ammoMax: options.ammoMax ?? 0,
  blastRadius: options.blastRadius ?? 0,
  firePattern: options.firePattern ?? "single",
  magazineSize: options.magazineSize ?? options.ammoMax ?? 0,
  reloadTime: options.reloadTime ?? (options.resource === "ballistic" ? 1.7 : 0),
  heatPerShot: options.heatPerShot ?? (options.resource === "energy" ? Math.max(14, (options.energyCost ?? 0) * 2.1) : 0),
  heatLimit: options.heatLimit ?? (options.resource === "energy" ? 100 : 0),
  coolingRate: options.coolingRate ?? (options.resource === "energy" ? 32 : 0),
  burstCount: options.firePattern === "burst" ? Math.max(2, options.burstCount ?? 3) : 1,
  burstInterval: Math.max(0.05, options.burstInterval ?? 0.1),
  spinUpTime: options.firePattern === "sustain" ? Math.max(0, options.spinUpTime ?? 0.35) : 0,
  sustainTime: options.firePattern === "sustain" ? Math.max(0.25, options.sustainTime ?? 1.2) : 0,
});

const createRivalStats = (
  frameId: BaseFrameId,
  frameName: string,
  legType: LegType,
  stats: {
    hpMax: number;
    enMax: number;
    enRegen: number;
    defense: number;
    moveSpeed: number;
    turnSpeed: number;
    weight: number;
    loadLimit: number;
  },
  weapons: WeaponStats[],
  canGuard = false,
  guardProfile: GuardProfile = "balanced",
): DerivedStats => {
  const byHardpoint = (hardpoint: WeaponHardpoint): WeaponStats | undefined =>
    weapons.find((weapon) => weapon.hardpoint === hardpoint);
  const right = byHardpoint("rightArm") ?? weapons[0];
  const left = byHardpoint("leftArm") ?? right;

  return {
    frameId,
    frameName,
    hpMax: stats.hpMax,
    enMax: stats.enMax,
    enRegen: stats.enRegen,
    defense: stats.defense,
    moveSpeed: stats.moveSpeed,
    turnSpeed: stats.turnSpeed,
    weight: stats.weight,
    loadLimit: stats.loadLimit,
    overloadRatio: 0,
    legType,
    boostSpeed: Math.round(Math.max(stats.moveSpeed * 1.25, stats.moveSpeed * 1.75)),
    quickBoostThrust: Math.round(stats.moveSpeed * 2.05),
    quickBoostCooldown: legType === "reverse" ? 0.44 : legType === "tank" ? 0.72 : 0.52,
    quickBoostCost: legType === "reverse" ? 12 : legType === "tank" ? 22 : 16,
    quickBoostDuration: legType === "hover" ? 0.22 : 0.18,
    rightRange: right.range,
    leftRange: left.range,
    rightAttack: right.attack,
    leftAttack: left.attack,
    rightCooldown: right.cooldown,
    leftCooldown: left.cooldown,
    rightResource: right.resource,
    leftResource: left.resource,
    rightWeaponKind: right.weaponKind,
    leftWeaponKind: left.weaponKind,
    rightEnergyCost: right.energyCost,
    leftEnergyCost: left.energyCost,
    rightAmmoMax: right.ammoMax,
    leftAmmoMax: left.ammoMax,
    canGuard,
    guardProfile,
    weapons,
  };
};

const createRivalWeaponStates = (
  weapons: WeaponStats[],
  spawnIndex: number,
): PlayerWeaponState[] =>
  weapons.map((weapon, weaponIndex) =>
    createWeaponState(weapon, 0.5 + spawnIndex * 0.05 + weaponIndex * 0.16),
  );

const createStageFiveRivalBossSpec = (): RivalBossSpec => {
  const weapons = [
    createRivalWeapon("rightArm", "R-ARM", "Redline Rifle", {
      range: 340,
      attack: 46,
      cooldown: 0.68,
      resource: "energy",
      weaponKind: "rifle",
      energyCost: 9,
    }),
    createRivalWeapon("leftArm", "L-ARM", "Breaker Blade", {
      range: 90,
      attack: 72,
      cooldown: 1.18,
      resource: "energy",
      weaponKind: "blade",
      energyCost: 18,
    }),
    createRivalWeapon("leftShoulder", "L-SHOULDER", "Needle Missiles", {
      range: 430,
      attack: 62,
      cooldown: 2.15,
      resource: "ballistic",
      weaponKind: "missile",
      ammoMax: 7,
      blastRadius: 28,
    }),
    createRivalWeapon("rightShoulder", "R-SHOULDER", "Pulse Pod", {
      range: 286,
      attack: 34,
      cooldown: 0.92,
      resource: "energy",
      weaponKind: "pulse",
      energyCost: 7,
    }),
  ];

  return {
    stats: createRivalStats("medium", "Mirror Vesper", "biped", {
      hpMax: 1120,
      enMax: 690,
      enRegen: 36,
      defense: 88,
      moveSpeed: 118,
      turnSpeed: 94,
      weight: 4100,
      loadLimit: 5200,
    }, weapons),
    color: "#ff4f7d",
    targetPriority: "lowestHpPercent",
    rules: [
      { id: "rival-1", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { id: "rival-2", condition: "enemyClose", action: "shootLeft", enabled: true },
      { id: "rival-3", condition: "enemyFar", action: "fireLongRange", enabled: true },
      { id: "rival-4", condition: "shoulderReady", action: "alphaStrike", enabled: true },
      { id: "rival-5", condition: "always", action: "strafe", enabled: true },
    ],
  };
};

const createStageSevenRivalBossSpec = (): RivalBossSpec => {
  const weapons = [
    createRivalWeapon("rightArm", "R-ARM", "Tyrant Pulse Rifle", {
      range: 372,
      attack: 56,
      cooldown: 0.58,
      resource: "energy",
      weaponKind: "pulse",
      energyCost: 10,
    }),
    createRivalWeapon("leftArm", "L-ARM", "Heap Blade", {
      range: 92,
      attack: 90,
      cooldown: 1.04,
      resource: "energy",
      weaponKind: "blade",
      energyCost: 24,
    }),
    createRivalWeapon("leftShoulder", "L-SHOULDER", "Siege Grenade", {
      range: 360,
      attack: 105,
      cooldown: 2.55,
      resource: "ballistic",
      weaponKind: "grenade",
      ammoMax: 5,
      blastRadius: 76,
    }),
    createRivalWeapon("rightShoulder", "R-SHOULDER", "Hunter Missiles", {
      range: 470,
      attack: 72,
      cooldown: 1.85,
      resource: "ballistic",
      weaponKind: "missile",
      ammoMax: 10,
      blastRadius: 34,
    }),
  ];

  return {
    stats: createRivalStats("heavy", "Signal Tyrant", "biped", {
      hpMax: 1820,
      enMax: 860,
      enRegen: 42,
      defense: 132,
      moveSpeed: 96,
      turnSpeed: 72,
      weight: 5600,
      loadLimit: 6800,
    }, weapons, true),
    color: "#ff6a42",
    targetPriority: "lowestHp",
    rules: [
      { id: "tyrant-1", condition: "hpLow", action: "guard", enabled: true },
      { id: "tyrant-2", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { id: "tyrant-3", condition: "enemyClustered", action: "fireExplosive", enabled: true },
      { id: "tyrant-4", condition: "enemyMid", action: "alphaStrike", enabled: true },
      { id: "tyrant-5", condition: "enemyFar", action: "fireLongRange", enabled: true },
      { id: "tyrant-6", condition: "always", action: "strafe", enabled: true },
    ],
  };
};

const createWorldOneBossSpec = (): RivalBossSpec => {
  const weapons = [
    createRivalWeapon("rightArm", "R-ARM", "Training Beam", {
      range: 370,
      attack: 34,
      cooldown: 1.1,
      resource: "energy",
      weaponKind: "beamLaser",
      energyCost: 5,
      firePattern: "sustain",
      heatPerShot: 10,
      heatLimit: 120,
      coolingRate: 32,
      spinUpTime: 0.18,
      sustainTime: 0.72,
      burstInterval: 0.11,
    }),
    createRivalWeapon("leftArm", "L-ARM", "Bulwark Pulse", {
      range: 300,
      attack: 38,
      cooldown: 0.78,
      resource: "energy",
      weaponKind: "pulse",
      energyCost: 7,
    }),
    createRivalWeapon("rightShoulder", "R-SHOULDER", "Slow Missiles", {
      range: 430,
      attack: 54,
      cooldown: 2.2,
      resource: "ballistic",
      weaponKind: "missile",
      ammoMax: 6,
      blastRadius: 30,
    }),
  ];

  return {
    stats: createRivalStats("heavy", "Aegis Bulwark", "tank", {
      hpMax: 1540,
      enMax: 760,
      enRegen: 44,
      defense: 118,
      moveSpeed: 70,
      turnSpeed: 56,
      weight: 6200,
      loadLimit: 7600,
    }, weapons, true),
    color: "#73d7ff",
    targetPriority: "nearest",
    bossArt: "world1",
    radius: 36,
    rules: [
      { id: "bulwark-1", condition: "hpLow", action: "guard", enabled: true },
      { id: "bulwark-2", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { id: "bulwark-3", condition: "enemyMid", action: "alphaStrike", enabled: true },
      { id: "bulwark-4", condition: "enemyFar", action: "fireLongRange", enabled: true },
      { id: "bulwark-5", condition: "always", action: "strafe", enabled: true },
    ],
  };
};

const createWorldTwoBossSpec = (): RivalBossSpec => {
  const weapons = [
    createRivalWeapon("rightArm", "R-ARM", "Meridian Cannon", {
      range: 430,
      attack: 74,
      cooldown: 1.1,
      resource: "ballistic",
      weaponKind: "rocket",
      ammoMax: 8,
      blastRadius: 54,
    }),
    createRivalWeapon("leftArm", "L-ARM", "Sweeper Laser", {
      range: 410,
      attack: 44,
      cooldown: 1.18,
      resource: "energy",
      weaponKind: "beamLaser",
      energyCost: 7,
      firePattern: "sustain",
      heatPerShot: 13,
      heatLimit: 132,
      coolingRate: 29,
      spinUpTime: 0.22,
      sustainTime: 1.0,
      burstInterval: 0.09,
    }),
    createRivalWeapon("leftShoulder", "L-SHOULDER", "Anchor Grenade", {
      range: 370,
      attack: 96,
      cooldown: 2.55,
      resource: "ballistic",
      weaponKind: "grenade",
      ammoMax: 5,
      blastRadius: 80,
    }),
    createRivalWeapon("rightShoulder", "R-SHOULDER", "Hunter Missiles", {
      range: 470,
      attack: 72,
      cooldown: 1.85,
      resource: "ballistic",
      weaponKind: "missile",
      ammoMax: 10,
      blastRadius: 34,
    }),
  ];

  return {
    stats: createRivalStats("quad", "Iron Meridian", "quad", {
      hpMax: 2640,
      enMax: 940,
      enRegen: 48,
      defense: 154,
      moveSpeed: 88,
      turnSpeed: 70,
      weight: 7200,
      loadLimit: 8800,
    }, weapons, true),
    color: "#ff9d42",
    targetPriority: "lowestHpPercent",
    bossArt: "world2",
    radius: 43,
    rules: [
      { id: "meridian-1", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { id: "meridian-2", condition: "enemyClustered", action: "fireExplosive", enabled: true },
      { id: "meridian-3", condition: "enemyMid", action: "alphaStrike", enabled: true },
      { id: "meridian-4", condition: "enemyFar", action: "fireLongRange", enabled: true },
      { id: "meridian-5", condition: "always", action: "strafe", enabled: true },
    ],
  };
};

const createWorldThreeBossSpec = (): RivalBossSpec => {
  const weapons = [
    createRivalWeapon("rightArm", "R-ARM", "Core Lance", {
      range: 460,
      attack: 58,
      cooldown: 1.0,
      resource: "energy",
      weaponKind: "beamLaser",
      energyCost: 9,
      firePattern: "sustain",
      heatPerShot: 16,
      heatLimit: 150,
      coolingRate: 30,
      spinUpTime: 0.16,
      sustainTime: 1.15,
      burstInterval: 0.075,
    }),
    createRivalWeapon("leftArm", "L-ARM", "Ruin Blade", {
      range: 104,
      attack: 112,
      cooldown: 0.98,
      resource: "energy",
      weaponKind: "blade",
      energyCost: 26,
    }),
    createRivalWeapon("leftShoulder", "L-SHOULDER", "Rift Grenade", {
      range: 400,
      attack: 124,
      cooldown: 2.35,
      resource: "ballistic",
      weaponKind: "grenade",
      ammoMax: 7,
      blastRadius: 92,
    }),
    createRivalWeapon("rightShoulder", "R-SHOULDER", "Core Seekers", {
      range: 500,
      attack: 86,
      cooldown: 1.62,
      resource: "ballistic",
      weaponKind: "missile",
      ammoMax: 12,
      blastRadius: 38,
    }),
  ];

  return {
    stats: createRivalStats("tank", "Oblivion Core", "tank", {
      hpMax: 4200,
      enMax: 1120,
      enRegen: 56,
      defense: 192,
      moveSpeed: 82,
      turnSpeed: 62,
      weight: 9800,
      loadLimit: 11800,
    }, weapons, true),
    color: "#ff4f7d",
    targetPriority: "lowestHp",
    bossArt: "world3",
    radius: 50,
    rules: [
      { id: "oblivion-1", condition: "hpLow", action: "guard", enabled: true },
      { id: "oblivion-2", condition: "enemyProjectileNear", action: "boostDodge", enabled: true },
      { id: "oblivion-3", condition: "enemyClustered", action: "fireExplosive", enabled: true },
      { id: "oblivion-4", condition: "enemyClose", action: "shootLeft", enabled: true },
      { id: "oblivion-5", condition: "enemyMid", action: "alphaStrike", enabled: true },
      { id: "oblivion-6", condition: "enemyFar", action: "fireLongRange", enabled: true },
      { id: "oblivion-7", condition: "always", action: "strafe", enabled: true },
    ],
  };
};

const createRivalBossSpec = (stage: number): RivalBossSpec =>
  worldForStage(stage) === 3
    ? createWorldThreeBossSpec()
    : worldForStage(stage) === 2
      ? createWorldTwoBossSpec()
      : createWorldOneBossSpec();

const createEnemy = (
  stage: number,
  stageType: CombatStageType,
  index: number,
  rank: CombatActor["rank"],
  total: number,
  enterFromOffscreen = false,
): CombatActor => {
  const role = (() => {
    if (rank === "boss") {
      return "rival" as const;
    }
    if (rank === "elite") {
      return worldForStage(stage) >= 3 || worldStageForStage(stage) >= 5 ? "bruiser" as const : "sniper" as const;
    }
    const worldStage = worldStageForStage(stage);
    if (worldStage === 2) {
      return "scout" as const;
    }
    if (worldStage === 3) {
      return index % 2 === 0 ? "sniper" as const : "drone" as const;
    }
    if (worldStage === 4) {
      return index % 3 === 0 ? "bruiser" as const : "scout" as const;
    }
    if (worldStage >= 5 || worldForStage(stage) >= 2) {
      return (["scout", "sniper", "bruiser", "drone"] as const)[index % 4];
    }
    return "drone" as const;
  })();
  const angle = -Math.PI * 0.94 + ((index + 0.5) / Math.max(1, total)) * Math.PI * 1.88;
  const distance = rank === "boss" ? 235 : 228 + (index % 3) * 28;
  const roleHpScale = role === "bruiser" ? 1.32 : role === "scout" ? 0.78 : role === "sniper" ? 0.9 : 1;
  const roleAttackScale = role === "sniper" ? 1.25 : role === "bruiser" ? 1.12 : role === "scout" ? 0.84 : 1;
  const hpScale = (rank === "boss" ? 3.1 : rank === "elite" ? 1.85 : 1) * roleHpScale;
  const attackScale = (rank === "boss" ? 1.65 : rank === "elite" ? 1.28 : 1) * roleAttackScale;
  const world = worldForStage(stage);
  const baseHp = 108 + world * 44 + stage * (world === 1 ? 18 : world === 2 ? 25 : 32);
  const baseAttack = 8 + world * 3.4 + stage * (world === 1 ? 1.35 : world === 2 ? 1.75 : 2.2);
  const spawnX = rank === "boss"
    ? ARENA_WIDTH * 0.5
    : ARENA_WIDTH * 0.5 + Math.cos(angle) * distance;
  const spawnY = rank === "boss"
    ? ARENA_HEIGHT * 0.22
    : ARENA_HEIGHT * 0.46 + Math.sin(angle) * distance * 0.72;
  const entrySide = index % 4;
  const entryOffset = 84 + (index % 3) * 20;
  const entryTargetX = ARENA_WIDTH * (0.28 + ((index * 37) % 45) / 100);
  const entryTargetY = ARENA_HEIGHT * (0.26 + ((index * 29) % 42) / 100);
  const entryX =
    entrySide === 0
      ? -entryOffset
      : entrySide === 1
        ? ARENA_WIDTH + entryOffset
        : clamp(entryTargetX, 84, ARENA_WIDTH - 84);
  const entryY =
    entrySide === 2
      ? -entryOffset
      : entrySide === 3
        ? ARENA_HEIGHT + entryOffset
        : clamp(entryTargetY, 84, ARENA_HEIGHT - 84);
  const entryDirection = normalize(entryTargetX - entryX, entryTargetY - entryY);
  const initialSpeed = rank === "boss" ? 112 : rank === "elite" ? 172 : 198;
  const rivalSpec = role === "rival" ? createRivalBossSpec(stage) : undefined;
  const rivalRightWeapon = rivalSpec?.stats.weapons.find((weapon) => weapon.hardpoint === "rightArm");
  const rivalLeftWeapon = rivalSpec?.stats.weapons.find((weapon) => weapon.hardpoint === "leftArm");
  const rivalRange = rivalSpec
    ? Math.max(...rivalSpec.stats.weapons.map((weapon) => weapon.range))
    : undefined;
  const rivalAttack = rivalSpec
    ? Math.max(...rivalSpec.stats.weapons.map((weapon) => weapon.attack))
    : undefined;
  const moveSpeed = rivalSpec?.stats.moveSpeed ?? (rank === "boss" ? 48 : rank === "elite" ? 66 : 76 + stage * 1.5) *
    (role === "scout" ? 1.34 : role === "sniper" ? 0.72 : role === "bruiser" ? 0.82 : 1);
  const quickBoostThrust = rivalSpec?.stats.quickBoostThrust ?? moveSpeed *
    (rank === "boss" ? 1.2 : rank === "elite" ? 1.7 : role === "scout" ? 1.8 : 1.48);
  const quickBoostMaxSpeed = rivalSpec?.stats.boostSpeed ?? moveSpeed *
    (rank === "boss" ? 1.28 : rank === "elite" ? 1.78 : role === "scout" ? 2.05 : 1.78);
  const quickBoostDuration = rivalSpec?.stats.quickBoostDuration ?? (rank === "boss" ? 0.15 : role === "scout" ? 0.2 : 0.17);

  return {
    id: uid("enemy"),
    name: rivalSpec
      ? rivalSpec.stats.frameName
      : rank === "boss"
      ? "Signal Tyrant"
      : rank === "elite"
        ? role === "sniper" ? "Gatebreaker Artillery" : "Gatebreaker Bulwark"
        : role === "scout"
          ? "Scout Frame"
          : role === "sniper"
            ? "Lance Frame"
            : role === "bruiser"
              ? "Bulwark Frame"
              : "Drone Frame",
    team: "enemy",
    x: enterFromOffscreen ? entryX : clamp(spawnX, 52, ARENA_WIDTH - 52),
    y: enterFromOffscreen ? entryY : clamp(spawnY, 52, ARENA_HEIGHT - 52),
    ax: 0,
    ay: 0,
    vx: enterFromOffscreen ? entryDirection.x * initialSpeed : 0,
    vy: enterFromOffscreen ? entryDirection.y * initialSpeed : 0,
    radius: rivalSpec?.radius ?? (rank === "boss" ? 30 : rank === "elite" ? 22 : 16),
    hp: rivalSpec?.stats.hpMax ?? baseHp * hpScale,
    maxHp: rivalSpec?.stats.hpMax ?? baseHp * hpScale,
    en: rivalSpec?.stats.enMax ?? 0,
    maxEn: rivalSpec?.stats.enMax ?? 0,
    rightAmmo: rivalRightWeapon?.ammoMax ?? 0,
    rightAmmoMax: rivalRightWeapon?.ammoMax ?? 0,
    leftAmmo: rivalLeftWeapon?.ammoMax ?? 0,
    leftAmmoMax: rivalLeftWeapon?.ammoMax ?? 0,
    enRegen: rivalSpec?.stats.enRegen ?? 0,
    defense: rivalSpec?.stats.defense ?? (rank === "boss" ? 78 + stage * 6 : rank === "elite" ? 56 + stage * 5 : 30 + stage * 4) +
      (role === "bruiser" ? 22 : role === "scout" ? -8 : 0),
    moveSpeed,
    quickBoostThrust,
    quickBoostMaxSpeed,
    quickBoostTime: enterFromOffscreen ? quickBoostDuration : 0,
    quickBoostDuration,
    range: rivalRange ?? (role === "sniper" ? 430 : role === "bruiser" ? 230 : rank === "boss" ? 380 : rank === "elite" ? 330 : 275),
    attack: rivalAttack ?? baseAttack * attackScale,
    cooldown: 0.4 + index * 0.35,
    cooldownMax: role === "scout" ? 0.92 : role === "sniper" ? 1.46 : rank === "boss" ? 0.82 : rank === "elite" ? 1.0 : 1.18,
    boostCooldown: 1.1 + index * 0.18,
    guard: false,
    canGuard: rivalSpec?.stats.canGuard ?? false,
    guardProfile: rivalSpec?.stats.guardProfile ?? "balanced",
    loadRatio: rivalSpec ? statsLoadRatio(rivalSpec.stats) : rank === "boss" ? 0.94 : rank === "elite" ? 0.82 : 0.68,
    facingX: rank === "boss" ? 0 : -entryDirection.x,
    facingY: rank === "boss" ? 1 : -entryDirection.y,
    frameId: rivalSpec?.stats.frameId,
    legType: rivalSpec?.stats.legType,
    color: rivalSpec?.color ?? (rank === "boss" ? "#ff6a42" : rank === "elite" ? "#d889ff" : "#f1b15b"),
    rank,
    enemyRole: role,
    bossArt: rivalSpec?.bossArt,
    rivalAi: rivalSpec
      ? {
          stats: rivalSpec.stats,
          rules: rivalSpec.rules,
          activeAction: "idle",
          weapons: createRivalWeaponStates(rivalSpec.stats.weapons, index),
          boostCooldown: 1.1 + index * 0.18,
          targetPriority: rivalSpec.targetPriority,
        }
      : undefined,
    entryBoostTime: enterFromOffscreen ? 1.42 : undefined,
    entryBoostSoundPlayed: false,
  };
};

const spawnEnemies = (
  stage: number,
  stageType: CombatStageType,
  ranks: CombatActor["rank"][],
  startIndex: number,
  total: number,
  enterFromOffscreen = false,
): CombatActor[] =>
  ranks.map((rank, index) =>
    createEnemy(stage, stageType, startIndex + index, rank, total, enterFromOffscreen),
  );

const pushBossAlert = (state: CombatState, enemy: CombatActor): void => {
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "alert",
      x: state.width / 2,
      y: state.height * 0.22,
      life: 2.15,
      maxLife: 2.15,
      color: enemy.color,
      size: 1,
      label: enemy.name,
    }),
  );
  state.soundEvents.push("alert");
};

const createInitialEnemies = (
  stage: number,
  stageType: CombatStageType,
  playerCount: number,
): {
  enemies: CombatActor[];
  enemyQueue: CombatActor["rank"][];
  enemyTotal: number;
  spawnedEnemyCount: number;
  defeatedEnemyCount: number;
  nextEnemySpawnAt: number;
} => {
  const ranks = createEnemyRanks(stage, playerCount, stageType);

  return {
    enemies: [],
    enemyQueue: ranks,
    enemyTotal: ranks.length,
    spawnedEnemyCount: 0,
    defeatedEnemyCount: 0,
    nextEnemySpawnAt: 0,
  };
};

const refillEnemyWave = (state: CombatState): void => {
  const capacity = activeEnemyCap(state.stage, state.players.length, state.stageType) - state.enemies.length;
  if (capacity <= 0 || state.enemyQueue.length === 0) {
    return;
  }
  const livingCount = state.enemies.filter((enemy) => enemy.hp > 0).length;
  if (state.time < state.nextEnemySpawnAt && livingCount > 0) {
    return;
  }

  const batchSize = nextEnemyBatchSize(state, capacity);
  if (batchSize <= 0) {
    return;
  }

  const incoming = state.enemyQueue.splice(0, batchSize);
  const spawned = spawnEnemies(state.stage, state.stageType, incoming, state.spawnedEnemyCount, state.enemyTotal, true);
  state.enemies.push(...spawned);
  for (const enemy of spawned) {
    if (enemy.rank === "boss") {
      pushBossAlert(state, enemy);
    }
  }
  state.spawnedEnemyCount += incoming.length;
  state.nextEnemySpawnAt = state.time + enemySpawnDelayFor(state, incoming);
};

export const createCombatState = (
  stage: number,
  statsByUnit: DerivedStats[],
  unitHpByUnit: number[],
  sortieEnabled: boolean[],
  unlockedUnitCount: number,
  weaponAutoUseByUnit: WeaponAutoUse[] = [],
  stageType: CombatStageType = "normal",
): CombatState => {
  const players = statsByUnit
    .map((stats, unitIndex) => ({ stats, unitIndex }))
    .filter(({ stats, unitIndex }) =>
      unitIndex < unlockedUnitCount &&
      (sortieEnabled[unitIndex] ?? true) &&
      (unitHpByUnit[unitIndex] ?? stats.hpMax) > 0,
    )
    .map(({ stats, unitIndex }, formationIndex) =>
      createPlayerUnit(
        stats,
        unitIndex,
        formationIndex,
        unitHpByUnit[unitIndex] ?? stats.hpMax,
        weaponAutoUseByUnit[unitIndex],
      ),
    );
  const wave = createInitialEnemies(stage, stageType, Math.max(1, players.length));

  return {
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    time: 0,
    stage,
    stageType,
    players,
    enemies: wave.enemies,
    enemyQueue: wave.enemyQueue,
    enemyTotal: wave.enemyTotal,
    spawnedEnemyCount: wave.spawnedEnemyCount,
    defeatedEnemyCount: wave.defeatedEnemyCount,
    nextEnemySpawnAt: wave.nextEnemySpawnAt,
    projectiles: [],
    effects: [],
    soundEvents: [],
    report: {
      damageByUnit: statsByUnit.map(() => 0),
      ruleHitsByUnit: statsByUnit.map(() => ({})),
    },
    status: "running",
  };
};

const livingPlayerUnits = (state: CombatState): PlayerCombatUnit[] =>
  state.players.filter((unit) => unit.actor.hp > 0);

const livingEnemies = (state: CombatState): CombatActor[] =>
  state.enemies.filter((enemy) => enemy.hp > 0);

const enemyDistance = (player: CombatActor, enemy: CombatActor): number =>
  Math.hypot(enemy.x - player.x, enemy.y - player.y);

const rankScore = (enemy: CombatActor): number =>
  enemy.rank === "boss" ? 3 : enemy.rank === "elite" ? 2 : 1;

const nearestEnemyDistance = (state: CombatState, player: CombatActor): number =>
  livingEnemies(state).reduce(
    (nearest, enemy) => Math.min(nearest, enemyDistance(player, enemy)),
    Number.POSITIVE_INFINITY,
  );

const clusteredEnemyCount = (state: CombatState, target: CombatActor | undefined): number => {
  if (!target) {
    return 0;
  }

  return livingEnemies(state).filter((enemy) =>
    enemy.id !== target.id &&
    Math.hypot(enemy.x - target.x, enemy.y - target.y) <= 96,
  ).length + 1;
};

const selectEnemyTarget = (
  state: CombatState,
  player: CombatActor,
  priority: TargetPriorityId = "nearest",
): CombatActor | undefined => {
  const enemies = livingEnemies(state);
  if (enemies.length === 0) {
    return undefined;
  }

  const sorted = [...enemies].sort((a, b) => {
    const distanceA = enemyDistance(player, a);
    const distanceB = enemyDistance(player, b);

    switch (priority) {
      case "lowestHp":
        return a.hp - b.hp || distanceA - distanceB;
      case "lowestHpPercent":
        return a.hp / a.maxHp - b.hp / b.maxHp || distanceA - distanceB;
      case "eliteFirst":
        return rankScore(b) - rankScore(a) || a.hp / a.maxHp - b.hp / b.maxHp || distanceA - distanceB;
      case "nearest":
      default:
        return distanceA - distanceB;
    }
  });

  return sorted[0];
};

const nearestPlayerUnit = (state: CombatState, enemy: CombatActor): PlayerCombatUnit | undefined => {
  let best: PlayerCombatUnit | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const unit of livingPlayerUnits(state)) {
    const player = unit.actor;
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (distance < bestDistance) {
      best = unit;
      bestDistance = distance;
    }
  }
  return best;
};

const playerDistance = (enemy: CombatActor, player: CombatActor): number =>
  Math.hypot(player.x - enemy.x, player.y - enemy.y);

const clusteredPlayerCount = (state: CombatState, target: CombatActor | undefined): number => {
  if (!target) {
    return 0;
  }

  return livingPlayerUnits(state).filter((unit) =>
    unit.actor.id !== target.id &&
    Math.hypot(unit.actor.x - target.x, unit.actor.y - target.y) <= 104,
  ).length + 1;
};

const selectPlayerTarget = (
  state: CombatState,
  enemy: CombatActor,
  priority: TargetPriorityId = "nearest",
): CombatActor | undefined => {
  const players = livingPlayerUnits(state).map((unit) => unit.actor);
  if (players.length === 0) {
    return undefined;
  }

  const sorted = [...players].sort((a, b) => {
    const distanceA = playerDistance(enemy, a);
    const distanceB = playerDistance(enemy, b);

    switch (priority) {
      case "lowestHp":
        return a.hp - b.hp || distanceA - distanceB;
      case "lowestHpPercent":
        return a.hp / a.maxHp - b.hp / b.maxHp || distanceA - distanceB;
      case "nearest":
      case "eliteFirst":
      default:
        return distanceA - distanceB;
    }
  });

  return sorted[0];
};

interface ProjectileThreatDistances {
  any: number;
  ballistic: number;
  energy: number;
  missile: number;
}

const hostileProjectileThreatDistances = (state: CombatState, actor: CombatActor): ProjectileThreatDistances => {
  const best: ProjectileThreatDistances = {
    any: Number.POSITIVE_INFINITY,
    ballistic: Number.POSITIVE_INFINITY,
    energy: Number.POSITIVE_INFINITY,
    missile: Number.POSITIVE_INFINITY,
  };

  for (const projectile of state.projectiles) {
    if (projectile.owner === actor.team) {
      continue;
    }
    const distance = Math.hypot(projectile.x - actor.x, projectile.y - actor.y);
    best.any = Math.min(best.any, distance);
    if (projectile.damageKind === "missile") {
      best.missile = Math.min(best.missile, distance);
    } else if (projectile.damageKind === "energy") {
      best.energy = Math.min(best.energy, distance);
    } else if (projectile.damageKind === "ballistic" || projectile.damageKind === "explosive") {
      best.ballistic = Math.min(best.ballistic, distance);
    }
  }
  return best;
};

const nearestHostileMissile = (
  state: CombatState,
  actor: CombatActor,
  maxDistance = 280,
): Projectile | undefined => {
  let best: Projectile | undefined;
  let bestDistance = maxDistance;

  for (const projectile of state.projectiles) {
    if (projectile.owner === actor.team || projectile.kind !== "missile") {
      continue;
    }
    const distance = Math.hypot(projectile.x - actor.x, projectile.y - actor.y);
    if (distance < bestDistance) {
      best = projectile;
      bestDistance = distance;
    }
  }

  return best;
};

const breakIncomingMissileLocks = (state: CombatState, actor: CombatActor): void => {
  let broken = 0;
  for (const projectile of state.projectiles) {
    const dx = actor.x - projectile.x;
    const dy = actor.y - projectile.y;
    const distance = Math.hypot(dx, dy);
    const speed = Math.max(1, Math.hypot(projectile.vx, projectile.vy));
    const approach = (projectile.vx * dx + projectile.vy * dy) / Math.max(1, speed * distance);

    if (
      projectile.owner !== actor.team &&
      projectile.kind === "missile" &&
      projectile.targetId === actor.id &&
      distance >= BOOST_LOCK_BREAK_MIN_DISTANCE &&
      distance <= BOOST_LOCK_BREAK_MAX_DISTANCE &&
      approach >= BOOST_LOCK_BREAK_MIN_APPROACH
    ) {
      projectile.targetId = undefined;
      broken += 1;
    }
  }

  if (broken > 0) {
    state.effects.push(
      createEffect({
        id: uid("effect"),
        kind: "lockBreak",
        x: actor.x,
        y: actor.y,
        life: 0.36,
        maxLife: 0.36,
        color: actor.team === "player" ? "#8af6ff" : actor.color,
        size: actor.radius * 2.9,
      }),
    );
  }
};

const nearestPlayerProjectileThreat = (
  state: CombatState,
  enemy: CombatActor,
): { distance: number; x: number; y: number } | undefined => {
  let best: { distance: number; x: number; y: number } | undefined;
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "player") {
      continue;
    }

    const dx = projectile.x - enemy.x;
    const dy = projectile.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 92) {
      continue;
    }

    const closing = (projectile.vx * dx + projectile.vy * dy) < 0;
    if (!closing && distance > 48) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = { distance, x: dx / Math.max(1, distance), y: dy / Math.max(1, distance) };
    }
  }

  return best;
};

const pushMoveEffect = (
  state: CombatState,
  x: number,
  y: number,
  color: string,
  size = 13,
  life = 0.22,
  rotation?: number,
): void => {
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "boost",
      x,
      y,
      life,
      maxLife: life,
      color,
      size,
      rotation,
    }),
  );
};

const pushBoostBurst = (
  state: CombatState,
  actor: CombatActor,
  direction: { x: number; y: number },
  color = "#21e0ff",
): void => {
  const angle = Math.atan2(direction.y, direction.x);
  const side = { x: -direction.y, y: direction.x };
  const backX = actor.x - direction.x * (actor.radius + 5);
  const backY = actor.y - direction.y * (actor.radius + 5);

  pushMoveEffect(state, backX, backY, color, 34, 0.34, angle);
  pushMoveEffect(state, backX - direction.x * 5 + side.x * 6, backY - direction.y * 5 + side.y * 6, "#8af6ff", 18, 0.26, angle);
  pushMoveEffect(state, backX - direction.x * 6 - side.x * 6, backY - direction.y * 6 - side.y * 6, "#ffb35a", 15, 0.22, angle);
};

const fireProjectile = (
  state: CombatState,
  source: CombatActor,
  target: Pick<CombatActor, "x" | "y">,
  damage: number,
  speed: number,
  kind: Projectile["kind"],
  damageKind: DamageKind,
  color: string,
  radius: number,
  targetId?: string,
  sourceUnitIndex?: number,
  blastRadius = 0,
): void => {
  const aim = normalize(target.x - source.x, target.y - source.y);
  state.projectiles.push(
    createProjectile({
      id: uid("projectile"),
      owner: source.team,
      kind,
      x: source.x + aim.x * (source.radius + 8),
      y: source.y + aim.y * (source.radius + 8),
      vx: aim.x * speed,
      vy: aim.y * speed,
      damage,
      damageKind,
      radius,
      blastRadius,
      life: kind === "missile" ? 2.9 : kind === "rocket" || kind === "grenade" ? 2.05 : 1.55,
      color,
      targetId,
      sourceUnitIndex,
      interceptable: kind === "missile",
      interceptHp: kind === "missile" ? Math.max(16, damage * 0.18) : undefined,
      interceptDamage: Math.max(4, damage * (kind === "pulse" ? 0.68 : kind === "bullet" ? 0.9 : 1.05)),
    }),
  );
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "muzzle",
      x: source.x + aim.x * (source.radius + 12),
      y: source.y + aim.y * (source.radius + 12),
      life: 0.12,
      maxLife: 0.12,
      color,
      size: 16,
    }),
  );
  state.soundEvents.push(
    kind === "missile" || kind === "rocket" || kind === "grenade"
      ? "missile"
      : kind === "pulse"
        ? "shootEnergy"
        : "shootBallistic",
  );
};

const projectileProfile = (
  kind: WeaponKind,
  resource: WeaponResource,
): {
  projectileKind: Projectile["kind"];
  speed: number;
  color: string;
  radius: number;
  damageScale: number;
  damageKind: DamageKind;
  homing: boolean;
} => {
  switch (kind) {
    case "sniperRifle":
      return {
        projectileKind: resource === "energy" ? "pulse" : "bullet",
        speed: resource === "energy" ? 820 : 880,
        color: resource === "energy" ? "#8ce5ff" : "#ffe0a6",
        radius: 4.1,
        damageScale: 1.18,
        damageKind: resource === "energy" ? "energy" : "ballistic",
        homing: false,
      };
    case "machineGun":
      return {
        projectileKind: resource === "energy" ? "pulse" : "bullet",
        speed: resource === "energy" ? 560 : 640,
        color: resource === "energy" ? "#54f4a7" : "#ffb15a",
        radius: 3.5,
        damageScale: 0.82,
        damageKind: resource === "energy" ? "energy" : "ballistic",
        homing: false,
      };
    case "rocket":
      return {
        projectileKind: "rocket",
        speed: 315,
        color: "#ff9d42",
        radius: 6.4,
        damageScale: 1.08,
        damageKind: "explosive",
        homing: false,
      };
    case "grenade":
      return {
        projectileKind: "grenade",
        speed: 255,
        color: "#ffc45f",
        radius: 7.2,
        damageScale: 1.0,
        damageKind: "explosive",
        homing: false,
      };
    case "missile":
      return {
        projectileKind: "missile",
        speed: 225,
        color: "#ff9c35",
        radius: 5.9,
        damageScale: 1.0,
        damageKind: "missile",
        homing: true,
      };
    case "pulse":
      return {
        projectileKind: "pulse",
        speed: 510,
        color: "#63cfff",
        radius: 4.8,
        damageScale: 1.0,
        damageKind: "energy",
        homing: false,
      };
    case "rifle":
    default:
      return {
        projectileKind: resource === "energy" ? "pulse" : "bullet",
        speed: resource === "energy" ? 585 : 650,
        color: resource === "energy" ? "#63cfff" : "#ffb15a",
        radius: 4.4,
        damageScale: 1.0,
        damageKind: resource === "energy" ? "energy" : "ballistic",
        homing: false,
      };
  }
};

const performBladeAttack = (
  state: CombatState,
  source: CombatActor,
  target: CombatActor,
  damage: number,
  reach: number,
): void => {
  const aim = normalize(target.x - source.x, target.y - source.y);
  const rotation = Math.atan2(aim.y, aim.x);
  const strikeDistance = Math.min(reach * 0.72, aim.distance * 0.58);
  const strikeX = source.x + aim.x * strikeDistance;
  const strikeY = source.y + aim.y * strikeDistance;

  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "slash",
      x: strikeX,
      y: strikeY,
      life: 0.38,
      maxLife: 0.38,
      color: "#8dfff1",
      size: 82,
      rotation,
    }),
  );
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "muzzle",
      x: source.x + aim.x * (source.radius + 10),
      y: source.y + aim.y * (source.radius + 10),
      life: 0.11,
      maxLife: 0.11,
      color: "#d7fff6",
      size: 20,
    }),
  );

  const resolvedDamage = damageAfterDefense(damage, target, "melee");
  target.hp = Math.max(0, target.hp - resolvedDamage);
  const sourceUnitIndex = source.id.startsWith("player-") ? Number(source.id.replace("player-", "")) - 1 : undefined;
  if (sourceUnitIndex !== undefined && Number.isFinite(sourceUnitIndex)) {
    state.report.damageByUnit[sourceUnitIndex] =
      (state.report.damageByUnit[sourceUnitIndex] ?? 0) + resolvedDamage;
  }
  const knockback = target.rank === "boss" ? 95 : target.rank === "elite" ? 145 : 205;
  target.vx += aim.x * knockback;
  target.vy += aim.y * knockback;
  state.soundEvents.push("blade", "hit");
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "explosion",
      x: target.x - aim.x * target.radius * 0.35,
      y: target.y - aim.y * target.radius * 0.35,
      life: 0.18,
      maxLife: 0.18,
      color: "#9fffee",
      size: 22,
    }),
  );
};

const beamLineDistance = (
  source: CombatActor,
  aim: { x: number; y: number },
  target: CombatActor,
): { projection: number; perpendicular: number } => {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const projection = dx * aim.x + dy * aim.y;
  const perpendicular = Math.abs(dx * aim.y - dy * aim.x);
  return { projection, perpendicular };
};

const lockBeamAim = (weapon: PlayerWeaponState, source: CombatActor, target: CombatActor): void => {
  const aim = normalize(target.x - source.x, target.y - source.y);
  weapon.beamAimX = aim.x;
  weapon.beamAimY = aim.y;
};

const rotateBeamAimToward = (
  weapon: PlayerWeaponState,
  source: CombatActor,
  target: CombatActor,
  maxTurn: number,
): void => {
  if (weapon.beamAimX === undefined || weapon.beamAimY === undefined) {
    lockBeamAim(weapon, source, target);
    return;
  }

  const desired = normalize(target.x - source.x, target.y - source.y);
  const currentAngle = Math.atan2(weapon.beamAimY, weapon.beamAimX);
  const desiredAngle = Math.atan2(desired.y, desired.x);
  const delta = Math.atan2(Math.sin(desiredAngle - currentAngle), Math.cos(desiredAngle - currentAngle));
  const nextAngle = currentAngle + clamp(delta, -maxTurn, maxTurn);
  weapon.beamAimX = Math.cos(nextAngle);
  weapon.beamAimY = Math.sin(nextAngle);
};

const pushBeamWarning = (
  state: CombatState,
  source: CombatActor,
  weapon: PlayerWeaponState,
  range: number,
): void => {
  const aimX = weapon.beamAimX ?? source.facingX;
  const aimY = weapon.beamAimY ?? source.facingY;
  const startX = source.x + aimX * (source.radius + 8);
  const startY = source.y + aimY * (source.radius + 8);
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "beamWarning",
      x: startX,
      y: startY,
      endX: source.x + aimX * range,
      endY: source.y + aimY * range,
      life: 0.06,
      maxLife: 0.06,
      color: source.team === "player" ? "#78f3ff" : source.color,
      size: BEAM_WARNING_WIDTH,
    }),
  );
};

const performBeamAttack = (
  state: CombatState,
  source: CombatActor,
  weapon: PlayerWeaponState,
  damage: number,
  range: number,
): boolean => {
  const aim = {
    x: weapon.beamAimX ?? source.facingX,
    y: weapon.beamAimY ?? source.facingY,
  };
  const startX = source.x + aim.x * (source.radius + 8);
  const startY = source.y + aim.y * (source.radius + 8);
  const endX = source.x + aim.x * range;
  const endY = source.y + aim.y * range;
  const targets = source.team === "player" ? livingEnemies(state) : livingPlayerUnits(state).map((unit) => unit.actor);
  const sourceUnitIndex = source.id.startsWith("player-") ? Number(source.id.replace("player-", "")) - 1 : undefined;
  let hit = false;

  for (const target of targets) {
    const { projection, perpendicular } = beamLineDistance(source, aim, target);
    const hitWidth = BEAM_HIT_WIDTH + target.radius;
    if (projection < source.radius || projection > range + target.radius || perpendicular > hitWidth) {
      continue;
    }

    const centerWidth = Math.max(1, target.radius * 0.42);
    const edgeWidth = Math.max(1, hitWidth - centerWidth);
    const damageScale = perpendicular <= centerWidth
      ? 1
      : clamp(1 - (perpendicular - centerWidth) / edgeWidth, 0.35, 1);
    const resolvedDamage = damageAfterDefense(damage * damageScale, target, "energy");
    target.hp = Math.max(0, target.hp - resolvedDamage);
    if (sourceUnitIndex !== undefined && Number.isFinite(sourceUnitIndex)) {
      state.report.damageByUnit[sourceUnitIndex] =
        (state.report.damageByUnit[sourceUnitIndex] ?? 0) + resolvedDamage;
    }
    target.vx += aim.x * (target.rank === "boss" ? 20 : 36) * damageScale;
    target.vy += aim.y * (target.rank === "boss" ? 20 : 36) * damageScale;
    hit = true;
  }
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "beam",
      x: startX,
      y: startY,
      endX,
      endY,
      life: 0.13,
      maxLife: 0.13,
      color: source.team === "player" ? "#78f3ff" : source.color,
      size: source.team === "player" ? 8 : 11,
    }),
  );
  state.effects.push(
    createEffect({
      id: uid("effect"),
      kind: "muzzle",
      x: startX,
      y: startY,
      life: 0.08,
      maxLife: 0.08,
      color: "#dffbff",
      size: 18,
    }),
  );
  state.soundEvents.push("shootEnergy");
  if (hit) {
    state.soundEvents.push("hit");
  }
  return hit;
};

const hostileBeamLockDistance = (state: CombatState, actor: CombatActor): number => {
  let best = Number.POSITIVE_INFINITY;
  const scan = (source: CombatActor, weapons: PlayerWeaponState[]): void => {
    if (source.team === actor.team || source.hp <= 0) {
      return;
    }

    for (const weapon of weapons) {
      if (
        weapon.weaponKind !== "beamLaser" ||
        weapon.beamAimX === undefined ||
        weapon.beamAimY === undefined ||
        (weapon.sequenceWarmupRemaining <= 0 && weapon.sustainRemaining <= 0)
      ) {
        continue;
      }

      const aim = { x: weapon.beamAimX, y: weapon.beamAimY };
      const { projection, perpendicular } = beamLineDistance(source, aim, actor);
      if (projection < source.radius || projection > weapon.range + actor.radius) {
        continue;
      }
      best = Math.min(best, Math.max(0, perpendicular - actor.radius));
    }
  };

  for (const unit of state.players) {
    scan(unit.actor, unit.weapons);
  }
  for (const enemy of state.enemies) {
    if (enemy.rivalAi) {
      scan(enemy, enemy.rivalAi.weapons);
    }
  }

  return best;
};

const spendEnergy = (actor: CombatActor, amount: number): boolean => {
  if (actor.en < amount) {
    return false;
  }
  actor.en -= amount;
  return true;
};

const weaponByHardpoint = (
  unit: PlayerCombatUnit,
  hardpoint: WeaponHardpoint,
): PlayerWeaponState | undefined =>
  unit.weapons.find((weapon) => weapon.hardpoint === hardpoint);

const bladeReachFor = (
  actor: CombatActor,
  target: CombatActor,
  weapon: Pick<PlayerWeaponState, "range">,
): number =>
  actor.radius + target.radius + Math.min(BLADE_REACH_CAP, Math.max(0, weapon.range));

const bladeEngageDistanceFor = (
  actor: CombatActor,
  target: CombatActor,
  weapon: Pick<PlayerWeaponState, "range">,
): number =>
  bladeReachFor(actor, target, weapon) + BLADE_ENGAGE_BUFFER;

const firstReadyShoulderWeapon = (
  unit: PlayerCombatUnit,
  target: CombatActor,
): PlayerWeaponState | undefined =>
  unit.weapons.find((weapon) =>
    weapon.hardpoint.includes("Shoulder") &&
    weapon.autoUse &&
    weapon.cooldownRemaining <= 0 &&
    !isWeaponSequenceActive(weapon) &&
    canPayWeapon(unit, weapon) &&
    isWeaponInRange(unit.actor, target, weapon),
  );

const canPayWeapon = (unit: PlayerCombatUnit, weapon: PlayerWeaponState | undefined): boolean => {
  if (!weapon) {
    return false;
  }
  return weapon.resource === "ballistic"
    ? weapon.reloadRemaining <= 0 && weapon.magazine > 0
    : !weapon.overheated && weapon.heat < weapon.heatLimit && unit.actor.en >= weapon.energyCost;
};

const canAutoUseWeapon = (unit: PlayerCombatUnit, weapon: PlayerWeaponState | undefined): boolean =>
  Boolean(weapon?.autoUse) && Boolean(weapon && !isWeaponSequenceActive(weapon)) && canPayWeapon(unit, weapon);

const isWeaponInRange = (
  actor: CombatActor,
  target: CombatActor,
  weapon: PlayerWeaponState,
): boolean => {
  if (weapon.weaponKind === "blade") {
    return Math.hypot(target.x - actor.x, target.y - actor.y) <= bladeReachFor(actor, target, weapon);
  }
  return Math.hypot(target.x - actor.x, target.y - actor.y) <= weapon.range + target.radius;
};

const consumeWeapon = (
  unit: PlayerCombatUnit,
  weapon: PlayerWeaponState,
): boolean => {
  if (weapon.resource === "ballistic") {
    if (weapon.reloadRemaining > 0 || weapon.magazine <= 0) {
      return false;
    }
    weapon.magazine -= 1;
    weapon.ammo = weapon.magazine;
    if (weapon.magazine <= 0) {
      weapon.reloadRemaining = weapon.reloadTime;
    }
    return true;
  }
  if (weapon.overheated || weapon.heat >= weapon.heatLimit || !spendEnergy(unit.actor, weapon.energyCost)) {
    return false;
  }
  weapon.heat = Math.min(weapon.heatLimit, weapon.heat + weapon.heatPerShot);
  if (weapon.heat >= weapon.heatLimit) {
    weapon.overheated = true;
  }
  return true;
};

const isWeaponSequenceActive = (weapon: PlayerWeaponState): boolean =>
  weapon.burstShotsRemaining > 0 || weapon.sustainRemaining > 0 || weapon.sequenceWarmupRemaining > 0;

const weaponSequenceTarget = (
  state: CombatState,
  weapon: PlayerWeaponState,
  fallback: CombatActor | undefined,
): CombatActor | undefined => {
  const targetId = weapon.sequenceTargetId;
  const target = targetId
    ? [...state.enemies, ...livingPlayerUnits(state).map((unit) => unit.actor)].find((actor) => actor.id === targetId)
    : undefined;
  if (target && target.hp > 0) {
    return target;
  }
  return fallback?.hp && fallback.hp > 0 ? fallback : undefined;
};

const updateWeaponRuntime = (weapon: PlayerWeaponState, dt: number): void => {
  weapon.cooldownRemaining = Math.max(0, weapon.cooldownRemaining - dt);

  if (weapon.resource === "ballistic") {
    if (weapon.reloadRemaining > 0) {
      weapon.reloadRemaining = Math.max(0, weapon.reloadRemaining - dt);
      if (weapon.reloadRemaining <= 0 && weapon.magazine <= 0) {
        weapon.magazine = weapon.magazineSize;
        weapon.ammo = weapon.magazine;
      }
    } else if (weapon.magazine <= 0) {
      weapon.reloadRemaining = weapon.reloadTime;
    }
  } else {
    weapon.heat = Math.max(0, weapon.heat - weapon.coolingRate * dt);
    if (weapon.overheated && weapon.heat <= weapon.heatLimit * 0.58) {
      weapon.overheated = false;
    }
  }

  if (weapon.sequenceWarmupRemaining > 0) {
    weapon.sequenceWarmupRemaining = Math.max(0, weapon.sequenceWarmupRemaining - dt);
  } else if (weapon.sustainRemaining > 0) {
    weapon.sustainRemaining = Math.max(0, weapon.sustainRemaining - dt);
  }
  weapon.sequenceTimer = Math.max(0, weapon.sequenceTimer - dt);

  if (!isWeaponSequenceActive(weapon)) {
    weapon.sequenceTargetId = undefined;
    weapon.beamAimX = undefined;
    weapon.beamAimY = undefined;
  }
};

const fireWeaponShot = (
  state: CombatState,
  unit: PlayerCombatUnit,
  weapon: PlayerWeaponState | undefined,
  target: CombatActor,
  requireRange = false,
): boolean => {
  if (!weapon || !weapon.autoUse) {
    return false;
  }

  const player = unit.actor;
  const toTarget = normalize(target.x - player.x, target.y - player.y);

  if (weapon.weaponKind === "blade") {
    const bladeReach = bladeReachFor(player, target, weapon);
    if (toTarget.distance > bladeReach) {
      return false;
    }
    if (!consumeWeapon(unit, weapon)) {
      return false;
    }
    player.vx += toTarget.x * player.moveSpeed * 0.88;
    player.vy += toTarget.y * player.moveSpeed * 0.88;
    performBladeAttack(state, player, target, weapon.attack * 1.55, bladeReach);
    weapon.cooldownRemaining = weapon.cooldownMax;
    return true;
  }

  if (weapon.weaponKind === "beamLaser") {
    if (toTarget.distance > weapon.range + target.radius) {
      return false;
    }
    if (!consumeWeapon(unit, weapon)) {
      return false;
    }
    performBeamAttack(state, player, weapon, weapon.attack * 0.56, weapon.range + target.radius);
    return true;
  }

  if (requireRange && !isWeaponInRange(player, target, weapon)) {
    return false;
  }

  if (!consumeWeapon(unit, weapon)) {
    return false;
  }
  const profile = projectileProfile(weapon.weaponKind, weapon.resource);
  fireProjectile(
    state,
    player,
    target,
    weapon.attack * profile.damageScale,
    profile.speed,
    profile.projectileKind,
    profile.damageKind,
    profile.color,
    profile.radius,
    profile.homing ? target.id : undefined,
    unit.unitIndex,
    weapon.blastRadius,
  );
  return true;
};

const startWeaponSequence = (
  weapon: PlayerWeaponState,
  target: CombatActor,
  firedImmediately: boolean,
  source?: CombatActor,
): void => {
  weapon.sequenceTargetId = target.id;
  if (weapon.firePattern === "burst") {
    weapon.burstShotsRemaining = Math.max(0, weapon.burstCount - (firedImmediately ? 1 : 0));
    weapon.sequenceTimer = weapon.burstInterval;
    weapon.cooldownRemaining = weapon.cooldownMax;
    return;
  }

  if (weapon.firePattern === "sustain") {
    if (weapon.weaponKind === "beamLaser" && source) {
      lockBeamAim(weapon, source, target);
    }
    weapon.sequenceWarmupRemaining = weapon.spinUpTime;
    weapon.sequenceTimer = weapon.spinUpTime;
    weapon.sustainRemaining = weapon.sustainTime;
    weapon.cooldownRemaining = weapon.cooldownMax + weapon.spinUpTime + weapon.sustainTime;
    return;
  }

  weapon.cooldownRemaining = weapon.cooldownMax;
};

const firePlayerWeapon = (
  state: CombatState,
  unit: PlayerCombatUnit,
  weapon: PlayerWeaponState | undefined,
  target: CombatActor,
  requireRange = false,
): boolean => {
  if (!weapon || !weapon.autoUse || weapon.cooldownRemaining > 0 || isWeaponSequenceActive(weapon)) {
    return false;
  }

  if (requireRange && !isWeaponInRange(unit.actor, target, weapon)) {
    return false;
  }

  if (weapon.firePattern === "sustain") {
    if (!canPayWeapon(unit, weapon)) {
      return false;
    }
    startWeaponSequence(weapon, target, false, unit.actor);
    state.effects.push(
      createEffect({
        id: uid("effect"),
        kind: "muzzle",
        x: unit.actor.x + unit.actor.facingX * (unit.actor.radius + 12),
        y: unit.actor.y + unit.actor.facingY * (unit.actor.radius + 12),
        life: 0.2,
        maxLife: 0.2,
        color: "#ffcf66",
        size: 18,
      }),
    );
    return true;
  }

  const fired = fireWeaponShot(state, unit, weapon, target, requireRange);
  if (!fired) {
    return false;
  }

  startWeaponSequence(weapon, target, true, unit.actor);
  return true;
};

const resolveWeaponSequences = (
  state: CombatState,
  unit: PlayerCombatUnit,
  fallbackTarget: CombatActor | undefined,
  dt: number,
): void => {
  for (const weapon of unit.weapons) {
    if (!weapon.autoUse) {
      continue;
    }

    if (weapon.weaponKind === "beamLaser" && weapon.sequenceWarmupRemaining > 0) {
      pushBeamWarning(state, unit.actor, weapon, weapon.range + 48);
    }

    if (weapon.sequenceTimer > 0 || weapon.sequenceWarmupRemaining > 0) {
      continue;
    }

    const target = weaponSequenceTarget(state, weapon, fallbackTarget);
    if (!target) {
      weapon.burstShotsRemaining = 0;
      weapon.sustainRemaining = 0;
      weapon.sequenceTargetId = undefined;
      weapon.beamAimX = undefined;
      weapon.beamAimY = undefined;
      continue;
    }

    if (weapon.burstShotsRemaining > 0) {
      if (fireWeaponShot(state, unit, weapon, target, true)) {
        weapon.burstShotsRemaining -= 1;
        weapon.sequenceTimer = weapon.burstInterval;
      } else {
        weapon.burstShotsRemaining = 0;
      }
    }

    if (weapon.sustainRemaining > 0 && weapon.sequenceTimer <= 0 && weapon.sequenceWarmupRemaining <= 0) {
      if (weapon.weaponKind === "beamLaser") {
        rotateBeamAimToward(weapon, unit.actor, target, BEAM_TRACK_TURN_RATE * Math.max(dt, weapon.burstInterval));
      }
      if (fireWeaponShot(state, unit, weapon, target, true)) {
        weapon.sequenceTimer = weapon.burstInterval;
      } else {
        weapon.sustainRemaining = 0;
      }
    }
  }
};

type WeaponPlanMode = "suppressive" | "alpha" | "explosive" | "longRange";

const isExplosiveWeapon = (weapon: PlayerWeaponState): boolean =>
  weapon.weaponKind === "rocket" || weapon.weaponKind === "grenade" || weapon.blastRadius > 0;

const isLongRangeWeapon = (weapon: PlayerWeaponState): boolean =>
  weapon.weaponKind === "sniperRifle" ||
  weapon.weaponKind === "beamLaser" ||
  weapon.weaponKind === "rocket" ||
  weapon.weaponKind === "missile" ||
  weapon.range >= 390;

const suppressiveWeaponScore = (weapon: PlayerWeaponState): number => {
  const armBonus = weapon.hardpoint === "leftArm" || weapon.hardpoint === "rightArm" ? 80 : 0;
  const kindBonus =
    weapon.weaponKind === "machineGun"
      ? 42
      : weapon.weaponKind === "beamLaser"
        ? 36
      : weapon.weaponKind === "rifle" || weapon.weaponKind === "pulse"
        ? 30
        : weapon.weaponKind === "blade"
          ? 10
          : 0;
  return armBonus + kindBonus + Math.max(0, 3 - weapon.cooldownMax) * 10;
};

const plannedWeaponCandidates = (
  unit: PlayerCombatUnit,
  target: CombatActor,
  mode: WeaponPlanMode,
): PlayerWeaponState[] =>
  unit.weapons
    .filter((weapon) => {
      if (!weapon.autoUse || weapon.cooldownRemaining > 0 || isWeaponSequenceActive(weapon) || !canPayWeapon(unit, weapon)) {
        return false;
      }
      if (!isWeaponInRange(unit.actor, target, weapon)) {
        return false;
      }

      switch (mode) {
        case "suppressive":
          return (
            !isExplosiveWeapon(weapon) &&
            (weapon.hardpoint === "leftArm" ||
              weapon.hardpoint === "rightArm" ||
              weapon.weaponKind === "machineGun" ||
              weapon.weaponKind === "beamLaser" ||
              weapon.weaponKind === "rifle" ||
              weapon.weaponKind === "pulse")
          );
        case "explosive":
          return isExplosiveWeapon(weapon);
        case "longRange":
          return isLongRangeWeapon(weapon);
        case "alpha":
        default:
          return true;
      }
    })
    .sort((a, b) => {
      switch (mode) {
        case "suppressive":
          return suppressiveWeaponScore(b) - suppressiveWeaponScore(a);
        case "explosive":
          return (b.blastRadius || b.attack) - (a.blastRadius || a.attack);
        case "longRange":
          return b.range - a.range || b.attack - a.attack;
        case "alpha":
        default:
          return b.attack - a.attack || b.range - a.range;
      }
    });

const firePlannedWeapons = (
  state: CombatState,
  unit: PlayerCombatUnit,
  target: CombatActor,
  mode: WeaponPlanMode,
): boolean => {
  const candidates = plannedWeaponCandidates(unit, target, mode);
  const limit = mode === "alpha" ? candidates.length : mode === "suppressive" ? 2 : 1;
  let fired = false;

  for (const weapon of candidates.slice(0, limit)) {
    fired = firePlayerWeapon(state, unit, weapon, target, true) || fired;
  }

  return fired;
};

const isMissileInterceptWeapon = (weapon: PlayerWeaponState): boolean =>
  (weapon.hardpoint === "leftArm" || weapon.hardpoint === "rightArm") &&
  (weapon.weaponKind === "rifle" || weapon.weaponKind === "machineGun" || weapon.weaponKind === "pulse");

const interceptWeaponScore = (weapon: PlayerWeaponState): number => {
  const profile = projectileProfile(weapon.weaponKind, weapon.resource);
  return profile.speed + (weapon.weaponKind === "machineGun" ? 80 : 0) - weapon.cooldownMax * 20;
};

const interceptIncomingMissile = (state: CombatState, unit: PlayerCombatUnit): boolean => {
  const player = unit.actor;
  const missile = nearestHostileMissile(state, player);
  if (!missile) {
    return false;
  }

  const distance = Math.hypot(missile.x - player.x, missile.y - player.y);
  const weapon = unit.weapons
    .filter((candidate) =>
      isMissileInterceptWeapon(candidate) &&
      candidate.autoUse &&
      candidate.cooldownRemaining <= 0 &&
      !isWeaponSequenceActive(candidate) &&
      canPayWeapon(unit, candidate) &&
      distance <= candidate.range + 90,
    )
    .sort((a, b) => interceptWeaponScore(b) - interceptWeaponScore(a))[0];

  if (!weapon || !consumeWeapon(unit, weapon)) {
    return false;
  }

  const aim = normalize(missile.x - player.x, missile.y - player.y);
  player.facingX = aim.x;
  player.facingY = aim.y;
  const profile = projectileProfile(weapon.weaponKind, weapon.resource);
  fireProjectile(
    state,
    player,
    missile,
    weapon.attack * profile.damageScale * 1.05,
    profile.speed,
    profile.projectileKind,
    profile.damageKind,
    profile.color,
    profile.radius,
    undefined,
    unit.unitIndex,
    0,
  );
  weapon.cooldownRemaining = Math.max(0.14, weapon.cooldownMax * 0.7);
  return true;
};

const applyPlayerAction = (
  state: CombatState,
  unit: PlayerCombatUnit,
  action: AiActionId,
  target: CombatActor | undefined,
): void => {
  const player = unit.actor;
  if (!target) {
    if (action === "interceptMissile") {
      interceptIncomingMissile(state, unit);
    }
    return;
  }

  const toTarget = normalize(target.x - player.x, target.y - player.y);
  player.facingX = toTarget.x;
  player.facingY = toTarget.y;
  const strafeDirection = Math.sin(state.time * 2.7) > 0 ? 1 : -1;
  const perpendicular = { x: -toTarget.y * strafeDirection, y: toTarget.x * strafeDirection };
  const rangeBias = toTarget.distance > 285 ? 0.44 : toTarget.distance < 118 ? -0.62 : 0.05;
  const combatDrift = () => {
    applyThrust(player, perpendicular.x * 0.45 + toTarget.x * rangeBias, perpendicular.y * 0.45 + toTarget.y * rangeBias, 0.5);
  };

  switch (action) {
    case "approach":
      applyThrust(player, toTarget.x, toTarget.y, 0.82);
      break;
    case "retreat":
      applyThrust(player, -toTarget.x, -toTarget.y, 0.68);
      break;
    case "strafe":
      applyThrust(player, perpendicular.x * 0.55 + toTarget.x * rangeBias, perpendicular.y * 0.55 + toTarget.y * rangeBias, 0.58);
      break;
    case "boostDodge": {
      const cost = unit.stats.quickBoostCost;
      if (unit.boostCooldown <= 0 && spendEnergy(player, cost)) {
        const thrust = unit.stats.quickBoostThrust;
        player.vx += perpendicular.x * thrust;
        player.vy += perpendicular.y * thrust;
        applyThrust(player, perpendicular.x, perpendicular.y, clamp(thrust / Math.max(1, player.moveSpeed * 2.6), 0.6, 1.55));
        player.quickBoostTime = unit.stats.quickBoostDuration;
        player.quickBoostMaxSpeed = unit.stats.boostSpeed;
        pushBoostBurst(state, player, perpendicular, player.team === "enemy" ? player.color : "#21e0ff");
        breakIncomingMissileLocks(state, player);
        unit.boostCooldown = unit.stats.quickBoostCooldown;
        state.soundEvents.push(boostSoundForActor(player));
      } else {
        applyThrust(player, perpendicular.x * 0.35 + toTarget.x * rangeBias, perpendicular.y * 0.35 + toTarget.y * rangeBias, 0.32);
      }
      break;
    }
    case "suppressiveFire":
      combatDrift();
      firePlannedWeapons(state, unit, target, "suppressive");
      break;
    case "alphaStrike":
      combatDrift();
      firePlannedWeapons(state, unit, target, "alpha");
      break;
    case "fireExplosive":
      combatDrift();
      firePlannedWeapons(state, unit, target, "explosive");
      break;
    case "fireLongRange":
      combatDrift();
      firePlannedWeapons(state, unit, target, "longRange");
      break;
    case "shootRight":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "rightArm"), target);
      break;
    case "shootLeft": {
      const leftWeapon = weaponByHardpoint(unit, "leftArm");
      if (leftWeapon?.weaponKind === "blade") {
        const bladeReach = bladeReachFor(player, target, leftWeapon);
        if (toTarget.distance > bladeReach) {
          applyThrust(player, toTarget.x, toTarget.y, 1.15);
          break;
        }

        applyThrust(player, toTarget.x, toTarget.y, 0.58);
        firePlayerWeapon(state, unit, leftWeapon, target);
        break;
      }

      combatDrift();
      firePlayerWeapon(state, unit, leftWeapon, target);
      break;
    }
    case "fireLeftShoulder":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "leftShoulder"), target);
      break;
    case "fireRightShoulder":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "rightShoulder"), target);
      break;
    case "fireBothShoulders":
      combatDrift();
      firePlayerWeapon(state, unit, weaponByHardpoint(unit, "bothShoulders"), target);
      break;
    case "fireShoulder":
    case "fireMissile":
      combatDrift();
      firePlayerWeapon(state, unit, firstReadyShoulderWeapon(unit, target), target, true);
      break;
    case "interceptMissile":
      combatDrift();
      interceptIncomingMissile(state, unit);
      break;
    case "guard":
      if (unit.stats.canGuard && player.canGuard) {
        player.guard = true;
        applyThrust(player, -toTarget.x, -toTarget.y, 0.2);
      } else {
        combatDrift();
      }
      break;
    case "idle":
      combatDrift();
      break;
  }
};

const updateRivalEnemy = (state: CombatState, enemy: CombatActor, dt: number): void => {
  const rival = enemy.rivalAi;
  if (!rival) {
    return;
  }

  const target = selectPlayerTarget(state, enemy, rival.targetPriority);
  if (!target) {
    rival.activeAction = "idle";
    rival.activeRuleId = undefined;
    return;
  }

  enemy.en = Math.min(enemy.maxEn, enemy.en + enemy.enRegen * dt);
  for (const weapon of rival.weapons) {
    updateWeaponRuntime(weapon, dt);
  }
  rival.boostCooldown = Math.max(0, rival.boostCooldown - dt);

  const targetDistance = playerDistance(enemy, target);
  const nearestPlayerDistance = livingPlayerUnits(state).reduce(
    (nearest, unit) => Math.min(nearest, playerDistance(enemy, unit.actor)),
    Number.POSITIVE_INFINITY,
  );
  const unit: PlayerCombatUnit = {
    unitIndex: -1,
    actor: enemy,
    stats: rival.stats,
    activeAction: rival.activeAction,
    activeRuleId: rival.activeRuleId,
    weapons: rival.weapons,
    boostCooldown: rival.boostCooldown,
  };
  const rightWeapon = weaponByHardpoint(unit, "rightArm");
  const leftWeapon = weaponByHardpoint(unit, "leftArm");
  const leftShoulderWeapon = weaponByHardpoint(unit, "leftShoulder");
  const rightShoulderWeapon = weaponByHardpoint(unit, "rightShoulder");
  const bothShoulderWeapon = weaponByHardpoint(unit, "bothShoulders");
  resolveWeaponSequences(state, unit, target, dt);
  const projectileThreats = hostileProjectileThreatDistances(state, enemy);
  const decision = evaluateAiRules(rival.rules, {
    en: enemy.en,
    hpPercent: enemy.hp / enemy.maxHp,
    enPercent: enemy.en / enemy.maxEn,
    nearestEnemyDistance: nearestPlayerDistance,
    clusteredEnemyCount: clusteredPlayerCount(state, target),
    rightCooldown: rightWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
    leftCooldown: leftWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
    leftShoulderCooldown: leftShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
    rightShoulderCooldown: rightShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
    bothShoulderCooldown: bothShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
    rightCanPay: canAutoUseWeapon(unit, rightWeapon),
    leftCanPay: canAutoUseWeapon(unit, leftWeapon),
    leftShoulderCanPay: canAutoUseWeapon(unit, leftShoulderWeapon),
    rightShoulderCanPay: canAutoUseWeapon(unit, rightShoulderWeapon),
    bothShoulderCanPay: canAutoUseWeapon(unit, bothShoulderWeapon),
    enemyProjectileDistance: projectileThreats.any,
    incomingBallisticDistance: projectileThreats.ballistic,
    incomingEnergyDistance: projectileThreats.energy,
    incomingMissileDistance: projectileThreats.missile,
    incomingBeamLockDistance: hostileBeamLockDistance(state, enemy),
    canGuard: rival.stats.canGuard,
  });

  const bladeEngageDistance = target && leftWeapon?.weaponKind === "blade"
    ? bladeEngageDistanceFor(enemy, target, leftWeapon)
    : 0;
  const hasDefensiveDecision = decision.some(
    (item) =>
      item.action === "retreat" ||
      item.action === "boostDodge" ||
      (item.action === "guard" && rival.stats.canGuard),
  );
  if (
    leftWeapon?.weaponKind === "blade" &&
    leftWeapon.autoUse &&
    leftWeapon.cooldownRemaining <= 0 &&
    targetDistance <= bladeEngageDistance &&
    !hasDefensiveDecision
  ) {
    decision.push({
      action: "shootLeft",
      ruleId: "rival-blade-priority",
      condition: "leftReady",
    });
  }

  enemy.ax = 0;
  enemy.ay = 0;
  enemy.guard = false;
  rival.activeAction = decision[0].action;
  rival.activeRuleId = decision[0].ruleId;
  for (const item of decision) {
    applyPlayerAction(state, unit, item.action, target);
  }
  rival.boostCooldown = unit.boostCooldown;
  enemy.boostCooldown = unit.boostCooldown;
};

const updateEnemy = (state: CombatState, enemy: CombatActor, dt: number): void => {
  const targetUnit = nearestPlayerUnit(state, enemy);
  if (!targetUnit) {
    return;
  }
  const player = targetUnit.actor;
  const toPlayer = normalize(player.x - enemy.x, player.y - enemy.y);
  enemy.facingX = toPlayer.x;
  enemy.facingY = toPlayer.y;
  enemy.ax = 0;
  enemy.ay = 0;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  enemy.boostCooldown = Math.max(0, enemy.boostCooldown - dt);

  if (isEntryBoosting(enemy)) {
    enemy.entryBoostTime = Math.max(0, (enemy.entryBoostTime ?? 0) - dt);
    if (!enemy.entryBoostSoundPlayed) {
      enemy.entryBoostSoundPlayed = true;
      state.soundEvents.push(boostSoundForActor(enemy));
    }

    const entryAnchor = {
      x: clamp(enemy.x, 112, state.width - 112),
      y: clamp(enemy.y, 92, state.height - 92),
    };
    const toArena = normalize(entryAnchor.x - enemy.x, entryAnchor.y - enemy.y);
    const thrust = enemy.rank === "boss" ? 1.05 : enemy.rank === "elite" ? 1.65 : 1.9;
    applyThrust(enemy, toArena.x, toArena.y, thrust);

    const inside =
      enemy.x > 44 &&
      enemy.x < state.width - 44 &&
      enemy.y > 44 &&
      enemy.y < state.height - 44;
    if (!inside) {
      enemy.entryBoostTime = Math.max(enemy.entryBoostTime ?? 0, 0.05);
      return;
    }

    enemy.entryBoostTime = 0;
  }

  if (enemy.rivalAi) {
    updateRivalEnemy(state, enemy, dt);
    return;
  }

  const threat = nearestPlayerProjectileThreat(state, enemy);
  if (threat && enemy.boostCooldown <= 0) {
    const dodgeSide = Math.sin(state.time * 3.1 + enemy.x * 0.013) > 0 ? 1 : -1;
    const dodge = { x: -threat.y * dodgeSide, y: threat.x * dodgeSide };
    const thrust = enemy.quickBoostThrust * actorBoostImpulseFor(enemy);
    enemy.vx += dodge.x * thrust;
    enemy.vy += dodge.y * thrust;
    enemy.quickBoostTime = enemy.quickBoostDuration;
    applyThrust(enemy, dodge.x, dodge.y, clamp(thrust / Math.max(1, enemy.moveSpeed * 3.2), 0.45, 1.05));
    pushBoostBurst(state, enemy, dodge, enemy.rank === "elite" ? "#d889ff" : "#ff9d42");
    state.soundEvents.push(boostSoundForActor(enemy));
    enemy.boostCooldown = enemy.rank === "boss" ? 1.05 : enemy.rank === "elite" ? 0.85 : 1.25;
  }

  const desiredBand =
    enemy.enemyRole === "sniper"
      ? { min: enemy.range * 0.68, max: enemy.range * 0.92 }
      : enemy.enemyRole === "bruiser"
        ? { min: enemy.range * 0.28, max: enemy.range * 0.62 }
        : enemy.enemyRole === "scout"
          ? { min: enemy.range * 0.35, max: enemy.range * 0.74 }
          : { min: enemy.range * 0.46, max: enemy.range * 0.82 };

  if (toPlayer.distance > desiredBand.max) {
    applyThrust(enemy, toPlayer.x, toPlayer.y, enemy.enemyRole === "scout" ? 0.62 : 0.42);
  } else if (toPlayer.distance < desiredBand.min) {
    applyThrust(enemy, -toPlayer.x, -toPlayer.y, enemy.enemyRole === "sniper" ? 0.52 : 0.28);
  } else {
    const drift = Math.sin(state.time * 1.5 + enemy.x * 0.01) > 0 ? 1 : -1;
    const pressure = enemy.enemyRole === "bruiser" ? 0.16 : enemy.enemyRole === "sniper" ? -0.18 : 0.06;
    applyThrust(enemy, -toPlayer.y * drift * 0.38 + toPlayer.x * pressure, toPlayer.x * drift * 0.38 + toPlayer.y * pressure, 0.24);
  }

  if (toPlayer.distance <= enemy.range && enemy.cooldown <= 0) {
    const missile =
      enemy.rank === "boss" ||
      enemy.enemyRole === "sniper" ||
      (enemy.rank === "elite" && Math.sin(state.time * 2) > 0.35);
    fireProjectile(
      state,
      enemy,
      player,
      missile ? enemy.attack * 1.35 : enemy.attack,
      missile ? 215 : 410,
      missile ? "missile" : "bullet",
      missile ? "missile" : "ballistic",
      missile ? "#ff7a37" : "#ff5f42",
      missile ? 6.5 : 4.3,
      missile ? player.id : undefined,
    );
    enemy.cooldown = enemy.cooldownMax;
  }
};

const updateEffects = (state: CombatState, dt: number): void => {
  state.effects = state.effects
    .map((effect) => ({ ...effect, life: effect.life - dt }))
    .filter((effect) => effect.life > 0);
};

export const stepCombat = (
  state: CombatState,
  dt: number,
  rulesByUnit: AiRule[][],
  targetPrioritiesByUnit: TargetPriorityId[] = [],
): CombatState => {
  if (state.status !== "running") {
    return state;
  }

  state.soundEvents = [];
  state.time += dt;

  for (let unitIndex = 0; unitIndex < state.players.length; unitIndex += 1) {
    const unit = state.players[unitIndex];
    const player = unit.actor;
    if (player.hp <= 0) {
      unit.activeAction = "idle";
      unit.activeRuleId = undefined;
      player.ax = 0;
      player.ay = 0;
      player.guard = false;
      continue;
    }

    player.en = Math.min(player.maxEn, player.en + player.enRegen * dt);
    for (const weapon of unit.weapons) {
      updateWeaponRuntime(weapon, dt);
    }
    unit.boostCooldown = Math.max(0, unit.boostCooldown - dt);

    const target = selectEnemyTarget(state, player, targetPrioritiesByUnit[unit.unitIndex] ?? "nearest");
    const targetDistance = target
      ? Math.hypot(target.x - player.x, target.y - player.y)
      : Number.POSITIVE_INFINITY;
    const threatDistance = nearestEnemyDistance(state, player);
    const rules = rulesByUnit[unit.unitIndex] ?? rulesByUnit[0] ?? [];
    const rightWeapon = weaponByHardpoint(unit, "rightArm");
    const leftWeapon = weaponByHardpoint(unit, "leftArm");
    const leftShoulderWeapon = weaponByHardpoint(unit, "leftShoulder");
    const rightShoulderWeapon = weaponByHardpoint(unit, "rightShoulder");
    const bothShoulderWeapon = weaponByHardpoint(unit, "bothShoulders");
    resolveWeaponSequences(state, unit, target, dt);
    const projectileThreats = hostileProjectileThreatDistances(state, player);
    const decision = evaluateAiRules(rules, {
      en: player.en,
      hpPercent: player.hp / player.maxHp,
      enPercent: player.en / player.maxEn,
      nearestEnemyDistance: threatDistance,
      clusteredEnemyCount: clusteredEnemyCount(state, target),
      rightCooldown: rightWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      leftCooldown: leftWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      leftShoulderCooldown: leftShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      rightShoulderCooldown: rightShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      bothShoulderCooldown: bothShoulderWeapon?.cooldownRemaining ?? Number.POSITIVE_INFINITY,
      rightCanPay: canAutoUseWeapon(unit, rightWeapon),
      leftCanPay: canAutoUseWeapon(unit, leftWeapon),
      leftShoulderCanPay: canAutoUseWeapon(unit, leftShoulderWeapon),
      rightShoulderCanPay: canAutoUseWeapon(unit, rightShoulderWeapon),
      bothShoulderCanPay: canAutoUseWeapon(unit, bothShoulderWeapon),
      enemyProjectileDistance: projectileThreats.any,
      incomingBallisticDistance: projectileThreats.ballistic,
      incomingEnergyDistance: projectileThreats.energy,
      incomingMissileDistance: projectileThreats.missile,
      incomingBeamLockDistance: hostileBeamLockDistance(state, player),
      canGuard: unit.stats.canGuard,
    });

    const bladeEngageDistance = target && leftWeapon?.weaponKind === "blade"
      ? bladeEngageDistanceFor(player, target, leftWeapon)
      : 0;
    const hasDefensiveDecision = decision.some(
      (item) =>
        item.action === "retreat" ||
        item.action === "boostDodge" ||
        (item.action === "guard" && unit.stats.canGuard),
    );
    if (
      target &&
      leftWeapon?.weaponKind === "blade" &&
      leftWeapon.autoUse &&
      leftWeapon.cooldownRemaining <= 0 &&
      targetDistance <= bladeEngageDistance &&
      !hasDefensiveDecision
    ) {
      decision.push({
        action: "shootLeft",
        ruleId: "blade-priority",
        condition: "leftReady",
      });
    }

    player.ax = 0;
    player.ay = 0;
    player.guard = false;
    unit.activeAction = decision[0].action;
    unit.activeRuleId = decision[0].ruleId;
    for (const item of decision) {
      if (item.ruleId) {
        const unitRuleHits = state.report.ruleHitsByUnit[unit.unitIndex] ?? {};
        unitRuleHits[item.ruleId] = (unitRuleHits[item.ruleId] ?? 0) + 1;
        state.report.ruleHitsByUnit[unit.unitIndex] = unitRuleHits;
      }
      applyPlayerAction(state, unit, item.action, target);
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.hp > 0) {
      updateEnemy(state, enemy, dt);
    }
  }

  updatePositions(state, dt);
  resolveActorCollisions(state);
  updateHits(state, dt, uid);
  updateEnemyDestructions(state, dt, uid);
  updateEffects(state, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 || (enemy.deathTimer ?? 0) > 0);
  refillEnemyWave(state);

  if (livingPlayerUnits(state).length === 0) {
    state.status = "defeat";
    state.soundEvents.push("defeat");
  } else if (state.enemies.length === 0 && state.enemyQueue.length === 0) {
    state.status = "victory";
  }

  return state;
};
