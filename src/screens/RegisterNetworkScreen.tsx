import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { SUPABASE_CONFIGURED } from '../config/supabase';
import { Colors } from '../theme/colors';
import { StepProgress } from '../components/StepProgress';
import { useWifiStore } from '../contexts/useWifiStore';
import { useAuthStore } from '../contexts/useAuthStore';
import { AuthService } from '../services/authService';
import { GPSService } from '../utils/gps';
import { OfflineStorageService } from '../utils/offlineStorage';
import { WiFiService } from '../services/wifiService';
import { EncryptionService } from '../utils/encryption';
import { LocationCoordinates } from '../types';
import { MapTileService } from '../services/mapTileService';

interface RegisterNetworkScreenProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const RegisterNetworkScreen: React.FC<RegisterNetworkScreenProps> = ({
  onClose,
  onSuccess,
}) => {
  const { isLoading, myNetworks } = useWifiStore() as any;
  const { isAuthenticated } = useAuthStore() as any;

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [description] = useState('');
  const [networkType] = useState<'home' | 'public' | 'enterprise'>('home');
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationPermState, setLocationPermState] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [hasPayments, setHasPayments] = useState(false);
  const [hasRegistered, setHasRegistered] = useState(false);
  const [mapDlStatus, setMapDlStatus] = useState<{ inProgress: boolean; downloaded: number; failed: number; total: number } | null>(null);
  const [mapRequested, setMapRequested] = useState(false);

  useEffect(() => {
    let sub: any = null;
    (async () => {
      try {
        setIsGettingLocation(true);
        sub = await GPSService.startLocationTracking((loc) => {
          setLocation(loc);
          setLocationError(null);
        }, 2000);
        // Paralelamente, intenta cerrar cuando alcance ≤ 5 m
        GPSService.waitForAccurateLocation(5).then((coords) => {
          if (coords) setLocation(coords);
          setIsGettingLocation(false);
        });
      } catch { setIsGettingLocation(false); }
    })();
    return () => { try { sub && sub.remove && sub.remove(); } catch {} };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).permissions) {
      try {
        (navigator as any).permissions.query({ name: 'geolocation' }).then((res: any) => {
          setLocationPermState(res?.state || null);
        }).catch(() => {});
      } catch {}
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const paid = await OfflineStorageService.getHasCompletedPayments();
        const reg = await OfflineStorageService.getHasRegisteredNetwork();
        setHasPayments(!!paid);
        setHasRegistered(!!reg);
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
      try {
        if (mapRequested) return;
        const ready = await OfflineStorageService.getOfflineMapTilesReady();
        if (ready) return;
        if (location) {
          setMapRequested(true);
          try { await MapTileService.prepareOfflineMap(location, [14,15,16], { force: true }); } catch {}
        }
      } catch {}
    })();
  }, [location, mapRequested]);

  useEffect(() => {
    try {
      const hasAny = Array.isArray(myNetworks) && myNetworks.length > 0;
      if (hasAny) setHasRegistered(true);
    } catch {}
  }, [myNetworks]);

  const doneSteps = [true, true, false] as boolean[];
  const computeCurrentStep = () => 3;

  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    const coords = await GPSService.waitForAccurateLocation(5);
    if (coords) setLocation(coords);
    setIsGettingLocation(false);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    let didRegister = false;

    const ssidValid = Boolean(ssid.trim()) && ssid.trim().length >= 3;
    const passValid = Boolean(password.trim()) && password.trim().length >= 8;
    const passMatch = password === confirmPassword;
    if (!ssidValid || !passValid || !passMatch) {
      if (!ssidValid) setSubmitError('Ingresá un SSID válido (mínimo 3 caracteres)');
      else if (!passValid) setSubmitError('Ingresá una contraseña de al menos 8 caracteres');
      else if (!passMatch) setSubmitError('Las contraseñas no coinciden');
      return;
    }

    let finalLocation: LocationCoordinates | null = location;
    if (!finalLocation || !finalLocation.accuracy || finalLocation.accuracy > 5) {
      setSubmitError('Esperá a obtener una ubicación con precisión ≤ 5 m');
      return;
    }

    if (!SUPABASE_CONFIGURED) {
      try {
        await useWifiStore.getState().registerNetworkOffline(
          ssid.trim(),
          password,
          finalLocation,
          networkType,
          description.trim() || undefined,
          undefined
        );
      } catch {}
      try { await OfflineStorageService.setHasRegisteredNetwork(true); setHasRegistered(true); } catch {}
      try { setInviteCode(generateCode()); } catch {}
      didRegister = true;
      try { if (didRegister) { onSuccess(); } } catch {}
      return;
    }

    const stAuth = useAuthStore.getState();
    let userId: string | undefined = stAuth.user?.id;
    if (!userId) {
      try {
        const { user } = await AuthService.getCurrentUser();
        userId = user?.id;
      } catch {}
    }
    if (!userId) {
      try {
        await useWifiStore.getState().registerNetworkOffline(
          ssid.trim(),
          password,
          finalLocation,
          networkType,
          description.trim() || undefined,
          undefined
        );
      } catch {}
    }

    try {
      const { network: existing } = ssid.trim() ? await WiFiService.getNetworkBySSID(ssid.trim()) : { network: null } as any;
      if (existing && userId && existing.owner_id === userId) {
        const { error: updErr } = await WiFiService.updateNetwork(existing.id, {
          ssid: ssid.trim(),
          password_encrypted: password,
          network_type: networkType,
          latitude: finalLocation.latitude,
          longitude: finalLocation.longitude,
          security_protocol: 'WPA2',
          description: description.trim() || undefined,
        } as any);
        if (updErr) {
          setSubmitError(updErr);
        } else {
          try { await OfflineStorageService.setHasRegisteredNetwork(true); setHasRegistered(true); } catch {}
          try {
            if (finalLocation) {
              await MapTileService.prepareOfflineMap(finalLocation, [14,15,16]);
              try {
                const { networks } = await WiFiService.getNearbyNetworks(finalLocation.latitude, finalLocation.longitude, 3);
                if (networks && networks.length) {
                  await OfflineStorageService.saveWiFiData(networks, finalLocation);
                }
              } catch {}
            }
          } catch {}
          didRegister = true;
        }
      } else {
        if (userId && ssid.trim()) {
          const { error: regErr } = await WiFiService.registerNetwork(
            userId,
            ssid.trim(),
            password,
            finalLocation,
            networkType,
            'WPA2',
            description.trim() || undefined,
            undefined
          );
          if (regErr) {
            setSubmitError(regErr);
            try { Alert.alert('Error', regErr); } catch {}
            const regErrLower = String(regErr).toLowerCase();
            if (regErrLower.includes('duplicate') || regErrLower.includes('exists')) {
              const { network: existingAny } = await WiFiService.getNetworkBySSID(ssid.trim());
              if (existingAny && existingAny.owner_id === userId) {
                const { error: updErr2 } = await WiFiService.updateNetwork(existingAny.id, {
                  password_encrypted: password,
                  network_type: networkType,
                  latitude: finalLocation.latitude,
                  longitude: finalLocation.longitude,
                  security_protocol: 'WPA2',
                  description: description.trim() || undefined,
                } as any);
                if (updErr2) setSubmitError(updErr2);
                else didRegister = true;
              } else if (userId) {
                const altSsid = `${ssid.trim()}-${String(userId).slice(0,4)}`;
                const { network: createdAlt, error: regErrAlt } = await WiFiService.registerNetwork(
                  userId,
                  altSsid,
                  password,
                  finalLocation,
                  networkType,
                  'WPA2',
                  description.trim() || undefined,
                  undefined
                );
                if (regErrAlt) setSubmitError(regErrAlt);
                else if (createdAlt) {
                  const st = useWifiStore.getState();
                  st.getMyNetworks && (await st.getMyNetworks(userId));
                  try { await OfflineStorageService.setHasRegisteredNetwork(true); setHasRegistered(true); } catch {}
                  try {
                    if (finalLocation) {
                      await MapTileService.prepareOfflineMap(finalLocation, [14,15,16]);
                      try {
                        const { networks } = await WiFiService.getNearbyNetworks(finalLocation.latitude, finalLocation.longitude, 3);
                        if (networks && networks.length) {
                          await OfflineStorageService.saveWiFiData(networks, finalLocation);
                        }
                      } catch {}
                    }
                  } catch {}
                  try { setInviteCode(generateCode()); } catch {}
                  didRegister = true;
                }
              }
            }
          } else {
            didRegister = true;
          }
        }
      }
      } catch (e: any) {
        const msg = e?.message || 'Error al registrar la red';
        setSubmitError(msg);
        try { Alert.alert('Error', msg); } catch {}
      }
      const { getMyNetworks } = useWifiStore.getState() as any;
      if (userId) await getMyNetworks(userId);

    if (SUPABASE_CONFIGURED) {
      (async () => {
        try {
          const { network } = ssid.trim() ? await WiFiService.getNetworkBySSID(ssid.trim()) : { network: null } as any;
          const stWifi = useWifiStore.getState();
          const fallback = (stWifi.myNetworks || []).find((n: any) => n.ssid === ssid.trim());
          const target = network || fallback;
          if (target && target.id) {
            const code = generateCode();
            const hash = EncryptionService.hash(code);
            const existing = Array.isArray(target.tags) ? target.tags : [];
            const withoutHash = existing.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_hash:')) as string[];
            const withoutCode = withoutHash.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_code:')) as string[];
            const newTags = [...withoutCode, `register_hash:${hash}`, `register_code:${code}`];
            await WiFiService.updateNetwork(target.id, { tags: newTags, max_concurrent_users: 5 });
            try { await OfflineStorageService.setHasRegisteredNetwork(true); setHasRegistered(true); } catch {}
            setInviteCode(code);
            didRegister = true;
          }
        } catch {}
      })();
    }

    try { if (didRegister) { onSuccess(); } } catch {}
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };

  return (
    <View style={styles.container}>
      <View style={styles.appHeader}>
        <Text style={styles.brandText}>WiFi Emergencia</Text>
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Registrar Red Doméstica</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <StepProgress steps={["Usuario", "Suscripción", "Red"]} currentStep={3} doneSteps={doneSteps} />
      {submitError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{String(submitError).slice(0, 180)}</Text>
        </View>
      )}
      {inviteCode && (
        <View style={[styles.inviteBox, { marginHorizontal: 16 }]}>
          <Text style={styles.inviteTitle}>Código para habilitar hasta 5 usuarios</Text>
          <Text style={styles.inviteCode}>{inviteCode}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => { try { onSuccess(); } catch {} }}>
            <Text style={styles.primaryButtonText}>Continuar</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 220 : 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.errorBox}>
          <Text style={[styles.errorText, { fontSize: 15 }]}>Es necesario estar a no más de 2 metros del router o módem emisor de la red doméstica</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Ubicación</Text>
          {isGettingLocation ? (
            <View style={styles.locationLoading}>
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text style={styles.locationLoadingText}>Obteniendo ubicación...</Text>
            </View>
          ) : location ? (
            <View style={styles.locationInfo}>
              <Text style={styles.locationText}>📍 Latitud: {location.latitude.toFixed(6)}</Text>
              <Text style={styles.locationText}>📍 Longitud: {location.longitude.toFixed(6)}</Text>
              <Text style={styles.locationAccuracy}>Precisión: ±{location.accuracy.toFixed(0)} m</Text>
            </View>
          ) : (
            <View style={styles.locationLoading}>
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text style={styles.locationLoadingText}>Esperando geolocalización precisa (≤ 5 m)...</Text>
              <Text style={styles.locationLoadingText}>Activá ubicación precisa y salí a cielo abierto para mejorar.</Text>
              {Platform.OS === 'web' && (
                <Text style={styles.locationLoadingText}>Permiso del sitio: {locationPermState || 'desconocido'}</Text>
              )}
            </View>
          )}
          
        </View>

        {mapDlStatus && (
          <View style={styles.section}>
            <Text style={styles.label}>Mapa de ciudad</Text>
            {mapDlStatus.inProgress ? (
              <View style={styles.locationLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.locationLoadingText}>
                  Descargando mapa... {Math.floor(((mapDlStatus.downloaded + mapDlStatus.failed) / Math.max(1, mapDlStatus.total)) * 100)}%
                </Text>
              </View>
            ) : (
              <Text style={styles.locationLoadingText}>
                {mapDlStatus.total > 0 ? 'Mapa offline listo' : 'Mapa offline no descargado'}
              </Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Nombre de la red (SSID) *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ingresá el nombre de la red WiFi"
            value={ssid}
            onChangeText={setSsid}
            editable={!isLoading}
            autoCapitalize="none"
          />
        </View>


        <View style={styles.section}>
          <Text style={styles.label}>Contraseña *</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Ingresá la contraseña de la red WiFi"
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.showPasswordButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.showPasswordText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Confirmar contraseña *</Text>
          <TextInput
            style={styles.input}
            placeholder="Confirmá la contraseña de la red WiFi"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isLoading}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
        </View>

        

        


        

        

        

        

        
      </ScrollView>
      <View style={styles.footerBar}>
        <TouchableOpacity
          style={[
            styles.registerButton,
            styles.footerButton,
            (
              !Boolean(ssid.trim()) ||
              !Boolean(password.trim()) ||
              password !== confirmPassword ||
              !location ||
              !location.accuracy ||
              location.accuracy > 5 ||
              isGettingLocation
            ) && styles.buttonDisabled
          ]}
          onPress={handleSubmit}
          disabled={
            !Boolean(ssid.trim()) ||
            !Boolean(password.trim()) ||
            password !== confirmPassword ||
            !location ||
            !location.accuracy ||
            location.accuracy > 5 ||
            isLoading ||
            isGettingLocation
          }
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.registerButtonText}>Registrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appHeader: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 18,
    color: '#666',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  coordInput: {
    flex: 1,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 60,
  },
  showPasswordButton: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  showPasswordText: {
    color: Colors.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  locationLoadingText: {
    marginLeft: 8,
    color: Colors.primaryDark,
    fontSize: 14,
  },
  locationInfo: {
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#2e7d32',
    marginBottom: 4,
  },
  locationAccuracy: {
    fontSize: 12,
    color: '#66bb6a',
    marginTop: 4,
  },
  refreshLocationButton: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  refreshLocationText: {
    color: Colors.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },
  locationInfoText: {
    color: '#333',
    fontSize: 13,
    flex: 1,
  },
  infoBox: {
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#856404',
    marginBottom: 4,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#e53935',
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    fontWeight: '600',
  },
  registerButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inviteBox: {
    padding: 16,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    marginTop: 12,
  },
  inviteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryDark,
    marginBottom: 8,
  },
  inviteCode: {
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: Colors.primaryDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6
  },
  footerBar: { position: 'absolute', left: 0, right: 0, bottom: Platform.OS === 'android' ? 48 : 0, padding: 12, backgroundColor: 'transparent' },
  footerButton: { alignSelf: 'center', minWidth: 220 }
});
