import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useStore } from '../../store/useStore'
import { portApi, fm } from '../../services/api'

// ── Toast notifications ───────────────────────────────────────────
export default function Notifications() {
  const { notifications, removeNotif } = useStore()
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:9999, display:'flex', flexDirection:'column', gap:6, pointerEvents:'none' }}>
      <AnimatePresence>
        {notifications.map(n => (
          <motion.div key={n.id}
            initial={{ opacity:0, y:10, scale:.95 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:-6, scale:.95 }}
            transition={{ duration:.16 }}
            onClick={() => removeNotif(n.id)}
            style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 16px',
              borderRadius:8, fontFamily:'JetBrains Mono,monospace', fontSize:11,
              cursor:'pointer', pointerEvents:'all', minWidth:280,
              background:'rgba(9,18,35,.97)',
              border:`1px solid ${n.type==='ok'?'var(--bull)':n.type==='err'?'var(--bear)':n.type==='warn'?'var(--gold)':'var(--blue)'}`,
              color: n.type==='ok'?'var(--bull)':n.type==='err'?'var(--bear)':n.type==='warn'?'var(--gold)':'var(--blue)',
              boxShadow:'0 8px 32px rgba(0,0,0,.5)',
            }}>
            <span style={{ flex:1 }}>{n.msg}</span>
            <X size={11}/>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── P&L Strip (open positions bar) ───────────────────────────────
export function PnlStrip() {
  const { openPositions, setSelectedSymbol, notify } = useStore()
  const qc = useQueryClient()
  const [closingSet, setClosingSet] = useState<Set<string>>(new Set())

  async function closeOne(posId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (closingSet.has(posId)) return
    setClosingSet(prev => { const s = new Set(prev); s.add(posId); return s })
    try {
      await portApi.closePos(posId)
      qc.invalidateQueries({ queryKey: ['positions'] })
      qc.invalidateQueries({ queryKey: ['metrics'] })
      notify('Position closed', 'ok')
    } catch {
      notify('Close failed — check backend', 'err')
    } finally {
      setClosingSet(prev => { const s = new Set(prev); s.delete(posId); return s })
    }
  }

  if (!openPositions.length) return null

  return (
    <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', overflowX:'auto', flexShrink:0, whiteSpace:'nowrap' }}>
      <div style={{ display:'inline-flex', height:44, alignItems:'stretch' }}>
        {openPositions.map(pos => {
          const pnl = pos.unrealisedPnl ?? 0
          const pct = pos.unrealisedPnlPct ?? 0
          const pnlCol  = pnl > 0 ? 'var(--bull)' : pnl < 0 ? 'var(--bear)' : 'var(--muted)'
          const sideCol = pos.side === 'BUY' ? 'var(--bull)' : 'var(--bear)'
          const isClosing = closingSet.has(pos.id)
          return (
            <div key={pos.id}
              style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'0 14px', borderRight:'1px solid var(--border)', cursor:'pointer', borderTop:`2px solid ${pnlCol}`, transition:'background .1s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              onClick={() => setSelectedSymbol(pos.symbol)}>
              <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, fontWeight:700, color:'var(--text)' }}>{pos.symbol}</span>
              <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:3, background:sideCol+'22', color:sideCol }}>{pos.side}</span>
              <div>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, fontWeight:700, color:pnlCol, lineHeight:1 }}>{fm(pnl)}</div>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, color:pnlCol, marginTop:2 }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</div>
              </div>
              <button
                onClick={e => closeOne(pos.id, e)}
                disabled={isClosing}
                style={{ width:20, height:20, borderRadius:'50%', border:'1px solid var(--border)', background:'var(--card2)', color:'var(--muted)', fontSize:10, cursor: isClosing ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                onMouseEnter={e => { if (!isClosing) { const b = e.currentTarget; b.style.background='var(--bear)'; b.style.color='#fff'; b.style.borderColor='var(--bear)' } }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.background='var(--card2)'; b.style.color='var(--muted)'; b.style.borderColor='var(--border)' }}>
                {isClosing ? '·' : '✕'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
