import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import React, { useEffect, useState } from 'react';
import { HomeScreen } from './src/screens/HomeScreen';
import { RegisterNetworkScreen } from './src/screens/RegisterNetworkScreen';
import { MapScreen } from './src/screens/MapScreen';
import { PaymentScreen } from './src/screens/PaymentScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { NetworksScreen } from './src/screens/NetworksScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { View, Alert, Text } from 'react-native';
import { useAuthStore } from './src/contexts/useAuthStore';
import { useWifiStore } from './src/contexts/useWifiStore';
import { Platform } from 'react-native';
import { OfflineStorageService } from './src/utils/offlineStorage';
import { PaymentService } from './src/services/paymentService';
import { SUPABASE_CONFIGURED } from './src/config/supabase';

const readForcedScreen = () => {
  try {
    const href = (typeof window !== 'undefined' && window.location && window.location.href) || '';
    const url = new URL(href);
    const search = new URLSearchParams(url.search || '');
    const hash = new URLSearchParams((url.hash || '').replace(/^#/, '').replace(/^\?/, '').trim());
    const val = (search.get('screen') || hash.get('screen') || search.get('s') || hash.get('s') || '').trim();
    const normalized = (val || '').toLowerCase();
    if (['payments', 'map', 'profile', 'register', 'auth'].includes(normalized)) {
      const cap = normalized === 'payments'
        ? 'Payments'
        : normalized === 'map'
        ? 'Map'
        : normalized === 'profile'
        ? 'Profile'
        : normalized === 'auth'
        ? 'auth'
        : 'register';
      return cap;
    }
  } catch {}
  return null;
};

function App() {
  const initialForced = readForcedScreen();
  const [forced, setForced] = useState(!!initialForced);
  const [screen, setScreen] = useState(initialForced || 'auth');
  const [payload, setPayload] = useState(null);
  const onNavigate = (name, data) => { setForced(false); setScreen(name); setPayload(data || null); };
  const { isAuthenticated } = useAuthStore();
  const { getMyNetworks } = useWifiStore();

  useEffect(() => {
    (async () => {
      try {
        const applied = await OfflineStorageService.getConfigBaselineApplied();
        if (!applied) {
          try { await OfflineStorageService.resetToDefault(); } catch {}
          try { await OfflineStorageService.setConfigBaselineApplied(true); } catch {}
        }
        if (typeof window !== 'undefined') {
          try { window.localStorage && window.localStorage.removeItem('dev_payments'); } catch {}
          try {
            const params = new URLSearchParams(window.location.search || '');
            const tiles = (params.get('tiles') || '').trim();
            const saved = await OfflineStorageService.getTileBaseUrl();
            if (tiles) {
              await OfflineStorageService.setTileBaseUrl(tiles);
            } else if (!saved && window.localStorage && window.localStorage.getItem('tile_base_url')) {
              await OfflineStorageService.setTileBaseUrl(String(window.localStorage.getItem('tile_base_url')));
            }
          } catch {}
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (forced) return;
      if (!isAuthenticated) {
        try { await useAuthStore.getState().getCurrentUser(); } catch {}
        if (!useAuthStore.getState().isAuthenticated) {
          setScreen('auth');
          return;
        }
      }
      if (!SUPABASE_CONFIGURED) {
        setScreen('Map');
        return;
      }
      try {
        if (Platform.OS === 'web') {
          const f = readForcedScreen();
          if (f) { setForced(true); setScreen(f); return; }
        }
      } catch {}
      try {
        const stAuth = useAuthStore.getState();
        const userId = stAuth.user?.id;
        let hasPaid = false;
        if (userId) {
          try {
            const { done } = await PaymentService.hasInitialDownloadCompleted(userId);
            hasPaid = !!done;
          } catch {}
        }
        
        let serverHomeCount = 0;
        if (userId && getMyNetworks) {
          try {
            await getMyNetworks(userId);
            const stWifi = useWifiStore.getState();
            const homes = (stWifi.myNetworks || []).filter((n) => n.network_type === 'home');
            serverHomeCount = homes.length;
          } catch {}
        }
        if (!hasPaid) {
          setScreen('Payments');
          return;
        }
        if (serverHomeCount <= 0) {
          onNavigate('register', { origin: 'App', mode: 'mandatory' });
          return;
        }
        try { await OfflineStorageService.setHasRegisteredNetwork(true); } catch {}
        setScreen('Map');
      } catch {
        setScreen('Payments');
      }
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    try {
      if (Platform.OS === 'web') {
        const f = readForcedScreen();
        if (f) { setForced(true); setScreen(f); }
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (screen === 'Profile') {
          try { await useAuthStore.getState().getCurrentUser(); } catch {}
          const userId = useAuthStore.getState().user?.id;
          if (userId) {
            try { await getMyNetworks?.(userId); } catch {}
          }
        } else if (screen === 'Networks') {
          try { await useAuthStore.getState().getCurrentUser(); } catch {}
          const userId = useAuthStore.getState().user?.id;
          if (userId) {
            try { await getMyNetworks?.(userId); } catch {}
          }
        }
      } catch {}
    })();
  }, [screen]);

  
  if (screen === 'auth') {
    return (
      <View style={{ flex: 1 }}>
        <AuthScreen onAuthSuccess={() => setScreen('Payments')} />
      </View>
    );
  }
  if (screen === 'Map') {
    return (
        <MapScreen
          onNetworkSelected={() => {}}
          onNavigateRegister={() => { onNavigate('register', { origin: 'Map', mode: 'optional' }); }}
          onNavigate={(name, data) => onNavigate(name, data)}
          skipRedirectOnce={payload && payload.skipRedirectOnce ? true : false}
        />
    );
  }
  if (screen === 'Payments') {
    return (
      <View style={{ flex: 1 }}>
        <PaymentScreen onClose={async () => { try { const cameFromMenu = (payload && payload.origin) === 'menu'; if (cameFromMenu) { setScreen('Map'); setPayload({ skipRedirectOnce: true }); return; } const userId = useAuthStore.getState().user?.id; if (userId) { const { done } = await PaymentService.hasInitialDownloadCompleted(userId); if (done) { setScreen('Map'); } else { setScreen('Payments'); } } else { setScreen('Payments'); } } catch { setScreen('Payments'); } }} onSuccess={async () => { try { await OfflineStorageService.setHasCompletedPayments(true); } catch {}; setScreen('register'); }} />
      </View>
    );
  }
  if (screen === 'Profile') {
    return (
      <View style={{ flex: 1 }}>
        <ProfileScreen onClose={() => setScreen('Map')} onNavigateRegister={() => onNavigate('register', { origin: 'Profile', mode: 'optional' })} />
      </View>
    );
  }
  if (screen === 'Networks') {
    return (
      <View style={{ flex: 1 }}>
        <NetworksScreen onClose={() => setScreen('Map')} onNavigateRegister={() => onNavigate('register', { origin: 'Networks', mode: 'optional' })} />
      </View>
    );
  }
  if (screen === 'register') {
    return (
      <View style={{ flex: 1 }}>
        <RegisterNetworkScreen onClose={async () => { try { const origin = (payload && payload.origin) || null; const mode = (payload && payload.mode) || 'mandatory'; const userId = useAuthStore.getState().user?.id; if (mode === 'mandatory') { if (userId) { const { getMyNetworks } = useWifiStore.getState(); await getMyNetworks(userId); const stWifi = useWifiStore.getState(); const homes = (stWifi.myNetworks || []).filter((n) => n.network_type === 'home'); if (homes.length > 0) { setScreen('Map'); } else { Alert.alert('Completá el registro', 'Debés registrar al menos una red para continuar'); onNavigate('register', { origin: origin || 'App', mode: 'mandatory' }); } } else { onNavigate('register', { origin: origin || 'App', mode: 'mandatory' }); } } else { if (origin === 'Networks') { setScreen('Networks'); } else { setScreen('Map'); } } } catch { setScreen('Map'); } }} onSuccess={async () => { try { const origin = (payload && payload.origin) || null; setScreen(origin === 'Networks' ? 'Networks' : 'Map'); } catch { setScreen('Map'); } }} />
      </View>
    );
  }
  return <HomeScreen onNavigate={onNavigate} />;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  componentDidCatch(error) {
    this.setState({ error });
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error || 'Error desconocido');
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, color: '#C62828', marginBottom: 8 }}>Ocurrió un error</Text>
          <Text style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>{msg}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

registerRootComponent(() => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
));
