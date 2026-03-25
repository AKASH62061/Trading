import { NavLink, useLocation } from 'react-router-dom'
import { ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import { fm, fpct } from '../../services/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { portApi } from '../../services/api'
import {
  TrendingUp, Grid3x3, Briefcase, Clock, BarChart2, PenTool,
  Zap, Map, Shield, Settings, ChevronLeft, ChevronRight,
  Wifi, WifiOff, RefreshCw, Activity, Flag, Layers
} from 'lucide-react'

const NAV_ITEMS = [
  { to:'/trading',       icon:TrendingUp, label:'Trading',        badge:null },
  { to:'/markets',       icon:Grid3x3,    label:'Markets',        badge:null },
  { to:'/signals',       icon:Zap,        label:'AI Signals',     badge:'AI' },
  { to:'/heatmap',       icon:Map,        label:'Heat Map',       badge:null },
  { to:'/portfolio',     icon:Briefcase,  label:'Portfolio',      badge:'pos' },
  { to:'/history',       icon:Clock,      label:'History',        badge:null },
  { to:'/analytics',     icon:BarChart2,  label:'Analytics',      badge:null },
  { to:'/risk',          icon:Shield,     label:'Risk',           badge:null },
  { to:'/chartlab',      icon:PenTool,    label:'Chart Lab',      badge:null },
  { to:'/india',         icon:Flag,       label:'🇮🇳 India',       badge:'NEW' },
  { to:'/india/options', icon:Layers,     label:'Option Chain',   badge:'F&O' },
  { to:'/settings',      icon:Settings,   label:'Settings',       badge:null },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { metrics, wsConnected, sidebarCollapsed, setSidebarCollapsed, openPositions, notify } = useStore()
  const qc  = useQueryClient()
  const loc = useLocation()

  const equity  = metrics?.totalEquity ?? 100000
  const totalPnl= (metrics?.totalUnrealisedPnl ?? 0) + (metrics?.totalRealisedPnl ?? 0)
  const ret     = metrics?.totalReturnPct ?? 0
  const pnlCol  = totalPnl > 0 ? 'var(--bull)' : totalPnl < 0 ? 'var(--bear)' : 'var(--muted)'

  const resetMut = useMutation({
    mutationFn: portApi.reset,
    onSuccess: () => { qc.invalidateQueries(); notify('Portfolio reset to $100,000', 'ok') },
    onError:   () => notify('Reset failed', 'err'),
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {/* ── Topbar ── */}
      <header style={{
        display:'flex', alignItems:'center', padding:'0 16px', height:48,
        background:'var(--bg2)', borderBottom:'1px solid var(--border)',
        flexShrink:0, gap:20, zIndex:50,
      }}>
        {/* Logo */}
        <div style={{ fontFamily:'var(--font-mono,"JetBrains Mono",monospace)', fontSize:14, fontWeight:800, letterSpacing:2, flexShrink:0 }}>
          <span style={{ color:'var(--accent)' }}>PAPER</span>
          <span style={{ color:'var(--bull)' }}>TRADER</span>
          <span style={{ color:'var(--muted)', fontSize:8, marginLeft:4, fontWeight:400 }}>PRO v2</span>
        </div>

        {/* Equity */}
        <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:20, fontWeight:700 }}>
            ${equity.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
          </span>
          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:600, color:pnlCol }}>
            {fm(totalPnl)} ({fpct(ret)})
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display:'flex', gap:16, marginLeft:'auto', alignItems:'center' }}>
          {[
            { label:'Cash',      val:`$${Math.round(metrics?.cashBalance??100000).toLocaleString()}`,  color:'var(--blue)' },
            { label:'Day P&L',   val:fm(metrics?.dayPnl??0),    color:(metrics?.dayPnl??0)>=0?'var(--bull)':'var(--bear)' },
            { label:'Win Rate',  val:metrics?.winRate!=null?`${metrics.winRate.toFixed(0)}%`:'—',       color:'var(--gold)' },
            { label:'Sharpe',    val:metrics?.sharpeRatio!=null?metrics.sharpeRatio.toFixed(2):'—',     color:'var(--purple)' },
            { label:'Drawdown',  val:metrics?.currentDrawdown!=null?`${metrics.currentDrawdown.toFixed(1)}%`:'—', color:'var(--bear)' },
            { label:'Positions', val:String(openPositions.length), color:'var(--gold)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'right' }} className="hidden-xs">
              <div style={{ fontSize:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px' }}>{s.label}</div>
              <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700, color:s.color, marginTop:1 }}>{s.val}</div>
            </div>
          ))}

          {/* WS dot */}
          <div style={{ display:'flex', alignItems:'center', gap:4 }} title={wsConnected?'Connected':'Reconnecting'}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:wsConnected?'var(--bull)':'var(--bear)' }} className={wsConnected?'pulse-dot':''} />
            <span style={{ fontSize:9, color:'var(--muted)', fontFamily:'JetBrains Mono,monospace' }}>{wsConnected?'LIVE':'OFFLINE'}</span>
          </div>

          {/* Reset */}
          <button onClick={()=>{ if(confirm('Reset portfolio to $100,000?')) resetMut.mutate() }}
            style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', border:'1px solid var(--bear)', borderRadius:5, background:'transparent', color:'var(--bear)', fontSize:9, fontWeight:700, cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as any).style.background='var(--bear)';(e.currentTarget as any).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as any).style.background='transparent';(e.currentTarget as any).style.color='var(--bear)'}}>
            <RefreshCw size={10}/> RESET
          </button>
        </div>
      </header>

      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>
        {/* ── Sidebar ── */}
        <nav style={{
          width: sidebarCollapsed ? 46 : 185,
          background:'var(--bg2)', borderRight:'1px solid var(--border)',
          display:'flex', flexDirection:'column', flexShrink:0,
          overflow:'hidden', transition:'width .2s ease',
        }}>
          <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'6px 0' }}>
            {NAV_ITEMS.map(({ to, icon:Icon, label, badge }) => {
              const active = loc.pathname.startsWith(to)
              const posBadge = badge === 'pos' && openPositions.length > 0 ? openPositions.length : null
              const aiBadge  = badge === 'AI'
              return (
                <NavLink key={to} to={to}
                  style={{
                    display:'flex', alignItems:'center', gap:9,
                    padding: sidebarCollapsed ? '9px 14px' : '8px 12px',
                    fontSize:12, fontWeight:600, textDecoration:'none',
                    borderLeft:`2px solid ${active?'var(--accent)':'transparent'}`,
                    background: active ? 'var(--card)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--muted)',
                    transition:'all .12s', whiteSpace:'nowrap', overflow:'hidden',
                  }}
                  onMouseEnter={e=>{ if(!active)(e.currentTarget as any).style.background='var(--card)';(e.currentTarget as any).style.color='var(--text)' }}
                  onMouseLeave={e=>{ if(!active)(e.currentTarget as any).style.background='transparent';(e.currentTarget as any).style.color=active?'var(--text)':'var(--muted)' }}>
                  <Icon size={14} style={{ flexShrink:0 }} />
                  {!sidebarCollapsed && (
                    <>
                      <span style={{ flex:1 }}>{label}</span>
                      {posBadge && <span style={{ background:'var(--accent)', color:'#fff', fontSize:8, fontWeight:700, padding:'1px 4px', borderRadius:8, minWidth:14, textAlign:'center' }}>{posBadge}</span>}
                      {aiBadge  && <span style={{ background:'linear-gradient(135deg,var(--accent),var(--purple))', color:'#fff', fontSize:7, fontWeight:700, padding:'1px 5px', borderRadius:4, letterSpacing:.5 }}>AI</span>}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>

          {/* Collapse toggle */}
          <button onClick={()=>setSidebarCollapsed(!sidebarCollapsed)}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', height:32, borderTop:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', transition:'color .12s', width:'100%' }}
            onMouseEnter={e=>(e.currentTarget as any).style.color='var(--text)'}
            onMouseLeave={e=>(e.currentTarget as any).style.color='var(--muted)'}>
            {sidebarCollapsed ? <ChevronRight size={12}/> : <ChevronLeft size={12}/>}
          </button>
        </nav>

        {/* ── Page content ── */}
        <main style={{ flex:1, overflow:'hidden', minWidth:0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
