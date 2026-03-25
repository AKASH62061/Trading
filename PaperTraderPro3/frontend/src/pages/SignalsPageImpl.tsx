import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useStore } from '../store/useStore'
import { signalApi, fp, fm } from '../services/api'
import { TrendingUp, TrendingDown, Brain, Target, Zap, Activity, BarChart2 } from 'lucide-react'

const MODEL_LABELS: Record<string, string> = {
  lstm: 'LSTM', tcn: 'TCN', transformer: 'Attn', xgboost: 'XGB', ruleEngine: 'Rules'
}
const REGIME_COLORS: Record<string, string> = {
  STRONG_TREND: 'var(--bull)', WEAK_TREND: '#00c49a', RANGE_BOUND: 'var(--gold)', HIGH_VOL: 'var(--bear)'
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2, transition: 'width .5s ease', boxShadow: `0 0 4px ${color}` }} />
    </div>
  )
}

function ModelVoteRow({ name, vote }: { name: string; vote: any }) {
  const col = vote.direction === 'BUY' ? 'var(--bull)' : vote.direction === 'SELL' ? 'var(--bear)' : 'var(--muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 36, fontFamily: 'JetBrains Mono,monospace', fontSize: 9, fontWeight: 700, color: 'var(--muted)' }}>{MODEL_LABELS[name] || name}</div>
      <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 1 }}>
        <div style={{ height: '100%', width: `${vote.prob * 100}%`, background: col, borderRadius: 1 }} />
      </div>
      <div style={{ width: 28, fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: col, textAlign: 'right' }}>{(vote.prob * 100).toFixed(0)}%</div>
      <div style={{ width: 34, fontFamily: 'JetBrains Mono,monospace', fontSize: 8, color: col, textAlign: 'right' }}>w:{(vote.weight || 0).toFixed(2)}</div>
    </div>
  )
}

export function SignalsPage() {
  const navigate = useNavigate()
  const { signals, prices, setSelectedSymbol } = useStore()
  const [filter,  setFilter]  = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [minConf, setMinConf] = useState(45)
  const [sortBy,  setSortBy]  = useState<'confidence' | 'expectedValue' | 'kelly'>('confidence')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: freshSignals, isLoading } = useQuery({
    queryKey: ['signals-full'],
    queryFn: signalApi.getAll,
    refetchInterval: 30_000,
  })

  const allSigs = freshSignals || signals
  const sigList = Object.values(allSigs)
    .filter((s: any) => (filter === 'ALL' || s.direction === filter) && s.confidence >= minConf && s.direction !== 'NEUTRAL')
    .sort((a: any, b: any) => {
      if (sortBy === 'confidence')    return b.confidence - a.confidence
      if (sortBy === 'expectedValue') return (b.expectedValue || 0) - (a.expectedValue || 0)
      if (sortBy === 'kelly')         return (b.kellyCriterion || 0) - (a.kellyCriterion || 0)
      return 0
    })

  const buyCount  = sigList.filter((s: any) => s.direction === 'BUY').length
  const sellCount = sigList.filter((s: any) => s.direction === 'SELL').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={14} color="var(--accent)" />
            <span style={{ fontWeight: 700, fontSize: 12 }}>Neural Ensemble Scanner</span>
            <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'JetBrains Mono,monospace' }}>LSTM + TCN + Transformer + XGBoost + Mamba + WaveNet + Q-Learning + ANFIS + Monte Carlo</span>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {(['ALL', 'BUY', 'SELL'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700, borderRadius: 4, border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`, background: filter === f ? '#0a1230' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer' }}>
                {f === 'BUY' ? `▲ BUY (${buyCount})` : f === 'SELL' ? `▼ SELL (${sellCount})` : `ALL (${sigList.length})`}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {(['confidence', 'expectedValue', 'kelly'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                style={{ padding: '4px 8px', fontSize: 8, fontWeight: 700, borderRadius: 4, border: `1px solid ${sortBy === s ? 'var(--gold)' : 'var(--border)'}`, background: sortBy === s ? '#1a1200' : 'transparent', color: sortBy === s ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer' }}>
                {s === 'expectedValue' ? 'EV' : s === 'kelly' ? 'Kelly' : 'Conf'}↓
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>Min: <span style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono,monospace' }}>{minConf}%</span></span>
            <input type="range" min={0} max={85} value={minConf} onChange={e => setMinConf(+e.target.value)} style={{ width: 90, accentColor: 'var(--accent)' }} />
          </div>
        </div>
      </div>

      {/* Signals grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {isLoading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Computing ensemble signals...</div>}
        {!isLoading && sigList.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <Brain size={32} style={{ marginBottom: 10, opacity: .4 }} /><br />
            No signals matching criteria — lower confidence threshold
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
          {sigList.map((sig: any) => {
            const pd  = prices[sig.symbol]
            const col = sig.direction === 'BUY' ? 'var(--bull)' : 'var(--bear)'
            const isExpanded = expanded === sig.symbol
            const regime = sig.regime || {}
            const regCol = REGIME_COLORS[regime.state] || 'var(--muted)'

            return (
              <div key={sig.symbol}
                style={{ background: 'var(--card)', border: `1px solid ${col}44`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s' }}
                onMouseEnter={e => (e.currentTarget as any).style.borderColor = col}
                onMouseLeave={e => (e.currentTarget as any).style.borderColor = `${col}44`}>

                {/* Header */}
                <div style={{ padding: '11px 14px', background: `${col}08`, borderBottom: `1px solid ${col}22`, cursor: 'pointer' }}
                  onClick={() => { setSelectedSymbol(sig.symbol); navigate(`/trading/${sig.symbol}`) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {sig.direction === 'BUY' ? <TrendingUp size={14} color={col} /> : <TrendingDown size={14} color={col} />}
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700 }}>{sig.symbol}</span>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: col, fontWeight: 700 }}>${fp(pd?.price)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <span className="tag" style={{ background: `${col}18`, color: col }}>{sig.direction}</span>
                        <span className="tag" style={{ background: `${col}18`, color: col }}>{sig.strength}</span>
                        <span className="tag" style={{ background: `${regCol}18`, color: regCol, fontSize: 7 }}>{regime.state}</span>
                        {sig.pattern && <span className="tag tag-blue">{sig.pattern.name}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 24, fontWeight: 700, color: col, lineHeight: 1 }}>{sig.ensembleConfidence || sig.confidence}%</div>
                      <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>ensemble conf.</div>
                    </div>
                  </div>
                  <ConfidenceBar value={sig.ensembleConfidence || sig.confidence} color={col} />
                </div>

                {/* Entry / SL / TP / Kelly */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: `1px solid ${col}18` }}>
                  {[['Entry', sig.suggestedEntry, col], ['SL', sig.suggestedSL, 'var(--bear)'], ['TP', sig.suggestedTP, 'var(--bull)'], ['R/R', null, 'var(--gold)'], ['Kelly', null, 'var(--gold)']].map(([label, val, c], i) => (
                    <div key={label as string} style={{ padding: '7px 0', textAlign: 'center', borderRight: i < 4 ? `1px solid ${col}18` : 'none' }}>
                      <div style={{ fontSize: 7, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: c as string }}>
                        {label === 'R/R' ? `${(sig.riskReward || 0).toFixed(2)}R` : label === 'Kelly' ? `${((sig.kellyCriterion || 0) * 100).toFixed(1)}%` : `$${fp(val as number)}`}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Expected value + models row */}
                <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${col}18` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={10} color="var(--gold)" />
                    <span style={{ fontSize: 9, color: 'var(--muted)' }}>EV: <span style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, color: (sig.expectedValue || 0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{(sig.expectedValue || 0) >= 0 ? '+' : ''}{(sig.expectedValue || 0).toFixed(2)}R</span></span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    {sig.modelVotes && Object.entries(sig.modelVotes).map(([name, vote]: any) => (
                      <div key={name} title={`${name}: ${vote.direction} ${(vote.prob * 100).toFixed(0)}%`}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: vote.direction === 'BUY' ? 'var(--bull)' : vote.direction === 'SELL' ? 'var(--bear)' : 'var(--muted)' }} />
                        <span style={{ fontSize: 7, color: 'var(--muted)' }}>{MODEL_LABELS[name]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reasons */}
                <div style={{ padding: '6px 14px' }}>
                  {sig.reasons?.slice(0, isExpanded ? 8 : 3).map((r: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--text2)', marginBottom: 2 }}>
                      <span style={{ color: col, fontSize: 8 }}>▸</span>{r}
                    </div>
                  ))}
                </div>

                {/* Expand button */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : sig.symbol)}
                  style={{ padding: '5px 14px', borderTop: `1px solid ${col}18`, cursor: 'pointer', fontSize: 9, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Activity size={9} />
                  {isExpanded ? 'Hide model details' : 'Show model details'}
                </div>

                {/* Expanded model votes */}
                {isExpanded && sig.modelVotes && (
                  <div style={{ padding: '8px 14px', borderTop: `1px solid ${col}18`, background: 'var(--bg2)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>Model votes</div>
                    {Object.entries(sig.modelVotes).map(([name, vote]: any) => (
                      <ModelVoteRow key={name} name={name} vote={vote} />
                    ))}
                    {/* Regime weights */}
                    <div style={{ marginTop: 8, fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 }}>Regime weights ({regime.state})</div>
                    {regime.weights && Object.entries(regime.weights).map(([k, v]: any) => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ width: 100, fontSize: 8, color: 'var(--muted)' }}>{k}</span>
                        <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 1 }}>
                          <div style={{ height: '100%', width: `${v * 100}%`, background: regCol, borderRadius: 1 }} />
                        </div>
                        <span style={{ width: 24, fontSize: 8, fontFamily: 'JetBrains Mono,monospace', color: regCol, textAlign: 'right' }}>{(v * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                    {regime.description && <div style={{ marginTop: 6, fontSize: 9, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.4 }}>{regime.description}</div>}
                    {/* Technicals snapshot */}
                    {sig.technicals && (
                      <>
                        <div style={{ marginTop: 8, fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 }}>Technical snapshot</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {[
                            ['RSI14', sig.technicals.rsi14?.toFixed(1), sig.technicals.rsi14 < 30 ? 'var(--bull)' : sig.technicals.rsi14 > 70 ? 'var(--bear)' : 'var(--muted)'],
                            ['MACD',  sig.technicals.macdHist > 0 ? '▲' : '▼', sig.technicals.macdHist > 0 ? 'var(--bull)' : 'var(--bear)'],
                            ['ADX',   sig.technicals.adx14?.toFixed(0), sig.technicals.adx14 > 25 ? 'var(--bull)' : 'var(--muted)'],
                            ['BB%',   sig.technicals.bb_pct?.toFixed(0)+'%', sig.technicals.bb_pct < 20 ? 'var(--bull)' : sig.technicals.bb_pct > 80 ? 'var(--bear)' : 'var(--muted)'],
                            ['CMF',   sig.technicals.cmf?.toFixed(2), sig.technicals.cmf > 0 ? 'var(--bull)' : 'var(--bear)'],
                            ['Stoch', sig.technicals.stochK?.toFixed(0), sig.technicals.stochK < 20 ? 'var(--bull)' : sig.technicals.stochK > 80 ? 'var(--bear)' : 'var(--muted)'],
                          ].map(([l, v, c]) => (
                            <div key={l as string} style={{ background: 'var(--bg)', borderRadius: 4, padding: '3px 7px', fontSize: 8, fontFamily: 'JetBrains Mono,monospace' }}>
                              <span style={{ color: 'var(--muted)' }}>{l}: </span>
                              <span style={{ color: c as string, fontWeight: 700 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
