import { BaseFrameId, LegType } from "../types";

interface MechSilhouetteProps {
  legType: LegType;
  frameId?: BaseFrameId;
  compact?: boolean;
}

const frameBody = (frameId: BaseFrameId | undefined) => {
  switch (frameId) {
    case "light":
      return { coreX: 109, coreY: 50, coreW: 42, coreH: 34, headX: 116, shoulderW: 18 };
    case "heavy":
      return { coreX: 96, coreY: 43, coreW: 68, coreH: 50, headX: 112, shoulderW: 31 };
    case "quad":
      return { coreX: 101, coreY: 49, coreW: 58, coreH: 42, headX: 114, shoulderW: 28 };
    case "tank":
      return { coreX: 92, coreY: 45, coreW: 76, coreH: 46, headX: 112, shoulderW: 34 };
    case "medium":
    default:
      return { coreX: 105, coreY: 47, coreW: 50, coreH: 40, headX: 114, shoulderW: 24 };
  }
};

export default function MechSilhouette({ legType, frameId, compact = false }: MechSilhouetteProps) {
  const width = compact ? 130 : 260;
  const height = compact ? 116 : 230;
  const scale = compact ? 0.5 : 1;
  const body = frameBody(frameId);

  return (
    <svg
      className={`mech-silhouette leg-${legType} frame-${frameId ?? "medium"}`}
      viewBox="0 0 260 230"
      width={width}
      height={height}
      role="img"
      aria-label="機体シルエット"
    >
      <defs>
        <filter id={`glow-${legType}-${compact ? "c" : "l"}`}>
          <feGaussianBlur stdDeviation={2 * scale} result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#glow-${legType}-${compact ? "c" : "l"})`}>
        <ellipse cx="130" cy="205" rx="82" ry="13" fill="rgba(54, 215, 255, .13)" />
        <rect x={body.coreX} y={body.coreY} width={body.coreW} height={body.coreH} rx="8" className="mech-core" />
        <rect x={body.headX} y="23" width="32" height="24" rx="7" className="mech-head" />
        <rect x={body.coreX - body.shoulderW} y="62" width={body.shoulderW} height="56" rx="8" className="mech-shoulder" />
        <rect x={body.coreX + body.coreW} y="62" width={body.shoulderW} height="56" rx="8" className="mech-shoulder" />
        <rect x="58" y="83" width="22" height="66" rx="6" className="mech-arm-left" />
        <rect x="180" y="77" width="24" height="78" rx="6" className="mech-arm-right" />
        <rect x="44" y="126" width="38" height="12" rx="4" className="weapon-left" />
        <rect x="197" y="108" width="42" height="14" rx="4" className="weapon-right" />
        {legType === "biped" && (
          <g>
            <path d="M112 88 L102 147 L86 196 L107 199 L124 145 L126 91 Z" className="mech-leg" />
            <path d="M148 88 L158 147 L174 196 L153 199 L136 145 L134 91 Z" className="mech-leg" />
          </g>
        )}
        {legType === "quad" && (
          <g>
            <path d="M108 90 L78 136 L56 189 L76 195 L102 146 L124 96 Z" className="mech-leg" />
            <path d="M122 94 L112 148 L112 200 L132 200 L138 145 L135 95 Z" className="mech-leg" />
            <path d="M152 90 L182 136 L204 189 L184 195 L158 146 L136 96 Z" className="mech-leg" />
            <path d="M138 94 L148 148 L148 200 L128 200 L122 145 L125 95 Z" className="mech-leg" />
          </g>
        )}
        {legType === "reverse" && (
          <g>
            <path d="M111 88 L92 134 L120 154 L98 205 L77 200 L94 160 L70 137 L101 88 Z" className="mech-leg" />
            <path d="M149 88 L168 134 L140 154 L162 205 L183 200 L166 160 L190 137 L159 88 Z" className="mech-leg" />
          </g>
        )}
        {legType === "tank" && (
          <g>
            <rect x="66" y="135" width="128" height="48" rx="17" className="tank-base" />
            <rect x="54" y="165" width="152" height="26" rx="13" className="tank-tread" />
            <path d="M80 191 H180" className="tank-line" />
          </g>
        )}
        {legType === "hover" && (
          <g>
            <path d="M88 104 L67 162 L96 177 L123 118 Z" className="hover-skirt" />
            <path d="M172 104 L193 162 L164 177 L137 118 Z" className="hover-skirt" />
            <rect x="89" y="159" width="82" height="22" rx="11" className="hover-pad" />
            <path d="M72 202 C98 190 158 190 188 202" className="hover-wave" />
          </g>
        )}
      </g>
    </svg>
  );
}
