import { v4 as uuid } from 'uuid'
import { PriceSimulator } from './PriceSimulator'
import { MARKET_CONFIG, FUTURES_MULTIPLIERS } from '../models/instruments'

export type Side   = 'BUY'|'SELL'
export type OType  = 'MARKET'|'LIMIT'|'STOP'|'STOP_LIMIT'
export type OStatus= 'PENDING'|'FILLED'|'CANCELLED'|'REJECTED'
export type PStatus= 'OPEN'|'CLOSED'

export interface Order {
  id: string; symbol: string; symbolName: string; side: Side; type: OType
  quantity: number; limitPrice?: number; stopPrice?: number
  stopLoss?: number; takeProfit?: number; trailingStop?: number
  marketType: string; leverage: number; multiplier: number
  status: OStatus; fillPrice?: number; commission: number
  createdAt: string; filledAt?: string; rejectedReason?: string
  pnl?: number
}

export interface Position {
  id: string; symbol: string; symbolName: string; side: Side
  marketType: string; leverage: number; multiplier: number
  quantity: number; avgEntryPrice: number; currentPrice: number
  commission: number; stopLoss?: number; takeProfit?: number
  trailingStop?: number; trailingStopPrice?: number
  status: PStatus; openedAt: string; closedAt?: string; closePrice?: number
  unrealisedPnl: number; unrealisedPnlPct: number
  realisedPnl: number; marketValue: number
  highWaterMark: number
  trades: Array<{orderId:string;price:number;qty:number;side:Side;at:string}>
}

export interface RiskMetrics {
  portfolioHeat: number; // % of capital at risk from all open SLs
  largestExposure: {symbol:string;pct:number}
  correlationRisk: number // 0-100
  marginUsed: number; marginAvailable: number; marginLevel: number
  dailyVaR: number // Value at Risk 95% 1-day
  betaWeightedDelta: number
}

export interface PortfolioMetrics {
  cashBalance: number; totalMarketValue: number; totalEquity: number
  totalUnrealisedPnl: number; totalRealisedPnl: number; totalReturnPct: number
  dayPnl: number; weekPnl: number; monthPnl: number
  openPositions: number; totalTrades: number
  winTrades: number; lossTrades: number; winRate: number
  avgWin: number; avgLoss: number; riskReward: number; profitFactor: number
  maxDrawdown: number; currentDrawdown: number
  sharpeRatio: number; sortinoRatio: number; calmarRatio: number
  largestWin: number; largestLoss: number
  avgHoldingTimeHours: number; bestTrade: {symbol:string;pnl:number}|null; worstTrade: {symbol:string;pnl:number}|null
  consecutiveWins: number; consecutiveLosses: number; currentStreak: {type:'WIN'|'LOSS'|'NONE';count:number}
  equityCurve: number[]
  riskMetrics: RiskMetrics
  initialCapital: number
}

const INITIAL = 100_000

export class PortfolioManager {
  private cash = INITIAL
  private positions = new Map<string, Position>()
  private pending   = new Map<string, Order>()
  private history: Order[] = []
  private closed: Position[] = []
  private rpnl = 0
  private equityCurve: number[] = [INITIAL]
  private dayOpen = INITIAL; private weekOpen = INITIAL; private monthOpen = INITIAL
  private sim: PriceSimulator

  constructor(sim: PriceSimulator) { this.sim = sim }

  private getMult(sym: string) { return FUTURES_MULTIPLIERS[sym] ?? 1 }
  private getComm(price: number, qty: number, mkt: string, mult: number): number {
    const c = MARKET_CONFIG[mkt]; if (!c) return 0
    return c.commType==='flat' ? c.commVal*qty : price*qty*mult*c.commVal
  }
  private slip(price: number, side: Side, mkt: string): number {
    const s = MARKET_CONFIG[mkt]?.slippage ?? .0005
    return price*(1+(side==='BUY'?s:-s))
  }

  placeOrder(params: Omit<Order,'id'|'status'|'commission'|'createdAt'>): {order?:Order;error?:string} {
    const {symbol,side,type,quantity,marketType,leverage} = params
    const mult = this.getMult(symbol)
    const pd   = this.sim.getPrice(symbol)
    if (!pd) return {error:'Symbol not found'}
    const order: Order = { id:uuid(), ...params, multiplier:mult, commission:0, status:'PENDING', createdAt:new Date().toISOString() }

    if (type === 'MARKET') {
      const fp   = this.slip(pd.price, side, marketType)
      const comm = this.getComm(fp, quantity, marketType, mult)
      const total = fp*quantity*mult/leverage + comm
      if (side==='BUY') {
        const hasShort = Array.from(this.positions.values()).find(p=>p.symbol===symbol&&p.status==='OPEN'&&p.side==='SELL')
        if (!hasShort && this.cash < total) return {error:`Insufficient funds. Need $${total.toFixed(2)}, have $${this.cash.toFixed(2)}`}
      }
      order.fillPrice=fp; order.commission=comm; order.status='FILLED'; order.filledAt=new Date().toISOString()
      this.executeFill(order); this.history.unshift(order)
    } else {
      this.pending.set(order.id, order)
    }
    return {order}
  }

  private executeFill(order: Order) {
    const {symbol,symbolName,side,quantity,fillPrice:fp,commission,marketType,leverage,multiplier,stopLoss,takeProfit,trailingStop,filledAt} = order
    const fp2 = fp!
    if (side==='BUY') {
      const short = Array.from(this.positions.values()).find(p=>p.symbol===symbol&&p.status==='OPEN'&&p.side==='SELL')
      if (short) { this.closePos(short,order,fp2); return }
      this.cash -= fp2*quantity*multiplier/leverage+commission
      const ex = Array.from(this.positions.values()).find(p=>p.symbol===symbol&&p.status==='OPEN'&&p.side==='BUY')
      if (ex) {
        const nq=ex.quantity+quantity; ex.avgEntryPrice=(ex.avgEntryPrice*ex.quantity+fp2*quantity)/nq
        ex.quantity=nq; ex.commission+=commission; if(stopLoss)ex.stopLoss=stopLoss; if(takeProfit)ex.takeProfit=takeProfit
        ex.trades.push({orderId:order.id,price:fp2,qty:quantity,side,at:filledAt!})
      } else {
        const pid = uuid()
        this.positions.set(pid,{id:pid,symbol,symbolName,side:'BUY',marketType,leverage,multiplier,quantity,avgEntryPrice:fp2,currentPrice:fp2,commission,stopLoss,takeProfit,trailingStop,trailingStopPrice:trailingStop?fp2-trailingStop:undefined,status:'OPEN',openedAt:filledAt!,unrealisedPnl:0,unrealisedPnlPct:0,realisedPnl:0,marketValue:fp2*quantity*multiplier,highWaterMark:fp2,trades:[{orderId:order.id,price:fp2,qty:quantity,side,at:filledAt!}]})
      }
    } else {
      const long = Array.from(this.positions.values()).find(p=>p.symbol===symbol&&p.status==='OPEN'&&p.side==='BUY')
      if (long) { this.closePos(long,order,fp2); return }
      this.cash -= fp2*quantity*multiplier/leverage+commission
      const ex = Array.from(this.positions.values()).find(p=>p.symbol===symbol&&p.status==='OPEN'&&p.side==='SELL')
      if (ex) {
        const nq=ex.quantity+quantity; ex.avgEntryPrice=(ex.avgEntryPrice*ex.quantity+fp2*quantity)/nq
        ex.quantity=nq; ex.commission+=commission
        ex.trades.push({orderId:order.id,price:fp2,qty:quantity,side,at:filledAt!})
      } else {
        const pid=uuid()
        this.positions.set(pid,{id:pid,symbol,symbolName,side:'SELL',marketType,leverage,multiplier,quantity,avgEntryPrice:fp2,currentPrice:fp2,commission,stopLoss,takeProfit,trailingStop,trailingStopPrice:trailingStop?fp2+trailingStop:undefined,status:'OPEN',openedAt:filledAt!,unrealisedPnl:0,unrealisedPnlPct:0,realisedPnl:0,marketValue:fp2*quantity*multiplier,highWaterMark:fp2,trades:[{orderId:order.id,price:fp2,qty:quantity,side,at:filledAt!}]})
      }
    }
  }

  private closePos(pos: Position, closeOrder: Order, closePrice: number) {
    const cq=Math.min(closeOrder.quantity,pos.quantity)
    const cc=this.getComm(closePrice,cq,pos.marketType,pos.multiplier)
    const dir=pos.side==='BUY'?1:-1
    const raw=dir*(closePrice-pos.avgEntryPrice)*cq*pos.multiplier*pos.leverage
    const net=raw-pos.commission*(cq/pos.quantity)-cc
    this.cash+=closePrice*cq*pos.multiplier/pos.leverage+net-cc
    this.rpnl+=net
    this.equityCurve.push(this.cash+this.getTMV())
    if (this.equityCurve.length>1000) this.equityCurve.shift()
    closeOrder.pnl=net
    pos.realisedPnl=net; pos.closePrice=closePrice; pos.closedAt=closeOrder.filledAt
    pos.status=cq>=pos.quantity?'CLOSED':'OPEN'
    if (pos.status==='CLOSED') { this.closed.unshift({...pos}); this.positions.delete(pos.id) }
    else pos.quantity-=cq
  }

  cancelOrder(id: string): boolean {
    const o=this.pending.get(id); if(!o) return false
    o.status='CANCELLED'; this.history.unshift(o); this.pending.delete(id); return true
  }

  closePosition(posId: string): {order?:Order;error?:string} {
    const pos=this.positions.get(posId)
    if(!pos||pos.status!=='OPEN') return {error:'Not found'}
    const pd=this.sim.getPrice(pos.symbol); if(!pd) return {error:'No price'}
    return this.placeOrder({symbol:pos.symbol,symbolName:pos.symbolName,side:pos.side==='BUY'?'SELL':'BUY',type:'MARKET',quantity:pos.quantity,marketType:pos.marketType,leverage:pos.leverage,multiplier:pos.multiplier})

  closeAll() { for(const[id]of this.positions) this.closePosition(id) }

  processTickFills(tick: Record<string,any>) {
    // Pending orders
    for(const[id,o]of this.pending) {
      const pd=tick[o.symbol]; if(!pd) continue
      let triggered=false
      if(o.type==='LIMIT') triggered=(o.side==='BUY'&&pd.price<=o.limitPrice!)||(o.side==='SELL'&&pd.price>=o.limitPrice!)
      if(o.type==='STOP')  triggered=(o.side==='SELL'&&pd.price<=o.stopPrice!)||(o.side==='BUY'&&pd.price>=o.stopPrice!)
      if(triggered){
        const fp=this.slip(pd.price,o.side,o.marketType)
        o.fillPrice=fp; o.commission=this.getComm(fp,o.quantity,o.marketType,o.multiplier)
        o.status='FILLED'; o.filledAt=new Date().toISOString()
        this.executeFill(o); this.history.unshift(o); this.pending.delete(id)
      }
    }
    // Open position P&L + SL/TP + trailing stop
    for(const[id,pos]of this.positions) {
      if(pos.status!=='OPEN') continue
      const pd=tick[pos.symbol]; if(!pd) continue
      pos.currentPrice=pd.price
      const dir=pos.side==='BUY'?1:-1
      const raw=dir*(pd.price-pos.avgEntryPrice)*pos.quantity*pos.multiplier*pos.leverage
      pos.unrealisedPnl=raw-pos.commission
      pos.unrealisedPnlPct=pos.avgEntryPrice>0?(raw/(pos.avgEntryPrice*pos.quantity*pos.multiplier))*100:0
      pos.marketValue=pd.price*pos.quantity*pos.multiplier
      // Update trailing stop
      if(pos.trailingStop){
        if(pos.side==='BUY'&&pd.price>pos.highWaterMark){
          pos.highWaterMark=pd.price; pos.trailingStopPrice=pd.price-pos.trailingStop
        } else if(pos.side==='SELL'&&pd.price<pos.highWaterMark){
          pos.highWaterMark=pd.price; pos.trailingStopPrice=pd.price+pos.trailingStop
        }
      }
      // SL check
      const slHit = pos.stopLoss ? (pos.side==='BUY'?pd.price<=pos.stopLoss:pd.price>=pos.stopLoss) : false
      const tsHit = pos.trailingStopPrice ? (pos.side==='BUY'?pd.price<=pos.trailingStopPrice:pd.price>=pos.trailingStopPrice) : false
      const tpHit = pos.takeProfit ? (pos.side==='BUY'?pd.price>=pos.takeProfit:pd.price<=pos.takeProfit) : false
      if(slHit||tsHit) this.closePosition(id)
      else if(tpHit)   this.closePosition(id)
    }
  }

  private getTMV() { return Array.from(this.positions.values()).filter(p=>p.status==='OPEN').reduce((s,p)=>s+(p.marketValue??0),0) }

  private computeRisk(): RiskMetrics {
    const open = Array.from(this.positions.values()).filter(p=>p.status==='OPEN')
    const equity = this.cash + this.getTMV()
    const heat = open.reduce((s,p)=>{
      if(!p.stopLoss) return s
      const riskAmt = Math.abs(p.currentPrice-p.stopLoss)*p.quantity*p.multiplier
      return s+riskAmt/equity*100
    },0)
    const exposures = open.map(p=>({symbol:p.symbol,pct:p.marketValue/equity*100})).sort((a,b)=>b.pct-a.pct)
    const marginUsed = open.reduce((s,p)=>s+p.avgEntryPrice*p.quantity*p.multiplier/p.leverage,0)
    const marginAvail = equity-marginUsed
    // Simple VaR: 1.645 * portfolio stddev * sqrt(1) (1-day 95%)
    const dailyVol = open.reduce((s,p)=>{
      const vol = MARKET_CONFIG[p.marketType]?.baseVol ?? .001
      return s+(p.marketValue*vol)**2
    },0)
    const dailyVaR = 1.645*Math.sqrt(dailyVol)/equity*100
    return {
      portfolioHeat: Math.min(100,heat), largestExposure: exposures[0]??{symbol:'',pct:0},
      correlationRisk: Math.min(100,open.length*8),
      marginUsed, marginAvailable: marginAvail, marginLevel: marginUsed>0?equity/marginUsed*100:999,
      dailyVaR, betaWeightedDelta: open.filter(p=>p.side==='BUY').length - open.filter(p=>p.side==='SELL').length,
    }
  }

  getMetrics(): PortfolioMetrics {
    const open    = Array.from(this.positions.values()).filter(p=>p.status==='OPEN')
    const ur      = open.reduce((s,p)=>s+(p.unrealisedPnl||0),0)
    const mv      = open.reduce((s,p)=>s+(p.marketValue||0),0)
    const equity  = this.cash+mv
    const wins    = this.closed.filter(p=>p.realisedPnl>0)
    const losses  = this.closed.filter(p=>p.realisedPnl<=0)
    const avgWin  = wins.length   ? wins.reduce((s,p)=>s+p.realisedPnl,0)/wins.length : 0
    const avgLoss = losses.length ? Math.abs(losses.reduce((s,p)=>s+p.realisedPnl,0)/losses.length) : 0
    const gP = wins.reduce((s,p)=>s+p.realisedPnl,0)
    const gL = Math.abs(losses.reduce((s,p)=>s+p.realisedPnl,0))
    // Drawdown
    let peak=INITIAL, maxDD=0, curDD=0
    this.equityCurve.forEach(v=>{ if(v>peak)peak=v; const d=(peak-v)/peak*100; if(d>maxDD)maxDD=d })
    curDD=(peak-equity)/peak*100
    // Sharpe/Sortino
    const rets = this.equityCurve.slice(1).map((v,i)=>(v-this.equityCurve[i])/this.equityCurve[i])
    const mean = rets.length ? rets.reduce((a,b)=>a+b,0)/rets.length : 0
    const std  = rets.length ? Math.sqrt(rets.reduce((s,r)=>s+(r-mean)**2,0)/rets.length) : 1
    const downRets = rets.filter(r=>r<0)
    const downStd  = downRets.length ? Math.sqrt(downRets.reduce((s,r)=>s+r**2,0)/downRets.length) : std||1
    // Avg holding time
    const avgHold = this.closed.length ? this.closed.reduce((s,p)=>{
      if(!p.closedAt) return s
      return s+(new Date(p.closedAt).getTime()-new Date(p.openedAt).getTime())/3600000
    },0)/this.closed.length : 0
    // Streak
    let cWins=0, cLoss=0, streak={type:'NONE' as 'WIN'|'LOSS'|'NONE',count:0}
    for(const p of this.closed) {
      if(p.realisedPnl>0){cWins++;cLoss=0} else{cLoss++;cWins=0}
    }
    if(cWins>cLoss) streak={type:'WIN',count:cWins}; else if(cLoss>0) streak={type:'LOSS',count:cLoss}
    // Best/worst
    const bestT  = this.closed.reduce((b,p)=>!b||p.realisedPnl>b.realisedPnl?p:b, null as Position|null)
    const worstT = this.closed.reduce((b,p)=>!b||p.realisedPnl<b.realisedPnl?p:b, null as Position|null)
    const calmar = maxDD>0?(((equity-INITIAL)/INITIAL*100)/maxDD):0
    return {
      cashBalance:this.cash, totalMarketValue:mv, totalEquity:equity,
      totalUnrealisedPnl:ur, totalRealisedPnl:this.rpnl,
      totalReturnPct:((equity-INITIAL)/INITIAL)*100,
      dayPnl:equity-this.dayOpen, weekPnl:equity-this.weekOpen, monthPnl:equity-this.monthOpen,
      openPositions:open.length, totalTrades:this.history.filter(o=>o.status==='FILLED').length,
      winTrades:wins.length, lossTrades:losses.length,
      winRate:this.closed.length>0?(wins.length/this.closed.length)*100:0,
      avgWin, avgLoss, riskReward:avgLoss>0?avgWin/avgLoss:0,
      profitFactor:gL>0?gP/gL:0, maxDrawdown:maxDD, currentDrawdown:Math.max(0,curDD),
      sharpeRatio:std>0?(mean/std)*Math.sqrt(252):0,
      sortinoRatio:downStd>0?(mean/downStd)*Math.sqrt(252):0,
      calmarRatio:calmar,
      largestWin:wins.length?Math.max(...wins.map(p=>p.realisedPnl)):0,
      largestLoss:losses.length?Math.min(...losses.map(p=>p.realisedPnl)):0,
      avgHoldingTimeHours:avgHold,
      bestTrade: bestT ? {symbol:bestT.symbol,pnl:bestT.realisedPnl} : null,
      worstTrade: worstT ? {symbol:worstT.symbol,pnl:worstT.realisedPnl} : null,
      consecutiveWins:cWins, consecutiveLosses:cLoss, currentStreak:streak,
      equityCurve:this.equityCurve.slice(-200),
      riskMetrics:this.computeRisk(),
      initialCapital:INITIAL,
    }
  }

  getOpenPositions()  { return Array.from(this.positions.values()).filter(p=>p.status==='OPEN') }
  getClosedPositions(){ return this.closed.slice(0,500) }
  getPendingOrders()  { return Array.from(this.pending.values()) }
  getTradeHistory()   { return this.history.slice(0,500) }
  getCash()           { return this.cash }
  reset() {
    this.cash=INITIAL; this.positions.clear(); this.pending.clear()
    this.history=[]; this.closed=[]; this.rpnl=0
    this.equityCurve=[INITIAL]; this.dayOpen=INITIAL; this.weekOpen=INITIAL; this.monthOpen=INITIAL
  }
}
