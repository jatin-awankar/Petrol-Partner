'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { fetchProfileId } from '@/lib/fetchProfileId';

export function useWallet() {
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [profileId, setProfileId] = useState<string | null>(null);

  // Fetch profile ID once
  useEffect(() => {
    const getProfileId = async () => {
      const id = await fetchProfileId();
      setProfileId(id);
    };
    getProfileId();
    console.log('Fetching profile ID...', profileId);
  }, [profileId]);

  // Fetch wallet
  const fetchWallet = async () => {
    if (!profileId) return;
    console.log('Fetching wallet for profile ID:', profileId);

    try {
      setLoading(true);
      const { data, error } = await supabaseClient
        .from('user_wallets')
        .select('*')
        .eq('user_id', profileId)
        .maybeSingle();
      console.log('Supabase response:', { data, error });
      if (error) throw error;
      setWallet(data as UserWallet);
      console.log('Wallet data:', data);
    } catch (error: unknown) {
      toast.error('Error fetching wallet', {
        description: error instanceof Error ? error.message : 'Something went wrong fetching wallet.',
      });
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch transactions
  const fetchTransactions = async () => {
    if (!profileId) return;

    try {
      const { data, error } = await supabaseClient
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setTransactions((data || []) as WalletTransaction[]);
    } catch (error: any) {
      toast.error('Error fetching transactions', {
        description: error.message || 'Something went wrong fetching transactions.',
      });
    }
  };

  // Add money
  const addMoney = async (amount: number) => {
    if (!profileId) {
      toast.error('Authentication required', {
        description: 'Please sign in to add money.',
      });
      return { error: new Error('User not authenticated') };
    }

    try {
      // Insert credit transaction
      const { error: transactionError } = await supabaseClient
        .from('wallet_transactions')
        .insert([
          {
            user_id: profileId,
            amount,
            transaction_type: 'credit',
            description: `Added money to wallet`,
            status: 'completed',
          },
        ]);

      if (transactionError) throw transactionError;

      // Update wallet balance
      const { error: walletError } = await supabaseClient
        .from('user_wallets')
        .update({
          balance: (wallet?.balance || 0) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', profileId);

      if (walletError) throw walletError;

      toast.success('Money added successfully!', {
        description: `₹${amount} has been added to your wallet.`,
      });

      // Re-fetch
      await fetchWallet();
      await fetchTransactions();

      return { error: null };
    } catch (error: any) {
      toast.error('Failed to add money', {
        description: error.message || 'Could not add money to wallet.',
      });
      return { error };
    }
  };

  // Auto-fetch wallet and transactions when profileId is available
  useEffect(() => {
    if (profileId) {
      fetchWallet();
      fetchTransactions();
    }
  }, [profileId]);

  return {
    wallet,
    transactions,
    loading,
    fetchWallet,
    fetchTransactions,
    addMoney,
  };
}
