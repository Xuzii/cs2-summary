import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { worldToRadar, getMapCalibration } from '../lib/radar';

export interface RadarWorldToPct {
  (worldX: number, worldY: number): { left: string; top: string };
}

interface RadarProps {
  mapName: string;
  imageSize?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode | ((toPct: RadarWorldToPct) => ReactNode);
}

/**
 * Generic map radar. Loads `/static/radars/<mapName>.png`, captures the PNG's
 * natural width so world-to-pixel transforms stay accurate at any resolution,
 * and exposes a `worldToPct` helper via render-prop for children that need
 * to plot overlays (player dots, grenade arcs, kill markers).
 *
 * Usage:
 *   <Radar mapName="de_mirage">
 *     {(toPct) => (
 *       <div className="dot" style={{position: 'absolute', ...toPct(-300, 120)}} />
 *     )}
 *   </Radar>
 */
export function Radar({
  mapName,
  imageSize = 600,
  className,
  style,
  children,
}: RadarProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natW, setNatW] = useState(0);
  const url = radarUrl(mapName);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth) setNatW(el.naturalWidth);
  }, [url]);

  const cal = getMapCalibration(mapName);
  const toPct: RadarWorldToPct = (worldX, worldY) => {
    if (!cal || !natW) return { left: '50%', top: '50%' };
    const { x, y } = worldToRadar(cal, worldX, worldY, natW, imageSize);
    return {
      left: `${(x / imageSize) * 100}%`,
      top: `${(y / imageSize) * 100}%`,
    };
  };

  return (
    <div
      className={className ? `radar ${className}` : 'radar'}
      data-map={`RADAR · ${mapName.toUpperCase()}`}
      style={{ position: 'relative', aspectRatio: '1', ...style }}
    >
      <div className="radar-grid" />
      {url && (
        <img
          ref={imgRef}
          src={url}
          alt={mapName}
          onLoad={(e) => setNatW((e.currentTarget as HTMLImageElement).naturalWidth)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: 0.92,
            pointerEvents: 'none',
          }}
        />
      )}
      {typeof children === 'function' ? children(toPct) : children}
    </div>
  );
}

function radarUrl(mapName: string | null | undefined): string | null {
  if (!mapName) return null;
  return `${import.meta.env.BASE_URL}static/radars/${mapName}.png`;
}
