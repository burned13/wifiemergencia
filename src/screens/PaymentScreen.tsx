import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Alert, ScrollView, Platform } from 'react-native';
import { SUPABASE_CONFIGURED } from '../config/supabase';
import { Colors } from '../theme/colors';
import { StepProgress } from '../components/StepProgress';
import { useAuthStore } from '../contexts/useAuthStore';
import { PaymentService } from '../services/paymentService';
import { OfflineStorageService } from '../utils/offlineStorage';
import { PaymentTransaction, UserSubscription } from '../types';
import { useWifiStore } from '../contexts/useWifiStore';

interface PaymentScreenProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({ onClose, onSuccess }) => {
  const { user, isAuthenticated } = useAuthStore() as any;
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [hasPayments, setHasPayments] = useState(false);
  const [hasRegistered, setHasRegistered] = useState(false);
  const { myNetworks } = useWifiStore() as any;

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (!SUPABASE_CONFIGURED) {
        setSubscription(null);
        setTransactions([]);
        setLoading(false);
        return;
      }
      const { subscription } = await PaymentService.getSubscription(user.id);
      setSubscription(subscription || null);
      const { transactions } = await PaymentService.getTransactionHistory(user.id, 20);
      setTransactions(transactions);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const paid = await OfflineStorageService.getHasCompletedPayments();
        const reg = await OfflineStorageService.getHasRegisteredNetwork();
        setHasPayments(!!paid);
        setHasRegistered(!!reg);
      } catch {}
    })();
  }, [user?.id]);

  useEffect(() => {
    try {
      if (!SUPABASE_CONFIGURED) {
        setHasPayments(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const hasAny = Array.isArray(myNetworks) && myNetworks.length > 0;
      if (hasAny) setHasRegistered(true);
    } catch {}
  }, [myNetworks]);

  const doneSteps = [true, false, false] as boolean[];
  const computeCurrentStep = () => 2;

  const handlePurchase = async (
    type: 'initial_download' | 'premium_upgrade',
    amount: number
  ) => {
    if (!user) {
      Alert.alert('Sesión requerida', 'Inicia sesión para realizar compras');
      return;
    }
    setLoading(true);
    try {
      const { transaction, clientSecret, error } = await PaymentService.initiatePayment(
        user.id,
        amount,
        'USD',
        type
      );
      if (error || !transaction) {
        Alert.alert('Error', error || 'No se pudo iniciar el pago');
        setLoading(false);
        return;
      }
      const { transaction: confirmed, error: confErr } = await PaymentService.confirmPayment(
        transaction.id,
        clientSecret || `intent_${transaction.id}`
      );
      if (confErr || !confirmed) {
        Alert.alert('Error', confErr || 'No se pudo confirmar el pago');
        setLoading(false);
        return;
      }
      if (type === 'premium_upgrade') {
        await PaymentService.createSubscription(user.id, 'premium', amount);
      }
      await load();
      Alert.alert('Éxito', 'Transacción completada');
      try { await OfflineStorageService.setHasCompletedPayments(true); } catch {}
      setHasPayments(true);
      try { onSuccess?.(); } catch {}
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Fallo en la compra');
    }
    setLoading(false);
  };

  

  return (
    <View style={styles.container}>
      <View style={styles.appHeader}>
        <Text style={styles.brandText}>WiFi Emergencia</Text>
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Pagos y Suscripción</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <StepProgress steps={["Usuario", "Suscripción", "Red"]} currentStep={computeCurrentStep()} doneSteps={doneSteps} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 96 : 48 }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado de suscripción</Text>
          {loading ? (
            <ActivityIndicator color="#4CAF50" />
          ) : subscription ? (
            <View>
              <Text style={styles.statRow}>Tipo: {subscription.subscription_type}</Text>
              <Text style={styles.statRow}>
                Expira: {subscription.expiration_date ? new Date(subscription.expiration_date).toLocaleDateString() : 'Nunca'}
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>Sin suscripción activa</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Comprar</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => handlePurchase('initial_download', 1)}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Descarga inicial $1</Text>}
            </TouchableOpacity>
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: '#4CAF50' }]}
              onPress={() => handlePurchase('premium_upgrade', 2.5)}
              disabled={loading}
            >
              <Text style={[styles.secondaryButtonText, { color: '#4CAF50' }]}>Mejorar a Premium $2.50/mes</Text>
            </TouchableOpacity>
          </View>
        </View>

        
      </ScrollView>

      <View style={styles.footerBar}>
        <TouchableOpacity
          style={[styles.primaryButton, styles.footerButton]}
          onPress={() => { try { if (SUPABASE_CONFIGURED ? hasPayments : true) { onSuccess?.(); } else { Alert.alert('Pago requerido', 'Completá la compra para continuar'); } } catch {} }}
          disabled={SUPABASE_CONFIGURED ? !hasPayments : false}
        >
          <Text style={styles.primaryButtonText}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  appHeader: { backgroundColor: '#4CAF50', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 18, color: '#666' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, margin: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 12 },
  statRow: { fontSize: 13, color: '#333', marginBottom: 6 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 13 },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  primaryButton: { backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondaryButton: { borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  secondaryButtonText: { color: '#000', fontSize: 14, fontWeight: '600' },
  
  brandText: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 2 },
  footerBar: { position: 'absolute', left: 0, right: 0, bottom: Platform.OS === 'android' ? 48 : 0, padding: 12, backgroundColor: 'transparent' },
  footerButton: { alignSelf: 'center', minWidth: 220 }
});
