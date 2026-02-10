import { useState, useCallback, useEffect } from 'react';

export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: number | null;
  chainName: string | null;
  balance: string | null;
  connecting: boolean;
  error: string | null;
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  5: 'Goerli',
  10: 'Optimism',
  56: 'BNB Chain',
  100: 'Gnosis',
  137: 'Polygon',
  250: 'Fantom',
  324: 'zkSync Era',
  420: 'Optimism Goerli',
  8453: 'Base',
  42161: 'Arbitrum One',
  42170: 'Arbitrum Nova',
  43114: 'Avalanche',
  80001: 'Polygon Mumbai',
  11155111: 'Sepolia',
  534352: 'Scroll',
  59144: 'Linea',
};

function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`;
}

function getEthereum(): any | null {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return (window as any).ethereum;
  }
  return null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: null,
    chainId: null,
    chainName: null,
    balance: null,
    connecting: false,
    error: null,
  });

  const updateBalance = useCallback(async (address: string) => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      const balHex = await ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      const balWei = BigInt(balHex);
      const balEth = Number(balWei) / 1e18;
      setState(prev => ({ ...prev, balance: balEth.toFixed(4) }));
    } catch {
      // non-critical
    }
  }, []);

  const connect = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      setState(prev => ({
        ...prev,
        error: 'No wallet detected. Install MetaMask or another Web3 wallet.',
      }));
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      const accounts: string[] = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        setState(prev => ({ ...prev, connecting: false, error: 'No accounts found' }));
        return;
      }

      const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);
      const address = accounts[0];

      setState({
        connected: true,
        address,
        chainId,
        chainName: getChainName(chainId),
        balance: null,
        connecting: false,
        error: null,
      });

      updateBalance(address);
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        connecting: false,
        error: err?.message || 'Failed to connect wallet',
      }));
    }
  }, [updateBalance]);

  const disconnect = useCallback(() => {
    setState({
      connected: false,
      address: null,
      chainId: null,
      chainName: null,
      balance: null,
      connecting: false,
      error: null,
    });
  }, []);

  const signTransaction = useCallback(async (txParams: {
    to: string;
    data?: string;
    value?: string;
    gas?: string;
  }): Promise<{ hash: string } | { error: string }> => {
    const ethereum = getEthereum();
    if (!ethereum || !state.address) {
      return { error: 'Wallet not connected' };
    }

    try {
      const hash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: state.address,
          to: txParams.to,
          data: txParams.data || '0x',
          value: txParams.value || '0x0',
          ...(txParams.gas ? { gas: txParams.gas } : {}),
        }],
      });
      // Refresh balance after tx
      setTimeout(() => updateBalance(state.address!), 3000);
      return { hash };
    } catch (err: any) {
      if (err?.code === 4001) {
        return { error: 'Transaction rejected by user' };
      }
      return { error: err?.message || 'Transaction failed' };
    }
  }, [state.address, updateBalance]);

  const personalSign = useCallback(async (message: string): Promise<{ signature: string } | { error: string }> => {
    const ethereum = getEthereum();
    if (!ethereum || !state.address) {
      return { error: 'Wallet not connected' };
    }

    try {
      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [message, state.address],
      });
      return { signature };
    } catch (err: any) {
      if (err?.code === 4001) {
        return { error: 'Signing rejected by user' };
      }
      return { error: err?.message || 'Signing failed' };
    }
  }, [state.address]);

  const switchChain = useCallback(async (chainId: number) => {
    const ethereum = getEthereum();
    if (!ethereum) return;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err?.message || 'Failed to switch chain' }));
    }
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (state.connected) {
        setState(prev => ({ ...prev, address: accounts[0] }));
        updateBalance(accounts[0]);
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setState(prev => ({
        ...prev,
        chainId,
        chainName: getChainName(chainId),
      }));
      if (state.address) updateBalance(state.address);
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [state.connected, state.address, disconnect, updateBalance]);

  return {
    ...state,
    connect,
    disconnect,
    signTransaction,
    personalSign,
    switchChain,
    hasProvider: !!getEthereum(),
  };
}
