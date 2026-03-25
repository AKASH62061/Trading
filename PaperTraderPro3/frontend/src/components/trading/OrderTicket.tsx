import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useStore } from '../../store/useStore'
import { orderApi, portApi, fp, fm, MKTMETA } from '../../services/api'

export default function OrderTicket() {
  const qc = useQueryClient()
  const { prices, selectedSymbol, openPositions, metrics, signals, notify } = useStore()
  const pd  = selectedSymbol ? prices[selectedSymbol] : null
  const pos = openPositions.find(p => p.symbol === selectedSymbol && p.status === 'OPEN')
  const sig = selectedSymbol ? signals[selectedSymbol] : null
  const meta= pd ? MKTMETA[pd.marketType] : null

  const [side,  setSide]  = useState<'BUY'|'SELL'>('BUY')
  const [ot,    setOt]    = useState<'MARKET'|'LIMIT'|'STOP'>('MARKET')
  const [qty,   setQty]   = useState('1')
  const [lev,   setLev]   = useState(1)
  const [lmtPx, setLmtPx]= useState('')
  const [stpPx, setStpPx]= useState('')
  const [slPx,  setSlPx] = useState('')
  const [tpPx,  setTpPx] = useState('')
  const [trail, setTrail]= useState('')

  useEffect(() => {
    if (!pd) return
    setLev(1)
    setLmtPx(pd.price.toFixed(pd.price < 1 ? 4 : 2))
    setStpPx((pd.price * 0.97).toFixed(pd.price < 1 ? 4 : 2))
    setSlPx(''); setTpPx(''); setTrail('')
  }, [selectedSymbol])

  // Auto-fill SL/TP from signal
  function applySuggested() {
    if (!sig || !pd) return
    setOt('MARKET')
    setSide(sig.direction === 'BUY' ? 'BUY' : 'SELL')
    setSlPx(sig.suggestedSL.toFixed(pd.price < 1 ? 4 : 2))
    setTpPx(sig.suggestedTP.toFixed(pd.price < 1 ? 4 : 2))
  }

  const price = ot === 'MARKET' ? (pd?.price ?? 0) : ot === 'LIMIT' ? +lmtPx : +stpPx
  const qtyN  = parseFloat(qty) || 0
  const cash  = metrics?.cashBalance ?? 100000
  const comm  = pd?.marketType === 'US_STOCK' ? 0 : (pd?.marketType === 'FUTURES' || pd?.marketType === 'COMMODITY') ? 2 * qtyN : price * qtyN * 0.001
  const margin  = price * qtyN / lev
  const total   = margin + comm
  const canAfford = cash >= total

  const closeMut = useMutation({
    mutationFn: () => portApi.closePos(pos!.id),
    onSuccess: () => { qc.invalidateQueries(); notify(`${selectedSymbol} position closed`, 'ok') },
    onError:   () => notify('Close failed', 'err'),
  })

  const placeMut = useMutation({
    mutationFn: orderApi.place,
    onSuccess: (order) => {
      qc.invalidateQueries()
      notify(`✓ ${side} ${qtyN}×${selectedSymbol}${ot === 'MARKET' ? ` @ $${fp(order.fillPrice)}` : ' queued'}`, 'ok')
    },
    onError: (e: any) => notify(e.response?.data?.error || 'Order failed', 'err'),
  })

  const pnlCol = (pos?.unrealisedPnl ?? 0) > 0 ? 'var(--bull)' : (pos?.unrealisedPnl ?? 0) < 0 ? 'var(--bear)' : 'var(--muted)'

  if (!selectedSymbol || !pd) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', padding:20, textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>📈</div>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Select a symbol</div>
        <div style={{ fontSize:11, marginTop:4, color:'var(--muted)' }}>Choose from Markets or click any watchlist item</div>
      </div>
    )
  }

  const isG = pd.changePct >= 0
  const leverageOpts = meta ? [1,2,3,5,10,meta.maxLev].filter((v,i,a)=>a.indexOf(v)===i&&v<=meta.maxLev) : [1]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflowY:'auto' }}>
      <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
        {/* Symbol info */}
        <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color:'var(--accent)' }}>{selectedSymbol}</div>
        <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>{pd.marketType.replace('_',' ')} · {meta?.badge}</div>
        <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:22, fontWeight:700, color:isG?'var(--bull)':'var(--bear)' }}>${fp(pd.price)}</span>
          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:isG?'var(--bull)':'var(--bear)' }}>{isG?'+':''}{pd.changePct.toFixed(2)}% {fm(pd.change)}</span>
        </div>
        <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:8, color:'var(--muted)', marginTop:2 }}>
          Bid ${fp(pd.bid)} · Ask ${fp(pd.ask)} · Spread ${pd.spread.toFixed(pd.spread<1?4:2)}
        </div>

        {/* AI Signal suggestion */}
        {sig && sig.direction !== 'NEUTRAL' && (
          <div onClick={applySuggested}
            style={{ marginTop:10, padding:'8px 10px', borderRadius:7, border:'1px solid', borderColor:sig.direction==='BUY'?'rgba(0,212,168,.3)':'rgba(255,68,102,.3)', background:sig.direction==='BUY'?'rgba(0,212,168,.05)':'rgba(255,68,102,.05)', cursor:'pointer', transition:'all .15s' }}
            title="Click to apply signal settings">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px' }}>🤖 AI Signal</span>
              <span style={{ fontSize:7, color:'var(--muted)' }}>click to apply</span>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span className="tag" style={{ background:sig.direction==='BUY'?'rgba(0,212,168,.15)':'rgba(255,68,102,.15)', color:sig.direction==='BUY'?'var(--bull)':'var(--bear)', border:'none' }}>{sig.direction}</span>
              <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700, color:sig.direction==='BUY'?'var(--bull)':'var(--bear)' }}>{sig.confidence}% confidence</span>
              <span style={{ fontSize:9, color:'var(--muted)', marginLeft:'auto' }}>R/R {sig.riskReward.toFixed(2)}</span>
            </div>
            <div style={{ marginTop:3 }}>
              <div style={{ height:3, borderRadius:2, background:'var(--border)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${sig.confidence}%`, background:sig.direction==='BUY'?'var(--bull)':'var(--bear)', boxShadow:sig.direction==='BUY'?'0 0 6px var(--bull)':'0 0 6px var(--bear)', transition:'width .5s' }}/>
              </div>
            </div>
          </div>
        )}

        {/* Existing position */}
        {pos && (
          <div style={{ marginTop:10, padding:'9px 11px', borderRadius:7, border:'1px solid var(--border)', background:'var(--card)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'.8px', color:'var(--muted)' }}>Open Position</span>
              <span className="tag" style={{ background:pos.side==='BUY'?'rgba(0,212,168,.12)':'rgba(255,68,102,.12)', color:pos.side==='BUY'?'var(--bull)':'var(--bear)' }}>{pos.side}</span>
            </div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'var(--text2)' }}>{pos.quantity} × ${fp(pos.avgEntryPrice)} · Now ${fp(pos.currentPrice)}</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:16, fontWeight:700, color:pnlCol, marginTop:3 }}>
              {fm(pos.unrealisedPnl)} <span style={{ fontSize:10 }}>({(pos.unrealisedPnlPct??0)>=0?'+':''}{(pos.unrealisedPnlPct??0).toFixed(2)}%)</span>
            </div>
            {(pos.stopLoss||pos.takeProfit) && (
              <div style={{ display:'flex', gap:8, marginTop:4, fontFamily:'JetBrains Mono,monospace', fontSize:8 }}>
                {pos.stopLoss   && <span style={{ color:'var(--bear)' }}>SL ${fp(pos.stopLoss)}</span>}
                {pos.takeProfit && <span style={{ color:'var(--bull)' }}>TP ${fp(pos.takeProfit)}</span>}
                {pos.trailingStopPrice && <span style={{ color:'var(--gold)' }}>Trail ${fp(pos.trailingStopPrice)}</span>}
              </div>
            )}
            <button onClick={()=>closeMut.mutate()} disabled={closeMut.isPending}
              style={{ width:'100%', marginTop:8, padding:'8px', background:'var(--bear)', color:'#fff', border:'none', borderRadius:6, fontSize:10, fontWeight:800, cursor:'pointer', letterSpacing:.4 }}>
              ✕ CLOSE ENTIRE POSITION
            </button>
          </div>
        )}
      </div>

      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
        {/* BUY / SELL */}
        <div style={{ display:'flex', borderRadius:7, overflow:'hidden', border:'1px solid var(--border)' }}>
          {(['BUY','SELL'] as const).map(s=>(
            <button key={s} onClick={()=>setSide(s)}
              style={{ flex:1, padding:'10px', textAlign:'center', fontWeight:800, fontSize:12, border:'none', cursor:'pointer', transition:'all .12s',
                background:side===s?(s==='BUY'?'var(--bull)':'var(--bear)'):'var(--card)',
                color:side===s?(s==='BUY'?'#000':'#fff'):'var(--muted)' }}>
              {s==='BUY'?'▲ BUY LONG':'▼ SELL SHORT'}
            </button>
          ))}
        </div>

        {/* Order type */}
        <div style={{ display:'flex', gap:4 }}>
          {(['MARKET','LIMIT','STOP'] as const).map(t=>(
            <button key={t} onClick={()=>setOt(t)}
              style={{ flex:1, padding:'6px', fontSize:9, fontWeight:700, borderRadius:5, border:`1px solid ${ot===t?'var(--accent)':'var(--border)'}`, background:ot===t?'#0a1230':'var(--card)', color:ot===t?'var(--accent)':'var(--muted)', cursor:'pointer', transition:'all .12s', fontFamily:'JetBrains Mono,monospace' }}>
              {t}
            </button>
          ))}
        </div>

        {ot==='LIMIT' && <div><label style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, display:'block', marginBottom:4 }}>Limit Price ($)</label><input type="number" value={lmtPx} onChange={e=>setLmtPx(e.target.value)} className="pro-input"/></div>}
        {ot==='STOP'  && <div><label style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, display:'block', marginBottom:4 }}>Stop Price ($)</label><input type="number" value={stpPx} onChange={e=>setStpPx(e.target.value)} className="pro-input"/></div>}

        {/* Quantity */}
        <div>
          <label style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, display:'block', marginBottom:4 }}>Quantity</label>
          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
            <button onClick={()=>setQty(q=>String(Math.max(1,+q-1)))} style={{ width:32, height:32, borderRadius:5, border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:16, cursor:'pointer' }}>−</button>
            <input type="number" value={qty} onChange={e=>setQty(e.target.value)} className="pro-input" style={{ flex:1, textAlign:'center', fontSize:16, fontWeight:700 }}/>
            <button onClick={()=>setQty(q=>String(+q+1))} style={{ width:32, height:32, borderRadius:5, border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:16, cursor:'pointer' }}>+</button>
          </div>
          <div style={{ display:'flex', gap:4, marginTop:6 }}>
            {[10,25,50,100].map(p=>(
              <button key={p} onClick={()=>{ const mq=Math.floor((cash*p/100)/(price||1)); setQty(String(Math.max(1,mq))); }}
                style={{ flex:1, padding:'4px', fontSize:9, fontWeight:700, borderRadius:4, border:'1px solid var(--border)', background:'var(--card)', color:'var(--blue)', cursor:'pointer', fontFamily:'JetBrains Mono,monospace' }}>
                {p}%
              </button>
            ))}
          </div>
        </div>

        {/* Leverage */}
        {(meta?.maxLev??1) > 1 && (
          <div>
            <label style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, display:'block', marginBottom:4 }}>
              Leverage: <span style={{ color:'var(--gold)' }}>{lev}×</span>
            </label>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {leverageOpts.map(l=>(
                <button key={l} onClick={()=>setLev(l)}
                  style={{ padding:'3px 9px', fontSize:9, fontWeight:700, borderRadius:4, border:`1px solid ${lev===l?'var(--gold)':'var(--border)'}`, background:lev===l?'#1a1200':'var(--card)', color:lev===l?'var(--gold)':'var(--muted)', cursor:'pointer', fontFamily:'JetBrains Mono,monospace', transition:'all .1s' }}>
                  {l}×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SL / TP / Trailing */}
        {/* R/R display and auto-suggest */}
        {slPx && tpPx && price > 0 && (()=>{
          const sl=+slPx, tp=+tpPx
          const risk=Math.abs(price-sl), reward=Math.abs(price-tp)
          const rr=risk>0?reward/risk:0
          const rrCol=rr>=2?'var(--bull)':rr>=1.5?'var(--gold)':'var(--bear)'
          return (
            <div style={{ padding:'6px 10px', borderRadius:5, border:`1px solid ${rrCol}44`, background:`${rrCol}08`, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:10 }}>
              <span style={{ color:'var(--muted)' }}>Risk/Reward ratio:</span>
              <span style={{ fontFamily:'JetBrains Mono,monospace', fontWeight:700, color:rrCol }}>1 : {rr.toFixed(2)}R {rr<1.5?'⚠ Too low':rr>=2?'✓ Good':''}</span>
            </div>
          )
        })()}
        {sig&&sig.direction!=='NEUTRAL'&&(
          <button onClick={applySuggested} style={{ width:'100%', padding:'6px', border:'1px solid var(--accent)', borderRadius:5, background:'rgba(91,108,248,.1)', color:'var(--accent)', fontSize:9, fontWeight:700, cursor:'pointer', fontFamily:'JetBrains Mono,monospace' }}>
            🤖 Apply AI suggested SL/TP (R/R: {sig.riskReward?.toFixed(2)}R · Kelly: {((sig.kellyCriterion||0)*100).toFixed(1)}% capital)
          </button>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          <div>
            <label style={{ fontSize:8, color:'#e88', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, display:'block', marginBottom:3 }}>Stop Loss $</label>
            <input type="number" value={slPx} onChange={e=>setSlPx(e.target.value)} placeholder="Optional" className="pro-input" style={{ borderColor:'rgba(255,136,136,.3)', fontSize:12 }}/>
          </div>
          <div>
            <label style={{ fontSize:8, color:'#8e8', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, display:'block', marginBottom:3 }}>Take Profit $</label>
            <input type="number" value={tpPx} onChange={e=>setTpPx(e.target.value)} placeholder="Optional" className="pro-input" style={{ borderColor:'rgba(136,238,136,.3)', fontSize:12 }}/>
          </div>
        </div>
        <div>
          <label style={{ fontSize:8, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, display:'block', marginBottom:3 }}>Trailing Stop ($)</label>
          <input type="number" value={trail} onChange={e=>setTrail(e.target.value)} placeholder="Optional — distance in $" className="pro-input" style={{ borderColor:'rgba(245,200,66,.3)', fontSize:12 }}/>
        </div>

        {/* Order summary */}
        {price > 0 && qtyN > 0 && (
          <div style={{ padding:'10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg2)', fontSize:11 }}>
            {[['Price', `$${fp(price)}`],['Quantity', String(qtyN)],['Notional', `$${(price*qtyN).toLocaleString('en-US',{maximumFractionDigits:2})}`],lev>1?['Leverage',`${lev}×`]:null,['Margin', `$${margin.toLocaleString('en-US',{maximumFractionDigits:2})}`],['Commission', `$${comm.toFixed(2)}`]].filter(Boolean).map(([k,v])=>(
              <div key={k as string} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'var(--muted)' }}>{k}</span>
                <span style={{ fontFamily:'JetBrains Mono,monospace', fontWeight:600 }}>{v as string}</span>
              </div>
            ))}
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, marginTop:4, display:'flex', justifyContent:'space-between', fontWeight:700 }}>
              <span style={{ color:'var(--muted)' }}>Total required</span>
              <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, color:canAfford?'var(--bull)':'var(--bear)' }}>${total.toLocaleString('en-US',{maximumFractionDigits:2})}</span>
            </div>
          </div>
        )}

        {/* Place button */}
        <button
          disabled={!pd||qtyN<=0||!canAfford||placeMut.isPending}
          onClick={()=>{
            if(!selectedSymbol||!pd) return
            placeMut.mutate({ symbol:selectedSymbol, symbolName:pd.name||selectedSymbol, side, type:ot, quantity:qtyN,
              limitPrice:ot==='LIMIT'?+lmtPx:undefined, stopPrice:ot==='STOP'?+stpPx:undefined,
              stopLoss:slPx?+slPx:undefined, takeProfit:tpPx?+tpPx:undefined,
              trailingStop:trail?+trail:undefined, marketType:pd.marketType, leverage:lev })
          }}
          style={{ width:'100%', padding:'13px', borderRadius:8, border:'none', fontSize:13, fontWeight:800, cursor:'pointer', letterSpacing:.4, transition:'all .15s', opacity:(!pd||qtyN<=0||!canAfford)?0.3:1,
            background:side==='BUY'?'var(--bull)':'var(--bear)', color:side==='BUY'?'#000':'#fff' }}>
          {placeMut.isPending ? '...' : `${side==='BUY'?'▲ BUY':'▼ SELL'}  ${qtyN} × ${selectedSymbol}`}
        </button>
      </div>
    </div>
  )
}
