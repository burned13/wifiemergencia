import { OfflineStorageService } from '../utils/offlineStorage';
import { LocationCoordinates } from '../types';
import { ConnectionService } from '../services/connectionService';
import { Platform } from 'react-native';

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
const tileY = (lat: number, z: number) => {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z)
  );
};

const defaultTileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png?v=1`;

const toBase64 = (bytes: Uint8Array): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0;
    const b1 = bytes[i++] ?? 0;
    const b2 = bytes[i++] ?? 0;
    const enc1 = b0 >> 2;
    const enc2 = ((b0 & 3) << 4) | (b1 >> 4);
    const enc3 = ((b1 & 15) << 2) | (b2 >> 6);
    const enc4 = b2 & 63;
    if (i - 1 > bytes.length) {
      out += alphabet[enc1] + alphabet[enc2] + '==';
    } else if (i > bytes.length) {
      out += alphabet[enc1] + alphabet[enc2] + alphabet[enc3] + '=';
    } else {
      out += alphabet[enc1] + alphabet[enc2] + alphabet[enc3] + alphabet[enc4];
    }
  }
  return out;
};

export const MapTileService = {
  prepareOfflineMap: async (
    center: LocationCoordinates,
    zooms: number[],
    opts?: { force?: boolean; bbox?: { south: number; north: number; west: number; east: number } }
  ): Promise<{ downloaded: number; failed: number; radiusKm: number }> => {
    const reach = await ConnectionService.testInternetReachability();
    let canFetch = !!reach.reachable;
    if (Platform.OS === 'web') {
      canFetch = true;
    }
    if (opts?.force) {
      canFetch = true;
    }
    if (!canFetch) {
      try { const t = await OfflineStorageService.getTileBaseUrl(); if (t) canFetch = true; } catch {}
    }
    if (!canFetch) return { downloaded: 0, failed: 0, radiusKm: 0 };
    if (!opts?.force && (typeof center.accuracy !== 'number' || center.accuracy > 200)) return { downloaded: 0, failed: 0, radiusKm: 0 };

    let tileBaseUrl: string | null = null;
    try { tileBaseUrl = await OfflineStorageService.getTileBaseUrl(); } catch {}
    if (!tileBaseUrl && Platform.OS === 'web') {
      tileBaseUrl = 'https://cors.isomorphic-git.org/https://tile.openstreetmap.org';
      try { await OfflineStorageService.setTileBaseUrl(tileBaseUrl); } catch {}
    }
    if (!tileBaseUrl && Platform.OS !== 'web') {
      const local = 'http://192.168.1.6:8080';
      let ok = false;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1500);
        const r = await fetch(local, { signal: ctrl.signal });
        clearTimeout(timer);
        ok = r.ok;
      } catch {}
      if (ok) {
        tileBaseUrl = local;
        try { await OfflineStorageService.setTileBaseUrl(tileBaseUrl); } catch {}
      }
    }
    const tileUrlLocal = (z: number, x: number, y: number) => (tileBaseUrl ? `${tileBaseUrl}/${z}/${x}/${y}.png?v=1` : defaultTileUrl(z, x, y));
    const tileUrlOsm = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png?v=1`;
    const tileUrlWm = (z: number, x: number, y: number) => `https://maps.wikimedia.org/osm-intl/${z}/${x}/${y}.png`;
    const fetchBytes = async (url: string): Promise<Uint8Array> => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('tile_fetch_failed');
      const blob = await resp.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    };
    const isProbablyBlank = (bytes: Uint8Array): boolean => {
      if (!bytes || bytes.length < 2000) return true;
      let unique = 0;
      const seen = new Set<number>();
      const step = Math.max(1, Math.floor(bytes.length / 2048));
      for (let i = 0; i < bytes.length; i += step) {
        const b = bytes[i];
        if (!seen.has(b)) {
          seen.add(b);
          unique++;
          if (unique > 64) return false;
        }
      }
      return unique < 16;
    };
    const fetchWithFallback = async (z: number, x: number, y: number): Promise<string | null> => {
      try {
        let bytes = await fetchBytes(tileUrlLocal(z, x, y));
        if (isProbablyBlank(bytes)) {
          bytes = await fetchBytes(tileUrlOsm(z, x, y));
        }
        if (isProbablyBlank(bytes)) {
          bytes = await fetchBytes(tileUrlWm(z, x, y));
        }
        if (bytes && bytes.length) {
          return `data:image/png;base64,${toBase64(bytes)}`;
        }
        return null;
      } catch {
        try {
          const bytes = await fetchBytes(tileUrlWm(z, x, y));
          return `data:image/png;base64,${toBase64(bytes)}`;
        } catch {
          return null;
        }
      }
    };

    let bbox: { south: number; north: number; west: number; east: number } | null = null;
    if (opts?.bbox) {
      bbox = opts.bbox;
    } else if (!opts?.force) {
      try {
        const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${center.latitude}&lon=${center.longitude}`);
        if (rev.ok) {
          const jr: any = await rev.json();
          const addr = jr?.address || {};
          const city = addr.city || addr.town || addr.village || '';
          const country = addr.country || '';
          if (city) {
            const q = encodeURIComponent(`${city} ${country}`.trim());
            const sr = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${q}&limit=1`);
            if (sr.ok) {
              const arr: any[] = await sr.json();
              const hit = arr && arr[0];
              if (hit && Array.isArray(hit.boundingbox) && hit.boundingbox.length === 4) {
                const bb = hit.boundingbox.map((v: any) => Number(v));
                bbox = { south: bb[0], north: bb[1], west: bb[2], east: bb[3] };
              }
            }
          }
        }
      } catch {}
    }

    let downloaded = 0;
    let failed = 0;
    let radiusKm = 3;
    let total = 0;

    if (bbox) {
      const centerLat = (bbox.south + bbox.north) / 2;
      const centerLon = (bbox.west + bbox.east) / 2;
      const dLatKm = (bbox.north - bbox.south) * 111;
      const dLonKm = (bbox.east - bbox.west) * 111 * Math.cos((centerLat * Math.PI) / 180);
      const diagKm = Math.sqrt(dLatKm * dLatKm + dLonKm * dLonKm);
      radiusKm = Math.max(3, diagKm / 2);
      await OfflineStorageService.saveOfflineMapRegion({ center: { latitude: centerLat, longitude: centerLon, accuracy: center.accuracy }, radiusKm, zooms });
      for (const z of zooms) {
        const xMin = tileX(bbox.west, z);
        const xMax = tileX(bbox.east, z);
        const yMin = tileY(bbox.north, z);
        const yMax = tileY(bbox.south, z);
        total += Math.max(0, (xMax - xMin + 1)) * Math.max(0, (yMax - yMin + 1));
      }
      await OfflineStorageService.setMapDownloadStatus({ inProgress: true, downloaded: 0, failed: 0, total });
      for (const z of zooms) {
        const xMin = tileX(bbox.west, z);
        const xMax = tileX(bbox.east, z);
        const yMin = tileY(bbox.north, z);
        const yMax = tileY(bbox.south, z);
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            try {
              const base64 = await fetchWithFallback(z, x, y);
              if (!base64) throw new Error('tile_fetch_failed');
              await OfflineStorageService.saveMapTile(z, x, y, base64);
              downloaded++;
              await OfflineStorageService.setMapDownloadStatus({ inProgress: true, downloaded, failed, total });
            } catch {
              failed++;
              await OfflineStorageService.setMapDownloadStatus({ inProgress: true, downloaded, failed, total });
            }
          }
        }
      }
    } else {
      const spanDeg = 3 / 111;
      const minLat = center.latitude - spanDeg;
      const maxLat = center.latitude + spanDeg;
      const minLon = center.longitude - spanDeg;
      const maxLon = center.longitude + spanDeg;
      await OfflineStorageService.saveOfflineMapRegion({ center, radiusKm, zooms });
      for (const z of zooms) {
        const xMin = tileX(minLon, z);
        const xMax = tileX(maxLon, z);
        const yMin = tileY(maxLat, z);
        const yMax = tileY(minLat, z);
        total += Math.max(0, (xMax - xMin + 1)) * Math.max(0, (yMax - yMin + 1));
      }
      await OfflineStorageService.setMapDownloadStatus({ inProgress: true, downloaded: 0, failed: 0, total });
      for (const z of zooms) {
        const xMin = tileX(minLon, z);
        const xMax = tileX(maxLon, z);
        const yMin = tileY(maxLat, z);
        const yMax = tileY(minLat, z);
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            try {
              const base64 = await fetchWithFallback(z, x, y);
              if (!base64) throw new Error('tile_fetch_failed');
              await OfflineStorageService.saveMapTile(z, x, y, base64);
              downloaded++;
              await OfflineStorageService.setMapDownloadStatus({ inProgress: true, downloaded, failed, total });
            } catch {
              failed++;
              await OfflineStorageService.setMapDownloadStatus({ inProgress: true, downloaded, failed, total });
            }
          }
        }
      }
    }

    await OfflineStorageService.setMapDownloadStatus({ inProgress: false, downloaded, failed, total });
    await OfflineStorageService.setOfflineMapTilesReady(downloaded > 0);
    return { downloaded, failed, radiusKm };
  },
};
