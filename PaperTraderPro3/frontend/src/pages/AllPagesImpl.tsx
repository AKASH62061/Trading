import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { useStore } from '../store/useStore'
import { mktApi, portApi, analyticsApi, fp, fm, fpct, MKTCOLORS, MKTMETA } from '../services/api'
import CandleChart from '../components/chart/CandleChart'
import { AlertTriangle, TrendingUp, TrendingDown, Shield, BarChart2, Target, Zap, Brain } from 'lucide-react'

const S = { borderColor:'var(--border)', background:'rgba(9,18,35,.97)', borderRadius:6, fontSize:10, fontFamily:'JetBrains Mono,monospace', color:'var(--text)' }

// ═══ MARKETS PAGE ═══════════════════════════════════════════════
export function MarketsPage() {
  const navigate = useNavigate()
  const { prices, setSelectedSymbol, openPositions, signals } = useStore()
  const [tab,    setTab]    = useState('ALL')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'change'|'price'|'signal'>('change')

  const { data: instruments = [] } = useQuery({ queryKey:['markets'], queryFn:mktApi.getAll, refetchInterval:5000 })

  const tabs = ['ALL','US_STOCK','UK_STOCK','CRYPTO','COMMODITY','FUTURES']
  const filtered = instruments
    .filter((i:any) => (tab==='ALL'||i.marketType===tab) && (!search||i.sym.toLowerCase().includes(search.toLowerCase())||i.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a:any,b:any) => {
      const pa=prices[a.sym], pb=prices[b.sym], sa=signals[a.sym], sb=signals[b.sym]
      if(sortBy==='signal') return (sb?.ensembleConfidence||0)-(sa?.ensembleConfidence||0)
      if(sortBy==='change') return (pb?.changePct??0)-(pa?.changePct??0)
      return (pb?.price??0)-(pa?.price??0)
    })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0, flexWrap:'wrap' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." className="pro-input" style={{ maxWidth:220, flex:1 }}/>
        <div style={{ display:'flex', gap:3 }}>
          {tabs.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'4px 9px', fontSize:9, fontWeight:700, borderRadius:4, border:`1px solid ${tab===t?'var(--accent)':'var(--border)'}`, background:tab===t?'#0a1230':'transparent', color:tab===t?'var(--accent)':'var(--muted)', cursor:'pointer' }}>
              {t==='ALL'?'All':MKTMETA[t]?.emoji+' '+t.replace('_',' ')}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:3, marginLeft:'auto' }}>
          {(['change','price','signal'] as const).map(s=>(
            <button key={s} onClick={()=>setSortBy(s)} style={{ padding:'3px 8px', fontSize:8, fontWeight:700, borderRadius:3, border:`1px solid ${sortBy===s?'var(--gold)':'var(--border)'}`, background:sortBy===s?'#1a1200':'transparent', color:sortBy===s?'var(--gold)':'var(--muted)', cursor:'pointer' }}>
              {s==='signal'?'AI Signal':s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:10 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
          {filtered.map((inst:any) => {
            const pd  = prices[inst.sym], sig = signals[inst.sym]
            const isG = (pd?.changePct??inst.dailyChg??0)>=0
            const chg = pd?.changePct??inst.dailyChg??0
            const hasPos = openPositions.some(p=>p.symbol===inst.sym)
            const mInfo = MKTMETA[inst.marketType]
            const sigCol = sig?.direction==='BUY'?'var(--bull)':sig?.direction==='SELL'?'var(--bear)':'transparent'
            return (
              <div key={inst.sym}
                style={{ padding:11, borderRadius:8, border:`1px solid ${hasPos?'var(--accent)':'var(--border)'}`, background:'var(--card)', cursor:'pointer', position:'relative', overflow:'hidden', transition:'all .12s' }}
                onMouseEnter={e=>(e.currentTarget as any).style.borderColor='var(--accent)'}
                onMouseLeave={e=>(e.currentTarget as any).style.borderColor=hasPos?'var(--accent)':'var(--border)'}
                onClick={()=>{ setSelectedSymbol(inst.sym); navigate(`/trading/${inst.sym}`) }}>
                {hasPos && <div style={{ position:'absolute', top:6, right:6, width:5, height:5, borderRadius:'50%', background:'var(--accent)' }} className="pulse-dot"/>}
                <div style={{ fontSize:7, fontWeight:700, padding:'1px 5px', borderRadius:3, display:'inline-block', marginBottom:4, background:MKTCOLORS[inst.marketType]+'22', color:MKTCOLORS[inst.marketType] }}>{mInfo?.badge}</div>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700 }}>{inst.sym}</div>
                <div style={{ fontSize:8, color:'var(--muted)', margin:'2px 0 6px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inst.name}</div>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, fontWeight:700, color:isG?'var(--bull)':'var(--bear)' }}>${fp(pd?.price??inst.price)}</div>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, color:isG?'var(--bull)':'var(--bear)' }}>{isG?'▲':'▼'} {isG?'+':''}{chg.toFixed(2)}%</div>
                {sig && sig.direction!=='NEUTRAL' && (
                  <div style={{ marginTop:5, padding:'2px 6px', borderRadius:3, background:`${sigCol}18`, border:`1px solid ${sigCol}44`, display:'inline-flex', alignItems:'center', gap:4 }}>
                    <Brain size={8} color={sigCol}/>
                    <span style={{ fontSize:7, fontWeight:700, color:sigCol, fontFamily:'JetBrains Mono,monospace' }}>{sig.direction} {sig.ensembleConfidence||sig.confidence}%</span>
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

// ═══ HEATMAP PAGE ═══════════════════════════════════════════════
export function HeatmapPage() {
  const { prices, setSelectedSymbol, signals } = useStore()
  const navigate = useNavigate()
  const { data: heatData=[] } = useQuery({ queryKey:['heatmap'], queryFn:mktApi.getHeatmap, refetchInterval:3000 })

  const grouped: Record<string,any[]> = {}
  heatData.forEach((i:any)=>{ if(!grouped[i.marketType])grouped[i.marketType]=[]; grouped[i.marketType].push(i) })

  function heatBg(pct: number): string {
    const t = Math.max(-1, Math.min(1, pct/3))
    if(t>0) return `rgba(0,${Math.round(180+t*75)},${Math.round(150+t*50)},${.25+t*.55})`
    if(t<0) return `rgba(${Math.round(200+(-t)*55)},${Math.round(50+(-t)*20)},${Math.round(70)},${.25+(-t)*.55})`
    return 'rgba(25,44,72,.4)'
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0, display:'flex', gap:16, alignItems:'center' }}>
        <span style={{ fontWeight:700, fontSize:12 }}>Market Heat Map</span>
        <div style={{ display:'flex', gap:6, alignItems:'center', fontSize:9, color:'var(--muted)' }}>
          <div style={{ width:50, height:8, background:'linear-gradient(90deg,rgba(255,68,102,.7),rgba(25,44,72,.4),rgba(0,212,168,.7))', borderRadius:2 }}/>
          <span>−3% ← 0% → +3%</span>
        </div>
        <span style={{ fontSize:9, color:'var(--muted)' }}>AI signal dot = BUY <span style={{ color:'var(--bull)' }}>●</span> SELL <span style={{ color:'var(--bear)' }}>●</span></span>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:12 }}>
        {Object.entries(grouped).map(([mkt,items])=>{
          const meta = MKTMETA[mkt]
          return (
            <div key={mkt} style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:MKTCOLORS[mkt], marginBottom:8 }}>{meta?.emoji} {meta?.label}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {items.sort((a,b)=>(b.changePct??0)-(a.changePct??0)).map((item:any)=>{
                  const pd = prices[item.symbol], sig = signals[item.symbol]
                  const chg = pd?.changePct??item.changePct??0
                  const isG = chg>=0
                  const sigCol = sig?.direction==='BUY'?'var(--bull)':sig?.direction==='SELL'?'var(--bear)':null
                  return (
                    <div key={item.symbol}
                      style={{ background:heatBg(chg), border:`1px solid ${isG?'rgba(0,212,168,.25)':'rgba(255,68,102,.25)'}`, padding:'8px 12px', minWidth:90, textAlign:'center', borderRadius:6, cursor:'pointer', position:'relative', transition:'transform .12s' }}
                      onMouseEnter={e=>{ (e.currentTarget as any).style.transform='scale(1.05)'; (e.currentTarget as any).style.zIndex='10' }}
                      onMouseLeave={e=>{ (e.currentTarget as any).style.transform='scale(1)'; (e.currentTarget as any).style.zIndex='1' }}
                      onClick={()=>{ setSelectedSymbol(item.symbol); navigate(`/trading/${item.symbol}`) }}>
                      {sigCol && <div style={{ position:'absolute', top:4, right:4, width:6, height:6, borderRadius:'50%', background:sigCol }} className="pulse-dot"/>}
                      <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, fontWeight:700, color:'rgba(255,255,255,.9)' }}>{item.symbol.replace('-USD','').replace('.L','')}</div>
                      <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, fontWeight:700, color:isG?'#80ffe8':'#ff9aaa', marginTop:1 }}>{isG?'+':''}{chg.toFixed(2)}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══ PORTFOLIO PAGE ══════════════════════════════════════════════
export function PortfolioPage() {
  const { openPositions, closedPositions, pendingOrders, metrics, notify } = useStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'open'|'pending'|'closed'>('open')

  const closeMut  = useMutation({ mutationFn:portApi.closePos,    onSuccess:()=>{ qc.invalidateQueries(); notify('Position closed','ok') }, onError:()=>notify('Close failed','err') })
  const cancelMut = useMutation({ mutationFn:portApi.cancelOrder, onSuccess:()=>{ qc.invalidateQueries(); notify('Order cancelled','ok') } })

  const stats = [
    { l:'Cash',        v:`$${Math.round(metrics?.cashBalance??0).toLocaleString()}`,         col:'#3b8ef8' },
    { l:'Market Value',v:`$${Math.round(metrics?.totalMarketValue??0).toLocaleString()}`,    col:'var(--text)' },
    { l:'Total Equity',v:`$${Math.round(metrics?.totalEquity??0).toLocaleString()}`,         col:'var(--text)' },
    { l:'Return',      v:fpct(metrics?.totalReturnPct??0),                                   col:(metrics?.totalReturnPct??0)>=0?'var(--bull)':'var(--bear)' },
    { l:'Unrealised',  v:fm(metrics?.totalUnrealisedPnl??0),                                 col:(metrics?.totalUnrealisedPnl??0)>=0?'var(--bull)':'var(--bear)' },
    { l:'Realised',    v:fm(metrics?.totalRealisedPnl??0),                                   col:(metrics?.totalRealisedPnl??0)>=0?'var(--bull)':'var(--bear)' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      <div style={{ display:'flex', gap:8, padding:10, borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap' }}>
        {stats.map(({l,v,col})=>(
          <div key={l} style={{ flex:1, minWidth:110, padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--card)' }}>
            <div style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:3 }}>{l}</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, fontWeight:700, color:col }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {(['open','pending','closed'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'9px 16px', fontSize:11, fontWeight:700, border:'none', borderBottom:`2px solid ${tab===t?'var(--accent)':'transparent'}`, background:'transparent', color:tab===t?'var(--text)':'var(--muted)', cursor:'pointer' }}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
            {t==='open'&&openPositions.length>0&&<span style={{ marginLeft:5, background:'var(--accent)', color:'#fff', fontSize:8, padding:'1px 5px', borderRadius:8 }}>{openPositions.length}</span>}
            {t==='pending'&&pendingOrders.length>0&&<span style={{ marginLeft:5, background:'var(--gold)', color:'#000', fontSize:8, padding:'1px 5px', borderRadius:8 }}>{pendingOrders.length}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:12 }}>
        {tab==='open' && (openPositions.length===0 ? <Empty icon="💼" t="No open positions"/> :
          openPositions.map(pos=>{
            const pnl=pos.unrealisedPnl??0, pct=pos.unrealisedPnlPct??0, col=pnl>0?'var(--bull)':pnl<0?'var(--bear)':'var(--muted)'
            return (
              <div key={pos.id} style={{ marginBottom:10, borderRadius:10, border:'1px solid var(--border)', overflow:'hidden', background:'var(--card)', borderLeft:`3px solid ${col}` }}>
                <div style={{ display:'flex', alignItems:'center', padding:'11px 14px', borderBottom:'1px solid var(--border)', gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, fontWeight:700 }}>
                      {pos.symbol}
                      <span className="tag" style={{ marginLeft:6, background:pos.side==='BUY'?'rgba(0,212,168,.12)':'rgba(255,68,102,.12)', color:pos.side==='BUY'?'var(--bull)':'var(--bear)' }}>{pos.side}</span>
                      {pos.leverage>1&&<span className="tag tag-gold" style={{ marginLeft:4 }}>{pos.leverage}×</span>}
                    </div>
                    <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>{pos.symbolName}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:16, fontWeight:700, color:col }}>{fm(pnl)}</div>
                    <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, color:col }}>{pct>=0?'+':''}{pct.toFixed(2)}%</div>
                  </div>
                  <button onClick={()=>closeMut.mutate(pos.id)} disabled={closeMut.isPending} style={{ padding:'8px 16px', background:'var(--bear)', color:'#fff', border:'none', borderRadius:7, fontSize:11, fontWeight:800, cursor:'pointer' }}>✕ CLOSE</button>
                </div>
                <div style={{ display:'flex', background:'var(--card2)' }}>
                  {[['Qty',String(pos.quantity)],['Entry','$'+fp(pos.avgEntryPrice)],['Current','$'+fp(pos.currentPrice)],['Mkt Val','$'+Math.round(pos.marketValue??0).toLocaleString()],['P&L',fm(pnl)]].map(([l,v],i)=>(
                    <div key={l} style={{ flex:1, padding:'7px 12px', borderRight:i<4?'1px solid var(--border)':'none' }}>
                      <div style={{ fontSize:7, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2 }}>{l}</div>
                      <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700, color:l==='P&L'?col:'var(--text)' }}>{v}</div>
                    </div>
                  ))}
                </div>
                {(pos.stopLoss||pos.takeProfit||pos.trailingStopPrice)&&(
                  <div style={{ padding:'5px 14px', display:'flex', gap:10, fontFamily:'JetBrains Mono,monospace', fontSize:9 }}>
                    {pos.stopLoss&&<span style={{color:'var(--bear)'}}>SL ${fp(pos.stopLoss)}</span>}
                    {pos.takeProfit&&<span style={{color:'var(--bull)'}}>TP ${fp(pos.takeProfit)}</span>}
                    {pos.trailingStopPrice&&<span style={{color:'var(--gold)'}}>Trail ${fp(pos.trailingStopPrice)}</span>}
                  </div>
                )}
              </div>
            )
          })
        )}
        {tab==='pending' && (pendingOrders.length===0 ? <Empty icon="⏳" t="No pending orders"/> :
          pendingOrders.map(order=>(
            <div key={order.id} style={{ marginBottom:10, borderRadius:10, border:'1px solid var(--border)', overflow:'hidden', background:'var(--card)', borderLeft:'3px solid var(--gold)' }}>
              <div style={{ display:'flex', alignItems:'center', padding:'11px 14px', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700 }}>{order.symbol} <span className="tag" style={{ background:order.side==='BUY'?'rgba(0,212,168,.12)':'rgba(255,68,102,.12)', color:order.side==='BUY'?'var(--bull)':'var(--bear)' }}>{order.side}</span></div>
                  <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>{order.type} · Qty {order.quantity} · @ ${fp(order.limitPrice||order.stopPrice)}</div>
                </div>
                <span className="tag tag-gold">PENDING</span>
                <button onClick={()=>cancelMut.mutate(order.id)} style={{ padding:'5px 12px', border:'1px solid var(--muted)', borderRadius:5, background:'transparent', color:'var(--muted)', fontSize:9, fontWeight:700, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          ))
        )}
        {tab==='closed' && (closedPositions.length===0 ? <Empty icon="📊" t="No closed positions"/> :
          closedPositions.map(pos=>{
            const pnl=pos.realisedPnl??0
            return (
              <div key={pos.id} style={{ marginBottom:8, borderRadius:8, border:'1px solid var(--border)', overflow:'hidden', background:'var(--card)', borderLeft:`3px solid ${pnl>=0?'var(--bull)':'var(--bear)'}` }}>
                <div style={{ display:'flex', alignItems:'center', padding:'9px 14px', gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700 }}>{pos.symbol} <span style={{ fontSize:9, color:'var(--muted)', fontWeight:400 }}>{pos.quantity} units</span></div>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>Entry ${fp(pos.avgEntryPrice)} → ${fp(pos.closePrice)}</div>
                  </div>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color:pnl>=0?'var(--bull)':'var(--bear)' }}>{fm(pnl)}</div>
                  <span className="tag" style={{ background:pnl>=0?'rgba(0,212,168,.12)':'rgba(255,68,102,.12)', color:pnl>=0?'var(--bull)':'var(--bear)' }}>{pnl>=0?'WIN':'LOSS'}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ═══ HISTORY PAGE ════════════════════════════════════════════════
export function HistoryPage() {
  const { closedPositions } = useStore()
  const totalPnl = closedPositions.reduce((s,p)=>s+(p.realisedPnl??0),0)
  const wins = closedPositions.filter(p=>(p.realisedPnl??0)>0)
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      <div style={{ display:'flex', gap:24, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0 }}>
        {[['Trades',closedPositions.length,'var(--text)'],['Net P&L',fm(totalPnl),totalPnl>=0?'var(--bull)':'var(--bear)'],['Win Rate',closedPositions.length?`${(wins.length/closedPositions.length*100).toFixed(0)}%`:'—','var(--gold)'],['Wins',wins.length,'var(--bull)'],['Losses',closedPositions.length-wins.length,'var(--bear)']].map(([l,v,c])=>(
          <div key={l as string}><div style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px' }}>{l}</div><div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color:c as string }}>{v}</div></div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead style={{ position:'sticky', top:0, background:'var(--bg2)', zIndex:1 }}>
            <tr>{['Symbol','Side','Qty','Entry','Close','Commission','P&L','Result','Date'].map(h=>(
              <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontSize:8, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.8px', borderBottom:'1px solid var(--border)' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {closedPositions.map(pos=>{
              const pnl=pos.realisedPnl??0
              return (
                <tr key={pos.id} style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e=>(e.currentTarget as any).style.background='var(--card)'}
                  onMouseLeave={e=>(e.currentTarget as any).style.background='transparent'}>
                  <td style={{ padding:'8px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700 }}>{pos.symbol}<br/><span style={{ fontSize:8, color:'var(--muted)', fontWeight:400 }}>{pos.symbolName}</span></td>
                  <td style={{ padding:'8px 12px', fontSize:11, fontWeight:700, color:pos.side==='BUY'?'var(--bull)':'var(--bear)' }}>{pos.side}</td>
                  <td style={{ padding:'8px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:11 }}>{pos.quantity}</td>
                  <td style={{ padding:'8px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:11 }}>${fp(pos.avgEntryPrice)}</td>
                  <td style={{ padding:'8px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:11 }}>${fp(pos.closePrice)}</td>
                  <td style={{ padding:'8px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:11 }}>${pos.commission.toFixed(2)}</td>
                  <td style={{ padding:'8px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700, color:pnl>=0?'var(--bull)':'var(--bear)' }}>{fm(pnl)}</td>
                  <td style={{ padding:'8px 12px' }}><span className="tag" style={{ background:pnl>=0?'rgba(0,212,168,.12)':'rgba(255,68,102,.12)', color:pnl>=0?'var(--bull)':'var(--bear)' }}>{pnl>=0?'WIN':'LOSS'}</span></td>
                  <td style={{ padding:'8px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:9, color:'var(--muted)' }}>{new Date(pos.closedAt!).toLocaleDateString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {closedPositions.length===0 && <Empty icon="📋" t="No closed trades yet"/>}
      </div>
    </div>
  )
}

// ═══ ANALYTICS PAGE ══════════════════════════════════════════════
export function AnalyticsPage() {
  const { metrics, closedPositions } = useStore()
  const { data: analytics } = useQuery({ queryKey:['analytics'], queryFn:analyticsApi.get, refetchInterval:15000 })
  const isUp = (metrics?.equityCurve??[]).length>1 && (metrics?.equityCurve??[100000])[((metrics?.equityCurve??[]).length-1)] >= 100000
  const equityData = (metrics?.equityCurve??[100000]).map((v,i)=>({ i, v }))
  const pnlData = closedPositions.slice(0,40).reverse().map((p,i)=>({ i, pnl:p.realisedPnl??0 }))
  const byMarket = analytics?.byMarket??{}

  const cards = [
    { l:'Win Rate',      v:metrics?.winRate!=null?`${metrics.winRate.toFixed(1)}%`:'—',      sub:`${metrics?.winTrades??0}W / ${metrics?.lossTrades??0}L`,   col:'var(--gold)',   icon:<Target size={14}/> },
    { l:'Risk/Reward',   v:metrics?.riskReward!=null?`${metrics.riskReward.toFixed(2)}R`:'—', sub:'Avg win / avg loss',                                        col:'#3b8ef8',       icon:<BarChart2 size={14}/> },
    { l:'Profit Factor', v:metrics?.profitFactor!=null?metrics.profitFactor.toFixed(2):'—',   sub:'Gross profit/loss',                                         col:(metrics?.profitFactor??0)>=1?'var(--bull)':'var(--bear)', icon:<Zap size={14}/> },
    { l:'Sharpe',        v:metrics?.sharpeRatio!=null?metrics.sharpeRatio.toFixed(2):'—',     sub:'Annualised',                                                col:'var(--purple)', icon:<TrendingUp size={14}/> },
    { l:'Sortino',       v:metrics?.sortinoRatio!=null?metrics.sortinoRatio.toFixed(2):'—',   sub:'Downside-adj.',                                             col:'var(--purple)', icon:<TrendingUp size={14}/> },
    { l:'Calmar',        v:metrics?.calmarRatio!=null?metrics.calmarRatio.toFixed(2):'—',     sub:'Return/maxDD',                                              col:'#3b8ef8',       icon:<Shield size={14}/> },
    { l:'Max Drawdown',  v:metrics?.maxDrawdown!=null?`${metrics.maxDrawdown.toFixed(2)}%`:'—', sub:'From peak',                                               col:'var(--bear)',   icon:<TrendingDown size={14}/> },
    { l:'Avg Hold',      v:metrics?.avgHoldingTimeHours!=null?`${metrics.avgHoldingTimeHours.toFixed(1)}h`:'—', sub:'Per trade',                               col:'var(--text)',   icon:<Zap size={14}/> },
  ]

  return (
    <div style={{ height:'100%', overflowY:'auto', padding:14, background:'var(--bg)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
        {cards.map(({l,v,sub,col,icon})=>(
          <div key={l} style={{ padding:'12px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--card)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:10, right:12, opacity:.12, color:col }}>{icon}</div>
            <div style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:3 }}>{l}</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:20, fontWeight:700, color:col }}>{v}</div>
            <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10, marginBottom:10 }}>
        <div style={{ padding:14, borderRadius:10, border:'1px solid var(--border)', background:'var(--card)' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10 }}>Equity Curve</div>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={equityData}>
              <defs><linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={isUp?'#00d4a8':'#ff4466'} stopOpacity={.22}/><stop offset="95%" stopColor={isUp?'#00d4a8':'#ff4466'} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="i" hide/><YAxis hide domain={['auto','auto']}/>
              <Tooltip contentStyle={S} formatter={(v:any)=>[`$${Math.round(v).toLocaleString()}`,'Equity']}/>
              <ReferenceLine y={100000} stroke="var(--border)" strokeDasharray="4 4"/>
              <Area type="monotone" dataKey="v" stroke={isUp?'#00d4a8':'#ff4466'} fill="url(#eqG)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ padding:14, borderRadius:10, border:'1px solid var(--border)', background:'var(--card)' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10 }}>P&L per Trade</div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={pnlData}>
              <XAxis dataKey="i" hide/><YAxis hide/>
              <Tooltip contentStyle={S} formatter={(v:any)=>[`$${v.toFixed(2)}`,'P&L']}/>
              <ReferenceLine y={0} stroke="var(--border)"/>
              <Bar dataKey="pnl" radius={[2,2,0,0]}>{pnlData.map((d,i)=><Cell key={i} fill={d.pnl>=0?'#00d4a8':'#ff4466'}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {Object.keys(byMarket).length>0&&(
        <div style={{ padding:14, borderRadius:10, border:'1px solid var(--border)', background:'var(--card)' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10 }}>Performance by Market</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8 }}>
            {Object.entries(byMarket).map(([mkt,d]:any)=>(
              <div key={mkt} style={{ padding:'10px 12px', borderRadius:8, border:`1px solid ${MKTCOLORS[mkt]??'var(--border)'}44`, background:`${MKTCOLORS[mkt]??'#000'}11` }}>
                <div style={{ fontSize:9, fontWeight:700, color:MKTCOLORS[mkt]??'var(--text)', marginBottom:5 }}>{MKTMETA[mkt]?.emoji} {mkt.replace('_',' ')}</div>
                {[['Trades',d.trades,'var(--text)'],['Win Rate',d.trades?`${(d.wins/d.trades*100).toFixed(0)}%`:'—','var(--gold)'],['P&L',fm(d.totalPnl),d.totalPnl>=0?'var(--bull)':'var(--bear)']].map(([l,v,c])=>(
                  <div key={l as string} style={{ display:'flex', justifyContent:'space-between', marginBottom:3, fontSize:9 }}>
                    <span style={{ color:'var(--muted)' }}>{l}</span>
                    <span style={{ fontFamily:'JetBrains Mono,monospace', fontWeight:700, color:c as string }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══ RISK PAGE ═══════════════════════════════════════════════════
export function RiskPage() {
  const { metrics, openPositions, signals } = useStore()
  const risk = metrics?.riskMetrics
  const equityPeak = Math.max(...(metrics?.equityCurve??[100000]))

  return (
    <div style={{ height:'100%', overflowY:'auto', padding:14, background:'var(--bg)' }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14 }}>
        <Shield size={16} color="var(--accent)"/>
        <h2 style={{ fontSize:14, fontWeight:700, margin:0 }}>Risk Management Dashboard</h2>
        <span style={{ fontSize:10, color:'var(--muted)', marginLeft:4 }}>Kelly Criterion · CVaR · Correlation · Drawdown Control</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
        {[
          { l:'Portfolio Heat',    v:risk?`${risk.portfolioHeat?.toFixed(1)}%`:'—',      sub:'% capital at risk from SLs',    col:risk?.portfolioHeat>20?'var(--bear)':risk?.portfolioHeat>10?'var(--gold)':'var(--bull)', warn:risk?.portfolioHeat>25 },
          { l:'Daily VaR 95%',     v:risk?`${risk.dailyVaR?.toFixed(2)}%`:'—',           sub:'1-day value at risk',            col:'#3b8ef8', warn:false },
          { l:'Margin Level',      v:risk?`${risk.marginLevel?.toFixed(0)}%`:'—',         sub:'Equity/margin ratio',           col:risk?.marginLevel<150?'var(--bear)':risk?.marginLevel<300?'var(--gold)':'var(--bull)', warn:risk?.marginLevel<150 },
          { l:'Margin Used',       v:risk?`$${Math.round(risk.marginUsed||0).toLocaleString()}`:'—', sub:'Across open positions', col:'var(--text)', warn:false },
          { l:'Margin Available',  v:risk?`$${Math.round(risk.marginAvailable||0).toLocaleString()}`:'—', sub:'Available to trade', col:'#3b8ef8', warn:false },
          { l:'Net Delta',         v:risk?`${risk.betaWeightedDelta>=0?'+':''}${risk.betaWeightedDelta}`:'—', sub:'Longs minus shorts', col:risk?.betaWeightedDelta>0?'var(--bull)':risk?.betaWeightedDelta<0?'var(--bear)':'var(--muted)', warn:false },
        ].map(({l,v,sub,col,warn})=>(
          <div key={l} style={{ padding:'13px 15px', borderRadius:10, border:`1px solid ${warn?'var(--bear)':'var(--border)'}`, background:'var(--card)', boxShadow:warn?'0 0 12px rgba(255,68,102,.15)':'none' }}>
            {warn&&<div style={{ fontSize:8, color:'var(--bear)', fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:3 }}><AlertTriangle size={9}/>HIGH RISK</div>}
            <div style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:4 }}>{l}</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:18, fontWeight:700, color:col }}>{v}</div>
            <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Position exposure */}
      <div style={{ padding:14, borderRadius:10, border:'1px solid var(--border)', background:'var(--card)', marginBottom:10 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10 }}>Position Exposure + AI Signal</div>
        {openPositions.length===0 ? <div style={{ color:'var(--muted)', fontSize:11, textAlign:'center', padding:20 }}>No open positions</div> :
          openPositions.map(pos=>{
            const exposure = metrics?.totalEquity ? (pos.marketValue/metrics.totalEquity*100) : 0
            const pnlCol = (pos.unrealisedPnl??0)>0?'var(--bull)':(pos.unrealisedPnl??0)<0?'var(--bear)':'var(--muted)'
            const sig = signals[pos.symbol]
            return (
              <div key={pos.id} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700 }}>{pos.symbol}</span>
                    <span className="tag" style={{ background:pos.side==='BUY'?'rgba(0,212,168,.12)':'rgba(255,68,102,.12)', color:pos.side==='BUY'?'var(--bull)':'var(--bear)' }}>{pos.side}</span>
                    {sig&&sig.direction!=='NEUTRAL'&&<span style={{ fontSize:8, color:sig.direction==='BUY'?'var(--bull)':'var(--bear)', fontFamily:'JetBrains Mono,monospace' }}>AI:{sig.direction} {sig.ensembleConfidence||sig.confidence}%</span>}
                  </div>
                  <div style={{ display:'flex', gap:16 }}>
                    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, color:'var(--muted)' }}>{exposure.toFixed(1)}% exposure</span>
                    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700, color:pnlCol }}>{fm(pos.unrealisedPnl)}</span>
                  </div>
                </div>
                <div style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(100,exposure)}%`, background:pnlCol, borderRadius:2, transition:'width .3s' }}/>
                </div>
                {pos.stopLoss&&(
                  <div style={{ marginTop:3, fontSize:8, color:'var(--muted)', fontFamily:'JetBrains Mono,monospace' }}>
                    Risk: ${Math.abs(pos.currentPrice-pos.stopLoss).toFixed(2)}/unit · ${Math.abs((pos.currentPrice-pos.stopLoss)*pos.quantity*pos.multiplier).toFixed(0)} total
                  </div>
                )}
              </div>
            )
          })
        }
      </div>

      {/* Drawdown */}
      <div style={{ padding:14, borderRadius:10, border:'1px solid var(--border)', background:'var(--card)' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:12 }}>Drawdown Monitor</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {[['Current Drawdown',(metrics?.currentDrawdown??0).toFixed(2)+'%',metrics?.currentDrawdown??0],['Max Drawdown',(metrics?.maxDrawdown??0).toFixed(2)+'%',metrics?.maxDrawdown??0]].map(([l,v,val])=>(
            <div key={l as string}>
              <div style={{ fontSize:9, color:'var(--muted)', marginBottom:5 }}>{l}</div>
              <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden', marginBottom:4 }}>
                <div style={{ height:'100%', width:`${Math.min(100,val as number)}%`, background:`hsl(${Math.max(0,120-(val as number)*4)},80%,50%)`, borderRadius:3, transition:'width .5s' }}/>
              </div>
              <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:18, fontWeight:700, color:'var(--bear)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══ CHARTLAB PAGE ═══════════════════════════════════════════════
function ChartLabPageOLD() {
  const { sym } = useParams()
  const { selectedSymbol } = useStore()
  const symbol = sym || selectedSymbol || 'AAPL'
  return (
    <div style={{ height:'100%', overflow:'hidden', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0, fontSize:10, color:'var(--muted)', display:'flex', gap:16, alignItems:'center' }}>
        <span style={{ fontWeight:700, color:'var(--text)' }}>✏️ Chart Lab</span>
        <span>Trend Lines · Fibonacci Retracement/Fan/Extension · Pitchfork · Gann Fan · MA · EMA · BB · VWAP · RSI · MACD</span>
        <span style={{ marginLeft:'auto', fontFamily:'JetBrains Mono,monospace', fontSize:9 }}>Scroll=pan · Ctrl+Scroll=zoom · Esc=cancel</span>
      </div>
      <div style={{ flex:1, overflow:'hidden' }}>
        <CandleChart symbol={symbol} />
      </div>
    </div>
  )
}

// ═══ SETTINGS PAGE ═══════════════════════════════════════════════
export function SettingsPage() {
  const { metrics } = useStore()
  return (
    <div style={{ height:'100%', overflowY:'auto', padding:24, background:'var(--bg)' }}>
      <h1 style={{ fontSize:16, fontWeight:700, marginBottom:20 }}>Settings</h1>
      <div style={{ maxWidth:580, display:'flex', flexDirection:'column', gap:14 }}>
        {[
          { title:'Account', fields:[{ l:'Starting Capital ($)', v:'100,000', t:'number' },{ l:'Display Currency', v:'USD', t:'text' }] },
          { title:'AI Engine', fields:[{ l:'Signal confidence threshold', v:'45', t:'number' },{ l:'Kelly multiplier', v:'0.5 (half-Kelly)', t:'text' },{ l:'Regime detection sensitivity', v:'Medium', t:'text' }] },
          { title:'Risk Management', fields:[{ l:'Max portfolio heat (%)', v:'20', t:'number' },{ l:'Max single position (%)', v:'25', t:'number' },{ l:'Daily loss limit (%)', v:'5', t:'number' }] },
          { title:'About', fields:[{ l:'Version', v:'2.0.0', t:'text' },{ l:'Frontend', v:'React 18 + TypeScript + Vite', t:'text' },{ l:'Backend', v:'Node.js + Express + WebSocket', t:'text' },{ l:'AI Engine', v:'LSTM + TCN + Transformer + XGBoost + Rules', t:'text' },{ l:'Risk Engine', v:'Kelly + CVaR + Correlation + Drawdown', t:'text' }] },
        ].map(section=>(
          <div key={section.title} style={{ padding:16, borderRadius:10, border:'1px solid var(--border)', background:'var(--card)' }}>
            <h2 style={{ fontSize:12, fontWeight:700, marginBottom:14, color:'var(--text2)' }}>{section.title}</h2>
            {section.fields.map(f=>(
              <div key={f.l} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <label style={{ fontSize:10, color:'var(--muted)', alignSelf:'center' }}>{f.l}</label>
                <input defaultValue={f.v} type={f.t} className="pro-input" style={{ fontSize:12 }}/>
              </div>
            ))}
          </div>
        ))}
        {/* AI Status */}
        <div style={{ padding:16, borderRadius:10, border:'1px solid rgba(0,212,168,.3)', background:'rgba(0,212,168,.04)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <Brain size={14} color="var(--bull)"/>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--bull)' }}>Neural Ensemble Status</span>
          </div>
          {[['LSTM','Active — 48 hidden units, 2 layers'],['TCN','Active — dilated convolutions, 4 blocks'],['Transformer','Active — 4 attention heads, d=24'],['XGBoost-style','Active — gradient boosting, 200 estimators'],['Rule Engine','Active — 17 indicators (legacy baseline)'],['Regime Detector','Active — HMM 4-state classifier'],['Kelly Criterion','Active — half-Kelly position sizing'],['CVaR (95%)','Active — conditional tail risk']].map(([m,s])=>(
            <div key={m} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--bull)' }}/>
              <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, fontWeight:700, color:'var(--text)', minWidth:120 }}>{m}</span>
              <span style={{ fontSize:9, color:'var(--muted)' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Empty({ icon, t }: { icon:string; t:string }) {
  return <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60, color:'var(--muted)' }}><div style={{ fontSize:28, marginBottom:10 }}>{icon}</div><div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{t}</div></div>
}
