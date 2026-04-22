// World -> radar-pixel transform. Ported from web/src/lib/radar.ts which was
// itself ported from cs-demo-manager. Exposed on window for the adapter +
// RadarPng consumers.
//
// All per-map calibration is keyed on lowercase map name. The target JSX
// components work in a fixed 600x600 coord space, so worldTo600() is the
// one-shot helper the adapter uses to remap every position field at load.

(function () {
  const MAP_CALIBRATION = {
    de_ancient: { posX: -2953, posY: 2164, scale: 5 },
    de_anubis: { posX: -2796, posY: 3328, scale: 5.22 },
    de_dust2: { posX: -2476, posY: 3239, scale: 4.4 },
    de_inferno: { posX: -2087, posY: 3870, scale: 4.9 },
    de_mirage: { posX: -3230, posY: 1713, scale: 5 },
    de_nuke: { posX: -3453, posY: 2887, scale: 7, thresholdZ: -495 },
    de_overpass: { posX: -4831, posY: 1781, scale: 5.2 },
    de_train: { posX: -2308, posY: 2078, scale: 4.082077 },
    de_vertigo: { posX: -3168, posY: 1762, scale: 4, thresholdZ: 11700 },
    de_cache: { posX: -2000, posY: 3250, scale: 5.5 },
  };

  // All radar PNGs bundled with the project are 1024x1024. If a future map
  // ships at a different native resolution, override via per-map entry below.
  const DEFAULT_RADAR_SIZE = 1024;

  function getMapCalibration(mapName) {
    if (!mapName) return undefined;
    return MAP_CALIBRATION[mapName.toLowerCase()];
  }

  function worldToRadar(cal, worldX, worldY, radarSize, imageSize) {
    const xDef = (worldX - cal.posX) / cal.scale;
    const scaledX = (xDef * imageSize) / radarSize;
    const yDef = (cal.posY - worldY) / cal.scale;
    const scaledY = (yDef * imageSize) / radarSize;
    return { x: scaledX, y: scaledY };
  }

  // Convert a raw CS2 world position into the target UI's 0-600 coord space.
  // Returns { x:300, y:300 } (centre) when the map is unknown so overlays at
  // least render at a sane fallback rather than flying off-canvas.
  function worldTo600(mapName, worldX, worldY, radarSize) {
    const cal = getMapCalibration(mapName);
    const size = radarSize || DEFAULT_RADAR_SIZE;
    if (!cal) return { x: 300, y: 300 };
    return worldToRadar(cal, worldX, worldY, size, 600);
  }

  window.CS2_RADAR = {
    MAP_CALIBRATION,
    DEFAULT_RADAR_SIZE,
    getMapCalibration,
    worldToRadar,
    worldTo600,
  };
})();
