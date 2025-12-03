import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Platform, Alert, Linking, Image, PanResponder } from 'react-native';
import { useWifiStore } from '../contexts/useWifiStore';
import { EncryptionService } from '../utils/encryption';
import { useAuthStore } from '../contexts/useAuthStore';
import { Colors } from '../theme/colors';
import { ConnectionService } from '../services/connectionService';
import { WiFiService } from '../services/wifiService';
import { GPSService } from '../utils/gps';
import { OfflineStorageService } from '../utils/offlineStorage';
import { MapTileService } from '../services/mapTileService';
import { LocationCoordinates, WiFiNetwork } from '../types';
import AndroidIcon from '../../assets/images/android-icon-foreground.png';
 
const TL_COORDS: LocationCoordinates = { latitude: -35.967, longitude: -62.734, accuracy: 50 };

interface MapScreenProps {
  onNetworkSelected: (network: WiFiNetwork) => void;
  onNavigateRegister?: () => void;
  onNavigate?: (name: string, data?: any) => void;
  skipRedirectOnce?: boolean;
}

export const MapScreen: React.FC<MapScreenProps> = ({ onNetworkSelected, onNavigateRegister, onNavigate, skipRedirectOnce }) => {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState(1);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [lastConnectedId, setLastConnectedId] = useState<string | null>(null);
  const [netLatency, setNetLatency] = useState<number | null>(null);
  
  const [syncing, setSyncing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const reconnectTimer = useRef<any>(null);
  const disconnectTimer = useRef<any>(null);
  
  const [ownerCodeModal, setOwnerCodeModal] = useState(false);
  const [ownerCodeInput, setOwnerCodeInput] = useState('');
  const [ownerCodeTarget, setOwnerCodeTarget] = useState<WiFiNetwork | null>(null);
  const [ownerRevokeModal, setOwnerRevokeModal] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<WiFiNetwork | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [autoCode, setAutoCode] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const { nearbyNetworks, myNetworks, isLoading, error, getNearbyNetworks, searchNetworks, getMyNetworks, syncOfflineNetworks, loadPendingNetworksToMyNetworks, updateNetwork, deleteNetwork } = useWifiStore() as any;
  const { user, device, signOut } = useAuthStore();
  const [hasRegistered, setHasRegistered] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapDlStatus, setMapDlStatus] = useState<{ inProgress: boolean; downloaded: number; failed: number; total: number } | null>(null);
  const [tileZoom, setTileZoom] = useState<number>(15);
  const [tileGrid, setTileGrid] = useState<Array<{ z: number; x: number; y: number; dx: number; dy: number; uri: string | null }>>([]);
  const [minZoom, setMinZoom] = useState<number>(13);
  const [maxZoom, setMaxZoom] = useState<number>(16);
  const [guidanceActive, setGuidanceActive] = useState(false);
  const [guidanceText, setGuidanceText] = useState('');
  const [guidanceDistance, setGuidanceDistance] = useState(0);
  const [guidanceTarget, setGuidanceTarget] = useState<WiFiNetwork | null>(null);
  const [tileBaseUrl, setTileBaseUrl] = useState<string | null>(null);
  const [tileFail, setTileFail] = useState<Record<string, boolean>>({});
  const [selectedNetwork, setSelectedNetwork] = useState<WiFiNetwork | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panRes = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { panStart.current = { x: pan.x, y: pan.y }; },
      onPanResponderMove: (_e: any, gs: any) => { setPan({ x: panStart.current.x + gs.dx, y: panStart.current.y + gs.dy }); },
    })
  ).current;

  
  useEffect(() => {
    try {
      const params = new URLSearchParams((typeof window !== 'undefined' ? window.location.search : '') || '');
      const m = params.get('manage');
      if (m === 'access' && user) {
        const own = (myNetworks || []).filter((n: WiFiNetwork) => n.owner_id === user!.id);
        setRevokeTarget(own[0] || null);
        setOwnerRevokeModal(true);
      }
    } catch {}
  }, [user, myNetworks]);
  useEffect(() => {
    (async () => {
      const permissionGranted = await GPSService.requestLocationPermission();
      if (!permissionGranted) {
        setLocation(null);
        const approx = await GPSService.getApproximateLocationByIP();
        if (approx) {
          setLocation(approx);
          await getNearbyNetworks(approx, radiusKm);
        }
        else {
          setLocation(TL_COORDS);
          await getNearbyNetworks(TL_COORDS, radiusKm);
        }
      } else {
        const currentLocation = await GPSService.getCurrentLocation();
        if (currentLocation) {
          setLocation(currentLocation);
          await getNearbyNetworks(currentLocation, radiusKm);
        } else {
          const approx = await GPSService.getApproximateLocationByIP();
          if (approx) {
            setLocation(approx);
            await getNearbyNetworks(approx, radiusKm);
          } else {
            setLocation(TL_COORDS);
            await getNearbyNetworks(TL_COORDS, radiusKm);
          }
        }
      }
      if (!user) {
        await loadPendingNetworksToMyNetworks('guest');
      }
    })();
  }, [radiusKm, user, getNearbyNetworks, loadPendingNetworksToMyNetworks]);

  useEffect(() => {
    if (location) {
      getNearbyNetworks(location, radiusKm);
    }
  }, [radiusKm, location, getNearbyNetworks]);

  useEffect(() => {
    if (user) {
      getMyNetworks(user.id);
    }
  }, [user, getMyNetworks]);

  useEffect(() => {
    try {
      const homes = (myNetworks || []).filter((n: WiFiNetwork) => n.network_type === 'home');
      if (skipRedirectOnce) return;
      if (user && homes.length === 0 && onNavigate) {
        onNavigate('register');
      }
    } catch {}
  }, [user, myNetworks, onNavigate, skipRedirectOnce]);

  useEffect(() => {
    (async () => {
      try {
        const visual = await OfflineStorageService.getTileVisualBaseUrl();
        if (visual) {
          setTileBaseUrl(visual);
          return;
        }
        await OfflineStorageService.setTileVisualBaseUrl('https://maps.wikimedia.org/osm-intl');
        setTileBaseUrl('https://maps.wikimedia.org/osm-intl');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const flag = await OfflineStorageService.getHasRegisteredNetwork();
        setHasRegistered(!!flag);
        const ready = await OfflineStorageService.getOfflineMapTilesReady();
        setMapReady(!!ready);
        if (ready) {
          const region = await OfflineStorageService.getOfflineMapRegion();
          if (region && typeof region.radiusKm === 'number' && region.radiusKm > 0) {
            setRadiusKm(Math.max(0.5, Math.min(30, region.radiusKm)));
            const maxZoom = Math.max(...(region.zooms || [14]));
            setTileZoom(maxZoom);
            setMaxZoom(maxZoom);
            const minZoom = Math.min(...(region.zooms || [12]));
            setMinZoom(minZoom);
          }
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let timer: any = null;
    (async () => {
      timer = setInterval(async () => {
        try {
          const s = await OfflineStorageService.getMapDownloadStatus();
          setMapDlStatus(s);
        } catch {}
      }, 800);
    })();
    return () => { try { clearInterval(timer); } catch {} };
  }, []);

  useEffect(() => {
    (async () => {
      if (!mapReady || !location) return;
      const region = await OfflineStorageService.getOfflineMapRegion();
      const z = Math.max(...(region?.zooms || [tileZoom]));
      const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
      const tileY = (lat: number, z: number) => {
        const latRad = (lat * Math.PI) / 180;
        return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z));
      };
      const cx = tileX(location.longitude, z);
      const cy = tileY(location.latitude, z);
      const range = 2;
      const tasks: Array<Promise<{ z: number; x: number; y: number; dx: number; dy: number; uri: string | null }>> = [];
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          tasks.push((async () => ({ z, x, y, dx, dy, uri: await OfflineStorageService.getMapTile(z, x, y) }))());
        }
      }
      const grid = await Promise.all(tasks);
      setTileGrid(grid);
    })();
  }, [mapReady, location, tileZoom]);

  useEffect(() => {
    try {
      const homes = (myNetworks || []).filter((n: WiFiNetwork) => n.network_type === 'home');
      OfflineStorageService.setHasRegisteredNetwork(homes.length > 0).catch(() => {});
      (async () => { try { const flag = await OfflineStorageService.getHasRegisteredNetwork(); setHasRegistered(!!flag); } catch {} })();
    } catch {}
  }, [myNetworks]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const homes = (myNetworks || []).filter((n: WiFiNetwork) => n.network_type === 'home');
      if (!homes.length) return;
      const prefer = user ? homes.filter((n: WiFiNetwork) => n.owner_id === user.id) : homes;
      const list = prefer.length ? prefer : homes;
      const codeTag = list
        .map((n: WiFiNetwork) => (n.tags || []).find((t: any) => typeof t === 'string' && String(t).startsWith('register_code:')) as string | undefined)
        .find(Boolean) as string | undefined;
      if (!codeTag) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
        setAutoCode(code);
        try {
          const hash = EncryptionService.hash(code);
          const target = list[0];
          const existing = Array.isArray(target.tags) ? target.tags : [];
          const withoutHash = existing.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_hash:')) as string[];
          const withoutCode = withoutHash.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_code:')) as string[];
          const newTags = [...withoutCode, `register_hash:${hash}`, `register_code:${code}`];
          await WiFiService.updateNetwork(target.id, { tags: newTags, max_concurrent_users: 5 });
          if (user) { try { await getMyNetworks(user.id); } catch {} }
        } catch {}
      }
    })();
  }, [user, myNetworks, getMyNetworks]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: any = null;
    (async () => {
      sub = await GPSService.startLocationTracking(async (loc) => {
        setLocation(loc);
        const pool = [...nearbyNetworks, ...myNetworks];
        if (!pool.length || autoConnecting) return;
        const nearest = useWifiStore.getState().connectNearestNetwork(loc);
        if (!nearest) return;
        const dist = GPSService.calculateDistance(loc.latitude, loc.longitude, nearest.latitude, nearest.longitude);
        if (dist <= 0.12 && lastConnectedId !== nearest.id) {
          setAutoConnecting(true);
          const nearestLoc = loc;
          let pass = '';
          if (nearest.password_encrypted) {
            pass = WiFiService.getDecryptedPassword(nearest.password_encrypted);
          } else {
            const pending = await OfflineStorageService.getPendingNetworks();
            const hit = pending.find((p) => p.ssid === nearest.ssid);
            const enc = hit?.password || '';
            pass = enc ? EncryptionService.decrypt(enc) : '';
          }
          if (pass) {
            const native = await ConnectionService.connectNative(nearest.ssid, pass);
            if (native.success && user && device) {
              await ConnectionService.startConnection(user.id, nearest.id, device.id, nearestLoc);
              setLastConnectedId(nearest.id);
            }
            pass = '';
          }
          setAutoConnecting(false);
        }
        if (guidanceActive && guidanceTarget) {
          const d = GPSService.calculateDistance(loc.latitude, loc.longitude, guidanceTarget.latitude, guidanceTarget.longitude);
          setGuidanceDistance(Math.round(d * 1000));
          const toRad = (v: number) => (v * Math.PI) / 180;
          const toDeg = (v: number) => (v * 180) / Math.PI;
          const dLon = toRad(guidanceTarget.longitude - loc.longitude);
          const lat1 = toRad(loc.latitude);
          const lat2 = toRad(guidanceTarget.latitude);
          let br = toDeg(Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)));
          br = (br + 360) % 360;
          const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          const idx = Math.round(br / 45) % 8;
          const dir = dirs[idx];
          if (d * 1000 <= 5) {
            setGuidanceText('Llegaste a la red más cercana');
            setGuidanceActive(false);
          } else {
            setGuidanceText(`Caminar ${Math.round(d * 1000)} m hacia ${dir}`);
          }
        }
      }, 5000);
    })();
    return () => {
      try { sub?.remove?.(); } catch {}
    };
  }, [nearbyNetworks, myNetworks, autoConnecting, lastConnectedId, user, device]);

  

  const handleSearch = async () => {
    if (searching) return;
    setSearching(true);
    try {
      if (searchQuery.trim()) {
        await searchNetworks(searchQuery);
      } else if (location) {
        await getNearbyNetworks(location, 1);
      }
    } catch {}
    setSearching(false);
  };

  const renderMiniMap = () => {
    if (!location) return null;
    const loc = location;
    const size = 260;
    const half = size / 2;
    const pixelsPerKm = 60;
    const degToKmLon = (deg: number) => deg * 111 * Math.cos((loc.latitude * Math.PI) / 180);
    const degToKmLat = (deg: number) => deg * 111;

    const merged = [...myNetworks];
    const seen: Record<string, boolean> = {};
    const unique = merged.filter((n) => {
      const key = n.ssid ? n.ssid.toLowerCase() : n.id;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    const myIds: Record<string, boolean> = {};
    myNetworks.forEach((m: WiFiNetwork) => (myIds[m.id] = true));
    const points = unique.map((n) => {
      const dLatKm = degToKmLat(n.latitude - loc.latitude);
      const dLonKm = degToKmLon(n.longitude - loc.longitude);
      let x = half + dLonKm * pixelsPerKm;
      let y = half - dLatKm * pixelsPerKm;
      x = Math.max(6, Math.min(size - 6, x));
      y = Math.max(6, Math.min(size - 6, y));
      const isMine = !!myIds[n.id] || (!!user && n.owner_id === user.id);
      return { x, y, isMine, ssid: n.ssid };
    });

    const z = tileZoom;
    const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
    const tileY = (lat: number, z: number) => {
      const latRad = (lat * Math.PI) / 180;
      return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z));
    };
    const worldPixelX = (lon: number, z: number) => ((lon + 180) / 360) * Math.pow(2, z) * 256;
    const worldPixelY = (lat: number, z: number) => {
      const latRad = (lat * Math.PI) / 180;
      const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
      return y * Math.pow(2, z) * 256;
    };
    const cx = tileX(loc.longitude, z);
    const cy = tileY(loc.latitude, z);
    const range = 5;
    const tilesCount = range * 2 + 1;
    const scale = size / (256 * tilesCount);
    const centerPx = size / 2;
    const tlx = (cx - range) * 256;
    const tly = (cy - range) * 256;
    const gridDim = 256 * tilesCount * scale;
    const offset = centerPx - gridDim / 2;

    const mergedPoints = [...unique];
    const seenId: Record<string, boolean> = {};
    const uniquePoints = mergedPoints.filter((n) => {
      const key = n.ssid ? n.ssid.toLowerCase() : n.id;
      if (seenId[key]) return false;
      seenId[key] = true;
      return true;
    });

    const markers = uniquePoints.map((n) => {
      const px = worldPixelX(n.longitude, z);
      const py = worldPixelY(n.latitude, z);
      const left = (px - tlx) * scale + offset - 12;
      const top = (py - tly) * scale + offset - 12;
      const isMine = !!myNetworks.find((m: WiFiNetwork) => m.id === n.id) || (!!user && n.owner_id === user.id);
      return { left, top, isMine, ssid: n.ssid, network: n } as { left: number; top: number; isMine: boolean; ssid: string; network: WiFiNetwork };
    });

    const iconSize = 48;
    const tiles = (() => {
      const list: Array<{ z: number; x: number; y: number; dx: number; dy: number; uri?: string | null }> = [];
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          const pre = tileGrid.find((t) => t.z === z && t.x === x && t.y === y);
          list.push({ z, x, y, dx, dy, uri: pre ? pre.uri : null });
        }
      }
      return list as any;
    })();

    return (
      <View style={styles.miniMap}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden' }} {...panRes.panHandlers}>
          <View style={{ transform: [{ scale }], width: 256 * tilesCount, height: 256 * tilesCount, position: 'absolute', left: offset + pan.x, top: offset + pan.y }}>
            {tiles.map((t: any, idx: number) => {
              const key = `${t.z}_${t.x}_${t.y}`;
              const preferred = tileBaseUrl ? `${tileBaseUrl}/${t.z}/${t.x}/${t.y}.png` : `https://maps.wikimedia.org/osm-intl/${t.z}/${t.x}/${t.y}.png`;
              const uri = preferred;
              return (
                <Image
                  key={`${key}_${idx}`}
                  source={{ uri }}
                  style={{ position: 'absolute', left: (t.dx + range) * 256, top: (t.dy + range) * 256, width: 256, height: 256 }}
                  onError={() => { try { setTileFail((prev) => ({ ...prev, [key]: true })); } catch {} }}
                />
              );
            })}
          </View>
          <Image
            source={{ uri: (tileBaseUrl ? `${tileBaseUrl}/${z}/${tileX(loc.longitude, z)}/${tileY(loc.latitude, z)}.png` : `https://maps.wikimedia.org/osm-intl/${z}/${tileX(loc.longitude, z)}/${tileY(loc.latitude, z)}.png`) }}
            style={{ position: 'absolute', left: centerPx - 128 + pan.x, top: centerPx - 128 + pan.y, width: 256, height: 256, opacity: 0.9 }}
          />
        </View>
        {markers.map((m, i) => (
          <TouchableOpacity key={`mk_${i}`} onPress={() => setSelectedNetwork(m.network)} style={{ position: 'absolute', left: m.left + pan.x, top: m.top + pan.y }}>
            <Image source={AndroidIcon} style={{ width: iconSize, height: iconSize }} />
          </TouchableOpacity>
        ))}
        <Text style={{ position: 'absolute', left: centerPx - 6 + pan.x, top: centerPx - 14 + pan.y, color: Colors.primaryDark, fontSize: 18, fontWeight: '800' }}>▲</Text>
        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomButton} onPress={() => setTileZoom((z) => Math.min(z + 1, maxZoom))}>
            <Text style={{ color: Colors.surface, fontWeight: '800' }}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomButton} onPress={() => setTileZoom((z) => Math.max(z - 1, minZoom))}>
            <Text style={{ color: Colors.surface, fontWeight: '800' }}>－</Text>
          </TouchableOpacity>
        </View>
        
        {guidanceActive && guidanceText ? (
          <View style={styles.guidanceBox}>
            <Text style={styles.guidanceText}>{guidanceText}</Text>
          </View>
        ) : null}
        <View style={styles.miniMapLegend}>
          <View style={[styles.legendDot, { backgroundColor: Colors.accentRed }]} /><Text style={styles.legendText}>My networks</Text>
          <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} /><Text style={styles.legendText}>Nearby</Text>
        </View>
      </View>
    );
  };

  useEffect(() => {
    let timer: any = null;
    (async () => {
      timer = setInterval(async () => {
        try {
          const st = await OfflineStorageService.getMapDownloadStatus();
          setMapDlStatus(st);
          const ready = await OfflineStorageService.getOfflineMapTilesReady();
          setMapReady(!!ready);
        } catch {}
      }, 5000);
    })();
    return () => { try { clearInterval(timer); } catch {} };
  }, [mapReady, location]);


  useEffect(() => {
    let timer: any = null;
    (async () => {
      timer = setInterval(async () => {
        try {
          const status = await ConnectionService.getWifiStatus();
          if (!status.connected) return;
          const myList = myNetworks.map((n: WiFiNetwork) => n.ssid);
          const isOwn = status.ssid ? myList.includes(String(status.ssid)) : false;
          if (!isOwn) return;
          const offline = await OfflineStorageService.getOfflineWiFiData();
          const last = offline?.lastSync ? new Date(offline.lastSync).getTime() : 0;
          const now = Date.now();
          const weekMs = 7 * 24 * 60 * 60 * 1000;
          if (!last || now - last > weekMs) {
          const loc = location;
          if (!loc) return;
          const { networks } = await WiFiService.getNearbyNetworks(loc.latitude, loc.longitude, 3);
            if (networks && networks.length) {
              await OfflineStorageService.saveWiFiData(networks, loc);
            }
          }
        } catch {}
      }, 7 * 24 * 60 * 60 * 1000);
    })();
    return () => { try { clearInterval(timer); } catch {} };
  }, [location, myNetworks]);

  const connectNearest = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const loc = location;
      if (!loc) return;
      const mergedRaw = [...nearbyNetworks, ...myNetworks];
      const seenSsid = new Set<string>();
      const merged = mergedRaw.filter((n) => {
        const key = (n.ssid || '').toLowerCase();
        if (!key) return true;
        if (seenSsid.has(key)) return false;
        seenSsid.add(key);
        return true;
      });
      const scan = await ConnectionService.scanNearbySSIDs();
      const seen = new Set(scan.ssids);
      const byBssid = new Map<string, string>();
      (scan.entries || []).forEach((e) => { if (e.bssid) byBssid.set(e.bssid, e.ssid); });
      let candidate: WiFiNetwork | null = null;
      try {
        const last = await OfflineStorageService.getConnectionCache('last_ssid');
        const lastSsid = String(last?.ssid || '').toLowerCase();
        if (lastSsid) {
          candidate = merged.find((n) => n.ssid.toLowerCase() === lastSsid && (n.bssid ? byBssid.has(n.bssid) : seen.has(n.ssid))) || null;
        }
      } catch {}
      if (!candidate) {
        const visible = merged.filter((n) => (n.bssid ? byBssid.has(n.bssid) : seen.has(n.ssid)));
        if (visible.length) {
          try {
            const withLatency = await Promise.all(visible.map(async (n) => ({ n, avg: await OfflineStorageService.getLatencyAvg(n.ssid) })));
            withLatency.sort((a, b) => {
              if (a.avg == null && b.avg == null) return 0;
              if (a.avg == null) return 1;
              if (b.avg == null) return -1;
              return a.avg - b.avg;
            });
            candidate = withLatency[0].n;
          } catch {
            candidate = visible[0];
          }
        }
      }
      const nearest = candidate || useWifiStore.getState().connectNearestNetwork(loc);
      if (nearest) {
        if (Platform.OS === 'web') {
          Alert.alert('Solo móvil', 'La conexión automática solo está disponible en la app móvil');
          onNetworkSelected(nearest);
          return;
        }
        const isGuest = !user || !device;
        
        let pass = '';
        if (nearest.password_encrypted) {
          pass = WiFiService.getDecryptedPassword(nearest.password_encrypted);
        } else {
          const pending = await OfflineStorageService.getPendingNetworks();
          const hit = pending.find((p) => p.ssid === nearest.ssid);
          const enc = hit?.password || '';
          pass = enc ? EncryptionService.decrypt(enc) : '';
        }
        if (!pass) {
          Alert.alert('Falta contraseña', 'No se encontró la contraseña para esta red');
          onNetworkSelected(nearest);
          return;
        }
        const limit = await ConnectionService.checkConnectionLimit(nearest.id);
        if (!limit.canConnect) {
          Alert.alert('Límite alcanzado', `Usuarios activos: ${limit.activeCount}/${limit.maxUsers}`);
          try { await ConnectionService.logAccessEvent(nearest.id, user!.id, 'limit_exceeded', loc); } catch {}
          onNetworkSelected(nearest);
          return;
        }

        const native = await ConnectionService.connectNative(nearest.ssid, pass);
          if (!native.success) {
            try {
              if (!isGuest && loc) {
                await ConnectionService.logAccessEvent(
                  nearest.id,
                  user!.id,
                  'failed_auth',
                  loc,
                  native.error || 'native_connect_failed'
                );
              }
            } catch {}
            Alert.alert('Error de conexión', native.error === 'native_module_missing' ? 'Módulo nativo no instalado' : (native.error || 'Error desconocido'));
            onNetworkSelected(nearest);
            return;
          }
        if (!isGuest) {
          const started = await ConnectionService.startConnection(user!.id, nearest.id, device!.id, loc);
          const connId = started.connection?.id;
          const timeoutMin = nearest.session_timeout_minutes || 10;
          if (connId) {
            try { await ConnectionService.enforceSessionTimeout(connId, timeoutMin); } catch {}
          }
          try { if (reconnectTimer.current) clearTimeout(reconnectTimer.current); } catch {}
          reconnectTimer.current = setTimeout(() => { try { connectNearest(); } catch {} }, (timeoutMin * 60 * 1000) + 5000);
          try { await OfflineStorageService.saveConnectionCache('active', { id: connId, networkId: nearest.id, userId: user!.id, ssid: nearest.ssid, startedAt: Date.now() }); } catch {}
          try { await OfflineStorageService.saveConnectionCache('last_ssid', { ssid: nearest.ssid }); } catch {}
        } else {
          try { await OfflineStorageService.saveConnectionCache('last_ssid', { ssid: nearest.ssid }); } catch {}
        }
        pass = '';
        try {
          const reach = await ConnectionService.testInternetReachability();
          setNetLatency(reach.reachable ? (reach.latencyMs ?? 0) : null);
          if (reach.reachable && typeof reach.latencyMs === 'number') {
            try { await OfflineStorageService.addLatencySample(nearest.ssid, reach.latencyMs); } catch {}
          }
        } catch {}
        onNetworkSelected(nearest);
      }
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    return () => {
      try { if (reconnectTimer.current) clearTimeout(reconnectTimer.current); } catch {}
      try { if (disconnectTimer.current) clearInterval(disconnectTimer.current); } catch {}
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    try { if (disconnectTimer.current) clearInterval(disconnectTimer.current); } catch {}
    disconnectTimer.current = setInterval(async () => {
      try {
        const active = await OfflineStorageService.getConnectionCache('active');
        if (!active || !active.id) return;
        const status = await ConnectionService.getWifiStatus();
        if (!status.connected || (status.ssid && active.ssid && String(status.ssid) !== String(active.ssid))) {
          const now = Date.now();
          const started = Number(active.startedAt || now);
          const duration = Math.max(1, Math.floor((now - started) / 1000));
          const loc = location;
          try { await ConnectionService.endConnection(String(active.id), duration); } catch {}
          try { await ConnectionService.logAccessEvent(String(active.networkId), String(active.userId), 'disconnected', loc || { latitude: 0, longitude: 0, accuracy: 0 }, 'wifi_disconnected'); } catch {}
          try { await OfflineStorageService.saveConnectionCache('active', {}); } catch {}
        }
      } catch {}
    }, 10000);
    return () => { try { if (disconnectTimer.current) clearInterval(disconnectTimer.current); } catch {} };
  }, [location]);

  const renderNetworkItem = ({ item }: { item: WiFiNetwork }) => (
    <TouchableOpacity
      style={[
        styles.networkCard,
        { borderLeftColor: user && item.owner_id === user.id ? '#C62828' : '#4CAF50' },
      ]}
      onPress={() => onNetworkSelected(item)}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <TouchableOpacity onPress={() => setShowMenu((v) => !v)}>
          <Text style={{ fontSize: 18, color: Colors.textSecondary }}>☰</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.networkHeader}>
        <Text style={styles.ssid} numberOfLines={1}>
          {item.ssid}
        </Text>
        <Text style={styles.networkType}>{item.network_type}</Text>
      </View>
      <View style={styles.networkDetails}>
        {user && (() => {
          const hasAccess = (item.tags || []).some((t) => typeof t === 'string' && String(t) === `register_user:${user!.id}`);
          return hasAccess ? (
            <Text style={styles.accessBadge}>Acceso habilitado</Text>
          ) : null;
        })()}
        <Text style={styles.detailText}>Signal: {item.signal_strength}%</Text>
        <Text style={styles.detailText}>Security: {item.security_protocol}</Text>
        <Text style={styles.detailText}>Users: {item.current_users}/{item.max_concurrent_users}</Text>
        {user && item.owner_id === user.id && (
          <View style={{ marginTop: 6 }}>
            {(() => {
              const registeredUsers = (item.tags || []).filter((t) => typeof t === 'string' && String(t).startsWith('register_user:')) as string[];
              const count = registeredUsers.length;
              return (
                <Text style={styles.detailText}>Registros habilitados: {count}/5</Text>
              );
            })()}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity
                style={[styles.approxButton, { borderColor: Colors.primaryDark }]}
                onPress={() => { setOwnerCodeTarget(item); setOwnerCodeInput(''); setOwnerCodeModal(true); }}
              >
                <Text style={[styles.approxButtonText, { color: Colors.primaryDark }]}>Definir código de registro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approxButton, { borderColor: Colors.primaryDark }]}
                onPress={() => {
                  try {
                    const codeTag = (item.tags || []).find((t) => typeof t === 'string' && String(t).startsWith('register_code:')) as string | undefined;
                    const code = codeTag ? String(codeTag).split(':')[1] : '';
                    if (code) {
                      Alert.alert('Código de invitación', code);
                    } else {
                      Alert.alert('Sin código', 'Aún no hay un código guardado para esta red');
                    }
                  } catch {}
                }}
              >
                <Text style={[styles.approxButtonText, { color: Colors.primaryDark }]}>Ver código</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approxButton, { borderColor: '#2e7d32' }]}
                onPress={() => {
                  try {
                    const codeTag = (item.tags || []).find((t) => typeof t === 'string' && String(t).startsWith('register_code:')) as string | undefined;
                    const code = codeTag ? String(codeTag).split(':')[1] : '';
                    if (!code) { Alert.alert('Sin código', 'Aún no hay un código guardado para esta red'); return; }
                    const url = `http://localhost:13175/?code=${code}`;
                    const shareAny = (navigator as any)?.share;
                    if (shareAny) {
                      shareAny({ title: 'Invitación WiFi', text: `Usá este código: ${code}`, url });
                    } else {
                      if ((navigator as any)?.clipboard?.writeText) (navigator as any).clipboard.writeText(url);
                      Alert.alert('Enlace copiado', url);
                    }
                  } catch {}
                }}
              >
                <Text style={[styles.approxButtonText, { color: '#2e7d32' }]}>Compartir link</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      {false}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brandText}>WiFi Emergencia</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => setShowMenu((v) => !v)}>
            <Text style={styles.hamburgerButton}>☰</Text>
          </TouchableOpacity>
        </View>
      </View>
      {showMenu && (
        <>
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setShowMenu(false)} />
          <View style={[styles.menuOverlay, { position: 'absolute', right: 12, top: 8, zIndex: 9999 }]}>
            <View style={styles.menuBox}>
              {onNavigate && (
                <TouchableOpacity style={styles.menuItem} onPress={async () => { setShowMenu(false); try { await useAuthStore.getState().getCurrentUser(); const uid = useAuthStore.getState().user?.id; const st = useWifiStore.getState(); if (uid) { st.getMyNetworks && (await st.getMyNetworks(uid)); } else { st.loadPendingNetworksToMyNetworks && (await st.loadPendingNetworksToMyNetworks('guest')); } } catch {}; onNavigate('Profile'); }}>
                  <Text style={styles.menuItemText}>Perfil</Text>
                </TouchableOpacity>
              )}
            {onNavigate && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); onNavigate('Payments', { origin: 'menu' }); }}>
                <Text style={styles.menuItemText}>Suscripción</Text>
              </TouchableOpacity>
            )}
            {onNavigate && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); onNavigate('Networks'); }}>
                <Text style={styles.menuItemText}>Redes</Text>
              </TouchableOpacity>
            )}
              <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowSupportModal(true); }}>
                <Text style={styles.menuItemText}>Soporte</Text>
              </TouchableOpacity>
              
              
              <TouchableOpacity style={styles.menuItem} onPress={async () => { setShowMenu(false); try { await signOut(); Alert.alert('Sesión cerrada', 'Ingresá nuevamente para continuar'); if (onNavigate) { onNavigate('auth'); } } catch {} }}>
                <Text style={styles.menuItemText}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
      

      

      <View style={styles.controlsRow}>
        <View style={styles.radiusContainer}>
          <Text style={styles.radiusLabel}>Radius</Text>
          <View style={styles.radiusControls}>
            <TouchableOpacity
              style={styles.radiusButton}
              onPress={() => setRadiusKm((r) => Math.max(0.5, +(r - 0.5).toFixed(1)))}
            >
              <Text style={styles.radiusButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.radiusValue}>{radiusKm.toFixed(1)} km</Text>
            <TouchableOpacity
              style={styles.radiusButton}
              onPress={() => setRadiusKm((r) => Math.min(10, +(r + 0.5).toFixed(1)))}
            >
              <Text style={styles.radiusButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        
        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[styles.approxButton, { borderColor: Colors.primary }]}
            onPress={async () => { try { setLocation(TL_COORDS); await getNearbyNetworks(TL_COORDS, radiusKm); } catch {} }}
          >
            <Text style={[styles.approxButtonText, { color: Colors.primary }]}>Trenque Lauquen</Text>
          </TouchableOpacity>
          <View style={{ position: 'relative', width: 24, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setShowCityPicker((v) => !v)} style={{ width: 24, alignItems: 'center' }}>
              <Text style={{ color: Colors.primary, fontWeight: '700' }}>▼</Text>
            </TouchableOpacity>
            {showCityPicker && (
              <View style={{ position: 'absolute', top: 24, left: -80, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 8, zIndex: 9999, elevation: 6, minWidth: 160 }}>
                <TouchableOpacity onPress={() => { setShowCityPicker(false); try { setLocation(TL_COORDS); getNearbyNetworks(TL_COORDS, radiusKm); } catch {} }}>
                  <Text style={{ color: Colors.textSecondary, fontWeight: '600' }}>Trenque Lauquen</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[styles.approxButton, { borderColor: Colors.primary }]}
            onPress={async () => {
              try {
                const ok = await GPSService.requestLocationPermission();
                if (!ok) { Alert.alert('Permiso de ubicación requerido', 'No se pudo centrar el GPS'); return; }
                const cur = await GPSService.getCurrentLocation();
                if (cur) { setLocation(cur); setPan({ x: 0, y: 0 }); Alert.alert('GPS centrado', `Lat ${cur.latitude.toFixed(5)} • Lon ${cur.longitude.toFixed(5)}`); }
              } catch {}
            }}
          >
            <Text style={[styles.approxButtonText, { color: Colors.primary }]}>Centrar GPS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approxButton, { borderColor: Colors.primary }]}
            onPress={async () => {
              try {
                if (!location) return;
                const pool = [...myNetworks];
                if (!pool.length && nearbyNetworks.length) {
                  const homesNearby = nearbyNetworks.filter((n) => n.network_type === 'home');
                  pool.push(...(homesNearby.length ? homesNearby : nearbyNetworks));
                }
                if (!pool.length) return;
                let target: WiFiNetwork | null = null;
                if (selectedNetwork) {
                  target = selectedNetwork;
                } else {
                  const homes = pool.filter((n) => n.network_type === 'home');
                  const pick = homes.length ? homes : pool;
                  const withDist = pick.map((n) => ({ n, d: GPSService.calculateDistance(location.latitude, location.longitude, n.latitude, n.longitude) }));
                  withDist.sort((a, b) => a.d - b.d);
                  target = withDist[0]?.n || null;
                }
                if (!target) return;
                const lat = target.latitude;
                const lon = target.longitude;
                if (Platform.OS === 'web') {
                  const url = `https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${lat},${lon}&travelmode=walking`;
                  await Linking.openURL(url);
                } else {
                  const reach = await ConnectionService.testInternetReachability();
                  if (reach.reachable) {
                    const url = `google.navigation:q=${lat},${lon}&mode=w`;
                    await Linking.openURL(url);
                  } else {
                    setGuidanceTarget(target);
                    setGuidanceActive(true);
                  }
                }
              } catch {}
            }}
          >
            <Text style={[styles.approxButtonText, { color: Colors.primary }]}>Cómo llegar</Text>
          </TouchableOpacity>
        </View>
        
        
        
      </View>

      <View style={styles.locationInfo}>
        {location && (
          <Text style={styles.locationText}>
            📍 Lat: {location.latitude.toFixed(4)}, Lon: {location.longitude.toFixed(4)}
          </Text>
        )}
        <Text style={styles.locationText}>My: {myNetworks.length} Nearby: {nearbyNetworks.length}</Text>
        <Text style={styles.locationText}>{mapReady ? 'Mapa offline listo' : 'Mapa offline no descargado'}</Text>
        {mapDlStatus && mapDlStatus.inProgress && (
          <Text style={styles.locationText}>
            Descargando mapa {Math.floor(((mapDlStatus.downloaded + mapDlStatus.failed) / Math.max(1, mapDlStatus.total)) * 100)}%
          </Text>
        )}
        {netLatency !== null && (
          <Text style={styles.locationText}>Internet OK • {netLatency} ms</Text>
        )}
        {error && (
          <Text style={{ color: '#d32f2f', fontSize: 12 }}>Error: {error}</Text>
        )}
      </View>

      

      {ownerCodeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Definir código de registro</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nuevo código"
              value={ownerCodeInput}
              onChangeText={setOwnerCodeInput}
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#2E7D32' }]}
                onPress={async () => {
                  const target = ownerCodeTarget;
                  if (!target) { setOwnerCodeModal(false); return; }
                  const hash = EncryptionService.hash(ownerCodeInput.trim());
                  if (!hash) { Alert.alert('Error', 'Ingresá un código válido'); return; }
                  const existing = Array.isArray(target.tags) ? target.tags : [];
                  const filtered = existing.filter((t) => typeof t === 'string' && !String(t).startsWith('register_hash:'));
                  const newTags = [...filtered, `register_hash:${hash}`];
                  try {
                    await updateNetwork(target.id, { tags: newTags });
                    setOwnerCodeModal(false);
                    setOwnerCodeTarget(null);
                    setOwnerCodeInput('');
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'No se pudo actualizar la red');
                  }
                }}
              >
                <Text style={styles.modalButtonText}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#9E9E9E' }]}
                onPress={() => { setOwnerCodeModal(false); setOwnerCodeTarget(null); setOwnerCodeInput(''); }}
              >
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {ownerRevokeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Revocar registros</Text>
              <TouchableOpacity onPress={() => { setOwnerRevokeModal(false); setRevokeTarget(null); }}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const target = revokeTarget;
              if (!target) return <Text style={styles.detailText}>No hay redes propias disponibles</Text>;
              const users = (target.tags || []).filter((t) => typeof t === 'string' && String(t).startsWith('register_user:')) as string[];
              return (
                <View>
                  <Text style={styles.detailText}>Red: {target.ssid}</Text>
                  {users.length ? users.map((uTag, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                      <Text style={styles.detailText}>{uTag.replace('register_user:', '')}</Text>
                      <TouchableOpacity
                        style={[styles.approxButton, { borderColor: '#d32f2f' }]}
                        onPress={async () => {
                          try {
                            const remaining = (target.tags || []).filter((t) => typeof t === 'string' && t !== uTag);
                            await WiFiService.updateNetwork(target.id, { tags: remaining as any });
                            const updated = { ...target, tags: remaining } as WiFiNetwork;
                            setRevokeTarget(updated);
                            Alert.alert('Listo', 'Registro revocado');
                          } catch (e: any) {
                            Alert.alert('Error', e?.message || 'No se pudo revocar');
                          }
                        }}
                      >
                        <Text style={[styles.approxButtonText, { color: '#d32f2f' }]}>Revocar</Text>
                      </TouchableOpacity>
                    </View>
                  )) : (
                    <Text style={styles.detailText}>No hay usuarios registrados</Text>
                  )}
                </View>
              );
            })()}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#9E9E9E' }]}
                onPress={() => { setOwnerRevokeModal(false); setRevokeTarget(null); }}
              >
                <Text style={styles.modalButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showSupportModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Soporte</Text>
              <TouchableOpacity onPress={() => setShowSupportModal(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.primaryDark }]}
                onPress={() => { try { Linking.openURL('mailto:soporte@wififree.global?subject=Ayuda'); } catch {} }}
              >
                <Text style={styles.modalButtonText}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#25D366' }]}
                onPress={() => { try { Linking.openURL('https://wa.me/5491112345678?text=Hola,%20necesito%20ayuda'); } catch {} }}
              >
                <Text style={styles.modalButtonText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#9E9E9E' }]}
                onPress={() => setShowSupportModal(false)}
              >
                <Text style={styles.modalButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      

      {renderMiniMap()}

      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <TouchableOpacity
          style={[styles.connectButton, { width: '100%', justifyContent: 'flex-start', paddingVertical: 10 }]}
          onPress={connectNearest}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, overflow: 'visible' }}>
                <Image source={AndroidIcon} style={[styles.connectButtonIcon, { transform: [{ scale: 2.0 }], position: 'absolute', left: -12, top: -12 }]} />
              </View>
              <Text style={[styles.connectButtonText, { fontSize: 20, fontWeight: '900' }]}>Conectar WiFi</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
    position: 'relative',
    zIndex: 200,
  },
  radiusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radiusLabel: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  radiusControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radiusButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceGreen,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  radiusButtonText: {
    color: Colors.primaryDark,
    fontSize: 16,
    fontWeight: '700',
  },
  radiusValue: {
    fontSize: 12,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  approxButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  approxButtonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: Colors.surface,
  },
  searchButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: Colors.surface,
    fontWeight: '600',
  },
  inviteBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  inviteBannerTitle: {
    fontSize: 14,
    color: '#BF360C',
    marginBottom: 6,
    fontWeight: '600',
  },
  inviteBannerCode: {
    fontSize: 16,
    color: '#BF360C',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  locationInfo: {
    padding: 12,
    backgroundColor: Colors.surfaceGreen,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGreen,
  },
  locationText: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '500',
  },
  networkCard: {
    margin: 12,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderLeftWidth: 4,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  networkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ssid: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    color: Colors.textPrimary,
  },
  networkType: {
    fontSize: 12,
    backgroundColor: Colors.border,
    color: Colors.textSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  networkDetails: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  detailText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  menuOverlay: {
    position: 'absolute',
    right: 12,
    top: 8,
  },
  menuBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0)',
    zIndex: 9998,
  },
  menuBox: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 180,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuItemText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.surface,
    marginBottom: 2,
  },
  accessBadge: {
    fontSize: 12,
    color: Colors.primaryDark,
    fontWeight: '700',
    marginBottom: 6,
  },
  listContent: {
    paddingBottom: 20,
  },
  miniMap: {
    height: 260,
    width: 260,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniMapCenter: {
    position: 'absolute',
    left: 130 - 10,
    top: 130 - 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  miniMapDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  miniMapLegend: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomControls: {
    position: 'absolute',
    right: 8,
    bottom: 48,
    gap: 8,
  },
  zoomButton: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  gpsCenterButton: {
    position: 'absolute',
    left: 8,
    bottom: 48,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  routeButton: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  guidanceBox: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  guidanceText: {
    color: Colors.surface,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  hamburgerButton: {
    color: Colors.surface,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  connectButtonText: {
    color: Colors.primaryDark,
    fontSize: 15,
    fontWeight: '700',
  },
  connectButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginRight: 12,
  },
  cityMapWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  registerCTA: {
    marginHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceGreen,
  },
  registerCTAText: {
    color: Colors.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  modalOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBox: {
    width: '86%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#666',
  },
});
