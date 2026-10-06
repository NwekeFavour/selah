import { useId } from "react";
import { avatarFromIdentity, normalizeAvatar, randomAvatar, BG, HAIR, OUTFIT, SKIN } from "./avatarData";

// Web3 PFP style: chunky ink outline, flat fills, one shade layer, loud traits.
// Code digits (sizes unchanged so saved codes stay valid):
//   0 skin (8)  1 head style (8)  2 hair color (8)  3 hoodie (10)
//   4 background (8)  5 eyes (3: normal / shades / laser)  6 mouth (3: smirk / gold grill / tongue)
// AvatarPicker below is unchanged apart from the labels for slots 1, 5 and 6.

const INK = "#14111F";
const SW = 3.5;
const GOLD = "#F6C445";
const line = { stroke: INK, strokeWidth: SW, strokeLinejoin: "round", strokeLinecap: "round" };

function mix(hex, to, t) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = rgb(hex);
  const b = rgb(to);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
const shade = (hex) => mix(hex, INK, 0.2);

function rr(x, y, w, h, r) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

const HEAD = rr(54, 46, 92, 92, 40);
const HEAD_SHIFTED = rr(44, 44, 92, 92, 40);
const SHORT = "M55 84Q52 40 100 40Q148 40 145 84Q132 66 100 68Q68 66 55 84Z";
const RAYS = Array.from({ length: 12 }, (_, i) => {
  const p = (deg) => {
    const a = (deg * Math.PI) / 180;
    return `${(100 + 260 * Math.cos(a)).toFixed(1)} ${(100 + 260 * Math.sin(a)).toFixed(1)}`;
  };
  return `M100 100L${p(i * 30)}L${p(i * 30 + 15)}Z`;
}).join("");

export function Avatar({ code, className = "h-full w-full" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const d = [...(normalizeAvatar(code) ?? avatarFromIdentity(""))].map(Number);

  const skin = SKIN[d[0]];
  const hair = HAIR[d[2]];
  const hood = OUTFIT[d[3]];
  const bg = BG[d[4]];
  const eyes = d[5];
  const mouth = d[6];
  const pattern = (d[1] + d[3] + d[4]) % 3;

  const sheen = (
    <path d="M72 50Q88 43 106 46" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" />
  );

  let back = null;
  let front = null;
  switch (d[1]) {
    case 0:
      front = (
        <>
          <path d={SHORT} fill={hair} {...line} />
          {sheen}
        </>
      );
      break;
    case 1: // mohawk
      front = (
        <path d="M86 54L80 22L94 34L100 10L106 34L120 22L114 54Q100 46 86 54Z" fill={hair} {...line} />
      );
      break;
    case 2: // spiky
      front = (
        <path
          d="M54 82L50 48L68 58L72 30L90 48L100 22L110 48L128 30L132 58L150 48L146 82Q130 62 100 64Q70 62 54 82Z"
          fill={hair}
          {...line}
        />
      );
      break;
    case 3: // beanie
      front = (
        <>
          <path d="M52 70Q52 24 100 24Q148 24 148 70Z" fill={hair} {...line} />
          <path d={rr(50, 58, 100, 18, 8)} fill={shade(hair)} {...line} />
          {[64, 76, 88, 100, 112, 124, 136].map((x) => (
            <path key={x} d={`M${x} 61V73`} stroke={INK} strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
          ))}
          <circle cx="100" cy="22" r="9" fill={mix(hair, "#fff", 0.25)} {...line} />
        </>
      );
      break;
    case 4: // cap
      front = (
        <>
          <path d="M54 70Q54 30 100 30Q146 30 146 70Z" fill={hair} {...line} />
          <path d="M100 34V68" stroke={INK} strokeOpacity=".4" strokeWidth="2" />
          <path d="M54 64Q28 66 22 78Q40 82 54 76Z" fill={shade(hair)} {...line} />
          <circle cx="100" cy="31" r="4.5" fill={shade(hair)} {...line} strokeWidth="2.5" />
        </>
      );
      break;
    case 5: // afro puff
      back = (
        <>
          {[0, 1].map((pass) => (
            <g key={pass} fill={pass ? hair : INK} stroke={pass ? "none" : INK} strokeWidth={SW * 2}>
              <circle cx="100" cy="56" r="50" />
              <circle cx="58" cy="74" r="26" />
              <circle cx="142" cy="74" r="26" />
              <circle cx="74" cy="34" r="26" />
              <circle cx="126" cy="34" r="26" />
            </g>
          ))}
        </>
      );
      front = (
        <>
          <path d={SHORT} fill={hair} {...line} />
          {sheen}
        </>
      );
      break;
    case 6: // long hair
      back = <path d="M50 74Q40 140 34 176L82 168L118 168L166 176Q160 140 150 74Z" fill={hair} {...line} />;
      front = (
        <>
          <path d={SHORT} fill={hair} {...line} />
          {sheen}
        </>
      );
      break;
    default: // crown
      front = (
        <>
          <path d={SHORT} fill={hair} {...line} />
          <path d="M62 54L60 22L82 38L100 14L118 38L140 22L138 54Z" fill={GOLD} {...line} />
          {[
            [60, 22, "#FF4D8D"],
            [100, 14, "#22D3EE"],
            [140, 22, "#FF4D8D"],
          ].map(([cx, cy, fill]) => (
            <circle key={cx} cx={cx} cy={cy} r="4.5" fill={fill} {...line} strokeWidth="2.5" />
          ))}
        </>
      );
  }

  const eyeEls =
    eyes === 1 ? (
      // shades
      <>
        <path d="M64 90L54 86M136 90L146 86M96 90H104" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        {[64, 104].map((x) => (
          <g key={x}>
            <path d={rr(x, 82, 32, 22, 8)} fill={INK} {...line} />
            <path d={`M${x} 94H${x + 32}V96A8 8 0 0 1 ${x + 24} 104H${x + 8}A8 8 0 0 1 ${x} 96Z`} fill={hood} opacity=".75" />
            <path d={`M${x + 6} 100L${x + 16} 84H${x + 22}L${x + 12} 100Z`} fill="#fff" opacity=".3" />
          </g>
        ))}
      </>
    ) : eyes === 2 ? (
      // laser eyes
      <>
        <path d="M66 80L90 86M110 86L134 80" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
        {[79, 121].map((x) => (
          <g key={x}>
            <circle cx={x} cy="94" r="14" fill="#FF2D55" opacity=".25" />
            <circle cx={x} cy="94" r="9" fill="#FF2D55" opacity=".4" />
            <ellipse cx={x} cy="94" rx="6.5" ry="5.5" fill="#FF2D55" {...line} strokeWidth="3" />
            <circle cx={x} cy="94" r="2.4" fill="#fff" />
          </g>
        ))}
      </>
    ) : (
      // normal
      <>
        <path d="M68 78Q79 72 90 77M110 77Q121 72 132 78" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
        {[79, 121].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="94" rx="6" ry="8.5" fill={INK} />
            <circle cx={x + 2} cy="91" r="2.3" fill="#fff" />
          </g>
        ))}
      </>
    );

  const mouthEl =
    mouth === 1 ? (
      // gold grill
      <>
        <path d="M82 116Q100 142 118 116Z" fill={INK} {...line} />
        <path d="M84 117Q100 124 116 117L115 124Q100 131 85 124Z" fill={GOLD} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M92 119V127M100 120V128M108 119V127" stroke={INK} strokeOpacity=".5" strokeWidth="1.8" />
      </>
    ) : mouth === 2 ? (
      // tongue out
      <>
        <path d="M96 124V134A6 6 0 0 0 108 134V126Z" fill="#FF6B8B" {...line} strokeWidth="3" />
        <path d="M102 128V134" stroke={INK} strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
        <path d="M84 118Q100 128 118 118" fill="none" {...line} strokeWidth="4" />
      </>
    ) : (
      // smirk
      <>
        <path d="M86 122Q100 130 118 116" fill="none" {...line} strokeWidth="4" />
        <path d="M118 116L122 112" fill="none" {...line} strokeWidth="3" />
      </>
    );

  return (
    <svg viewBox="0 0 200 200" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <clipPath id={`h${uid}`}>
          <path d={HEAD} />
        </clipPath>
        <pattern id={`p${uid}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2.2" fill="#fff" opacity=".4" />
        </pattern>
      </defs>

      {/* background + pattern */}
      <rect width="200" height="200" fill={bg} />
      {pattern === 0 && <path d={RAYS} fill="#fff" opacity=".16" />}
      {pattern === 1 && <rect width="200" height="200" fill={`url(#p${uid})`} />}
      {pattern === 2 && (
        <>
          <circle cx="100" cy="96" r="88" fill="#fff" opacity=".14" />
          <circle cx="100" cy="96" r="66" fill="#fff" opacity=".2" />
        </>
      )}

      {back}

      {/* hoodie */}
      <path d="M20 200C20 162 52 148 100 148C148 148 180 162 180 200Z" fill={hood} {...line} />
      <path d="M150 152C170 158 180 176 180 200L152 200C158 184 158 166 150 152Z" fill={shade(hood)} opacity=".6" />
      <path d="M86 166L84 188M114 166L116 188" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="84" cy="190" r="3.5" fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx="116" cy="190" r="3.5" fill="#fff" stroke={INK} strokeWidth="2" />

      {/* neck + collar */}
      <path d={rr(84, 124, 32, 34, 10)} fill={shade(skin)} {...line} />
      <path d="M60 152Q100 188 140 152Q100 166 60 152Z" fill={shade(hood)} {...line} />

      {/* ears + earring */}
      <circle cx="50" cy="114" r="5" fill="none" stroke={GOLD} strokeWidth="3" />
      {[52, 148].map((x) => (
        <g key={x}>
          <circle cx={x} cy="96" r="11" fill={skin} {...line} />
          <circle cx={x} cy="96" r="5" fill={shade(skin)} opacity=".6" />
        </g>
      ))}

      {/* head */}
      <path d={HEAD} fill={skin} {...line} />
      <g clipPath={`url(#h${uid})`}>
        <path d={`M0 0H200V200H0Z ${HEAD_SHIFTED}`} fillRule="evenodd" fill={shade(skin)} opacity=".45" />
      </g>

      {/* face */}
      {eyeEls}
      <path d="M98 102Q93 112 101 113" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      {mouthEl}

      {front}

      {/* laser beams sit on top of everything */}
      {eyes === 2 &&
        [1, -1].map((dir) => {
          const x = (v) => (dir === 1 ? 200 - v : v);
          return (
            <g key={dir}>
              <path d={`M${x(76)} 86L${x(0)} 80L${x(0)} 108L${x(76)} 102Z`} fill="#FF2D55" opacity=".35" />
              <path d={`M${x(76)} 89L${x(0)} 86L${x(0)} 102L${x(76)} 99Z`} fill="#FF2D55" opacity=".75" />
              <path d={`M${x(76)} 92L${x(0)} 92L${x(0)} 96L${x(76)} 96Z`} fill="#fff" opacity=".9" />
            </g>
          );
        })}
    </svg>
  );
}

function setPart(code, index, value) {
  return code.slice(0, index) + value + code.slice(index + 1);
}

function Row({ label, children }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function AvatarPicker({ value, onChange }) {
  const set = (index, nextValue) => onChange(setPart(value, index, nextValue));
  const ring = (selected) => selected
    ? "ring-2 ring-slate-900 ring-offset-2"
    : "ring-1 ring-slate-200 hover:ring-slate-400";

  const swatches = (label, index, palette) => (
    <Row label={label}>
      {palette.map((color, valueIndex) => (
        <button
          key={valueIndex}
          type="button"
          aria-label={`${label} ${valueIndex + 1}`}
          aria-pressed={Number(value[index]) === valueIndex}
          onClick={() => set(index, valueIndex)}
          style={{ background: color }}
          className={`h-7 w-7 rounded-full transition motion-reduce:transition-none ${ring(Number(value[index]) === valueIndex)}`}
        />
      ))}
    </Row>
  );

  const previews = (label, index, count) => (
    <Row label={label}>
      {Array.from({ length: count }, (_, valueIndex) => (
        <button
          key={valueIndex}
          type="button"
          aria-label={`${label} ${valueIndex + 1}`}
          aria-pressed={Number(value[index]) === valueIndex}
          onClick={() => set(index, valueIndex)}
          style={{ background: BG[Number(value[4])] }}
          className={`h-11 w-11 overflow-hidden rounded-xl transition motion-reduce:transition-none ${ring(Number(value[index]) === valueIndex)}`}
        >
          <Avatar code={setPart(value, index, valueIndex)} className="h-full w-full" />
        </button>
      ))}
    </Row>
  );

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl ring-1 ring-slate-200" style={{ background: BG[Number(value[4])] }}>
          <Avatar code={value} className="h-full w-full" />
        </div>
        <div>
          <button
            type="button"
            onClick={() => onChange(randomAvatar())}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold transition hover:border-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4] motion-reduce:transition-none"
          >
            Shuffle look
          </button>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">Others in the meeting see this instead of a photo.</p>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Customize</summary>
        <div className="mt-3 space-y-3">
          {swatches("Skin tone", 0, SKIN)}
          {previews("Head style", 1, 8)}
          {swatches("Hair colour", 2, HAIR)}
          {swatches("Outfit", 3, OUTFIT)}
          {swatches("Background", 4, BG)}
          {previews("Eyes", 5, 3)}
          {previews("Mouth", 6, 3)}
        </div>
      </details>
    </div>
  );
}