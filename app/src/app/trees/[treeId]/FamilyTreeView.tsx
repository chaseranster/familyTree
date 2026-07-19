import { type FamilyTreeNode, layoutOrgChart } from "@/lib/family-tree";

export function FamilyTreeView({ roots }: { roots: FamilyTreeNode[] }) {
  if (roots.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No one&apos;s been added yet — add the first person below.
      </p>
    );
  }

  const { boxes, edges, width, height } = layoutOrgChart(roots);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Family tree organizational chart"
      className="block"
    >
      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.path}
          fill="none"
          stroke="#d1d5db"
          strokeWidth={2}
        />
      ))}
      {boxes.map((box) => (
        <g key={box.id}>
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={8}
            fill="white"
            stroke="#d1d5db"
            strokeWidth={1.5}
          />
          <foreignObject x={box.x} y={box.y} width={box.width} height={box.height}>
            <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs leading-tight text-gray-900">
              {box.label}
            </div>
          </foreignObject>
        </g>
      ))}
    </svg>
  );
}
