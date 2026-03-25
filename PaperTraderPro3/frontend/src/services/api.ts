import axios from 'axios'
const api = axios.create({ 
  baseURL: ((import.meta as any).env?.VITE_API_URL || 'https://papertrader-backend.onrender.com') + '/api', 
  timeout: 10000 
})

export const mktApi      = { getAll:()=>api.get('/markets').then(r=>r.data), getCandles:(sym:string,tf='15m',limit=200)=>api.get(`/prices/${sym}/candles`,{params:{tf,limit}}).then(r=>r.data), getHeatmap:()=>api.get('/prices/heatmap').then(r=>r.data) }
export const portApi     = { getMetrics:()=>api.get('/portfolio/metrics').then(r=>r.data), getPositions:()=>api.get('/portfolio/positions').then(r=>r.data), getOrders:()=>api.get('/portfolio/orders').then(r=>r.data), closePos:(id:string)=>api.delete(`/portfolio/positions/${id}`).then(r=>r.data), closeAll:()=>api.post('/portfolio/close-all').then(r=>r.data), cancelOrder:(id:string)=>api.delete(`/portfolio/orders/${id}`).then(r=>r.data), reset:()=>api.post('/portfolio/reset').then(r=>r.data) }
export const orderApi    = { place:(o:any)=>api.post('/orders',o).then(r=>r.data) }
export const signalApi   = { getAll:()=>api.get('/signals').then(r=>r.data), getOne:(sym:string)=>api.get(`/signals/${sym}`).then(r=>r.data), getKelly:(sym:string)=>api.get(`/kelly/${sym}`).then(r=>r.data), getMega:(sym:string,mode?:string)=>api.get(`/mega-signal/${sym}`,{params:{mode}}).then(r=>r.data), getAdvanced:(sym:string,mode?:string)=>api.get(`/advanced-signal/${sym}`,{params:{mode}}).then(r=>r.data) }
export const regimeApi   = { getAll:()=>api.get('/regime').then(r=>r.data), getOne:(sym:string)=>api.get(`/regime/${sym}`).then(r=>r.data) }
export const riskApi     = { get:()=>api.get('/risk').then(r=>r.data) }
export const analyticsApi= { get:()=>api.get('/analytics').then(r=>r.data) }
export const indiaApi    = { getQuotes:()=>api.get('/india/quotes').then(r=>r.data), getOptionChain:(sym:string,weeks=0)=>api.get(`/india/option-chain/${sym}`,{params:{weeks}}).then(r=>r.data), getOptionAnalysis:(sym:string,weeks=0)=>api.get(`/india/option-analysis/${sym}`,{params:{weeks}}).then(r=>r.data), getAllOptions:()=>api.get('/india/all-options').then(r=>r.data) }
export default api

export function fp(p:number|null|undefined,d?:number):string{if(p==null||isNaN(p as number))return'—';const dec=d!=null?d:(p>=10000?0:p>=100?2:p>=1?2:4);return new Intl.NumberFormat('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}).format(p)}
export function fpINR(p:number|null|undefined):string{if(p==null||isNaN(p as number))return'—';return'₹'+new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(p)}
export function fm(n:number|null|undefined,sign=true):string{if(n==null||isNaN(n as number))return'—';const s=sign?(n<0?'-':n>0?'+':''):'',a=Math.abs(n);if(a>=1e9)return`${s}$${fp(a/1e9,2)}B`;if(a>=1e6)return`${s}$${fp(a/1e6,2)}M`;if(a>=1e3)return`${s}$${fp(a/1e3,2)}K`;return`${s}$${fp(a,2)}`}
export function fpct(n:number|null|undefined):string{if(n==null||isNaN(n as number))return'—';return`${n>0?'+':''}${n.toFixed(2)}%`}
export function pnlColor(n:number):string{return n>0?'var(--bull)':n<0?'var(--bear)':'var(--muted)'}
export const MKTCOLORS:Record<string,string>={US_STOCK:'#3b8ef8',UK_STOCK:'#8b5cf6',CRYPTO:'#f0b429',COMMODITY:'#26a69a',FUTURES:'#ef5350',IN_STOCK:'#ff9800',IN_INDEX:'#4caf50',IN_OPTION:'#e91e63'}
export const TFRAMES=['1m','5m','15m','1h','3h','1d']
export const MKTMETA:Record<string,{label:string;badge:string;color:string;maxLev:number;emoji:string}>={
  US_STOCK:{label:'US Stock',badge:'NYSE/NASDAQ',color:'#3b8ef8',maxLev:4,emoji:'🇺🇸'},
  UK_STOCK:{label:'UK Stock',badge:'LSE',color:'#8b5cf6',maxLev:4,emoji:'🇬🇧'},
  CRYPTO:{label:'Crypto',badge:'24/7',color:'#f0b429',maxLev:10,emoji:'₿'},
  COMMODITY:{label:'Commodity',badge:'CME',color:'#26a69a',maxLev:20,emoji:'🪙'},
  FUTURES:{label:'Futures',badge:'E-Mini',color:'#ef5350',maxLev:50,emoji:'📈'},
  IN_STOCK:{label:'India Stock',badge:'NSE/BSE',color:'#ff9800',maxLev:5,emoji:'🇮🇳'},
  IN_INDEX:{label:'India Index',badge:'NSE F&O',color:'#4caf50',maxLev:30,emoji:'📊'},
  IN_OPTION:{label:'India Option',badge:'NSE OPT',color:'#e91e63',maxLev:1,emoji:'⚡'},
}
export const REGIME_COLORS:Record<string,string>={STRONG_TREND:'var(--bull)',WEAK_TREND:'var(--gold)',RANGE_BOUND:'var(--blue)',HIGH_VOL:'var(--bear)'}
export const REGIME_ICONS:Record<string,string>={STRONG_TREND:'▲',WEAK_TREND:'→',RANGE_BOUND:'↔',HIGH_VOL:'⚡'}
export const TRADING_MODES = [
  { value:'SCALPING_1M',  label:'Scalp 1m',  emoji:'⚡', tf:'1m',  desc:'Ultra-fast scalping'},
  { value:'SCALPING_5M',  label:'Scalp 5m',  emoji:'🔥', tf:'5m',  desc:'Fast scalping'},
  { value:'INTRADAY_15M', label:'Intraday',  emoji:'📊', tf:'15m', desc:'Intraday trading (15m candles)'},
  { value:'INTRADAY_1H',  label:'Swing 1H',  emoji:'📈', tf:'1h',  desc:'Short swing'},
  { value:'SWING_4H',     label:'Swing 4H',  emoji:'🌊', tf:'4h',  desc:'Multi-day swing'},
]
