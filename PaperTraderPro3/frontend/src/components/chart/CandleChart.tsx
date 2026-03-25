// CandleChart.tsx — TradingView Advanced Chart (live data, zero setup)
// Replaces broken lightweight-charts with TradingView embed that works perfectly
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portApi, fp, fm } from '../../services/api'

// ── Symbol → TradingView format ───────────────────────────────────────────
function toTV(sym: string): string {
  if (sym.endsWith('-USD')) {
    const base = sym.replace('-USD', '')
    return `BINANCE:${base}USDT`
  }
  const fmap: Record<string, string> = {
    'ES=F': 'CME_MINI:ES1!', 'NQ=F': 'CME_MINI:NQ1!', 'YM=F': 'CBOT_MINI:YM1!',
    'RTY=F': 'CME_MINI:RTY1!', 'GC=F': 'COMEX:GC1!', 'SI=F': 'COMEX:SI1!',
    'CL=F': 'NYMEX:CL1!', 'BZ=F': 'NYMEX:BB1!', 'NG=F': 'NYMEX:NG1!',
    'HG=F': 'COMEX:HG1!', 'ZW=F': 'CBOT:ZW1!', 'ZC=F': 'CBOT:ZC1!',
    'ZB=F': 'CBOT:ZB1!', 'ZN=F': 'CBOT:ZN1!',
  }
  if (fmap[sym]) return fmap[sym]
  if (sym.endsWith('.L')) return `LSE:${sym.replace('.L', '')}`
  // Default: try NASDAQ then NYSE
  return `NASDAQ:${sym}`
}

// ── TradingView Chart (used both in TradingPage and ChartLab) ─────────────
export function TVAdvancedChart({ symbol, marketType }: { symbol: string; marketType?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.async = true
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol: toTV(symbol),
      interval: '15',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(8,16,30,1)',
      gridColor: 'rgba(28,46,74,0.4)',
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      studies: ['STD;MACD', 'STD;RSI', 'STD;Bollinger_Bands'],
      support_host: 'https://www.tradingview.com',
    })
    ref.current.appendChild(s)
    return () => { if (ref.current) ref.current.innerHTML = '' }
  }, [symbol])

  return (
    <div className="tradingview-widget-container" ref={ref} style={{ height: '100%', width: '100%' }}>
      <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 24px)', width: '100%' }} />
      <div style={{ fontSize: 10, color: 'var(--muted)', padding: '3px 6px', textAlign: 'right' }}>
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener" style={{ color: 'var(--muted)' }}>Charts by TradingView</a>
      </div>
    </div>
  )
}

// ── CandleChart: TradingView for Trading page ─────────────────────────────
interface Props { symbol?: string; height?: number }

export default function CandleChart({ symbol, height }: Props) {
  const { selectedSymbol, prices, openPositions, signals } = useStore()
  const sym = symbol || selectedSymbol || 'AAPL'
  const pd  = prices[sym]
  const sig = signals[sym]
  const [isMax, setIsMax] = useState(false)

  const isG = (pd?.changePct ?? 0) >= 0
  const pos = openPositions.find(p => p.symbol === sym && p.status === 'OPEN')
  const pnlCol = pos ? ((pos.unrealisedPnl ?? 0) >= 0 ? 'var(--bull)' : 'var(--bear)') : 'var(--muted)'
  const sigCol = sig?.direction === 'BUY' ? 'var(--bull)' : sig?.direction === 'SELL' ? 'var(--bear)' : 'var(--muted)'

  const containerStyle: React.CSSProperties = isMax
    ? { position: 'fixed', inset: 0, zIndex: 200, background: '#08101e', display: 'flex', flexDirection: 'column' }
    : { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: height ?? '100%' }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: 'var(--card2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700 }}>{sym}</span>
        {pd && (
          <>
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 700, color: isG ? 'var(--bull)' : 'var(--bear)' }}>
              ${fp(pd.price)}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: isG ? 'var(--bull)' : 'var(--bear)' }}>
              {isG ? '+' : ''}{pd.changePct?.toFixed(2)}%
            </span>
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--muted)', marginLeft: 4 }}>
              H:{fp(pd.high)} L:{fp(pd.low)}
            </span>
          </>
        )}
        {sig && sig.direction !== 'NEUTRAL' && (
          <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'JetBrains Mono,monospace', color: sigCol, fontWeight: 700, background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
            AI {sig.direction} {sig.ensembleConfidence}%
          </span>
        )}
        {pos && (
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono,monospace', color: pnlCol, fontWeight: 700 }}>
            PnL: {fm(pos.unrealisedPnl ?? 0)}
          </span>
        )}
        <button
          onClick={() => setIsMax(m => !m)}
          style={{ marginLeft: sig ? 0 : 'auto', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--muted)', cursor: 'pointer', padding: '3px 7px', fontSize: 10 }}>
          {isMax ? '⊠' : '⊞'}
        </button>
      </div>

      {/* TradingView chart — live candles, indicators, replay, everything */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TVAdvancedChart symbol={sym} />
      </div>
    </div>
  )
}

// ── LivePositions — side panel with open positions ────────────────────────
export function LivePositions() {
  const { openPositions, metrics, setSelectedSymbol, notify } = useStore()
  const qc = useQueryClient()
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set())

  async function closeOne(posId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (closingIds.has(posId)) return
    setClosingIds(prev => new Set(prev).add(posId))
    try {
      await portApi.closePos(posId)
      qc.invalidateQueries({ queryKey: ['positions'] })
      qc.invalidateQueries({ queryKey: ['metrics'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      notify('Position closed', 'ok')
    } catch (err: any) {
      notify(err?.response?.data?.error || 'Close failed', 'err')
    } finally {
      setClosingIds(prev => { const s = new Set(prev); s.delete(posId); return s })
    }
  }

  const closeAllMut = useMutation({
    mutationFn: portApi.closeAll,
    onSuccess: () => { qc.invalidateQueries(); notify('All positions closed', 'ok') },
    onError: () => notify('Close all failed', 'err'),
  })

  return (
    <div style={{ width: 280, background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, minWidth: 220 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card2)', flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--muted)' }}>Positions</span>
          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginLeft: 6 }}>{openPositions.length}</span>
        </div>
        {openPositions.length > 0 && (
          <button onClick={() => closeAllMut.mutate()} disabled={closeAllMut.isPending}
            style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 4, border: '1px solid var(--bear)', background: 'transparent', color: 'var(--bear)', cursor: 'pointer' }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--bear)'; b.style.color = '#fff' }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--bear)' }}>
            {closeAllMut.isPending ? '...' : 'Close All'}
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {openPositions.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 11, gap: 6, padding: 20 }}>
            <span style={{ fontSize: 24 }}>📊</span>No open positions
          </div>
        ) : openPositions.map(pos => {
          const pnl = pos.unrealisedPnl ?? 0, pct = pos.unrealisedPnlPct ?? 0
          const pnlCol = pnl > 0 ? 'var(--bull)' : pnl < 0 ? 'var(--bear)' : 'var(--muted)'
          const barW = Math.min(100, Math.abs(pct) * 5)
          const isClosing = closingIds.has(pos.id)
          return (
            <div key={pos.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: `3px solid ${pnlCol}`, transition: 'background .1s' }}
              onMouseEnter={e => (e.currentTarget as any).style.background = 'var(--card2)'}
              onMouseLeave={e => (e.currentTarget as any).style.background = 'transparent'}
              onClick={() => setSelectedSymbol(pos.symbol)}>
              <div style={{ padding: '9px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 700 }}>{pos.symbol}</span>
                      <span className="tag" style={{ background: pos.side === 'BUY' ? 'rgba(0,212,168,.12)' : 'rgba(255,68,102,.12)', color: pos.side === 'BUY' ? 'var(--bull)' : 'var(--bear)' }}>{pos.side}</span>
                      {pos.leverage > 1 && <span className="tag tag-gold">{pos.leverage}×</span>}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>{pos.quantity} @ ${fp(pos.avgEntryPrice)} → ${fp(pos.currentPrice)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, fontWeight: 700, color: pnlCol }}>{fm(pnl)}</div>
                    <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: pnlCol }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</div>
                  </div>
                </div>
                <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${barW}%`, background: pnlCol, borderRadius: 1, transition: 'width .3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 8, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                    <span>Now ${fp(pos.currentPrice)}</span>
                    {pos.stopLoss && <span style={{ color: 'var(--bear)' }}>SL${fp(pos.stopLoss)}</span>}
                    {pos.takeProfit && <span style={{ color: 'var(--bull)' }}>TP${fp(pos.takeProfit)}</span>}
                  </div>
                  <button
                    onClick={e => closeOne(pos.id, e)}
                    disabled={isClosing}
                    style={{ fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 4, border: 'none', background: isClosing ? 'var(--muted)' : 'var(--bear)', color: '#fff', cursor: isClosing ? 'not-allowed' : 'pointer', transition: 'all .1s', opacity: isClosing ? .6 : 1, fontFamily: 'JetBrains Mono,monospace' }}
                    onMouseEnter={e => { if (!isClosing) (e.currentTarget as any).style.background = '#ff1a3e' }}
                    onMouseLeave={e => { if (!isClosing) (e.currentTarget as any).style.background = 'var(--bear)' }}>
                    {isClosing ? '...' : '✕ CLOSE'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', background: 'var(--card2)', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            ['Unrealised', fm(metrics?.totalUnrealisedPnl ?? 0), (metrics?.totalUnrealisedPnl ?? 0) >= 0 ? 'var(--bull)' : 'var(--bear)'],
            ['Realised', fm(metrics?.totalRealisedPnl ?? 0), (metrics?.totalRealisedPnl ?? 0) >= 0 ? 'var(--bull)' : 'var(--bear)'],
            ['Cash', `$${Math.round(metrics?.cashBalance ?? 100000).toLocaleString()}`, '#3b8ef8'],
            ['Equity', `$${Math.round(metrics?.totalEquity ?? 100000).toLocaleString()}`, 'var(--text)'],
          ].map(([l, v, c]) => (
            <div key={l}><div style={{ fontSize: 7, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>{l}</div><div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: c as string }}>{v}</div></div>
          ))}
        </div>
      </div>
    </div>
  )
}
