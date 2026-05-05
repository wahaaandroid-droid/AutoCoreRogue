import { useState } from "react";
import { buildFromLoadout, getLegLabel, partsBySlot } from "../data/parts";
import { DerivedStats, Loadout, PartSlot, SLOTS } from "../types";
import MechSilhouette from "./MechSilhouette";

interface AssembleScreenProps {
  loadout: Loadout;
  unlockedPartIds: string[];
  stats: DerivedStats;
  onChangeLoadout: (slot: PartSlot, partId: string) => void;
  onOpenAi: () => void;
  onOpenMap: () => void;
  onStartCombat: () => void;
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
  loadout,
  unlockedPartIds,
  stats,
  onChangeLoadout,
  onOpenAi,
  onOpenMap,
  onStartCombat,
}: AssembleScreenProps) {
  const [activeSlot, setActiveSlot] = useState<PartSlot>("LEGS");
  const build = buildFromLoadout(loadout);
  const unlocked = new Set(unlockedPartIds);

  return (
    <main className="screen-grid assemble-screen">
      <section className="panel slot-panel">
        <div className="section-title">ASSEMBLE</div>
        <div className="slot-list">
          {SLOTS.map((slot) => {
            const part = build[slot];
            return (
              <button
                className={`slot-row ${activeSlot === slot ? "active" : ""}`}
                key={slot}
                onClick={() => setActiveSlot(slot)}
              >
                <span className="slot-token">{slot}</span>
                <span>
                  <strong>{part.name}</strong>
                  <small>{part.manufacturer}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="screen-actions">
          <button onClick={onOpenMap}>MAP</button>
          <button onClick={onOpenAi}>AI EDIT</button>
          <button className="primary" onClick={onStartCombat}>出撃</button>
        </div>
      </section>

      <section className="panel mech-preview-panel">
        <div className="section-title">FRAME PREVIEW</div>
        <div className="mech-preview">
          <MechSilhouette legType={stats.legType} />
          <div className="leg-badge">{getLegLabel(stats.legType)}</div>
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
            <dt>右攻撃</dt>
            <dd>{stats.rightAttack}</dd>
          </div>
          <div>
            <dt>左攻撃</dt>
            <dd>{stats.leftAttack}</dd>
          </div>
        </dl>
        {stats.overloadRatio > 0 && (
          <div className="warning-line">積載超過: 機動とクールダウンにペナルティ</div>
        )}
      </section>

      <section className="panel parts-browser">
        <div className="tab-row">
          {SLOTS.map((slot) => (
            <button
              key={slot}
              className={activeSlot === slot ? "active" : ""}
              onClick={() => setActiveSlot(slot)}
            >
              {slot}
            </button>
          ))}
        </div>
        <div className="part-card-grid">
          {partsBySlot(activeSlot)
            .filter((part) => unlocked.has(part.id))
            .map((part) => (
              <button
                key={part.id}
                className={`part-card ${loadout[activeSlot] === part.id ? "selected" : ""}`}
                onClick={() => onChangeLoadout(activeSlot, part.id)}
              >
                <span className={`mini-part-icon slot-${part.slot.replace("-", "").toLowerCase()}`} />
                <strong>{part.name}</strong>
                <small>{part.description}</small>
                <span className="part-stat-line">
                  ATK {part.stats.attack} / RNG {part.stats.range} / WT {part.stats.weight}
                </span>
                {part.weaponResource && (
                  <span className="part-stat-line">
                    {part.weaponResource === "ballistic"
                      ? `AMMO ${part.ammoCapacity ?? 0}`
                      : `EN COST ${part.energyCost ?? 0}`}
                  </span>
                )}
              </button>
            ))}
        </div>
      </section>
    </main>
  );
}
