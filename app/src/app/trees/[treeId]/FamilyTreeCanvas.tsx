"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type SafeTreeNode,
  layoutCanvas,
} from "@/lib/family-tree";

const MIN_SCALE = 0.15;
const MAX_SCALE = 2.5;
const FAR_THRESHOLD = 0.62; // below this, hide the sub-label (dates/status)
const TINY_THRESHOLD = 0.34; // below this, hide the name too -- just the dot

type LodTier = "full" | "far" | "tiny";

function tierForScale(scale: number): LodTier {
  if (scale < TINY_THRESHOLD) return "tiny";
  if (scale < FAR_THRESHOLD) return "far";
  return "full";
}

export function FamilyTreeCanvas({ forest }: { forest: SafeTreeNode[] }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [lodTier, setLodTier] = useState<LodTier>("full");

  const layout = useMemo(() => layoutCanvas(forest, collapsed), [forest, collapsed]);

  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const vt = useRef({ x: 0, y: 0, scale: 1 });
  const lodTierRef = useRef<LodTier>("full");
  const fittedRef = useRef(false);

  const applyTransform = useCallback(() => {
    worldRef.current?.setAttribute(
      "transform",
      `translate(${vt.current.x},${vt.current.y}) scale(${vt.current.scale})`,
    );
    const tier = tierForScale(vt.current.scale);
    if (tier !== lodTierRef.current) {
      lodTierRef.current = tier;
      setLodTier(tier);
    }
  }, []);

  const fitToView = useCallback(
    (animate: boolean) => {
      const el = containerRef.current;
      if (!el || layout.width === 0 || layout.height === 0) return;
      const rect = el.getBoundingClientRect();
      const scale = Math.min(
        (rect.width - 32) / layout.width,
        (rect.height - 32) / layout.height,
        1,
      );
      const targetX = (rect.width - layout.width * scale) / 2;
      const targetY = 16;

      if (!animate) {
        vt.current = { x: targetX, y: targetY, scale };
        applyTransform();
        return;
      }

      const start = { ...vt.current };
      const startTime = performance.now();
      const duration = 400;
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        const e = ease(t);
        vt.current = {
          x: start.x + (targetX - start.x) * e,
          y: start.y + (targetY - start.y) * e,
          scale: start.scale + (scale - start.scale) * e,
        };
        applyTransform();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [layout.width, layout.height, applyTransform],
  );

  useEffect(() => {
    if (fittedRef.current) return;
    fittedRef.current = true;
    fitToView(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.height]);

  const zoomBy = useCallback(
    (factor: number, cx: number, cy: number) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vt.current.scale * factor));
      const k = nextScale / vt.current.scale;
      vt.current = {
        x: cx - k * (cx - vt.current.x),
        y: cy - k * (cy - vt.current.y),
        scale: nextScale,
      };
      applyTransform();
    },
    [applyTransform],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinchDist = 0;

    const dist = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const mid = () => {
      const [a, b] = [...pointers.values()];
      const rect = el.getBoundingClientRect();
      return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      // Deliberately no setPointerCapture here: capturing on the container
      // would swallow the click that's supposed to reach a toggle button
      // nested inside the SVG. Tracking on window (below) instead of
      // capture is what lets drag keep working if the pointer leaves the
      // container mid-gesture.
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        dragging = false;
        pinchDist = dist();
      } else {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pointers.size === 2) {
        const d = dist();
        const m = mid();
        if (pinchDist > 0 && d > 0) zoomBy(d / pinchDist, m.x, m.y);
        pinchDist = d;
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      vt.current = { ...vt.current, x: vt.current.x + dx, y: vt.current.y + dy };
      applyTransform();
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      if (pointers.size === 0) dragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.13 : 0.885, e.clientX - rect.left, e.clientY - rect.top);
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      el.removeEventListener("wheel", onWheel);
    };
  }, [zoomBy, applyTransform]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative h-[70vh] max-h-[640px] min-h-[360px] w-full touch-none overflow-hidden rounded-md border border-gray-200 bg-white"
      >
        <svg className="block h-full w-full cursor-grab active:cursor-grabbing">
          <defs>
            <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#0b0b0b" floodOpacity="0.12" />
            </filter>
            {layout.boxes.map((box) => (
              <clipPath key={box.id} id={`canvas-clip-${box.id}`}>
                <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={12} />
              </clipPath>
            ))}
          </defs>
          <g ref={worldRef}>
            {layout.edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke="#c3c2b7"
                strokeWidth={edge.kind === "spouse" ? 3 : 2}
                strokeLinecap="round"
              />
            ))}

            {layout.boxes.map((box) => (
              <g key={box.id}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  rx={12}
                  fill="#fcfcfb"
                  stroke="#e1e0d9"
                  strokeWidth={1.5}
                  filter="url(#cardShadow)"
                />
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={6}
                  fill={box.accentColor}
                  clipPath={`url(#canvas-clip-${box.id})`}
                />
                <circle
                  cx={box.x + box.width / 2}
                  cy={box.y + 32}
                  r={16}
                  fill={box.avatarColor}
                />
                <text
                  x={box.x + box.width / 2}
                  y={box.y + 32}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={13}
                  fontWeight={600}
                >
                  {box.initial}
                </text>
                {lodTier !== "tiny" && (
                  <text
                    x={box.x + box.width / 2}
                    y={box.y + 64}
                    textAnchor="middle"
                    fill="#0b0b0b"
                    fontSize={12.5}
                    fontWeight={600}
                  >
                    {box.displayName}
                  </text>
                )}
                {lodTier === "full" && (
                  <text
                    x={box.x + box.width / 2}
                    y={box.y + 80}
                    textAnchor="middle"
                    fill="#898781"
                    fontSize={11}
                  >
                    {box.subLabel}
                  </text>
                )}
              </g>
            ))}

            {layout.toggles.map((toggle) => (
              <g
                key={toggle.id}
                data-testid={`tree-toggle-${toggle.id}`}
                role="button"
                tabIndex={0}
                aria-label={
                  toggle.collapsed
                    ? `Show ${toggle.hiddenCount} descendants of ${toggle.label}`
                    : `Hide descendants of ${toggle.label}`
                }
                onClick={() => toggleCollapse(toggle.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCollapse(toggle.id);
                  }
                }}
                className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <circle cx={toggle.x} cy={toggle.y} r={12} fill="#1a1e28" />
                <text
                  x={toggle.x}
                  y={toggle.y + 0.5}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#c9ceda"
                  fontSize={10.5}
                  fontWeight={800}
                >
                  {toggle.collapsed ? `+${toggle.hiddenCount}` : "−"}
                </text>
              </g>
            ))}
          </g>
        </svg>

        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              const rect = containerRef.current?.getBoundingClientRect();
              zoomBy(1.25, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-lg shadow-sm active:bg-gray-100"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const rect = containerRef.current?.getBoundingClientRect();
              zoomBy(0.8, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-lg shadow-sm active:bg-gray-100"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => fitToView(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-sm shadow-sm active:bg-gray-100"
            aria-label="Fit whole tree"
            title="Fit whole tree"
          >
            ⛶
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Drag to pan, pinch or scroll to zoom, tap ⊖ to collapse a branch.
      </p>
    </div>
  );
}
