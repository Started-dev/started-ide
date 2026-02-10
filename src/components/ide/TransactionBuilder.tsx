import { useState, useCallback, useMemo } from 'react';
import {
  X, Play, Send, Wallet, AlertCircle, CheckCircle, Loader2,
  Plus, Trash2, ChevronDown, ChevronRight, Zap, FlaskConical,
  Copy, Check, ExternalLink, FileCode, ArrowRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WalletConnect } from './WalletConnect';
import { callMCPTool } from '@/lib/mcp-client';

// ─── ABI Types ───

interface ABIParam {
  name: string;
  type: string;
  components?: ABIParam[];
}

interface ABIFunction {
  name: string;
  type: 'function';
  stateMutability: string;
  inputs: ABIParam[];
  outputs: ABIParam[];
}

interface TransactionBuilderProps {
  onClose: () => void;
}

// ─── Helpers ───

function isWriteFunction(fn: ABIFunction): boolean {
  return !['view', 'pure'].includes(fn.stateMutability);
}

function encodeSimpleParam(type: string, value: string): string {
  // Basic ABI encoding for common types
  if (type === 'address') return value.toLowerCase().replace('0x', '').padStart(64, '0');
  if (type === 'uint256' || type.startsWith('uint')) {
    try {
      const n = BigInt(value);
      return n.toString(16).padStart(64, '0');
    } catch {
      return '0'.repeat(64);
    }
  }
  if (type === 'bool') return (value === 'true' ? '1' : '0').padStart(64, '0');
  if (type === 'bytes32') return value.replace('0x', '').padEnd(64, '0');
  // For string/bytes — simplified encoding
  return value.replace('0x', '').padStart(64, '0');
}

function functionSelector(name: string, inputTypes: string[]): string {
  // Keccak-256 is not available natively, so we use a simplified approach:
  // The user can paste the selector manually, or we compute via RPC later
  const sig = `${name}(${inputTypes.join(',')})`;
  // We'll store the signature and let the user provide selector if needed
  return sig;
}

type BuilderStep = 'configure' | 'simulate' | 'send' | 'result';

export function TransactionBuilder({ onClose }: TransactionBuilderProps) {
  // ─── State ───
  const [step, setStep] = useState<BuilderStep>('configure');
  const [contractAddress, setContractAddress] = useState('');
  const [abiText, setAbiText] = useState('');
  const [parsedABI, setParsedABI] = useState<ABIFunction[]>([]);
  const [abiError, setAbiError] = useState('');
  const [selectedFn, setSelectedFn] = useState<ABIFunction | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [ethValue, setEthValue] = useState('0');
  const [customCalldata, setCustomCalldata] = useState('');
  const [useCustomCalldata, setUseCustomCalldata] = useState(false);
  const [showAbiInput, setShowAbiInput] = useState(true);

  // Simulation
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; data: any } | null>(null);

  // Send
  const [sending, setSending] = useState(false);
  const [txResult, setTxResult] = useState<{ ok: boolean; data: any } | null>(null);

  // Fetch ABI
  const [fetchingABI, setFetchingABI] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  const rpcUrl = sessionStorage.getItem('evm_rpc_url') || sessionStorage.getItem('evm_rpc_url_sim') || '';

  // ─── Parse ABI ───
  const handleParseABI = useCallback(() => {
    try {
      const parsed = JSON.parse(abiText);
      const fns: ABIFunction[] = (Array.isArray(parsed) ? parsed : parsed.abi || [])
        .filter((item: any) => item.type === 'function')
        .map((item: any) => ({
          name: item.name,
          type: 'function',
          stateMutability: item.stateMutability || 'nonpayable',
          inputs: item.inputs || [],
          outputs: item.outputs || [],
        }));
      if (fns.length === 0) {
        setAbiError('No functions found in ABI');
        return;
      }
      setParsedABI(fns);
      setAbiError('');
      setShowAbiInput(false);
    } catch {
      setAbiError('Invalid JSON — paste a valid ABI array');
    }
  }, [abiText]);

  // ─── Fetch ABI from Etherscan ───
  const handleFetchABI = useCallback(async () => {
    if (!contractAddress) return;
    setFetchingABI(true);
    setAbiError('');
    try {
      const result = await callMCPTool({
        tool: 'contract_get_abi',
        input: { address: contractAddress },
        serverId: 'mcp-contract-intel',
        etherscanKey: sessionStorage.getItem('etherscan_api_key') || undefined,
        etherscanChain: sessionStorage.getItem('etherscan_chain') || 'ethereum',
      });
      if (result.ok && result.result) {
        const abiData = (result.result as any).abi || result.result;
        const abiStr = typeof abiData === 'string' ? abiData : JSON.stringify(abiData, null, 2);
        setAbiText(abiStr);
        // Auto-parse
        const parsed = typeof abiData === 'string' ? JSON.parse(abiData) : abiData;
        const fns: ABIFunction[] = (Array.isArray(parsed) ? parsed : [])
          .filter((item: any) => item.type === 'function')
          .map((item: any) => ({
            name: item.name,
            type: 'function' as const,
            stateMutability: item.stateMutability || 'nonpayable',
            inputs: item.inputs || [],
            outputs: item.outputs || [],
          }));
        if (fns.length > 0) {
          setParsedABI(fns);
          setShowAbiInput(false);
        } else {
          setAbiError('ABI fetched but no functions found');
        }
      } else {
        setAbiError(result.error || 'Failed to fetch ABI');
      }
    } catch (err: any) {
      setAbiError(err?.message || 'Failed to fetch ABI');
    }
    setFetchingABI(false);
  }, [contractAddress]);

  // ─── Build calldata ───
  const calldata = useMemo(() => {
    if (useCustomCalldata) return customCalldata;
    if (!selectedFn) return '0x';

    // Build a basic selector + encoded params
    // For production, use ethers.js — here we do a lightweight version
    const inputTypes = selectedFn.inputs.map(i => i.type);
    const encodedParams = selectedFn.inputs
      .map(inp => encodeSimpleParam(inp.type, paramValues[inp.name] || ''))
      .join('');

    // We need function selector (first 4 bytes of keccak256)
    // Since we can't compute keccak in browser without a lib, we'll mark it
    const sigText = `${selectedFn.name}(${inputTypes.join(',')})`;

    // Check if user provided a manual selector override
    const manualSelector = paramValues['__selector'];
    if (manualSelector) {
      return manualSelector + encodedParams;
    }

    // Return signature for display — actual encoding happens server-side in simulation
    return `[sig:${sigText}]${encodedParams ? '...' + encodedParams.slice(0, 40) : ''}`;
  }, [selectedFn, paramValues, useCustomCalldata, customCalldata]);

  // ─── Build hex value ───
  const hexValue = useMemo(() => {
    try {
      if (!ethValue || ethValue === '0') return '0x0';
      const wei = BigInt(Math.floor(parseFloat(ethValue) * 1e18));
      return '0x' + wei.toString(16);
    } catch {
      return '0x0';
    }
  }, [ethValue]);

  // ─── Simulate ───
  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    setSimResult(null);

    try {
      // Build actual calldata for simulation
      let simData = customCalldata || '0x';
      if (!useCustomCalldata && selectedFn) {
        // Use the manual selector if provided, otherwise use customCalldata
        simData = paramValues['__selector']
          ? paramValues['__selector'] + selectedFn.inputs.map(i => encodeSimpleParam(i.type, paramValues[i.name] || '')).join('')
          : customCalldata || '0x';
      }

      const result = await callMCPTool({
        tool: 'sim_eth_call',
        input: {
          to: contractAddress,
          data: simData,
          value: hexValue,
        },
        serverId: 'mcp-tx-simulator',
        evmRpcUrl: rpcUrl,
      });

      setSimResult({ ok: result.ok, data: result.ok ? result.result : result.error });
      if (result.ok) setStep('simulate');
    } catch (err: any) {
      setSimResult({ ok: false, data: err?.message || 'Simulation failed' });
    }

    setSimulating(false);
  }, [contractAddress, hexValue, selectedFn, paramValues, customCalldata, useCustomCalldata, rpcUrl]);

  // ─── Estimate Gas ───
  const [gasEstimate, setGasEstimate] = useState<any>(null);
  const [estimatingGas, setEstimatingGas] = useState(false);

  const handleEstimateGas = useCallback(async () => {
    setEstimatingGas(true);
    try {
      let simData = customCalldata || '0x';
      if (!useCustomCalldata && selectedFn && paramValues['__selector']) {
        simData = paramValues['__selector'] + selectedFn.inputs.map(i => encodeSimpleParam(i.type, paramValues[i.name] || '')).join('');
      }

      const result = await callMCPTool({
        tool: 'sim_estimate_gas',
        input: { to: contractAddress, data: simData, value: hexValue },
        serverId: 'mcp-tx-simulator',
        evmRpcUrl: rpcUrl,
      });
      setGasEstimate(result.ok ? result.result : { error: result.error });
    } catch (err: any) {
      setGasEstimate({ error: err?.message });
    }
    setEstimatingGas(false);
  }, [contractAddress, hexValue, selectedFn, paramValues, customCalldata, useCustomCalldata, rpcUrl]);

  // ─── Send Transaction ───
  const handleSend = useCallback(async () => {
    setSending(true);
    setTxResult(null);

    try {
      let txData = customCalldata || '0x';
      if (!useCustomCalldata && selectedFn && paramValues['__selector']) {
        txData = paramValues['__selector'] + selectedFn.inputs.map(i => encodeSimpleParam(i.type, paramValues[i.name] || '')).join('');
      }

      const result = await callMCPTool({
        tool: 'wallet_send_transaction',
        input: {
          to: contractAddress,
          data: txData,
          value: hexValue,
          ...(gasEstimate?.gasEstimate ? { gas: '0x' + Math.ceil(gasEstimate.gasEstimate * 1.2).toString(16) } : {}),
        },
        serverId: 'mcp-tx-simulator',
      });

      setTxResult({ ok: result.ok, data: result.ok ? result.result : result.error });
      if (result.ok) setStep('result');
    } catch (err: any) {
      setTxResult({ ok: false, data: err?.message || 'Failed to send' });
    }

    setSending(false);
  }, [contractAddress, hexValue, selectedFn, paramValues, customCalldata, useCustomCalldata, gasEstimate]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  // ─── Grouped functions ───
  const readFns = parsedABI.filter(f => !isWriteFunction(f));
  const writeFns = parsedABI.filter(f => isWriteFunction(f));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg max-h-[85vh] bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Transaction Builder</span>
            {/* Step indicators */}
            <div className="flex items-center gap-1 ml-2">
              {(['configure', 'simulate', 'send', 'result'] as BuilderStep[]).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40" />}
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm font-semibold ${
                    step === s ? 'bg-primary/15 text-primary' : 'text-muted-foreground/50'
                  }`}>
                    {s === 'configure' ? 'Build' : s === 'simulate' ? 'Sim' : s === 'send' ? 'Sign' : 'Done'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">

          {/* ── Wallet Status (always visible) ── */}
          <div className="p-3 rounded-md border border-border bg-muted/30">
            <WalletConnect compact={false} />
          </div>

          {/* ── Step: Configure ── */}
          {(step === 'configure' || step === 'simulate') && (
            <>
              {/* Contract Address */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Contract Address
                </label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="0x..."
                    value={contractAddress}
                    onChange={e => setContractAddress(e.target.value)}
                    className="h-8 text-xs font-mono bg-background"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFetchABI}
                    disabled={!contractAddress || fetchingABI}
                    className="h-8 text-xs px-2.5 shrink-0"
                    title="Fetch ABI from Etherscan"
                  >
                    {fetchingABI ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              {/* ABI Input */}
              {showAbiInput && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Contract ABI
                  </label>
                  <Textarea
                    placeholder='Paste ABI JSON array or click the fetch button above...'
                    value={abiText}
                    onChange={e => setAbiText(e.target.value)}
                    className="h-24 text-xs font-mono bg-background resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleParseABI} disabled={!abiText} className="h-7 text-xs">
                      Parse ABI
                    </Button>
                    <button
                      onClick={() => setUseCustomCalldata(!useCustomCalldata)}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {useCustomCalldata ? 'Use ABI mode' : 'Use raw calldata'}
                    </button>
                  </div>
                  {abiError && <p className="text-[10px] text-destructive">{abiError}</p>}
                </div>
              )}

              {/* Raw Calldata Mode */}
              {useCustomCalldata && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Raw Calldata
                  </label>
                  <Input
                    placeholder="0x..."
                    value={customCalldata}
                    onChange={e => setCustomCalldata(e.target.value)}
                    className="h-8 text-xs font-mono bg-background"
                  />
                </div>
              )}

              {/* Function Selector */}
              {!useCustomCalldata && parsedABI.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Function ({parsedABI.length})
                    </label>
                    <button
                      onClick={() => { setShowAbiInput(true); setParsedABI([]); setSelectedFn(null); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Change ABI
                    </button>
                  </div>

                  <div className="max-h-40 overflow-auto space-y-0.5 border border-border rounded-md p-1">
                    {/* Write functions first */}
                    {writeFns.length > 0 && (
                      <div className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ide-warning font-bold">Write</div>
                    )}
                    {writeFns.map(fn => (
                      <button
                        key={fn.name}
                        onClick={() => { setSelectedFn(fn); setParamValues({}); }}
                        className={`w-full text-left px-2 py-1.5 rounded-sm text-xs font-mono flex items-center gap-2 transition-colors ${
                          selectedFn?.name === fn.name
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-ide-warning shrink-0" />
                        {fn.name}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          ({fn.inputs.map(i => i.type).join(', ')})
                        </span>
                      </button>
                    ))}
                    {/* Read functions */}
                    {readFns.length > 0 && (
                      <div className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ide-success font-bold mt-1">Read</div>
                    )}
                    {readFns.map(fn => (
                      <button
                        key={fn.name}
                        onClick={() => { setSelectedFn(fn); setParamValues({}); }}
                        className={`w-full text-left px-2 py-1.5 rounded-sm text-xs font-mono flex items-center gap-2 transition-colors ${
                          selectedFn?.name === fn.name
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-ide-success shrink-0" />
                        {fn.name}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          ({fn.inputs.map(i => i.type).join(', ')})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Function Parameters */}
              {!useCustomCalldata && selectedFn && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Parameters — {selectedFn.name}
                  </label>

                  {/* Function selector override */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">
                      Function Selector (4 bytes hex)
                    </label>
                    <Input
                      placeholder={`0x... (selector for ${selectedFn.name})`}
                      value={paramValues['__selector'] || ''}
                      onChange={e => setParamValues(p => ({ ...p, '__selector': e.target.value }))}
                      className="h-7 text-[11px] font-mono bg-background"
                    />
                    <p className="text-[9px] text-muted-foreground">
                      Sig: {selectedFn.name}({selectedFn.inputs.map(i => i.type).join(',')})
                    </p>
                  </div>

                  {selectedFn.inputs.map(inp => (
                    <div key={inp.name} className="space-y-1">
                      <label className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span className="font-mono text-foreground">{inp.name}</span>
                        <span className="text-muted-foreground/60">{inp.type}</span>
                      </label>
                      <Input
                        placeholder={`${inp.type}...`}
                        value={paramValues[inp.name] || ''}
                        onChange={e => setParamValues(p => ({ ...p, [inp.name]: e.target.value }))}
                        className="h-7 text-[11px] font-mono bg-background"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ETH Value */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  ETH Value (optional)
                </label>
                <Input
                  placeholder="0"
                  value={ethValue}
                  onChange={e => setEthValue(e.target.value)}
                  className="h-8 text-xs font-mono bg-background"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSimulate}
                  disabled={!contractAddress || simulating}
                  className="h-8 text-xs gap-1.5 flex-1"
                >
                  {simulating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <FlaskConical className="h-3 w-3" />
                  )}
                  Simulate (eth_call)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEstimateGas}
                  disabled={!contractAddress || estimatingGas}
                  className="h-8 text-xs gap-1.5"
                >
                  {estimatingGas ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Gas
                </Button>
              </div>

              {/* Simulation Result */}
              {simResult && (
                <div className={`p-3 rounded-md border text-xs ${
                  simResult.ok
                    ? 'border-ide-success/30 bg-ide-success/5'
                    : 'border-destructive/30 bg-destructive/5'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {simResult.ok ? (
                      <CheckCircle className="h-3.5 w-3.5 text-ide-success" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={`font-semibold text-[10px] uppercase tracking-wider ${
                      simResult.ok ? 'text-ide-success' : 'text-destructive'
                    }`}>
                      {simResult.ok ? 'Simulation Passed' : 'Simulation Failed'}
                    </span>
                  </div>
                  <pre className="text-[10px] font-mono text-muted-foreground overflow-auto max-h-24 whitespace-pre-wrap break-all">
                    {typeof simResult.data === 'string' ? simResult.data : JSON.stringify(simResult.data, null, 2)}
                  </pre>
                </div>
              )}

              {/* Gas Estimate */}
              {gasEstimate && (
                <div className="p-2.5 rounded-md border border-border bg-muted/30 text-xs space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Gas Estimate</div>
                  {gasEstimate.error ? (
                    <p className="text-destructive text-[11px]">{gasEstimate.error}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Gas:</span>
                        <span className="ml-1 font-mono text-foreground">{gasEstimate.gasEstimate?.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Price:</span>
                        <span className="ml-1 font-mono text-foreground">{gasEstimate.gasPriceGwei?.toFixed(1)} gwei</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cost:</span>
                        <span className="ml-1 font-mono text-foreground">{gasEstimate.estimatedCostEth?.toFixed(6)} ETH</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Send Button (shown after successful simulation) */}
              {simResult?.ok && (
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={sending}
                  className="h-9 text-xs gap-1.5 w-full bg-ide-warning/90 hover:bg-ide-warning text-primary-foreground font-semibold"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Sign & Send via Wallet
                </Button>
              )}
            </>
          )}

          {/* ── Step: Result ── */}
          {step === 'result' && txResult && (
            <div className="space-y-4">
              <div className={`p-4 rounded-md border ${
                txResult.ok
                  ? 'border-ide-success/30 bg-ide-success/5'
                  : 'border-destructive/30 bg-destructive/5'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {txResult.ok ? (
                    <CheckCircle className="h-5 w-5 text-ide-success" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span className={`text-sm font-semibold ${
                    txResult.ok ? 'text-ide-success' : 'text-destructive'
                  }`}>
                    {txResult.ok ? 'Transaction Sent!' : 'Transaction Failed'}
                  </span>
                </div>

                {txResult.ok && txResult.data?.hash && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase text-muted-foreground">TX Hash</span>
                      <button
                        onClick={() => copyToClipboard(txResult.data.hash, 'hash')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copied === 'hash' ? <Check className="h-3 w-3 text-ide-success" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-foreground break-all">{txResult.data.hash}</p>
                  </div>
                )}

                {!txResult.ok && (
                  <p className="text-xs text-destructive">{typeof txResult.data === 'string' ? txResult.data : JSON.stringify(txResult.data)}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setStep('configure'); setSimResult(null); setTxResult(null); setGasEstimate(null); }}
                  className="h-8 text-xs flex-1"
                >
                  New Transaction
                </Button>
                <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground">
            Always simulate before sending. Write operations require wallet approval.
            {rpcUrl ? '' : ' ⚠ No RPC URL configured — set one in MCP Config → TX Simulator.'}
          </p>
        </div>
      </div>
    </div>
  );
}
