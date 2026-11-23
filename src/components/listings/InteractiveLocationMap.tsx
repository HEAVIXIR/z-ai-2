"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

type Point = { latitude: number; longitude: number };
type Props = {
  latitude?: string;
  longitude?: string;
  onChange: (point: Point) => void;
  onClear: () => void;
};

type DragState = {
  mode: "map" | "marker";
  pointerId: number;
  startX: number;
  startY: number;
  startCenterX: number;
  startCenterY: number;
  moved: boolean;
};

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;
const DEFAULT_CENTER = { latitude: 32.4279, longitude: 53.688 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function wrap(value: number, max: number) {
  return ((value % max) + max) % max;
}

function toWorld(point: Point, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = clamp(point.latitude, -MAX_LATITUDE, MAX_LATITUDE);
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function fromWorld(x: number, y: number, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const normalizedY = clamp(y / scale, 0, 1);
  const n = Math.PI - 2 * Math.PI * normalizedY;
  return {
    longitude: wrap(x, scale) / scale * 360 - 180,
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
  };
}

export default function InteractiveLocationMap({ latitude, longitude, onChange, onClear }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState({ width: 760, height: 320 });
  const [zoom, setZoom] = useState(5);
  const [center, setCenter] = useState<Point>(DEFAULT_CENTER);

  const parsedLatitude = latitude?.trim() ? Number(latitude) : NaN;
  const parsedLongitude = longitude?.trim() ? Number(longitude) : NaN;
  const hasPoint =
    Number.isFinite(parsedLatitude) &&
    Number.isFinite(parsedLongitude) &&
    parsedLatitude >= -90 &&
    parsedLatitude <= 90 &&
    parsedLongitude >= -180 &&
    parsedLongitude <= 180;
  const selectedPoint = hasPoint
    ? { latitude: parsedLatitude, longitude: parsedLongitude }
    : null;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.max(280, Math.round(entry.contentRect.width)),
        height: Math.max(240, Math.round(entry.contentRect.height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedPoint || dragRef.current) return;
    setCenter(selectedPoint);
    setZoom((current) => Math.max(current, 12));
  }, [latitude, longitude]);

  const centerWorld = toWorld(center, zoom);
  const topLeftX = centerWorld.x - size.width / 2;
  const topLeftY = centerWorld.y - size.height / 2;
  const firstTileX = Math.floor(topLeftX / TILE_SIZE);
  const firstTileY = Math.floor(topLeftY / TILE_SIZE);
  const columns = Math.ceil(size.width / TILE_SIZE) + 1;
  const rows = Math.ceil(size.height / TILE_SIZE) + 1;

  const tiles = useMemo(() => {
    const result: Array<{ key: string; url: string; left: number; top: number }> = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const tileX = firstTileX + column;
        const tileY = firstTileY + row;
        if (tileY < 0 || tileY >= 2 ** zoom) continue;
        const wrappedX = wrap(tileX, 2 ** zoom);
        result.push({
          key: `${zoom}/${wrappedX}/${tileY}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
          left: tileX * TILE_SIZE - topLeftX,
          top: tileY * TILE_SIZE - topLeftY,
        });
      }
    }
    return result;
  }, [zoom, firstTileX, firstTileY, columns, rows, topLeftX, topLeftY]);

  const markerPosition = selectedPoint
    ? (() => {
        const pointWorld = toWorld(selectedPoint, zoom);
        return { left: pointWorld.x - topLeftX, top: pointWorld.y - topLeftY };
      })()
    : null;

  const pointFromPointer = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = fromWorld(
      topLeftX + clientX - rect.left,
      topLeftY + clientY - rect.top,
      zoom,
    );
    onChange(point);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const mode = target.closest("[data-map-marker='true']") ? "marker" : "map";
    const centerPoint = toWorld(center, zoom);
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenterX: centerPoint.x,
      startCenterY: centerPoint.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) drag.moved = true;

    if (drag.mode === "map" && drag.moved) {
      setCenter(fromWorld(
        drag.startCenterX - deltaX,
        drag.startCenterY - deltaY,
        zoom,
      ));
      return;
    }
    if (drag.mode === "marker" && drag.moved) {
      pointFromPointer(event.clientX, event.clientY);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mode === "map" && !drag.moved) {
      pointFromPointer(event.clientX, event.clientY);
    }
    dragRef.current = null;
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
      <div
        ref={containerRef}
        role="application"
        aria-label="نقشه تعاملی انتخاب محل دقیق دستگاه"
        className="relative h-72 w-full select-none overflow-hidden bg-[#e8e4dc] touch-none sm:h-80"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ width: TILE_SIZE, height: TILE_SIZE, left: tile.left, top: tile.top }}
          />
        ))}

        {markerPosition && markerPosition.left >= 0 && markerPosition.left <= size.width && markerPosition.top >= 0 && markerPosition.top <= size.height && (
          <button
            type="button"
            data-map-marker="true"
            aria-label="نشانگر محل دستگاه؛ برای جابه‌جایی بکشید یا با کلیدهای جهت‌نما حرکت دهید"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const step = 0.001 * 2 ** Math.max(0, 12 - zoom);
              if (event.key === "ArrowUp") onChange({ latitude: clamp(parsedLatitude + step, -90, 90), longitude: parsedLongitude });
              else if (event.key === "ArrowDown") onChange({ latitude: clamp(parsedLatitude - step, -90, 90), longitude: parsedLongitude });
              else if (event.key === "ArrowLeft") onChange({ latitude: parsedLatitude, longitude: clamp(parsedLongitude - step, -180, 180) });
              else if (event.key === "ArrowRight") onChange({ latitude: parsedLatitude, longitude: clamp(parsedLongitude + step, -180, 180) });
              else return;
              event.preventDefault();
            }}
            className="absolute z-10 -translate-x-1/2 -translate-y-full cursor-grab border-0 bg-transparent p-0 active:cursor-grabbing"
            style={{ left: markerPosition.left, top: markerPosition.top }}
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#F58220] text-white shadow-xl">
              <span className="text-lg leading-none">●</span>
              <span className="absolute -bottom-1 h-2 w-2 rotate-45 bg-[#F58220]" />
            </span>
          </button>
        )}

        <div className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-lg border border-black/15 bg-white/95 shadow-lg">
          <button type="button" aria-label="بزرگ‌نمایی نقشه" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoom((z) => Math.min(18, z + 1))} className="h-9 w-9 text-xl font-bold text-slate-800 hover:bg-slate-100">+</button>
          <div className="h-px bg-slate-200" />
          <button type="button" aria-label="کوچک‌نمایی نقشه" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoom((z) => Math.max(3, z - 1))} className="h-9 w-9 text-xl font-bold text-slate-800 hover:bg-slate-100">−</button>
        </div>

        {!hasPoint && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg bg-slate-900/85 px-3 py-2 text-center text-[11px] font-bold text-white shadow">
            برای ثبت نقطه، روی نقشه کلیک کنید
          </div>
        )}

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between bg-white/90 px-2 py-1 text-[10px] text-slate-700">
          <span>برای حرکت نقشه بکشید؛ برای انتخاب نقطه کلیک کنید؛ نشانگر را برای اصلاح بکشید</span>
          <span>© OpenStreetMap</span>
        </div>
      </div>
      {selectedPoint && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-black/25 px-3 py-2 text-[11px] text-emerald-300">
          <span>نقطه انتخاب‌شده: {selectedPoint.latitude.toFixed(6)} ، {selectedPoint.longitude.toFixed(6)}</span>
          <button type="button" onClick={onClear} className="text-white/60 underline underline-offset-2 hover:text-white">
            پاک‌کردن نقطه
          </button>
        </div>
      )}
    </div>
  );
}
