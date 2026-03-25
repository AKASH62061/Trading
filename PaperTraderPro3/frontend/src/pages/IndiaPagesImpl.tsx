import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Brain, TrendingUp, TrendingDown, Shield, Zap, Target, Activity } from 'lucide-react'
import { indiaApi, signalApi, fp, fpINR, fpct, TRADING_MODES } from '../services/api'

const S = { borderColor:'var(--border)', background:'rgba(9,18,35,.97)', borderRadius:6, fontSize:10, fontFamily:'JetBrains Mono,monospace', color:'var(--text)' }

// ─── Advanced AI Panel ───────────────────────────────────────────
export function AdvancedAIPanel({ symbol, mode }: { symbol: string; mode: string }) {
  const { data: sig, isLoading } = useQuery({
    queryKey: ['mega-signal', symbol, mode],
    queryFn: () => signalApi.getMega(symbol, mode),
    refetchInterval: 30000,
    enabled: !!symbol,
  })

  if (isLoading) return (
    <div style={{ padding:16, textAlign:'center', color:'var(--muted)', fontSize:10 }}>
      <div className="pulse-dot" style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'var(--accent)', marginRight:6 }}/>
      Running 12 AI models...
    </div>
  )
  if (!sig) return <div style={{ padding:12, color:'var(--muted)', fontSize:10 }}>No signal data yet</div>

  const dirCol = sig.megaDirection === 'BUY' ? 'var(--bull)' : sig.megaDirection === 'SELL' ? 'var(--bear)' : 'var(--muted)'
  const adv = sig.advanced
  const ens = sig.ensemble
  const rr = sig.dynamicRR

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {/* Mega Signal Header */}
      <div style={{ padding:'14px 16px', borderRadius:10, border:`2px solid ${dirCol}44`, background:`${dirCol}08` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <Brain size={18} color={dirCol} />
          <span style={{ fontSize:16, fontWeight:800, color:dirCol, fontFamily:'JetBrains Mono,monospace' }}>
            {sig.megaDirection}
          </span>
          <span style={{ fontSize:12, color:'var(--muted)' }}>MEGA SIGNAL</span>
          <div style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:6, background:`${dirCol}22`, border:`1px solid ${dirCol}44` }}>
            <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color:dirCol }}>
              {sig.megaConfidence}% conf
            </span>
          </div>
        </div>
        {rr && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {[
              { l:'Entry',  v:`$${fp(rr.entry)}`,     col:'var(--text)' },
              { l:'Stop Loss', v:`$${fp(rr.stopLoss)}`, col:'var(--bear)' },
              { l:'Target', v:`$${fp(rr.takeProfit)}`, col:'var(--bull)' },
              { l:'RR Ratio',  v:`${rr.riskReward.toFixed(2)}:1`, col: rr.riskReward >= 1.5 ? 'var(--bull)':'var(--bear)' },
            ].map(({l,v,col}) => (
              <div key={l} style={{ padding:'8px 10px', borderRadius:6, background:'var(--card)', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:8, color:'var(--muted)', marginBottom:2 }}>{l}</div>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700, color:col }}>{v}</div>
              </div>
            ))}
          </div>
        )}
        {rr && <div style={{ marginTop:6, fontSize:9, color:'var(--muted)' }}>⚙ {rr.reasoning}</div>}
      </div>

      {/* Model Scores Grid */}
      {adv && (
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Advanced AI Models</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
            {[
              { name:'Mamba SSM',   score:adv.mambaScore*100,          icon:'🌀', desc:'Long-range state' },
              { name:'WaveNet',     score:(adv.wavenetBull/(adv.wavenetBull+adv.wavenetBear+.001))*100, icon:'〰️', desc:'Dilated convolutions' },
              { name:'Transformer', score:adv.transformerScore*100,     icon:'🎯', desc:'Multi-head attention' },
              { name:'Q-Learning',  score:adv.qConfidence*100,          icon:'🎮', desc:'Reinforcement learning' },
              { name:'ANFIS',       score:adv.anfisScore*100,            icon:'🔮', desc:'Neuro-fuzzy rules' },
              { name:'Monte Carlo', score:adv.mcProbProfit*100,         icon:'🎲', desc:`E[move]: ${adv.mcExpectedMove?.toFixed(2)}%` },
            ].map(({name,score,icon,desc}) => {
              const isHigh = score > 55, isLow = score < 45
              const col = isHigh ? 'var(--bull)' : isLow ? 'var(--bear)' : 'var(--muted)'
              return (
                <div key={name} style={{ padding:'8px 10px', borderRadius:6, background:'var(--card)', border:`1px solid var(--border)` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:8, color:'var(--muted)' }}>{icon} {name}</span>
                    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:10, fontWeight:700, color:col }}>{score.toFixed(0)}%</span>
                  </div>
                  <div style={{ height:3, background:'var(--border)', borderRadius:2 }}>
                    <div style={{ height:'100%', width:`${Math.min(100,score)}%`, background:col, borderRadius:2, transition:'width .5s' }}/>
                  </div>
                  <div style={{ fontSize:7, color:'var(--muted)', marginTop:2 }}>{desc}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Additional metrics */}
      {adv && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
          <div style={{ padding:'10px 12px', borderRadius:6, background:'var(--card)', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:8, color:'var(--muted)', marginBottom:4 }}>🌊 Hurst Exponent</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color: adv.hurstH > 0.6 ? 'var(--bull)' : adv.hurstH < 0.4 ? 'var(--gold)' : 'var(--muted)' }}>
              H = {adv.hurstH?.toFixed(3)}
            </div>
            <div style={{ fontSize:8, color:'var(--muted)' }}>
              {adv.hurstH > 0.6 ? '📈 Strong trending' : adv.hurstH < 0.4 ? '↩️ Mean-reverting' : '🎲 Random walk'}
            </div>
          </div>
          <div style={{ padding:'10px 12px', borderRadius:6, background:'var(--card)', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:8, color:'var(--muted)', marginBottom:4 }}>💧 Order Flow</div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:14, fontWeight:700, color: adv.orderFlowImbalance > 0.1 ? 'var(--bull)' : adv.orderFlowImbalance < -0.1 ? 'var(--bear)' : 'var(--muted)' }}>
              {adv.orderFlowImbalance > 0 ? '+' : ''}{(adv.orderFlowImbalance * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize:8, color:'var(--muted)' }}>Buy/sell imbalance proxy</div>
          </div>
          {adv.multiTF && (
            <div style={{ gridColumn:'1/-1', padding:'10px 12px', borderRadius:6, background:'var(--card)', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:8, color:'var(--muted)', marginBottom:6 }}>📊 Multi-Timeframe Confluence</div>
              <div style={{ display:'flex', gap:6, marginBottom:4 }}>
                {[{l:'1m',v:adv.multiTF.m1},{l:'5m',v:adv.multiTF.m5},{l:'15m',v:adv.multiTF.m15},{l:'1H',v:adv.multiTF.m1h}].map(({l,v})=>(
                  <div key={l} style={{ flex:1, textAlign:'center', padding:'4px 0', borderRadius:4, background:v>0.1?'rgba(0,212,168,.1)':v<-0.1?'rgba(255,68,102,.1)':'rgba(255,255,255,.04)', border:`1px solid ${v>0.1?'var(--bull)':v<-0.1?'var(--bear)':'var(--border)'}` }}>
                    <div style={{ fontSize:7, color:'var(--muted)' }}>{l}</div>
                    <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, fontWeight:700, color:v>0.1?'var(--bull)':v<-0.1?'var(--bear)':'var(--muted)' }}>{v>0.1?'↑':v<-0.1?'↓':'→'}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:8, fontWeight:700, color: adv.multiTF.alignment==='ALIGNED'?'var(--bull)':adv.multiTF.alignment==='CONFLICTING'?'var(--bear)':'var(--gold)' }}>
                {adv.multiTF.alignment} — strongest on {adv.multiTF.strongestTF}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ensemble model votes */}
      {ens?.modelVotes && (
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Ensemble Model Votes</div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {Object.entries(ens.modelVotes).map(([name, vote]: [string, any]) => {
              const col = vote.direction==='BUY'?'var(--bull)':vote.direction==='SELL'?'var(--bear)':'var(--muted)'
              return (
                <div key={name} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:4, background:'var(--card)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:8, color:'var(--muted)', minWidth:90 }}>{name.toUpperCase()}</span>
                  <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, fontWeight:700, color:col, minWidth:40 }}>{vote.direction}</span>
                  <div style={{ flex:1, height:3, background:'var(--border)', borderRadius:2 }}>
                    <div style={{ height:'100%', width:`${vote.prob*100}%`, background:col, borderRadius:2 }}/>
                  </div>
                  <span style={{ fontSize:8, color:'var(--muted)' }}>{(vote.prob*100).toFixed(0)}%</span>
                  <span style={{ fontSize:7, color:'var(--muted)' }}>w={vote.weight?.toFixed(3)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI Thinking Notes */}
      {adv?.thinkingNotes && adv.thinkingNotes.length > 0 && (
        <div style={{ padding:'10px 12px', borderRadius:6, background:'rgba(59,142,248,.06)', border:'1px solid rgba(59,142,248,.2)' }}>
          <div style={{ fontSize:8, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>🧠 AI Reasoning</div>
          {adv.thinkingNotes.map((note: string, i: number) => (
            <div key={i} style={{ fontSize:9, color:'var(--muted)', lineHeight:1.6, borderLeft:'2px solid var(--accent)', paddingLeft:8, marginBottom:3 }}>
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Option Chain Page ────────────────────────────────────────────
export function IndiaOptionChainPage() {
  const [selectedIndex, setSelectedIndex] = useState('NIFTY50.NS')
  const [weeks, setWeeks] = useState(0)
  const [viewMode, setViewMode] = useState<'chain'|'analysis'>('chain')

  const { data: analysis, isLoading } = useQuery({
    queryKey: ['option-analysis', selectedIndex, weeks],
    queryFn: () => indiaApi.getOptionAnalysis(selectedIndex, weeks),
    refetchInterval: 15000,
  })

  const oc = analysis?.optionChain
  const indices = [
    { sym:'NIFTY50.NS',   label:'NIFTY 50',    color:'#4caf50' },
    { sym:'BANKNIFTY.NS', label:'BANK NIFTY',  color:'#2196f3' },
    { sym:'FINNIFTY.NS',  label:'FIN NIFTY',   color:'#ff9800' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0, flexWrap:'wrap' }}>
        <span style={{ fontSize:14, fontWeight:800 }}>🇮🇳 Indian Option Chain</span>
        <div style={{ display:'flex', gap:4 }}>
          {indices.map(idx => (
            <button key={idx.sym} onClick={() => setSelectedIndex(idx.sym)}
              style={{ padding:'4px 10px', fontSize:9, fontWeight:700, borderRadius:4, border:`1px solid ${selectedIndex===idx.sym?idx.color:'var(--border)'}`, background:selectedIndex===idx.sym?`${idx.color}22`:'transparent', color:selectedIndex===idx.sym?idx.color:'var(--muted)', cursor:'pointer' }}>
              {idx.label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {[0,1,2].map(w => (
            <button key={w} onClick={() => setWeeks(w)}
              style={{ padding:'3px 8px', fontSize:8, fontWeight:700, borderRadius:3, border:`1px solid ${weeks===w?'var(--gold)':'var(--border)'}`, background:weeks===w?'#1a1200':'transparent', color:weeks===w?'var(--gold)':'var(--muted)', cursor:'pointer' }}>
              {w===0?'Current Week':w===1?'Next Week':'Week +2'}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          {(['chain','analysis'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{ padding:'4px 10px', fontSize:9, fontWeight:700, borderRadius:4, border:`1px solid ${viewMode===m?'var(--accent)':'var(--border)'}`, background:viewMode===m?'#0a1230':'transparent', color:viewMode===m?'var(--accent)':'var(--muted)', cursor:'pointer' }}>
              {m==='chain'?'📋 Option Chain':'🧠 AI Analysis'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>Loading option chain...</div>}

      {!isLoading && oc && (
        <div style={{ flex:1, overflow:'auto' }}>
          {/* Stats Bar */}
          <div style={{ display:'flex', gap:8, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexWrap:'wrap' }}>
            {[
              { l:'Spot',          v:`₹${fp(oc.spotPrice)}`,        col:'var(--text)' },
              { l:'PCR',           v:oc.pcr?.toFixed(2),             col:oc.pcr>1.2?'var(--bull)':oc.pcr<0.8?'var(--bear)':'var(--muted)' },
              { l:'Max Pain',      v:`₹${fp(oc.maxPainStrike)}`,    col:'var(--gold)' },
              { l:'Implied Move',  v:`±${oc.impliedMove}%`,         col:'var(--accent)' },
              { l:'CE Wall',       v:`₹${fp(oc.resistanceLevel)}`,  col:'var(--bear)' },
              { l:'PE Wall',       v:`₹${fp(oc.supportLevel)}`,     col:'var(--bull)' },
              { l:'Total CE OI',   v:((oc.totalCE_OI||0)/1e5).toFixed(1)+'L', col:'var(--bear)' },
              { l:'Total PE OI',   v:((oc.totalPE_OI||0)/1e5).toFixed(1)+'L', col:'var(--bull)' },
            ].map(({l,v,col}) => (
              <div key={l} style={{ padding:'6px 10px', borderRadius:6, background:'var(--card)', border:'1px solid var(--border)', minWidth:90 }}>
                <div style={{ fontSize:8, color:'var(--muted)', marginBottom:2 }}>{l}</div>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700, color:col }}>{v}</div>
              </div>
            ))}
          </div>

          {viewMode === 'analysis' && analysis && (
            <div style={{ padding:16 }}>
              {/* OC Analysis */}
              <div style={{ padding:16, borderRadius:10, border:`2px solid ${analysis.bias==='BULLISH'?'var(--bull)':analysis.bias==='BEARISH'?'var(--bear)':'var(--border)'}33`, background:'var(--card)', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:18 }}>{analysis.bias==='BULLISH'?'🟢':analysis.bias==='BEARISH'?'🔴':'🟡'}</span>
                  <div>
                    <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:16, fontWeight:800, color:analysis.bias==='BULLISH'?'var(--bull)':analysis.bias==='BEARISH'?'var(--bear)':'var(--muted)' }}>
                      {analysis.bias}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>Strength: {analysis.strength}%</div>
                  </div>
                  <div style={{ marginLeft:'auto', padding:'8px 16px', borderRadius:8, background:'var(--bg)', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>Suggested Strategy</div>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', marginTop:2 }}>{analysis.strategy}</div>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {analysis.signals?.map((s: string, i: number) => (
                    <div key={i} style={{ fontSize:10, color:'var(--muted)', display:'flex', gap:6 }}>
                      <span style={{ color:'var(--accent)' }}>•</span>{s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {viewMode === 'chain' && oc.strikes && (
            <div style={{ padding:'0 8px' }}>
              {/* Option Chain Table */}
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9 }}>
                <thead>
                  <tr style={{ background:'var(--bg2)', borderBottom:'2px solid var(--border)' }}>
                    <th colSpan={5} style={{ padding:'6px 8px', textAlign:'center', color:'var(--bear)', borderRight:'2px solid var(--border)' }}>CALLS (CE)</th>
                    <th style={{ padding:'6px 8px', textAlign:'center', color:'var(--gold)', background:'rgba(240,180,41,.08)' }}>STRIKE</th>
                    <th colSpan={5} style={{ padding:'6px 8px', textAlign:'center', color:'var(--bull)', borderLeft:'2px solid var(--border)' }}>PUTS (PE)</th>
                  </tr>
                  <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', fontFamily:'JetBrains Mono,monospace' }}>
                    {['OI','OI Chg','Volume','IV%','LTP'].map(h => (
                      <th key={h} style={{ padding:'4px 6px', fontWeight:600, color:'var(--muted)', borderRight:h==='LTP'?'2px solid var(--border)':'none' }}>{h}</th>
                    ))}
                    <th style={{ padding:'4px 6px', fontWeight:800, color:'var(--gold)', background:'rgba(240,180,41,.08)', fontSize:10 }}>₹ STRIKE</th>
                    {['LTP','IV%','Volume','OI Chg','OI'].map(h => (
                      <th key={h} style={{ padding:'4px 6px', fontWeight:600, color:'var(--muted)', borderLeft:h==='LTP'?'2px solid var(--border)':'none' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {oc.strikes.map((s: any) => {
                    const isATM = Math.abs(s.strike - oc.spotPrice) < (oc.spotPrice > 30000 ? 100 : 50)
                    const isMaxPain = s.maxPain
                    const isMaxCE = s.CE_OI === Math.max(...oc.strikes.map((x: any) => x.CE_OI))
                    const isMaxPE = s.PE_OI === Math.max(...oc.strikes.map((x: any) => x.PE_OI))
                    return (
                      <tr key={s.strike} style={{
                        background: isATM ? 'rgba(240,180,41,.08)' : isMaxPain ? 'rgba(59,142,248,.06)' : 'transparent',
                        borderBottom:'1px solid var(--border)',
                        fontFamily:'JetBrains Mono,monospace',
                      }}>
                        <td style={{ padding:'5px 6px', color:isMaxCE?'var(--bear)':'var(--text)', fontWeight:isMaxCE?700:400, textAlign:'right' }}>{((s.CE_OI||0)/1000).toFixed(0)}K</td>
                        <td style={{ padding:'5px 6px', color:(s.CE_OI_chg||0)>0?'var(--bull)':'var(--bear)', textAlign:'right' }}>{s.CE_OI_chg>0?'+':''}{((s.CE_OI_chg||0)/1000).toFixed(0)}K</td>
                        <td style={{ padding:'5px 6px', color:'var(--muted)', textAlign:'right' }}>{((s.CE_volume||0)/1000).toFixed(0)}K</td>
                        <td style={{ padding:'5px 6px', color:'var(--text)', textAlign:'right' }}>{s.CE_IV?.toFixed(1)}</td>
                        <td style={{ padding:'5px 6px', color:'var(--bear)', fontWeight:700, textAlign:'right', borderRight:'2px solid var(--border)' }}>₹{fp(s.CE_LTP)}</td>
                        <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:800, background:'rgba(240,180,41,.05)', color: isATM?'var(--gold)':s.strike>oc.spotPrice?'rgba(255,68,102,.7)':'rgba(0,212,168,.7)', fontSize:10 }}>
                          {isMaxPain && <span style={{ fontSize:7, color:'var(--accent)', marginRight:2 }}>★</span>}
                          {isATM && <span style={{ fontSize:7, color:'var(--gold)', marginRight:2 }}>ATM</span>}
                          {fp(s.strike, 0)}
                        </td>
                        <td style={{ padding:'5px 6px', color:'var(--bull)', fontWeight:700, textAlign:'right', borderLeft:'2px solid var(--border)' }}>₹{fp(s.PE_LTP)}</td>
                        <td style={{ padding:'5px 6px', color:'var(--text)', textAlign:'right' }}>{s.PE_IV?.toFixed(1)}</td>
                        <td style={{ padding:'5px 6px', color:'var(--muted)', textAlign:'right' }}>{((s.PE_volume||0)/1000).toFixed(0)}K</td>
                        <td style={{ padding:'5px 6px', color:(s.PE_OI_chg||0)>0?'var(--bull)':'var(--bear)', textAlign:'right' }}>{s.PE_OI_chg>0?'+':''}{((s.PE_OI_chg||0)/1000).toFixed(0)}K</td>
                        <td style={{ padding:'5px 6px', color:isMaxPE?'var(--bull)':'var(--text)', fontWeight:isMaxPE?700:400, textAlign:'right' }}>{((s.PE_OI||0)/1000).toFixed(0)}K</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ padding:'8px 12px', fontSize:8, color:'var(--muted)', borderTop:'1px solid var(--border)' }}>
                ★ = Max Pain strike | ATM = At The Money | CE Wall = {fp(oc.resistanceLevel, 0)} | PE Wall = {fp(oc.supportLevel, 0)} | Source: {oc.source}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── India Stocks & Indices Page ──────────────────────────────────
export function IndiaMarketsPage() {
  const { data: quotes = [] } = useQuery({ queryKey:['india-quotes'], queryFn:indiaApi.getQuotes, refetchInterval:10000 })
  const { data: allOptions } = useQuery({ queryKey:['india-all-options'], queryFn:indiaApi.getAllOptions, refetchInterval:30000 })

  const quoteMap: Record<string, any> = {}
  quotes.forEach((q: any) => { quoteMap[q.symbol] = q })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg2)', flexShrink:0 }}>
        <span style={{ fontSize:14, fontWeight:800 }}>🇮🇳 Indian Markets — NSE/BSE Live</span>
        <span style={{ marginLeft:10, fontSize:9, color:'var(--muted)' }}>Refreshing every 10s via Yahoo Finance India</span>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:12 }}>

        {/* Index Dashboards with Option Chain Summary */}
        {allOptions && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>📊 Nifty Indices — Live</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:10 }}>
              {Object.entries(allOptions).map(([sym, data]: [string, any]) => {
                const q = quoteMap[sym]
                const biasCol = data.bias==='BULLISH'?'var(--bull)':data.bias==='BEARISH'?'var(--bear)':'var(--muted)'
                return (
                  <div key={sym} style={{ padding:14, borderRadius:10, background:'var(--card)', border:`1px solid var(--border)`, borderTop:`3px solid ${biasCol}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                      <div>
                        <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, fontWeight:800 }}>{sym.replace('.NS','').replace('.BO','')}</div>
                        <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:20, fontWeight:800, color:'var(--text)', marginTop:2 }}>
                          ₹{fp(q?.price ?? data.spotPrice, 0)}
                        </div>
                        <div style={{ fontSize:10, color:q?.changePct>=0?'var(--bull)':'var(--bear)' }}>
                          {q?.changePct >= 0 ? '▲' : '▼'} {Math.abs(q?.changePct??0).toFixed(2)}%
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ padding:'4px 10px', borderRadius:6, background:`${biasCol}18`, border:`1px solid ${biasCol}44`, marginBottom:4 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:biasCol }}>{data.bias}</div>
                        </div>
                        <div style={{ fontSize:9, color:'var(--muted)' }}>PCR: <span style={{ color:data.pcr>1.2?'var(--bull)':data.pcr<0.8?'var(--bear)':'var(--muted)', fontWeight:700 }}>{data.pcr?.toFixed(2)}</span></div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4 }}>
                      {[
                        { l:'Max Pain', v:`₹${fp(data.maxPain,0)}`, col:'var(--gold)' },
                        { l:'IV Move',  v:`±${data.impliedMove}%`,  col:'var(--accent)' },
                        { l:'Support',  v:`₹${fp(data.support,0)}`, col:'var(--bull)' },
                        { l:'Resist',   v:`₹${fp(data.resistance,0)}`,col:'var(--bear)' },
                      ].map(({l,v,col}) => (
                        <div key={l} style={{ padding:'5px 6px', borderRadius:4, background:'var(--bg)', textAlign:'center' }}>
                          <div style={{ fontSize:7, color:'var(--muted)' }}>{l}</div>
                          <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, fontWeight:700, color:col }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Indian Stocks Grid */}
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>🇮🇳 NSE/BSE Stocks</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:8 }}>
            {quotes.filter((q: any) => !q.symbol.includes('NIFTY') && !q.symbol.includes('NSEI') && !q.symbol.includes('SENSEX')).map((q: any) => {
              const isG = (q.changePct ?? 0) >= 0
              return (
                <div key={q.symbol} style={{ padding:11, borderRadius:8, background:'var(--card)', border:'1px solid var(--border)' }}>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700 }}>{q.symbol.replace('.NS','').replace('.BO','')}</div>
                  <div style={{ fontSize:8, color:'var(--muted)', margin:'2px 0 6px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.symbol}</div>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:15, fontWeight:700, color:isG?'var(--bull)':'var(--bear)' }}>₹{fp(q.price, q.price>1000?0:2)}</div>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, color:isG?'var(--bull)':'var(--bear)' }}>{isG?'▲':'▼'} {isG?'+':''}{(q.changePct??0).toFixed(2)}%</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
