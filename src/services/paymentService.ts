import { supabase } from '../config/supabase';
import { PaymentTransaction, UserSubscription } from '../types';

export const PaymentService = {
  initiatePayment: async (
    userId: string,
    amount: number = 1,
    currency: string = 'USD',
    transactionType: 'initial_download' | 'premium_upgrade' | 'refund' = 'initial_download'
  ): Promise<{ transaction: PaymentTransaction | null; clientSecret: string | null; error: string | null }> => {
    try {
      const { data: transaction, error: dbError } = await supabase
        .from('payment_transactions')
        .insert([
          {
            user_id: userId,
            amount,
            currency,
            status: 'pending',
            transaction_type: transactionType,
            metadata: {
              timestamp: new Date().toISOString(),
            },
          },
        ])
        .select()
        .maybeSingle();

      if (dbError) {
        return { transaction: null, clientSecret: null, error: dbError.message };
      }

      return {
        transaction: transaction || null,
        clientSecret: transaction?.id,
        error: null,
      };
    } catch (error: any) {
      return {
        transaction: null,
        clientSecret: null,
        error: error.message,
      };
    }
  },

  confirmPayment: async (
    transactionId: string,
    stripePaymentIntentId: string
  ): Promise<{ transaction: PaymentTransaction | null; error: string | null }> => {
    try {
      const { data: transaction, error } = await supabase
        .from('payment_transactions')
        .update({
          status: 'completed',
          stripe_payment_intent_id: stripePaymentIntentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId)
        .select()
        .maybeSingle();

      if (!error && transaction) {
        await supabase
          .from('users')
          .update({
            downloads_remaining: 5,
            total_downloads: 1,
          })
          .eq('id', transaction.user_id);
      }

      return { transaction: transaction || null, error: error?.message || null };
    } catch (error: any) {
      return { transaction: null, error: error.message };
    }
  },

  createSubscription: async (
    userId: string,
    subscriptionType: 'free' | 'premium' | 'lifetime' = 'free',
    amountPaid?: number
  ): Promise<{ subscription: UserSubscription | null; error: string | null }> => {
    try {
      const expirationDate =
        subscriptionType === 'lifetime'
          ? null
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('user_subscriptions')
        .insert([
          {
            user_id: userId,
            subscription_type: subscriptionType,
            payment_status: 'completed',
            amount_paid: amountPaid || 0,
            purchase_date: new Date().toISOString(),
            expiration_date: expirationDate,
          },
        ])
        .select()
        .maybeSingle();

      return { subscription: data || null, error: error?.message || null };
    } catch (error: any) {
      return { subscription: null, error: error.message };
    }
  },

  getSubscription: async (userId: string): Promise<{ subscription: UserSubscription | null; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return { subscription: data || null, error: error?.message || null };
    } catch (error: any) {
      return { subscription: null, error: error.message };
    }
  },

  getTransactionHistory: async (userId: string, limit: number = 50): Promise<{ transactions: PaymentTransaction[]; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return { transactions: data || [], error: error?.message || null };
    } catch (error: any) {
      return { transactions: [], error: error.message };
    }
  },

  processRefund: async (transactionId: string): Promise<{ transaction: PaymentTransaction | null; error: string | null }> => {
    try {
      const { data: originalTransaction, error: fetchError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('id', transactionId)
        .maybeSingle();

      if (fetchError || !originalTransaction) {
        return { transaction: null, error: fetchError?.message || 'Transaction not found' };
      }

      const { data: refundTransaction, error: insertError } = await supabase
        .from('payment_transactions')
        .insert([
          {
            user_id: originalTransaction.user_id,
            amount: -originalTransaction.amount,
            currency: originalTransaction.currency,
            status: 'completed',
            transaction_type: 'refund',
            stripe_payment_intent_id: `refund_${transactionId}`,
          },
        ])
        .select()
        .maybeSingle();

      if (!insertError) {
        await supabase
          .from('payment_transactions')
          .update({ status: 'refunded' })
          .eq('id', transactionId);
      }

      return {
        transaction: refundTransaction || null,
        error: insertError?.message || null,
      };
    } catch (error: any) {
      return { transaction: null, error: error.message };
    }
  },

  validateSubscriptionStatus: async (userId: string): Promise<{ isValid: boolean; subscription: UserSubscription | null; error: string | null }> => {
    try {
      const { subscription, error } = await PaymentService.getSubscription(userId);

      if (error || !subscription) {
        return { isValid: false, subscription: null, error };
      }

      if (
        subscription.expiration_date &&
        new Date(subscription.expiration_date) < new Date()
      ) {
        return { isValid: false, subscription, error: 'Subscription expired' };
      }

      return { isValid: true, subscription, error: null };
    } catch (error: any) {
      return { isValid: false, subscription: null, error: error.message };
    }
  },

  hasInitialDownloadCompleted: async (userId: string): Promise<{ done: boolean; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('transaction_type', 'initial_download')
        .eq('status', 'completed')
        .limit(1);
      if (error) return { done: false, error: error.message };
      return { done: !!(data && data.length), error: null };
    } catch (error: any) {
      return { done: false, error: error.message };
    }
  },

  isPremiumActive: async (userId: string): Promise<{ active: boolean; error: string | null }> => {
    try {
      const { subscription, error } = await PaymentService.getSubscription(userId);
      if (error) return { active: false, error };
      if (!subscription) return { active: false, error: null };
      const isPremium = subscription.subscription_type === 'premium';
      const notExpired = !subscription.expiration_date || new Date(subscription.expiration_date) >= new Date();
      return { active: isPremium && notExpired, error: null };
    } catch (error: any) {
      return { active: false, error: error.message };
    }
  },
};
