import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { SUPABASE_CONFIGURED } from '../config/supabase';
import { useAuthStore } from '../contexts/useAuthStore';
import { useWifiStore } from '../contexts/useWifiStore';
import { OfflineStorageService } from '../utils/offlineStorage';
import { Colors } from '../theme/colors';

interface NetworksScreenProps {
  onClose: () => void;
  onNavigateRegister?: () => void;
}

export const NetworksScreen: React.FC<NetworksScreenProps> = ({ onClose, onNavigateRegister }) => {
  const { user } = useAuthStore();
  const { myNetworks, deleteNetwork, updateNetwork } = useWifiStore() as any;
  const [homeNetworks, setHomeNetworks] = useState<any[]>([]);
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);
  const [editSsid, setEditSsid] = useState('');
  const [editPassword, setEditPassword] = useState('');

  useEffect(() => {
    try {
      const list = (myNetworks || []).filter((n: any) => n.network_type === 'home');
      setHomeNetworks(list);
      if (list.length && !selectedNetworkId) {
        setSelectedNetworkId(list[0].id);
        setEditSsid(list[0].ssid || '');
      }
      try { OfflineStorageService.setHasRegisteredNetwork(list.length > 0).catch(() => {}); } catch {}
    } catch {}
  }, [myNetworks, selectedNetworkId]);

  const handleDeleteNetwork = async () => {
    try {
      const target = homeNetworks.find((n) => n.id === selectedNetworkId) || null;
      if (!target) {
        Alert.alert('Sin red', 'Seleccioná una red doméstica');
        return;
      }
      if ((homeNetworks || []).length <= 1) {
        Alert.alert('Restricción', 'Debe quedar al menos una red doméstica');
        return;
      }
      if (Platform.OS === 'web') {
        const ok = typeof window !== 'undefined' ? window.confirm(`¿Eliminar "${target.ssid}"?`) : true;
        if (!ok) return;
        if (!SUPABASE_CONFIGURED) {
          try { await OfflineStorageService.removePendingNetworkById(target.id); } catch {}
          useWifiStore.setState((prev: any) => ({ myNetworks: (prev.myNetworks || []).filter((n: any) => n.id !== target.id) }));
          setHomeNetworks((prev) => prev.filter((n) => n.id !== target.id));
          setSelectedNetworkId((prev) => {
            const next = homeNetworks.filter((n) => n.id !== target.id);
            return next.length ? next[0].id : null;
          });
        } else {
          await deleteNetwork(target.id);
        }
        const stAfter = useWifiStore.getState() as any;
        if (stAfter.error) {
          Alert.alert('Error', String(stAfter.error));
          return;
        }
        if (SUPABASE_CONFIGURED) {
          try {
            const uid = useAuthStore.getState().user?.id;
            if (uid) {
              const st = useWifiStore.getState();
              st.getMyNetworks && (await st.getMyNetworks(uid));
              const list = (useWifiStore.getState().myNetworks || []).filter((n: any) => n.network_type === 'home');
              setHomeNetworks(list);
              setSelectedNetworkId(list.length ? list[0].id : null);
            }
          } catch {}
        }
        try { const remaining = homeNetworks.filter((n) => n.id !== target.id); if (remaining.length === 0) await OfflineStorageService.setHasRegisteredNetwork(false); } catch {}
        Alert.alert('Eliminada', 'Red doméstica eliminada');
      } else {
        Alert.alert('Eliminar red', `¿Eliminar "${target.ssid}"?`, [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: async () => {
              if (!SUPABASE_CONFIGURED) {
                try { await OfflineStorageService.removePendingNetworkById(target.id); } catch {}
                useWifiStore.setState((prev: any) => ({ myNetworks: (prev.myNetworks || []).filter((n: any) => n.id !== target.id) }));
                setHomeNetworks((prev) => prev.filter((n) => n.id !== target.id));
                setSelectedNetworkId((prev) => {
                  const next = homeNetworks.filter((n) => n.id !== target.id);
                  return next.length ? next[0].id : null;
                });
              } else {
                await deleteNetwork(target.id);
              }
              const stAfter = useWifiStore.getState() as any;
              if (stAfter.error) {
                Alert.alert('Error', String(stAfter.error));
                return;
              }
              if (SUPABASE_CONFIGURED) {
                try {
                  const uid = useAuthStore.getState().user?.id;
                  if (uid) {
                    const st = useWifiStore.getState();
                    st.getMyNetworks && (await st.getMyNetworks(uid));
                    const list = (useWifiStore.getState().myNetworks || []).filter((n: any) => n.network_type === 'home');
                    setHomeNetworks(list);
                    setSelectedNetworkId(list.length ? list[0].id : null);
                  }
                } catch {}
              }
              try { const remaining = homeNetworks.filter((n) => n.id !== target.id); if (remaining.length === 0) await OfflineStorageService.setHasRegisteredNetwork(false); } catch {}
              Alert.alert('Eliminada', 'Red doméstica eliminada');
            },
          },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo eliminar la red');
    }
  };

  const renderSelectedSummary = () => {
    const target = homeNetworks.find((n) => n.id === selectedNetworkId) || homeNetworks[0];
    if (!target) return null;
    const users = (target.tags || []).filter((t: any) => typeof t === 'string' && String(t).startsWith('register_user:')) as string[];
    const codeTag = (target.tags || []).find((t: any) => typeof t === 'string' && String(t).startsWith('register_code:')) as string | undefined;
    const code = codeTag ? String(codeTag).split(':')[1] : '';
    return (
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.label}>Usuarios habilitados</Text>
          <Text style={styles.label}>{users.length}/5</Text>
        </View>
        <View style={styles.sectionRow}>
          <TouchableOpacity style={styles.button} onPress={() => { try { Alert.alert('Código', code || 'Sin código'); } catch {} }}>
            <Text style={styles.buttonText}>Ver código</Text>
          </TouchableOpacity>
          {onNavigateRegister && (
            <TouchableOpacity style={[styles.button, { backgroundColor: '#4CAF50' }]} onPress={() => onNavigateRegister()}>
              <Text style={styles.buttonText}>Agregar red</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Nombre SSID</Text>
          <View style={styles.sectionRow}>
            <Text style={styles.input}>{editSsid}</Text>
            <TouchableOpacity style={styles.button} onPress={() => { try { const next = prompt('Nuevo SSID', editSsid || target.ssid || ''); if (typeof next === 'string') setEditSsid(next); } catch {} }}>
              <Text style={styles.buttonText}>Editar</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.sectionRow}>
            <Text style={styles.input}>{editPassword ? '••••••••' : ''}</Text>
            <TouchableOpacity style={styles.button} onPress={() => { try { const next = prompt('Nueva contraseña', ''); if (typeof next === 'string') setEditPassword(next); } catch {} }}>
              <Text style={styles.buttonText}>Editar</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.button} onPress={async () => {
            try {
              const updates: any = {};
              if (editSsid && editSsid !== target.ssid) updates.ssid = editSsid;
              if (editPassword.trim()) updates.password_encrypted = editPassword.trim();
              if (Object.keys(updates).length === 0) { Alert.alert('Sin cambios', 'No hay cambios para guardar'); return; }
              await updateNetwork(target.id, updates);
              Alert.alert('Actualizado', 'Red doméstica actualizada');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'No se pudo actualizar la red');
            }
          }}>
            <Text style={styles.buttonText}>Guardar cambios</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.button, { backgroundColor: Colors.accentRed, marginTop: 8 }]} onPress={handleDeleteNetwork}>
          <Text style={styles.buttonText}>Eliminar red</Text>
        </TouchableOpacity>
        
        <View style={{ marginTop: 8 }}>
          {users.length ? users.map((uTag, idx) => (
            <View key={idx} style={styles.sectionRow}>
              <Text style={styles.input}>{uTag.replace('register_user:', '')}</Text>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: Colors.accentRed }]}
                onPress={async () => {
                  try {
                    const remaining = (target.tags || []).filter((t: any) => typeof t === 'string' && t !== uTag);
                    await updateNetwork(target.id, { tags: remaining as any });
                    setHomeNetworks((prev) => prev.map((n) => (n.id === target.id ? { ...n, tags: remaining } : n)));
                    Alert.alert('Listo', 'Registro revocado');
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'No se pudo revocar');
                  }
                }}
              >
                <Text style={styles.buttonText}>Revocar</Text>
              </TouchableOpacity>
            </View>
          )) : (
            <Text style={styles.label}>No hay usuarios registrados</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.appHeader}>
        <Text style={styles.brandText}>WiFi Emergencia</Text>
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Redes</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mis redes</Text>
          {homeNetworks.length ? (
            <>
              <View style={styles.section}>
                <Text style={styles.label}>Seleccioná red</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {homeNetworks.map((n) => (
                    <TouchableOpacity
                      key={n.id}
                      style={[styles.chip, selectedNetworkId === n.id && styles.chipActive]}
                      onPress={() => { setSelectedNetworkId(n.id); setEditSsid(n.ssid || ''); setEditPassword(''); }}
                    >
                      <Text style={styles.chipText}>{n.ssid}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {renderSelectedSummary()}
            </>
          ) : (
            <Text style={styles.emptyText}>No tenés redes domésticas registradas</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  appHeader: { height: 48, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.muted },
  brandText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text },
  closeButton: { paddingHorizontal: 12, paddingVertical: 8 },
  closeText: { fontSize: 18, color: Colors.text },
  content: { padding: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.muted },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: Colors.text },
  section: { marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 14, color: Colors.text },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.muted, marginRight: 8 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.text },
  button: { backgroundColor: Colors.primary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6 },
  buttonText: { color: Colors.surface, fontWeight: '600' },
  emptyText: { color: Colors.text, opacity: 0.6 },
  input: { color: Colors.text, flex: 1 },
});
