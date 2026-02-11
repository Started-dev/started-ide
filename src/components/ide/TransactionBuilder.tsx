import { useState, useCallback, useMemo } from 'react';
import {
  X, Play, Send, AlertCircle, CheckCircle, Loader2,
  Plus, Trash2, Zap, FlaskConical,
  Copy, Check, FileCode, ArrowRight, Layers, ChevronDown, ChevronRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WalletConnect } from './WalletConnect';
import { callMCPTool } from '@/lib/mcp-client';
import { Interface, parseEther, formatEther } from 'ethers';

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

// ─── Batched Call ───

interface BatchCall {
  id: string;
  contractAddress: string;
  selectedFn: ABIFunction | null;
  paramValues: Record<string, string>;
  ethValue: string;
  customCalldata: string;
  useCustomCalldata: boolean;
  simResult: { ok: boolean; data: any } | null;
  gasEstimate: any;
  txResult: { ok: boolean; data: any } | null;
  label: string;
}

function createEmptyCall(): BatchCall {
  return {
    id: crypto.randomUUID(),
    contractAddress: '',
    selectedFn: null,
    paramValues: {},
    ethValue: '0',
    customCalldata: '',
    useCustomCalldata: false,
    simResult: null,
    gasEstimate: null,
    txResult: null,
    label: '',
  };
}

// ─── Helpers ───

function isWriteFunction(fn: ABIFunction): boolean {
  return !['view', 'pure'].includes(fn.stateMutability);
}

function encodeCalldata(iface: Interface, fn: ABIFunction, paramValues: Record<string, string>): string {
  const args = fn.inputs.map(inp => {
    const raw = paramValues[inp.name] || '';
    if (inp.type.startsWith('uint') || inp.type.startsWith('int')) {
      try { return BigInt(raw); } catch { return BigInt(0); }
    }
    if (inp.type === 'bool') return raw === 'true';
    if (inp.type.endsWith('[]')) {
      try { return JSON.parse(raw); } catch { return []; }
    }
    if (inp.type === 'bytes' || inp.type.startsWith('bytes')) return raw || '0x';
    return raw;
  });
  return iface.encodeFunctionData(fn.name, args);
}

function hexValue(ethVal: string): string {
  try {
    if (!ethVal || ethVal === '0') return '0x0';
    const wei = parseEther(ethVal);
    return '0x' + wei.toString(16);
  } catch {
    return '0x0';
  }
}

type BuilderStep = 'configure' | 'simulate' | 'send' | 'result';

export function TransactionBuilder({ onClose }: TransactionBuilderProps) {
  // ─── Shared State ───
  const [step, setStep] = useState<BuilderStep>('configure');
  const [abiText, setAbiText] = useState('');
  const [parsedABI, setParsedABI] = useState<ABIFunction[]>([]);
  const [abiError, setAbiError] = useState('');
  const [showAbiInput, setShowAbiInput] = useState(true);
  const [fetchingABI, setFetchingABI] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [abiContractAddress, setAbiContractAddress] = useState('');

  // ─── Batch State ───
  const [calls, setCalls] = useState<BatchCall[]>([createEmptyCall()]);
  const [activeCallIdx, setActiveCallIdx] = useState(0);
  const [batchMode, setBatchMode] = useState(false);

  // ─── Simulation/Send global state ───
  const [simulating, setSimulating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingIdx, setSendingIdx] = useState(-1);

  const rpcUrl = localStorage.getItem('evm_rpc_url') || localStorage.getItem('evm_rpc_url_sim') || '';

  const activeCall = calls[activeCallIdx] || calls[0];

  const ethersInterface = useMemo(() => {
    try {
      const parsed = JSON.parse(abiText);
      const abiArr = Array.isArray(parsed) ? parsed : parsed.abi || [];
      return new Interface(abiArr);
    } catch {
      return null;
    }
  }, [abiText]);

  // ─── Update active call ───
  const updateCall = useCallback((idx: number, patch: Partial<BatchCall>) => {
    setCalls(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }, []);

  // ─── Parse ABI ───
  const handleParseABI = useCallback(() => {
    try {
      const parsed = JSON.parse(abiText);
      const arr = Array.isArray(parsed) ? parsed : parsed.abi || [];
      const fns: ABIFunction[] = arr
        .filter((item: any) => item.type === 'function')
        .map((item: any) => ({
          name: item.name,
          type: 'function' as const,
          stateMutability: item.stateMutability || 'nonpayable',
          inputs: item.inputs || [],
          outputs: item.outputs || [],
        }));
      if (fns.length === 0) { setAbiError('No functions found in ABI'); return; }
      setParsedABI(fns);
      setAbiError('');
      setShowAbiInput(false);
    } catch {
      setAbiError('Invalid JSON — paste a valid ABI array');
    }
  }, [abiText]);

  // ─── Fetch ABI from Etherscan ───
  const handleFetchABI = useCallback(async () => {
    const addr = abiContractAddress || activeCall.contractAddress;
    if (!addr) return;
    setFetchingABI(true);
    setAbiError('');
    try {
      const result = await callMCPTool({
        tool: 'contract_get_abi',
        input: { address: addr },
        serverId: 'mcp-contract-intel',
        etherscanKey: localStorage.getItem('etherscan_api_key') || undefined,
        etherscanChain: localStorage.getItem('etherscan_chain') || 'ethereum',
      });
      if (result.ok && result.result) {
        const abiData = (result.result as any).abi || result.result;
        const abiStr = typeof abiData === 'string' ? abiData : JSON.stringify(abiData, null, 2);
        setAbiText(abiStr);
        const parsed = typeof abiData === 'string' ? JSON.parse(abiData) : abiData;
        const fns: ABIFunction[] = (Array.isArray(parsed) ? parsed : [])
          .filter((item: any) => item.type === 'function')
          .map((item: any) => ({
            name: item.name, type: 'function' as const,
            stateMutability: item.stateMutability || 'nonpayable',
            inputs: item.inputs || [], outputs: item.outputs || [],
          }));
        if (fns.length > 0) { setParsedABI(fns); setShowAbiInput(false); }
        else { setAbiError('ABI fetched but no functions found'); }
      } else {
        setAbiError(result.error || 'Failed to fetch ABI');
      }
    } catch (err: any) {
      setAbiError(err?.message || 'Failed to fetch ABI');
    }
    setFetchingABI(false);
  }, [abiContractAddress, activeCall.contractAddress]);

  // ─── Build calldata using ethers ───
  const getCalldata = useCallback((call: BatchCall): string => {
    if (call.useCustomCalldata) return call.customCalldata || '0x';
    if (!call.selectedFn || !ethersInterface) return '0x';
    try {
      return encodeCalldata(ethersInterface, call.selectedFn, call.paramValues);
    } catch (err: any) {
      return '0x';
    }
  }, [ethersInterface]);

  // ─── Simulate single call ───
  const simulateCall = useCallback(async (idx: number) => {
    const call = calls[idx];
    const data = getCalldata(call);
    try {
      const result = await callMCPTool({
        tool: 'sim_eth_call',
        input: { to: call.contractAddress, data, value: hexValue(call.ethValue) },
        serverId: 'mcp-tx-simulator',
        evmRpcUrl: rpcUrl,
      });
      updateCall(idx, { simResult: { ok: result.ok, data: result.ok ? result.result : result.error } });
      return result.ok;
    } catch (err: any) {
      updateCall(idx, { simResult: { ok: false, data: err?.message || 'Simulation failed' } });
      return false;
    }
  }, [calls, getCalldata, rpcUrl, updateCall]);

  // ─── Simulate all ───
  const handleSimulateAll = useCallback(async () => {
    setSimulating(true);
    let allOk = true;
    for (let i = 0; i < calls.length; i++) {
      if (!calls[i].contractAddress) continue;
      const ok = await simulateCall(i);
      if (!ok) allOk = false;
    }
    if (allOk) setStep('simulate');
    setSimulating(false);
  }, [calls, simulateCall]);

  // ─── Estimate gas for a call ───
  const handleEstimateGas = useCallback(async (idx: number) => {
    const call = calls[idx];
    const data = getCalldata(call);
    updateCall(idx, { gasEstimate: { loading: true } });
    try {
      const result = await callMCPTool({
        tool: 'sim_estimate_gas',
        input: { to: call.contractAddress, data, value: hexValue(call.ethValue) },
        serverId: 'mcp-tx-simulator',
        evmRpcUrl: rpcUrl,
      });
      updateCall(idx, { gasEstimate: result.ok ? result.result : { error: result.error } });
    } catch (err: any) {
      updateCall(idx, { gasEstimate: { error: err?.message } });
    }
  }, [calls, getCalldata, rpcUrl, updateCall]);

  // ─── Send single call ───
  const sendCall = useCallback(async (idx: number) => {
    const call = calls[idx];
    const data = getCalldata(call);
    try {
      const result = await callMCPTool({
        tool: 'wallet_send_transaction',
        input: {
          to: call.contractAddress, data, value: hexValue(call.ethValue),
          ...(call.gasEstimate?.gasEstimate ? { gas: '0x' + Math.ceil(call.gasEstimate.gasEstimate * 1.2).toString(16) } : {}),
        },
        serverId: 'mcp-tx-simulator',
      });
      updateCall(idx, { txResult: { ok: result.ok, data: result.ok ? result.result : result.error } });
      return result.ok;
    } catch (err: any) {
      updateCall(idx, { txResult: { ok: false, data: err?.message || 'Failed to send' } });
      return false;
    }
  }, [calls, getCalldata, updateCall]);

  // ─── Send all in sequence ───
  const handleSendAll = useCallback(async () => {
    setSending(true);
    for (let i = 0; i < calls.length; i++) {
      if (!calls[i].contractAddress) continue;
      setSendingIdx(i);
      const ok = await sendCall(i);
      if (!ok) break;
    }
    setSendingIdx(-1);
    setSending(false);
    setStep('result');
  }, [calls, sendCall]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const addCall = () => {
    const newCall = createEmptyCall();
    newCall.contractAddress = activeCall.contractAddress; // inherit contract
    setCalls(prev => [...prev, newCall]);
    setActiveCallIdx(calls.length);
    setBatchMode(true);
  };

  const removeCall = (idx: number) => {
    if (calls.length <= 1) return;
    setCalls(prev => prev.filter((_, i) => i !== idx));
    setActiveCallIdx(prev => Math.min(prev, calls.length - 2));
  };

  // ─── Encoding preview ───
  const encodingPreview = useMemo(() => {
    if (activeCall.useCustomCalldata) return activeCall.customCalldata;
    if (!activeCall.selectedFn || !ethersInterface) return null;
    try {
      return encodeCalldata(ethersInterface, activeCall.selectedFn, activeCall.paramValues);
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }, [activeCall, ethersInterface]);

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
            {calls.length > 1 && (
              <span className="ml-1 text-[9px] bg-accent/20 text-accent-foreground px-1.5 py-0.5 rounded-sm font-semibold">
                <Layers className="h-2.5 w-2.5 inline mr-0.5" />
                {calls.length} calls
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">

          {/* Wallet */}
          <div className="p-3 rounded-md border border-border bg-muted/30">
            <WalletConnect compact={false} />
          </div>

          {(step === 'configure' || step === 'simulate') && (
            <>
              {/* ABI Source (shared across calls) */}
              {showAbiInput && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Contract ABI
                  </label>
                  <div className="flex gap-1.5 mb-1.5">
                    <Input
                      placeholder="Contract address for ABI fetch..."
                      value={abiContractAddress}
                      onChange={e => setAbiContractAddress(e.target.value)}
                      className="h-8 text-xs font-mono bg-background"
                    />
                    <Button size="sm" variant="outline" onClick={handleFetchABI}
                      disabled={!abiContractAddress || fetchingABI} className="h-8 text-xs px-2.5 shrink-0">
                      {fetchingABI ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />}
                    </Button>
                  </div>
                  <Textarea
                    placeholder='Or paste ABI JSON array...'
                    value={abiText}
                    onChange={e => setAbiText(e.target.value)}
                    className="h-24 text-xs font-mono bg-background resize-none"
                  />
                  <Button size="sm" onClick={handleParseABI} disabled={!abiText} className="h-7 text-xs">
                    Parse ABI
                  </Button>
                  {abiError && <p className="text-[10px] text-destructive">{abiError}</p>}
                </div>
              )}

              {/* Batch tabs */}
              {batchMode && (
                <div className="flex items-center gap-1 flex-wrap">
                  {calls.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCallIdx(i)}
                      className={`text-[10px] px-2 py-1 rounded-sm font-mono flex items-center gap-1 transition-colors ${
                        i === activeCallIdx ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      #{i + 1}{c.selectedFn ? ` ${c.selectedFn.name}` : ''}
                      {c.simResult && (
                        c.simResult.ok
                          ? <CheckCircle className="h-2.5 w-2.5 text-ide-success" />
                          : <AlertCircle className="h-2.5 w-2.5 text-destructive" />
                      )}
                      {calls.length > 1 && (
                        <span onClick={e => { e.stopPropagation(); removeCall(i); }}
                          className="ml-0.5 hover:text-destructive"><Trash2 className="h-2.5 w-2.5" /></span>
                      )}
                    </button>
                  ))}
                  <button onClick={addCall} className="text-[10px] px-1.5 py-1 rounded-sm bg-muted text-muted-foreground hover:text-foreground">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Active Call Editor */}
              <div className="space-y-3">
                {/* Contract Address */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Target Contract {batchMode && `(#${activeCallIdx + 1})`}
                  </label>
                  <Input
                    placeholder="0x..."
                    value={activeCall.contractAddress}
                    onChange={e => updateCall(activeCallIdx, { contractAddress: e.target.value })}
                    className="h-8 text-xs font-mono bg-background"
                  />
                </div>

                {/* Toggle raw/abi */}
                <button
                  onClick={() => updateCall(activeCallIdx, { useCustomCalldata: !activeCall.useCustomCalldata })}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {activeCall.useCustomCalldata ? '← Use ABI mode' : 'Use raw calldata →'}
                </button>

                {/* Raw Calldata */}
                {activeCall.useCustomCalldata && (
                  <Input
                    placeholder="0x..."
                    value={activeCall.customCalldata}
                    onChange={e => updateCall(activeCallIdx, { customCalldata: e.target.value })}
                    className="h-8 text-xs font-mono bg-background"
                  />
                )}

                {/* Function Selector (ABI mode) */}
                {!activeCall.useCustomCalldata && parsedABI.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Function ({parsedABI.length})
                      </label>
                      <button onClick={() => { setShowAbiInput(true); setParsedABI([]); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground">Change ABI</button>
                    </div>
                    <div className="max-h-36 overflow-auto space-y-0.5 border border-border rounded-md p-1">
                      {writeFns.length > 0 && (
                        <div className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ide-warning font-bold">Write</div>
                      )}
                      {writeFns.map(fn => (
                        <button key={fn.name}
                          onClick={() => updateCall(activeCallIdx, { selectedFn: fn, paramValues: {} })}
                          className={`w-full text-left px-2 py-1.5 rounded-sm text-xs font-mono flex items-center gap-2 transition-colors ${
                            activeCall.selectedFn?.name === fn.name ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                          }`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-ide-warning shrink-0" />
                          {fn.name}
                          <span className="text-[10px] text-muted-foreground ml-auto">({fn.inputs.map(i => i.type).join(', ')})</span>
                        </button>
                      ))}
                      {readFns.length > 0 && (
                        <div className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ide-success font-bold mt-1">Read</div>
                      )}
                      {readFns.map(fn => (
                        <button key={fn.name}
                          onClick={() => updateCall(activeCallIdx, { selectedFn: fn, paramValues: {} })}
                          className={`w-full text-left px-2 py-1.5 rounded-sm text-xs font-mono flex items-center gap-2 transition-colors ${
                            activeCall.selectedFn?.name === fn.name ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                          }`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-ide-success shrink-0" />
                          {fn.name}
                          <span className="text-[10px] text-muted-foreground ml-auto">({fn.inputs.map(i => i.type).join(', ')})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parameters */}
                {!activeCall.useCustomCalldata && activeCall.selectedFn && (
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Parameters — {activeCall.selectedFn.name}
                    </label>
                    {activeCall.selectedFn.inputs.map(inp => (
                      <div key={inp.name} className="space-y-1">
                        <label className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span className="font-mono text-foreground">{inp.name}</span>
                          <span className="text-muted-foreground/60">{inp.type}</span>
                        </label>
                        <Input
                          placeholder={`${inp.type}...`}
                          value={activeCall.paramValues[inp.name] || ''}
                          onChange={e => updateCall(activeCallIdx, {
                            paramValues: { ...activeCall.paramValues, [inp.name]: e.target.value }
                          })}
                          className="h-7 text-[11px] font-mono bg-background"
                        />
                      </div>
                    ))}

                    {/* Encoded calldata preview */}
                    {encodingPreview && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Encoded Calldata</span>
                          <button onClick={() => encodingPreview && copyToClipboard(encodingPreview, 'calldata')}
                            className="text-muted-foreground hover:text-foreground">
                            {copied === 'calldata' ? <Check className="h-2.5 w-2.5 text-ide-success" /> : <Copy className="h-2.5 w-2.5" />}
                          </button>
                        </div>
                        <p className="text-[9px] font-mono text-muted-foreground break-all bg-muted/30 px-2 py-1 rounded-sm max-h-16 overflow-auto">
                          {encodingPreview.startsWith('Error') ? (
                            <span className="text-destructive">{encodingPreview}</span>
                          ) : encodingPreview}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ETH Value */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">ETH Value</label>
                  <Input
                    placeholder="0"
                    value={activeCall.ethValue}
                    onChange={e => updateCall(activeCallIdx, { ethValue: e.target.value })}
                    className="h-8 text-xs font-mono bg-background"
                  />
                </div>

                {/* Per-call sim result */}
                {activeCall.simResult && (
                  <div className={`p-2.5 rounded-md border text-xs ${
                    activeCall.simResult.ok ? 'border-ide-success/30 bg-ide-success/5' : 'border-destructive/30 bg-destructive/5'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {activeCall.simResult.ok
                        ? <CheckCircle className="h-3 w-3 text-ide-success" />
                        : <AlertCircle className="h-3 w-3 text-destructive" />}
                      <span className={`font-semibold text-[10px] uppercase ${activeCall.simResult.ok ? 'text-ide-success' : 'text-destructive'}`}>
                        {activeCall.simResult.ok ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    <pre className="text-[9px] font-mono text-muted-foreground overflow-auto max-h-20 whitespace-pre-wrap break-all">
                      {typeof activeCall.simResult.data === 'string' ? activeCall.simResult.data : JSON.stringify(activeCall.simResult.data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Gas estimate */}
                {activeCall.gasEstimate && !activeCall.gasEstimate.loading && (
                  <div className="p-2 rounded-md border border-border bg-muted/30 text-xs space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Gas Estimate</div>
                    {activeCall.gasEstimate.error ? (
                      <p className="text-destructive text-[11px]">{activeCall.gasEstimate.error}</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div><span className="text-muted-foreground">Gas:</span> <span className="font-mono">{activeCall.gasEstimate.gasEstimate?.toLocaleString()}</span></div>
                        <div><span className="text-muted-foreground">Price:</span> <span className="font-mono">{activeCall.gasEstimate.gasPriceGwei?.toFixed(1)} gwei</span></div>
                        <div><span className="text-muted-foreground">Cost:</span> <span className="font-mono">{activeCall.gasEstimate.estimatedCostEth?.toFixed(6)} ETH</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="outline" onClick={handleSimulateAll}
                  disabled={!calls.some(c => c.contractAddress) || simulating} className="h-8 text-xs gap-1.5 flex-1">
                  {simulating ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                  Simulate{calls.length > 1 ? ` All (${calls.length})` : ''}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEstimateGas(activeCallIdx)}
                  disabled={!activeCall.contractAddress || activeCall.gasEstimate?.loading}
                  className="h-8 text-xs gap-1.5">
                  {activeCall.gasEstimate?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Gas
                </Button>
                {!batchMode && (
                  <Button size="sm" variant="outline" onClick={addCall} className="h-8 text-xs gap-1 px-2.5" title="Add another call">
                    <Layers className="h-3 w-3" /><Plus className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>

              {/* Send button */}
              {calls.every(c => !c.contractAddress || c.simResult?.ok) && calls.some(c => c.simResult?.ok) && (
                <Button size="sm" onClick={handleSendAll} disabled={sending}
                  className="h-9 text-xs gap-1.5 w-full bg-ide-warning/90 hover:bg-ide-warning text-primary-foreground font-semibold">
                  {sending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending {sendingIdx >= 0 ? `#${sendingIdx + 1}...` : ''}</>
                  ) : (
                    <><Send className="h-3.5 w-3.5" /> Sign & Send{calls.length > 1 ? ` (${calls.filter(c => c.simResult?.ok).length} calls)` : ''}</>
                  )}
                </Button>
              )}
            </>
          )}

          {/* Result */}
          {step === 'result' && (
            <div className="space-y-3">
              {calls.map((call, i) => {
                if (!call.txResult) return null;
                return (
                  <div key={call.id} className={`p-3 rounded-md border ${
                    call.txResult.ok ? 'border-ide-success/30 bg-ide-success/5' : 'border-destructive/30 bg-destructive/5'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {call.txResult.ok
                        ? <CheckCircle className="h-4 w-4 text-ide-success" />
                        : <AlertCircle className="h-4 w-4 text-destructive" />}
                      <span className={`text-xs font-semibold ${call.txResult.ok ? 'text-ide-success' : 'text-destructive'}`}>
                        {calls.length > 1 && `#${i + 1} `}{call.txResult.ok ? 'Sent' : 'Failed'}
                        {call.selectedFn && ` — ${call.selectedFn.name}`}
                      </span>
                    </div>
                    {call.txResult.ok && call.txResult.data?.hash && (
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] font-mono text-foreground break-all">{call.txResult.data.hash}</p>
                        <button onClick={() => copyToClipboard(call.txResult!.data.hash, `hash-${i}`)}>
                          {copied === `hash-${i}` ? <Check className="h-2.5 w-2.5 text-ide-success" /> : <Copy className="h-2.5 w-2.5 text-muted-foreground" />}
                        </button>
                      </div>
                    )}
                    {!call.txResult.ok && (
                      <p className="text-[10px] text-destructive">{typeof call.txResult.data === 'string' ? call.txResult.data : JSON.stringify(call.txResult.data)}</p>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => { setStep('configure'); setCalls([createEmptyCall()]); setActiveCallIdx(0); setBatchMode(false); }}
                  className="h-8 text-xs flex-1">New Transaction</Button>
                <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">Close</Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground">
            Calldata auto-encoded via ethers.js. Simulate before sending.
            {rpcUrl ? '' : ' ⚠ No RPC URL — set one in MCP Config → TX Simulator.'}
          </p>
        </div>
      </div>
    </div>
  );
}
