import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { fm, fp, MKTCOLORS, TRADING_MODES } from '../services/api'
import { portApi } from '../services/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import CandleChart, { LivePositions } from '../components/chart/CandleChart'
import OrderTicket from '../components/trading/OrderTicket'
import { PnlStrip } from '../components/common/Notifications'
import { TrendingUp, TrendingDown, Minus, Brain, Activity, Shield, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { AdvancedAIPanel } from './IndiaPagesImpl'

const METRIC_LIST = [
  { k: 'totalEquity',         label: 'Equity',         fmt: (m:any) => `$${Math.round(m.totalEquity).toLocaleString()}`,          sub: (m:any) => `${m.totalReturnPct>=0?'+':''}${m.totalReturnPct?.toFixed(2)}%`,     col: (m:any) => m.totalReturnPct>=0?'var(--bull)':'var(--bear)' },
  { k: 'dayPnl',              label: 'Day P&L',        fmt: (m:any) => fm(m.dayPnl),                                               sub: ()=>'today',                                                                     col: (m:any) => m.dayPnl>=0?'var(--bull)':'var(--bear)' },
  { k: 'totalUnrealisedPnl',  label: 'Unrealised',     fmt: (m:any) => fm(m.totalUnrealisedPnl),                                   sub: ()=>'open positions',                                                            col: (m:any) => m.totalUnrealisedPnl>=0?'var(--bull)':'var(--bear)' },
  { k: 'totalRealisedPnl',    label: 'Realised',       fmt: (m:any) => fm(m.totalRealisedPnl),                                     sub: ()=>'closed trades',                                                             col: (m:any) => m.totalRealisedPnl>=0?'var(--bull)':'var(--bear)' },
  { k: 'winRate',             label: 'Win Rate',       fmt: (m:any) => m.winRate!=null?`${m.winRate.toFixed(0)}%`:'—',             sub: (m:any) => `${m.winTrades}W / ${m.lossTrades}L`,                               col: ()=>'var(--gold)' },
  { k: 'riskReward',          label: 'Risk/Reward',    fmt: (m:any) => m.riskReward!=null?`${m.riskReward.toFixed(2)}R`:'—',      sub: ()=>'avg win/loss',                                                              col: ()=>'#3b8ef8' },
  { k: 'profitFactor',        label: 'Profit Factor',  fmt: (m:any) => m.profitFactor!=null?m.profitFactor.toFixed(2):'—',        sub: ()=>'gross p/l ratio',                                                           col: (m:any) => (m.profitFactor||0)>=1?'var(--bull)':'var(--bear)' },
  { k: 'maxDrawdown',         label: 'Max DD',         fmt: (m:any) => m.maxDrawdown!=null?`${m.maxDrawdown.toFixed(2)}%`:'—',    sub: ()=>'from peak',                                                                 col: ()=>'var(--bear)' },
  { k: 'sharpeRatio',         label: 'Sharpe',         fmt: (m:any) => m.sharpeRatio!=null?m.sharpeRatio.toFixed(2):'—',         sub: ()=>'annualised',                                                                col: ()=>'var(--purple)' },
  { k: 'sortinoRatio',        label: 'Sortino',        fmt: (m:any) => m.sortinoRatio!=null?m.sortinoRatio.toFixed(2):'—',       sub: ()=>'downside adj.',                                                             col: ()=>'var(--purple)' },
  { k: 'calmarRatio',         label: 'Calmar',         fmt: (m:any) => m.calmarRatio!=null?m.calmarRatio.toFixed(2):'—',         sub: ()=>'return/maxDD',                                                              col: ()=>'#3b8ef8' },
  { k: 'openPositions',       label: 'Positions',      fmt: (m:any) => String(m.openPositions),                                    sub: ()=>'currently open',                                                            col: ()=>'var(--gold)' },
]

export function TradingPage() {
  const { sym } = useParams()
  const { setSelectedSymbol, selectedSymbol, metrics, signals, openPositions } = useStore()
  const [bottomH, setBottomH] = useState(96)
  const [tradingMode, setTradingMode] = useState('INTRADAY_15M')
  const [showAdvAI, setShowAdvAI] = useState(false)
  const dragging = useRef(false), startY = useRef(0), startH = useRef(96)

  useEffect(() => { if (sym) setSelectedSymbol(sym) }, [sym])

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (!dragging.current) return; setBottomH(Math.max(56, Math.min(260, startH.current - (e.clientY - startY.current)))) }
    const onUp   = () => { dragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const sig = selectedSymbol ? signals[selectedSymbol] : null
  const sigCol = sig?.direction === 'BUY' ? 'var(--bull)' : sig?.direction === 'SELL' ? 'var(--bear)' : 'var(--muted)'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PnlStrip />

      {/* AI Signal mini-bar */}
      {sig && sig.direction !== 'NEUTRAL' && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'4px 14px', background:'var(--bg3)', borderBottom:'1px solid var(--border)', flexShrink:0, fontSize:10 }}>
          <Brain size={11} color={sigCol} />
          <span style={{ color:sigCol, fontWeight:700, fontFamily:'JetBrains Mono,monospace' }}>{sig.direction}</span>
          <span style={{ color:'var(--muted)' }}>Ensemble {sig.ensembleConfidence}% conf</span>
          <span style={{ color:'var(--muted)' }}>·</span>
          <span style={{ color:'var(--muted)' }}>Regime: <span style={{ color:'var(--text)' }}>{sig.regime?.state}</span></span>
          <span style={{ color:'var(--muted)' }}>·</span>
          <span style={{ color:'var(--muted)' }}>Kelly: <span style={{ color:'var(--gold)', fontFamily:'JetBrains Mono,monospace' }}>{((sig.kellyCriterion||0)*100).toFixed(1)}%</span> of capital</span>
          <span style={{ color:'var(--muted)' }}>·</span>
          <span style={{ color:'var(--muted)' }}>EV: <span style={{ color:sig.expectedValue>=0?'var(--bull)':'var(--bear)', fontFamily:'JetBrains Mono,monospace' }}>{sig.expectedValue>=0?'+':''}{sig.expectedValue?.toFixed(2)}R</span></span>
          <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
            {sig.modelVotes && Object.entries(sig.modelVotes).map(([name, vote]: any) => (
              <div key={name} style={{ display:'flex', alignItems:'center', gap:3 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:vote.direction==='BUY'?'var(--bull)':vote.direction==='SELL'?'var(--bear)':'var(--muted)' }}/>
                <span style={{ color:'var(--muted)', fontSize:8 }}>{name.toUpperCase().slice(0,4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>
        {/* Chart + positions */}
        <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', minWidth:0 }}>
          <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0, padding:'8px 8px 0' }}>
            <div style={{ flex:1, minWidth:0, marginRight:8 }}>
              <CandleChart symbol={selectedSymbol || undefined} />
            </div>
            <LivePositions />
          </div>

          {/* Resize handle */}
          <div
            style={{ height:4, background:'var(--border)', cursor:'row-resize', flexShrink:0, transition:'background .15s' }}
            onMouseEnter={e => (e.currentTarget as any).style.background = 'var(--accent)'}
            onMouseLeave={e => (e.currentTarget as any).style.background = 'var(--border)'}
            onMouseDown={e => { dragging.current=true; startY.current=e.clientY; startH.current=bottomH; document.body.style.cursor='row-resize'; document.body.style.userSelect='none' }}
          />

          {/* Metrics bottom bar */}
          <div style={{ height:bottomH, background:'var(--bg2)', borderTop:'1px solid var(--border)', overflow:'hidden', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', height:'100%', overflowX:'auto', padding:'0 8px', gap:0 }}>
              {METRIC_LIST.map(({ k, label, fmt, sub, col }) => (
                <div key={k} style={{ padding:'0 18px', borderRight:'1px solid var(--border)', textAlign:'center', flexShrink:0 }}>
                  <div style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:3 }}>{label}</div>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color: metrics ? col(metrics) : 'var(--muted)' }}>
                    {metrics ? fmt(metrics) : '—'}
                  </div>
                  {metrics && <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:8, color: col(metrics), marginTop:1 }}>{sub(metrics)}</div>}
                </div>
              ))}
              {/* Current streak */}
              {metrics?.currentStreak?.type != null && metrics.currentStreak.type !== 'NONE' && (
                <div style={{ padding:'0 18px', borderRight:'1px solid var(--border)', textAlign:'center', flexShrink:0 }}>
                  <div style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:3 }}>Streak</div>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color: metrics?.currentStreak?.type==='WIN'?'var(--bull)':'var(--bear)' }}>
                    {metrics?.currentStreak?.count}{metrics?.currentStreak?.type==='WIN'?'W':'L'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel: Mode selector + Order Ticket + Advanced AI */}
        <div style={{ width:310, borderLeft:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Trading Mode Bar */}
          <TradingModeBar mode={tradingMode} setMode={setTradingMode} />
          {/* Order Ticket Header */}
          <div style={{ padding:'7px 14px', borderBottom:'1px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.8px', color:'var(--muted)' }}>Order Ticket</span>
            {selectedSymbol && signals[selectedSymbol] && (
              <span style={{ marginLeft:'auto', fontSize:8, fontFamily:'JetBrains Mono,monospace', color:sigCol, fontWeight:700 }}>
                AI: {signals[selectedSymbol].direction}
              </span>
            )}
          </div>
          {/* Order Ticket */}
          <div style={{ flex:showAdvAI?'0 0 auto':1, overflow:'hidden', maxHeight:showAdvAI?'220px':undefined }}><OrderTicket /></div>
          {/* Advanced AI Toggle */}
          <button onClick={() => setShowAdvAI(v => !v)}
            style={{ padding:'6px 14px', borderTop:'1px solid var(--border)', borderBottom: showAdvAI?'1px solid var(--border)':'none', background:'rgba(59,142,248,.06)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:6, color:'var(--accent)', fontSize:9, fontWeight:700 }}>
            <Brain size={11} color="var(--accent)" />
            🧠 Advanced AI — {TRADING_MODES.find(m=>m.value===tradingMode)?.label} Mode
            {showAdvAI ? <ChevronUp size={10} style={{ marginLeft:'auto' }}/> : <ChevronDown size={10} style={{ marginLeft:'auto' }}/>}
          </button>
          {showAdvAI && selectedSymbol && (
            <div style={{ flex:1, overflowY:'auto', padding:10 }}>
              <AdvancedAIPanel symbol={selectedSymbol} mode={tradingMode} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Trading Mode Selector component ─────────────────────────────
export function TradingModeBar({ mode, setMode }: { mode: string; setMode: (m: string) => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg3)', flexShrink:0, flexWrap:'wrap' }}>
      <span style={{ fontSize:8, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginRight:4 }}>MODE</span>
      {TRADING_MODES.map(m => (
        <button key={m.value} onClick={() => setMode(m.value)}
          title={m.desc}
          style={{ padding:'3px 8px', fontSize:8, fontWeight:700, borderRadius:4, border:`1px solid ${mode===m.value?'var(--accent)':'var(--border)'}`, background:mode===m.value?'#0a1230':'transparent', color:mode===m.value?'var(--accent)':'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
          <span>{m.emoji}</span> {m.label}
        </button>
      ))}
    </div>
  )
}
