import { create } from 'zustand'

export interface PriceData { symbol:string;name:string;price:number;open:number;high:number;low:number;change:number;changePct:number;volume:number;marketType:string;bid:number;ask:number;spread:number }
export interface Position { id:string;symbol:string;symbolName:string;side:'BUY'|'SELL';marketType:string;leverage:number;multiplier:number;quantity:number;avgEntryPrice:number;currentPrice:number;commission:number;stopLoss?:number;takeProfit?:number;trailingStop?:number;trailingStopPrice?:number;status:'OPEN'|'CLOSED';openedAt:string;closedAt?:string;closePrice?:number;unrealisedPnl:number;unrealisedPnlPct:number;realisedPnl:number;marketValue:number;highWaterMark:number }
export interface Order { id:string;symbol:string;symbolName:string;side:'BUY'|'SELL';type:string;quantity:number;limitPrice?:number;stopPrice?:number;stopLoss?:number;takeProfit?:number;trailingStop?:number;marketType:string;leverage:number;status:string;fillPrice?:number;commission:number;createdAt:string;filledAt?:string;pnl?:number }
export interface EnsembleSignal { symbol:string;direction:'BUY'|'SELL'|'NEUTRAL';confidence:number;strength:string;reasons:string[];suggestedEntry:number;suggestedSL:number;suggestedTP:number;riskReward:number;technicals:any;pattern?:{name:string;type:string;reliability:number};timestamp:number;ensembleConfidence:number;modelVotes:Record<string,{direction:string;prob:number;weight:number}>;regime:{state:string;bias:string;confidence:number;adx:number;bbWidth:number;atrPct:number;trend:string;weights:any;description:string};kellyCriterion:number;expectedValue:number }
export interface Metrics { cashBalance:number;totalMarketValue:number;totalEquity:number;totalUnrealisedPnl:number;totalRealisedPnl:number;totalReturnPct:number;dayPnl:number;weekPnl:number;monthPnl:number;openPositions:number;totalTrades:number;winTrades:number;lossTrades:number;winRate:number;avgWin:number;avgLoss:number;riskReward:number;profitFactor:number;maxDrawdown:number;currentDrawdown:number;sharpeRatio:number;sortinoRatio:number;calmarRatio:number;largestWin:number;largestLoss:number;avgHoldingTimeHours:number;bestTrade:any;worstTrade:any;consecutiveWins:number;consecutiveLosses:number;currentStreak:any;equityCurve:number[];riskMetrics:any;initialCapital:number }

interface Store {
  prices:Record<string,PriceData>; setPrices:(p:Record<string,PriceData>)=>void; updatePrices:(p:Record<string,Partial<PriceData>>)=>void
  selectedSymbol:string|null; setSelectedSymbol:(s:string|null)=>void
  openPositions:Position[]; closedPositions:Position[]; pendingOrders:Order[]; tradeHistory:Order[]; metrics:Metrics|null
  signals:Record<string,EnsembleSignal>; regimes:Record<string,any>; riskData:any
  setPortfolio:(d:{open?:Position[];closed?:Position[];pending?:Order[];history?:Order[]})=>void
  setMetrics:(m:Metrics)=>void; setSignals:(s:Record<string,EnsembleSignal>)=>void
  setRegimes:(r:Record<string,any>)=>void; setRiskData:(d:any)=>void
  timeframe:string; setTimeframe:(tf:string)=>void
  wsConnected:boolean; setWsConnected:(v:boolean)=>void
  sidebarCollapsed:boolean; setSidebarCollapsed:(v:boolean)=>void
  notifications:Array<{id:string;msg:string;type:'ok'|'err'|'warn'|'info';ts:number}>
  notify:(msg:string,type?:'ok'|'err'|'warn'|'info')=>void; removeNotif:(id:string)=>void
}
export const useStore = create<Store>((set,get)=>({
  prices:{}, setPrices:p=>set({prices:p}),
  updatePrices:upd=>set(s=>{const np={...s.prices};Object.entries(upd).forEach(([k,v])=>{np[k]={...np[k],...v} as PriceData});return{prices:np}}),
  selectedSymbol:'AAPL', setSelectedSymbol:s=>set({selectedSymbol:s}),
  openPositions:[],closedPositions:[],pendingOrders:[],tradeHistory:[],metrics:null,
  signals:{},regimes:{},riskData:null,
  setPortfolio:d=>set(s=>({openPositions:d.open??s.openPositions,closedPositions:d.closed??s.closedPositions,pendingOrders:d.pending??s.pendingOrders,tradeHistory:d.history??s.tradeHistory})),
  setMetrics:m=>set({metrics:m}), setSignals:s=>set({signals:s}),
  setRegimes:r=>set({regimes:r}), setRiskData:d=>set({riskData:d}),
  timeframe:'15m', setTimeframe:tf=>set({timeframe:tf}),
  wsConnected:false, setWsConnected:v=>set({wsConnected:v}),
  sidebarCollapsed:false, setSidebarCollapsed:v=>set({sidebarCollapsed:v}),
  notifications:[],
  notify:(msg,type='ok')=>{const id=Date.now().toString(36)+Math.random().toString(36).slice(2,5);set(s=>({notifications:[...s.notifications.slice(-4),{id,msg,type,ts:Date.now()}]}));setTimeout(()=>get().removeNotif(id),4500)},
  removeNotif:id=>set(s=>({notifications:s.notifications.filter(n=>n.id!==id)})),
}))
