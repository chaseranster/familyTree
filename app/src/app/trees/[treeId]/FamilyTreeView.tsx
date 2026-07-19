import { type FamilyTreeNode, layoutOrgChart } from "@/lib/family-tree";

const CARD_SURFACE = "#fcfcfb";
const CARD_BORDER = "#e1e0d9";
const CONNECTOR = "#c3c2b7";
const TEXT_PRIMARY = "#0b0b0b";
const TEXT_MUTED = "#898781";

/**
 * SVG <text> doesn't wrap or measure itself. Rather than let a long name
 * silently overflow the card, compress it to fit once it's likely wider
 * than the available space (rough average-char-width estimate -- good
 * enough since real glyph metrics aren't available server-side).
 */
function fitTextProps(text: string, maxWidth: number, avgCharWidth: number) {
  const estimatedWidth = text.length * avgCharWidth;
  if (estimatedWidth <= maxWidth) return {};
  return { textLength: maxWidth, lengthAdjust: "spacingAndGlyphs" as const };
}

export function FamilyTreeView({ roots }: { roots: FamilyTreeNode[] }) {
  if (roots.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No one&apos;s been added yet — add the first person below.
      </p>
    );
  }

  const { boxes, edges, width, height } = layoutOrgChart(roots);
  const avatarRadius = 16;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Family tree organizational chart"
      className="block"
    >
      <defs>
        <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#0b0b0b" floodOpacity="0.12" />
        </filter>
        {boxes.map((box) => (
          <clipPath key={box.id} id={`clip-${box.id}`}>
            <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={12} />
          </clipPath>
        ))}
      </defs>

      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.path}
          fill="none"
          stroke={CONNECTOR}
          strokeWidth={edge.kind === "spouse" ? 3 : 2}
          strokeLinecap="round"
        />
      ))}

      {boxes.map((box) => (
        <g key={box.id}>
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={12}
            fill={CARD_SURFACE}
            stroke={CARD_BORDER}
            strokeWidth={1.5}
            filter="url(#cardShadow)"
          />
          {/* generation accent bar -- decorative/redundant with row position, never the sole carrier of meaning */}
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={6}
            fill={box.accentColor}
            clipPath={`url(#clip-${box.id})`}
          />
          <circle
            cx={box.x + box.width / 2}
            cy={box.y + 6 + 10 + avatarRadius}
            r={avatarRadius}
            fill={box.avatarColor}
          />
          <text
            x={box.x + box.width / 2}
            y={box.y + 6 + 10 + avatarRadius}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize={13}
            fontWeight={600}
          >
            {box.initial}
          </text>
          <text
            x={box.x + box.width / 2}
            y={box.y + 6 + 10 + avatarRadius * 2 + 16}
            textAnchor="middle"
            fill={TEXT_PRIMARY}
            fontSize={12.5}
            fontWeight={600}
            {...fitTextProps(box.name, box.width - 12, 7.2)}
          >
            {box.name}
          </text>
          <text
            x={box.x + box.width / 2}
            y={box.y + 6 + 10 + avatarRadius * 2 + 32}
            textAnchor="middle"
            fill={TEXT_MUTED}
            fontSize={11}
            {...fitTextProps(box.subLabel, box.width - 12, 6.3)}
          >
            {box.subLabel}
          </text>
        </g>
      ))}
    </svg>
  );
}
