import { useState } from "react";
import { getBaseFrameById } from "../data/frames";
import {
  buildFromLoadout,
  getLegLabel,
  getSlotLabel,
  getWeaponKindLabel,
  isFreePart,
  normalizeLoadout,
  partsBySlot,
  unitsEquippingPart,
} from "../data/parts";
import {
  BaseFrameId,
  DerivedStats,
  EQUIP_SLOTS,
  EquipSlot,
  Loadout,
  Part,
  PartInventory,
  SpecialKind,
} from "../types";
import playerDirectionSpritesUrl from "../assets/player-direction-sprites.png";

interface AssembleScreenProps {
  loadouts: Loadout[];
  unitFrameIds: BaseFrameId[];
  unlockedUnitCount: number;
  partInventory: PartInventory;
  equippedCounts: PartInventory;
  statsByUnit: DerivedStats[];
  unitHpByUnit: number[];
  sortieEnabled: boolean[];
  repairKitStock: number;
  activeUnitIndex: number;
  lastOutcome?: string;
  onSelectUnit: (index: number) => void;
  onChangeLoadout: (slot: EquipSlot, partId: string) => void;
  onToggleSortie: (index: number) => void;
  onUseRepairKit: (index: number) => void;
  onOpenMap: () => void;
  onStartCombat: () => void;
  canStartCombat: boolean;
}

const statRows = [
  ["HP", "hpMax"],
  ["EN", "enMax"],
  ["EN回復", "enRegen"],
  ["防御", "defense"],
  ["移動", "moveSpeed"],
  ["ブースト", "boostSpeed"],
  ["QB推力", "quickBoostThrust"],
  ["AI反応", "aiReaction"],
  ["重量", "weight"],
  ["積載", "loadLimit"],
] as const satisfies readonly (readonly [string, keyof DerivedStats])[];

const FRAME_PREVIEW_COLUMN = 1;

const framePreviewRow = (frameId: BaseFrameId): number => {
  switch (frameId) {
    case "light":
      return 0;
    case "medium":
      return 1;
    case "heavy":
      return 2;
    case "quad":
      return 3;
    case "tank":
      return 4;
    default:
      return 1;
  }
};

const specialKindLabel = (kind: SpecialKind): string => {
  switch (kind) {
    case "shield":
      return "耐久 / シールド";
    case "barrier":
      return "耐久 / 軽減";
    case "bit":
      return "攻撃 / 射撃ビット";
    case "bomb":
      return "攻撃 / 広域爆弾";
    case "stun":
      return "特殊 / 麻痺";
    case "poison":
      return "特殊 / 腐食";
    default:
      return "特殊装備";
  }
};

const specialSummary = (part: Part): string => {
  const special = part.special;
  if (!special) {
    return "特殊効果なし";
  }

  switch (special.kind) {
    case "shield":
      return `HP低下時 SHIELD ${special.shieldHp ?? 0} / ${special.duration ?? 0}s / CD ${special.cooldown}s`;
    case "barrier":
      return `被弾予測時 軽減 ${Math.round((special.damageReduction ?? 0) * 100)}% / ${special.duration ?? 0}s / CD ${special.cooldown}s`;
    case "bit":
      return `自動展開 BIT HP ${special.bitHp ?? 0} / ATK ${special.damage ?? 0} / ${special.duration ?? 0}s`;
    case "bomb":
      return `敵密集時 ATK ${special.damage ?? 0} / BLAST ${special.blastRadius ?? 0} / CD ${special.cooldown}s`;
    case "stun":
      return `中距離 HIT麻痺 ${special.statusDuration ?? 0}s / RNG ${special.range ?? 0}`;
    case "poison":
      return `中距離 腐食 ${special.dotDamagePerSecond ?? 0}/s / ${special.statusDuration ?? 0}s`;
    default:
      return "自動発動";
  }
};

const partStatSummary = (part: Part): string => {
  if (part.slot === "SPECIAL") {
    return specialSummary(part);
  }
  if (part.slot === "BOOSTER") {
    return `BST ${part.stats.boostSpeed} / QB ${part.stats.quickBoostThrust} / EN ${part.stats.quickBoostCost} / WT ${part.stats.weight}`;
  }
  if (part.slot === "HEAD") {
    return `HP ${part.stats.hp} / DEF ${part.stats.defense} / AI ${part.stats.aiReaction} / WT ${part.stats.weight}`;
  }
  if (part.slot === "BODY") {
    return `HP ${part.stats.hp} / EN ${part.stats.enCapacity} / DEF ${part.stats.defense} / WT ${part.stats.weight}`;
  }
  return `ATK ${part.stats.attack} / RNG ${part.stats.range} / CD ${part.stats.cooldown} / WT ${part.stats.weight}`;
};

const firePatternText = (pattern: Part["firePattern"], weaponKind?: Part["weaponKind"]): string => {
  if (weaponKind === "beamLaser") {
    return "BEAM";
  }
  switch (pattern) {
    case "burst":
      return "BURST";
    case "sustain":
      return "GATLING";
    case "single":
    default:
      return "SINGLE";
  }
};

const guardProfileText = (profile: Part["guardProfile"]): string => {
  switch (profile) {
    case "kinetic":
      return "GUARD 実弾/爆風";
    case "energy":
      return "GUARD EN/レーザー";
    case "balanced":
    default:
      return "GUARD バランス";
  }
};

export default function AssembleScreen({
  loadouts,
  unitFrameIds,
  unlockedUnitCount,
  partInventory,
  equippedCounts,
  statsByUnit,
  unitHpByUnit,
  sortieEnabled,
  repairKitStock,
  activeUnitIndex,
  lastOutcome,
  onSelectUnit,
  onChangeLoadout,
  onToggleSortie,
  onUseRepairKit,
  onOpenMap,
  onStartCombat,
  canStartCombat,
}: AssembleScreenProps) {
  const [activeSlot, setActiveSlot] = useState<EquipSlot>("R-ARM");
  const loadout = normalizeLoadout(loadouts[activeUnitIndex] ?? loadouts[0]);
  const stats = statsByUnit[activeUnitIndex] ?? statsByUnit[0];
  const currentHp = Math.min(unitHpByUnit[activeUnitIndex] ?? stats.hpMax, stats.hpMax);
  const canRepair = repairKitStock > 0 && currentHp < stats.hpMax;
  const build = buildFromLoadout(loadout);
  const activeFrame = getBaseFrameById(unitFrameIds[activeUnitIndex] ?? stats.frameId);
  const activePart = build[activeSlot];
  const framePreviewStyle = {
    backgroundImage: `url(${playerDirectionSpritesUrl})`,
    backgroundPosition: `${(FRAME_PREVIEW_COLUMN / 3) * 100}% ${(framePreviewRow(activeFrame.id) / 4) * 100}%`,
  };

  const partStatus = (partId: string) => {
    if (isFreePart(partId)) {
      return { owned: 1, equipped: 0, available: 1, units: [] };
    }
    const owned = partInventory[partId] ?? 0;
    const equipped = equippedCounts[partId] ?? 0;
    const units = unitsEquippingPart(loadouts, unlockedUnitCount, partId);
    return { owned, equipped, available: owned - equipped, units };
  };

  return (
    <main className="screen-grid assemble-screen">
      <section className="panel slot-panel">
        <div className="section-title">UNITS</div>
        <div className="unit-switcher compact-switcher">
          {statsByUnit.map((unitStats, index) => {
            const locked = index >= unlockedUnitCount;
            const frame = getBaseFrameById(unitFrameIds[index] ?? unitStats.frameId);
            const hp = Math.ceil(Math.min(unitHpByUnit[index] ?? unitStats.hpMax, unitStats.hpMax));
            return (
              <button
                key={index}
                className={`${activeUnitIndex === index ? "active" : ""} ${locked ? "locked" : ""}`}
                onClick={() => onSelectUnit(index)}
                disabled={locked}
              >
                <strong>U{index + 1}</strong>
                {locked ? (
                  <small>未配備</small>
                ) : (
                  <>
                    <small>{frame.typeLabel}</small>
                    <small>{hp}/{unitStats.hpMax}</small>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="kit-panel">
          <div>
            <span>HP</span>
            <strong>{Math.ceil(currentHp)} / {stats.hpMax}</strong>
          </div>
          <div>
            <span>リペア</span>
            <strong>{repairKitStock}</strong>
          </div>
          <div className="screen-actions compact-actions">
            <button onClick={() => onToggleSortie(activeUnitIndex)} disabled={currentHp <= 0}>
              {sortieEnabled[activeUnitIndex] && currentHp > 0 ? "出撃 ON" : "出撃 OFF"}
            </button>
            <button onClick={() => onUseRepairKit(activeUnitIndex)} disabled={!canRepair}>
              修理
            </button>
          </div>
        </div>

        <div className="slot-list">
          {EQUIP_SLOTS.map((slot) => {
            const part = build[slot];
            return (
              <button
                className={`slot-row ${activeSlot === slot ? "active" : ""}`}
                key={slot}
                onClick={() => setActiveSlot(slot)}
              >
                <span className="slot-token">{getSlotLabel(slot)}</span>
                <span>
                  <strong>{part.name}</strong>
                  <small>{part.slot === "SPECIAL" ? specialKindLabel(part.special?.kind ?? "shield") : part.manufacturer}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div className="screen-actions">
          <button onClick={onOpenMap}>MAP</button>
          <button className="primary" onClick={onStartCombat} disabled={!canStartCombat}>
            出撃
          </button>
        </div>
      </section>

      <section className="panel parts-browser">
        <div className="parts-browser-head">
          <div>
            <div className="section-title">PARTS</div>
            <strong>{getSlotLabel(activeSlot)} / {activePart.name}</strong>
          </div>
          <small>{partStatSummary(activePart)}</small>
        </div>
        <div className="tab-row slot-filter-row">
          {EQUIP_SLOTS.map((slot) => (
            <button
              key={slot}
              className={activeSlot === slot ? "active" : ""}
              onClick={() => setActiveSlot(slot)}
            >
              {getSlotLabel(slot)}
            </button>
          ))}
        </div>
        <div className="part-card-grid">
          {partsBySlot(activeSlot)
            .filter((part) => isFreePart(part.id) || (partInventory[part.id] ?? 0) > 0 || loadout[activeSlot] === part.id)
            .map((part) => {
              const status = partStatus(part.id);
              const equippedHere = loadout[activeSlot] === part.id;
              const freePart = isFreePart(part.id);
              const canUse = freePart || equippedHere || status.available > 0 || status.units.some((unitIndex) => unitIndex !== activeUnitIndex);
              return (
                <button
                  key={part.id}
                  className={`part-card ${equippedHere ? "selected" : ""} ${!canUse ? "unavailable" : ""}`}
                  onClick={() => onChangeLoadout(activeSlot, part.id)}
                  disabled={!canUse}
                >
                  <span className={`mini-part-icon slot-${part.slot.replace("-", "").toLowerCase()}`} />
                  <strong>{part.name}</strong>
                  <small>{part.description}</small>
                  <span className="part-stat-line inventory-line">
                    {freePart ? "標準パーツ" : `所持 ${status.owned} / 装備 ${status.equipped}`}
                  </span>
                  {status.units.length > 0 && (
                    <span className="part-stat-line equipped-line">
                      装備中 {status.units.map((unitIndex) => `U${unitIndex + 1}`).join(", ")}
                    </span>
                  )}
                  <span className="part-stat-line">{partStatSummary(part)}</span>
                  {part.weaponKind && (
                    <span className="part-stat-line">
                      TYPE {getWeaponKindLabel(part.weaponKind)}
                      {part.blastRadius ? ` / BLAST ${part.blastRadius}` : ""}
                      {part.firePattern ? ` / ${firePatternText(part.firePattern, part.weaponKind)}` : ""}
                    </span>
                  )}
                  {part.weaponResource && (
                    <span className="part-stat-line">
                      {part.weaponResource === "ballistic"
                        ? `MAG ${part.magazineSize ?? part.ammoCapacity ?? 0}${part.reloadTime ? ` / REL ${part.reloadTime}` : ""}`
                        : `EN ${part.energyCost ?? 0}${part.heatPerShot ? ` / HEAT ${part.heatPerShot}` : ""}`}
                    </span>
                  )}
                  {part.guardEnabled && (
                    <span className="part-stat-line">{guardProfileText(part.guardProfile)}</span>
                  )}
                  {part.special && (
                    <span className="part-stat-line">{specialKindLabel(part.special.kind)}</span>
                  )}
                </button>
              );
            })}
        </div>
      </section>

      <section className="panel status-panel">
        <div className="section-title">SUMMARY</div>
        <div className="assemble-frame-chip">
          <div
            className={`frame-preview-image frame-${activeFrame.id}`}
            style={framePreviewStyle}
            role="img"
            aria-label={`${activeFrame.name} 機体画像`}
          />
          <div>
            <strong>{activeFrame.typeLabel}</strong>
            <small>{activeFrame.role} / {getLegLabel(stats.legType)}</small>
          </div>
        </div>

        <dl className="assemble-stat-grid">
          {statRows.map(([label, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{Number(stats[key]).toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        <div className="special-status-card">
          <span>特殊装備</span>
          <strong>{stats.special?.name ?? "未装備"}</strong>
          <small>{stats.special ? specialKindLabel(stats.special.kind) : "SPECIALスロットに装備してください"}</small>
          {stats.special && <small>{specialSummary(build.SPECIAL)}</small>}
        </div>

        <div className="weapon-status-list compact-weapon-list">
          {stats.weapons.map((weapon) => (
            <div key={weapon.hardpoint}>
              <span>{weapon.label}</span>
              <strong>{getWeaponKindLabel(weapon.weaponKind)}</strong>
              <small>
                ATK {weapon.attack} / RNG {weapon.range} / CD {weapon.cooldown.toFixed(1)}
              </small>
              <small>
                {weapon.resource === "ballistic"
                  ? `MAG ${weapon.magazineSize} / REL ${weapon.reloadTime.toFixed(1)}`
                  : `HEAT ${weapon.heatPerShot} / COOL ${weapon.coolingRate}`}
              </small>
            </div>
          ))}
        </div>

        {stats.overloadRatio > 0 && (
          <div className="warning-line">積載超過: 機動とクールダウンにペナルティ</div>
        )}
        {lastOutcome && <div className="outcome-line">{lastOutcome}</div>}
      </section>
    </main>
  );
}
