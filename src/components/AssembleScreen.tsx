import { useState } from "react";
import { getBaseFrameById } from "../data/frames";
import {
  buildFromLoadout,
  getLegLabel,
  getSlotLabel,
  getWeaponKindLabel,
  isFreePart,
  isShoulderSlotBlocked,
  normalizeShoulderLoadout,
  partsBySlot,
  unitsEquippingPart,
} from "../data/parts";
import {
  BaseFrameId,
  DerivedStats,
  EQUIP_SLOTS,
  EquipSlot,
  Loadout,
  PartInventory,
  WeaponAutoUse,
  WeaponHardpoint,
} from "../types";
import MechSilhouette from "./MechSilhouette";

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
  weaponAutoUse: WeaponAutoUse;
  onSelectUnit: (index: number) => void;
  onChangeLoadout: (slot: EquipSlot, partId: string) => void;
  onToggleWeaponAutoUse: (hardpoint: WeaponHardpoint) => void;
  onToggleSortie: (index: number) => void;
  onUseRepairKit: (index: number) => void;
  onOpenAi: () => void;
  onOpenMap: () => void;
  onStartCombat: () => void;
  canStartCombat: boolean;
}

const statRows = [
  ["HP", "hpMax"],
  ["EN容量", "enMax"],
  ["EN回復", "enRegen"],
  ["防御力", "defense"],
  ["移動速度", "moveSpeed"],
  ["旋回速度", "turnSpeed"],
  ["重量", "weight"],
  ["積載量", "loadLimit"],
] as const;

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
  weaponAutoUse,
  onSelectUnit,
  onChangeLoadout,
  onToggleWeaponAutoUse,
  onToggleSortie,
  onUseRepairKit,
  onOpenAi,
  onOpenMap,
  onStartCombat,
  canStartCombat,
}: AssembleScreenProps) {
  const [activeSlot, setActiveSlot] = useState<EquipSlot>("R-ARM");
  const loadout = normalizeShoulderLoadout(loadouts[activeUnitIndex] ?? loadouts[0]);
  const stats = statsByUnit[activeUnitIndex] ?? statsByUnit[0];
  const currentHp = Math.min(unitHpByUnit[activeUnitIndex] ?? stats.hpMax, stats.hpMax);
  const canRepair = repairKitStock > 0 && currentHp < stats.hpMax;
  const build = buildFromLoadout(loadout);
  const activeFrame = getBaseFrameById(unitFrameIds[activeUnitIndex] ?? stats.frameId);
  const activeSlotBlocked = isShoulderSlotBlocked(loadout, activeSlot);

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
        <div className="section-title">ASSEMBLE</div>
        <div className="unit-switcher">
          {statsByUnit.map((unitStats, index) => {
            const locked = index >= unlockedUnitCount;
            const frame = getBaseFrameById(unitFrameIds[index] ?? unitStats.frameId);
            return (
            <button
              key={index}
              className={`${activeUnitIndex === index ? "active" : ""} ${locked ? "locked" : ""}`}
              onClick={() => onSelectUnit(index)}
              disabled={locked}
            >
              <strong>UNIT {index + 1}</strong>
              {locked ? (
                <small>未配備</small>
              ) : (
                <>
                  <small>{frame.typeLabel} / {frame.role}</small>
                  <small>
                    HP {Math.ceil(Math.min(unitHpByUnit[index] ?? unitStats.hpMax, unitStats.hpMax))} / {unitStats.hpMax}
                  </small>
                  <small>{sortieEnabled[index] && (unitHpByUnit[index] ?? unitStats.hpMax) > 0 ? "出撃 ON" : "出撃 OFF"}</small>
                </>
              )}
            </button>
            );
          })}
        </div>
        <div className="kit-panel">
          <div>
            <span>リペアキット</span>
            <strong>{repairKitStock}</strong>
          </div>
          <div>
            <span>選択ユニットHP</span>
            <strong>{Math.ceil(currentHp)} / {stats.hpMax}</strong>
          </div>
          <div className="screen-actions compact-actions">
            <button
              onClick={() => onToggleSortie(activeUnitIndex)}
              disabled={currentHp <= 0}
            >
              {sortieEnabled[activeUnitIndex] && currentHp > 0 ? "出撃 ON" : "出撃 OFF"}
            </button>
            <button onClick={() => onUseRepairKit(activeUnitIndex)} disabled={!canRepair}>
              リペアキット使用
            </button>
          </div>
        </div>
        <div className="slot-list">
          {EQUIP_SLOTS.map((slot) => {
            const part = build[slot];
            const blocked = isShoulderSlotBlocked(loadout, slot);
            return (
              <button
                className={`slot-row ${activeSlot === slot ? "active" : ""} ${blocked ? "unavailable" : ""}`}
                key={slot}
                onClick={() => setActiveSlot(slot)}
                disabled={blocked}
              >
                <span className="slot-token">{getSlotLabel(slot)}</span>
                <span>
                  <strong>{part.name}</strong>
                  <small>{blocked ? "両肩武装が占有中" : part.manufacturer}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="screen-actions">
          <button onClick={onOpenMap}>MAP</button>
          <button onClick={onOpenAi}>AI EDIT</button>
          <button className="primary" onClick={onStartCombat} disabled={!canStartCombat}>出撃</button>
        </div>
      </section>

      <section className="panel mech-preview-panel">
        <div className="section-title">FRAME PREVIEW</div>
        <div className="mech-preview">
          <MechSilhouette frameId={activeFrame.id} legType={stats.legType} />
          <div className="leg-badge">{activeFrame.typeLabel} / {getLegLabel(stats.legType)}</div>
        </div>
      </section>

      <section className="panel status-panel">
        <div className="section-title">STATUS</div>
        <dl className="status-list">
          {statRows.map(([label, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{stats[key].toLocaleString()}</dd>
            </div>
          ))}
          <div>
            <dt>ベース</dt>
            <dd>{activeFrame.typeLabel}</dd>
          </div>
          <div>
            <dt>右攻撃</dt>
            <dd>{stats.rightAttack}</dd>
          </div>
          <div>
            <dt>左攻撃</dt>
            <dd>{stats.leftAttack}</dd>
          </div>
        </dl>
        <div className="weapon-status-list">
          {stats.weapons.map((weapon) => (
            <div key={weapon.hardpoint}>
              <span>{weapon.label}</span>
              <strong>{getWeaponKindLabel(weapon.weaponKind)}</strong>
              <small>ATK {weapon.attack} / RNG {weapon.range} / CD {weapon.cooldown.toFixed(1)}</small>
              <button
                className={`auto-toggle ${weaponAutoUse[weapon.hardpoint] ? "active" : ""}`}
                onClick={() => onToggleWeaponAutoUse(weapon.hardpoint)}
              >
                {weaponAutoUse[weapon.hardpoint] ? "AUTO" : "MANUAL"}
              </button>
            </div>
          ))}
        </div>
        {stats.overloadRatio > 0 && (
          <div className="warning-line">積載超過: 機動とクールダウンにペナルティ</div>
        )}
        {lastOutcome && <div className="outcome-line">{lastOutcome}</div>}
      </section>

      <section className="panel parts-browser">
        <div className="tab-row">
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
          {activeSlotBlocked ? (
            <div className="slot-lock-message">両肩武装が左右の肩スロットを占有しています</div>
          ) : partsBySlot(activeSlot)
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
                <span className="part-stat-line">
                  ATK {part.slot === "B-SHOULDER" ? part.stats.attack * 2 : part.stats.attack}
                  {part.slot === "B-SHOULDER" && part.stats.attack > 0 ? " (x2)" : ""}
                  {" / "}
                  RNG {part.stats.range} / WT {part.stats.weight}
                </span>
                {part.weaponKind && (
                  <span className="part-stat-line">
                    TYPE {getWeaponKindLabel(part.weaponKind)}
                    {part.blastRadius ? ` / BLAST ${part.blastRadius}` : ""}
                  </span>
                )}
                {part.weaponResource && (
                  <span className="part-stat-line">
                    {part.weaponResource === "ballistic"
                      ? `AMMO ${part.ammoCapacity ?? 0}`
                      : `EN COST ${part.energyCost ?? 0}`}
                  </span>
                )}
              </button>
              );
            })}
        </div>
      </section>
    </main>
  );
}
