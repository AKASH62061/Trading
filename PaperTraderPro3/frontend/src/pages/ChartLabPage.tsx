import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { TVAdvancedChart } from '../components/chart/CandleChart'
import { MKTMETA } from '../services/api'

export function ChartLabPage() {
  const { sym } = useParams()
  const { selectedSymbol, prices } = useStore()
  const symbol = sym || selectedSymbol || 'AAPL'
  const pd = prices[symbol]
  const [tvSym, setTvSym] = useState(symbol)

  // All symbols for the symbol picker
  const allSyms = Object.keys(prices)

  return (
    <div style={{ height:'100%', overflow:'hidden', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontWeight:700, fontSize:12 }}>✏️ Chart Lab</span>
        <select value={tvSym} onChange={e=>setTvSym(e.target.value)}
          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text)', padding:'3px 8px', fontFamily:'JetBrains Mono,monospace', fontSize:11, outline:'none' }}>
          {allSyms.sort().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize:9, color:'var(--muted)' }}>Powered by TradingView — real data, all drawing tools, 100+ indicators included</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, fontSize:9, color:'var(--muted)' }}>
          <span>🖊 Drawing tools built-in</span>
          <span>·</span>
          <span>📊 RSI, MACD, Bollinger Bands pre-loaded</span>
          <span>·</span>
          <span>📅 All timeframes</span>
        </div>
      </div>
      <div style={{ flex:1, overflow:'hidden' }}>
        <TVAdvancedChart symbol={tvSym} marketType={prices[tvSym]?.marketType} />
      </div>
    </div>
  )
}
