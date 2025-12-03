import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  Linking,
} from 'react-native';
import { Colors } from '../theme/colors';
import { useAuthStore } from '../contexts/useAuthStore';
import { useWifiStore } from '../contexts/useWifiStore';
import { WiFiService } from '../services/wifiService';
import { EncryptionService } from '../utils/encryption';
import { WiFiNetwork } from '../types';
 

interface HomeScreenProps {
  onNavigate: (screen: string, data?: any) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  const { user } = useAuthStore();
  const { myNetworks, isLoading: wifiLoading, getMyNetworks } = useWifiStore();
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  
  const [showMenu, setShowMenu] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [handledLinkCode, setHandledLinkCode] = useState(false);
  

  useEffect(() => {
    (async () => {
      if (!user) return;
      await getMyNetworks(user.id);
    })();
  }, [user, getMyNetworks]);

  useEffect(() => {
    try {
      const params = new URLSearchParams((typeof window !== 'undefined' ? window.location.search : '') || '');
      const c = params.get('code');
      if (c && !handledLinkCode) {
        setCodeInput(c);
        setShowCodeModal(true);
        setTimeout(() => {
          try {
            const code = c.trim().toUpperCase();
            setShowCodeModal(false);
            setCodeInput('');
            onNavigate('Map');
            (async () => {
              try {
                if (!user) return;
                const { network, error } = await WiFiService.getNetworkByRegisterCode(code);
                if (error || !network) { return; }
                const tags = Array.isArray(network.tags) ? network.tags : [];
                const hashTag = tags.find((t: any) => typeof t === 'string' && String(t).startsWith('register_hash:')) as string | undefined;
                const requiredHash = hashTag ? String(hashTag).split(':')[1] : '';
                const registered = tags.filter((t: any) => typeof t === 'string' && String(t).startsWith('register_user:')) as string[];
                if (registered.length >= 5) { return; }
                const codeHash = EncryptionService.hash(code);
                if (!requiredHash || codeHash !== requiredHash) { return; }
                const filtered = tags.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_user:')) as string[];
                const newTags = [...filtered, `register_user:${user.id}`];
                const { error: updErr } = await WiFiService.updateNetwork(network.id, { tags: newTags });
                if (!updErr) { try { await getMyNetworks(user.id); } catch {} }
              } catch {}
            })();
          } catch {}
        }, 300);
        setHandledLinkCode(true);
      }
    } catch {}
  }, [onNavigate, user, getMyNetworks, handledLinkCode]);

  

  

  

  const renderNetworkItem = ({ item }: { item: WiFiNetwork }) => {
    const seatsUsed = (Array.isArray(item.tags) ? item.tags : []).filter((t: any) => typeof t === 'string' && String(t).startsWith('register_user:')).length;
    const handleInvite = async () => {
      try {
        const code = generateCode();
        const hash = EncryptionService.hash(code);
        const existing = Array.isArray(item.tags) ? item.tags : [];
        const filtered = existing.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_hash:') && !String(t).startsWith('register_code:')) as string[];
        const newTags = [...filtered, `register_hash:${hash}`, `register_code:${code}`];
        await WiFiService.updateNetwork(item.id, { tags: newTags, max_concurrent_users: 5 });
        Alert.alert('Código de invitación', code);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'No se pudo generar el código');
      }
    };
    return (
      <TouchableOpacity
        style={styles.networkItem}
        onPress={() => onNavigate('detail', item)}
      >
        <View style={styles.networkItemHeader}>
          <Text style={styles.networkItemSSID} numberOfLines={1}>
            {item.ssid}
          </Text>
          <Text style={styles.networkItemType}>{item.network_type}</Text>
        </View>
        <View style={styles.networkItemStats}>
          <Text style={styles.networkItemStat}>
            👥 {item.current_users}/{item.max_concurrent_users}
          </Text>
          <Text style={styles.networkItemStat}>📶 {item.signal_strength}%</Text>
        </View>
        {item.network_type === 'home' && (
          <View style={styles.inviteRow}>
            <Text style={styles.inviteInfo}>Cupos usados: {seatsUsed}/5</Text>
            <TouchableOpacity onPress={handleInvite}>
              <Text style={styles.inviteButton}>Generar código</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brandText}>WiFi Emergencia</Text>
          <Text style={styles.welcomeText}>Bienvenido</Text>
          <Text style={styles.usernameText}>{user?.username || 'Usuario'}</Text>
        </View>
        <View />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        

        <View style={styles.card}>
          <View style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: Colors.primary }]}
              onPress={() => onNavigate('register')}
            >
              <Text style={styles.secondaryButtonText}>Registrar red</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: Colors.primaryDark }]}
              onPress={() => { setCodeInput(''); setShowCodeModal(true); }}
            >
              <Text style={[styles.secondaryButtonText, { color: Colors.primaryDark }]}>Ingresar por código</Text>
            </TouchableOpacity>
          </View>

          {wifiLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : myNetworks.length > 0 ? (
            <FlatList
              data={myNetworks}
              renderItem={renderNetworkItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          ) : (
            <Text style={styles.emptyText}>Todavía no registraste tu red</Text>
          )}
        </View>

        

        

        
      </ScrollView>
      {showCodeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Ingresar por código</Text>
            <Text style={styles.modalHint}>Ingresá el código de invitación para habilitar tu usuario.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Código"
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#2E7D32' }]}
                onPress={async () => {
                  if (codeLoading) return;
                  const code = codeInput.trim().toUpperCase();
                  if (!code) { Alert.alert('Error', 'Ingresá un código'); return; }
                  setCodeLoading(true);
                  // Navegar primero para no bloquear
                  setShowCodeModal(false);
                  setCodeInput('');
                  try { Alert.alert('Procesando', 'Navegando al mapa...'); } catch {}
                  try { onNavigate('Map'); } catch {}
                  try { setTimeout(() => { try { onNavigate('Map'); } catch {} }, 300); } catch {}
                  // Validar y registrar en segundo plano
                  (async () => {
                    try {
                      if (!user) { Alert.alert('Iniciá sesión', 'Ingresá a tu cuenta para continuar'); return; }
                      const { network, error } = await WiFiService.getNetworkByRegisterCode(code);
                      if (error || !network) { Alert.alert('Código inválido', error || 'No se encontró la red para este código'); return; }
                      const tags = Array.isArray(network.tags) ? network.tags : [];
                      const hashTag = tags.find((t: any) => typeof t === 'string' && String(t).startsWith('register_hash:')) as string | undefined;
                      const requiredHash = hashTag ? String(hashTag).split(':')[1] : '';
                      const registered = tags.filter((t: any) => typeof t === 'string' && String(t).startsWith('register_user:')) as string[];
                      if (registered.length >= 5) { Alert.alert('Cupo agotado', 'Esta red alcanzó el límite de 5 registros'); return; }
                      const codeHash = EncryptionService.hash(code);
                      if (!requiredHash || codeHash !== requiredHash) { Alert.alert('Código inválido', 'El código no coincide'); return; }
                      const filtered = tags.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_user:')) as string[];
                      const newTags = [...filtered, `register_user:${user.id}`];
                      const { error: updErr } = await WiFiService.updateNetwork(network.id, { tags: newTags });
                      if (updErr) { Alert.alert('Error', updErr); return; }
                      try { await getMyNetworks(user.id); } catch {}
                      try { Alert.alert('Listo', 'Registro habilitado con código'); } catch {}
                    } catch (e: any) {
                      Alert.alert('Error', e?.message || 'No se pudo registrar por código');
                    }
                  })();
                  setCodeLoading(false);
                }}
              >
                {codeLoading ? <ActivityIndicator color={Colors.surface} /> : <Text style={styles.modalButtonText}>Ingresar</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.neutral }]}
                onPress={() => { setShowCodeModal(false); setCodeInput(''); }}
              >
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      {showSupportModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Soporte</Text>
            <Text style={styles.modalHint}>Elegí cómo querés contactarnos.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.primaryDark }]}
                onPress={() => {
                  try { Linking.openURL('mailto:soporte@wififree.global?subject=Ayuda'); } catch {}
                }}
              >
                <Text style={styles.modalButtonText}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.whatsapp }]}
                onPress={() => {
                  try { Linking.openURL('https://wa.me/5491112345678?text=Hola,%20necesito%20ayuda'); } catch {}
                }}
              >
                <Text style={styles.modalButtonText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.modalButtons, { marginTop: 8 }]}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: Colors.neutral }]}
                onPress={() => setShowSupportModal(false)}
              >
                <Text style={styles.modalButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      {false}
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
  welcomeText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  usernameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.surface,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.surface,
    marginBottom: 2,
  },
  signOutButton: {
    color: Colors.surface,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  menuOverlay: {
    position: 'absolute',
    right: 12,
    top: 12,
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  addButton: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '90%',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.surface,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalButtonText: {
    color: Colors.surface,
    fontSize: 15,
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  networkItem: {
    paddingVertical: 12,
  },
  networkItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  networkItemSSID: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  networkItemType: {
    fontSize: 11,
    backgroundColor: Colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    color: Colors.textSecondary,
  },
  networkItemStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  networkItemStat: {
    fontSize: 12,
    color: Colors.muted,
  },
  inviteRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inviteInfo: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  inviteButton: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.muted,
    fontSize: 13,
    paddingVertical: 12,
  },
  offlineText: {
    fontSize: 12,
    color: Colors.muted,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
