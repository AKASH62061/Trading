import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'

export function useWebSocket() {
  const ws=useRef<WebSocket|null>(null),retries=useRef(0),timer=useRef<any>()
  const{setPrices,updatePrices,setMetrics,setPortfolio,setSignals,setWsConnected,notify}=useStore()
  const connect=useCallback(()=>{
    if(ws.current?.readyState===WebSocket.OPEN)return
    const url=(import.meta as any).env?.VITE_WS_URL||'ws://localhost:4000/ws'
    try{
      const s=new WebSocket(url);ws.current=s
      s.onopen=()=>{retries.current=0;setWsConnected(true);s.send(JSON.stringify({type:'PING'}))}
      s.onmessage=ev=>{try{const m=JSON.parse(ev.data);if(m.type==='INIT'){setPrices(m.data);if(m.metrics)setMetrics(m.metrics)};if(m.type==='PRICE_UPDATE')updatePrices(m.data);if(m.type==='PORTFOLIO_UPDATE')setMetrics(m.data);if(m.type==='SIGNALS_UPDATE')setSignals(m.data);if(m.type==='ORDER_FILLED')notify(`✓ ${m.data?.side} ${m.data?.quantity}×${m.data?.symbol} filled @ $${m.data?.fillPrice?.toFixed(2)}`,'ok');if(m.type==='SL_HIT')notify(`⚠ Stop Loss: ${m.data?.symbol}`,'warn');if(m.type==='TP_HIT')notify(`✓ Take Profit: ${m.data?.symbol}`,'ok')}catch{}}
      s.onclose=()=>{setWsConnected(false);if(retries.current<10){retries.current++;timer.current=setTimeout(connect,3000)}}
      s.onerror=()=>s.close()
    }catch{}
  },[])
  useEffect(()=>{connect();return()=>{clearTimeout(timer.current);ws.current?.close()}},[connect])
}
