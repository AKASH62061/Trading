import type { LiveQuote } from './RealMarketData'
import { INSTRUMENTS, MARKET_CONFIG } from '../models/instruments'
import { generateSignal, Signal, Candle } from '../ai/SignalEngine'

export interface PriceData {
  symbol: string; name: string; price: number; open: number; high: number; low: number
  change: number; changePct: number; volume: number; marketType: string
  bid: number; ask: number; spread: number
  candles: Record<string, Candle[]>
  signal?: Signal; lastSignalTime?: number
}

const TF_MS:  Record<string,number> = { '1m':60000,'5m':300000,'15m':900000,'1h':3600000,'3h':10800000,'1d':86400000 }
const TF_VOL: Record<string,number> = { '1m':.0006,'5m':.0012,'15m':.002,'1h':.004,'3h':.007,'1d':.015 }
const TF_N:   Record<string,number> = { '1m':180,'5m':120,'15m':100,'1h':90,'3h':72,'1d':60 }
const TF_CLOSE: Record<string,number> = { '1m':.085,'5m':.017,'15m':.005,'1h':.0013,'3h':.0004,'1d':.00005 }

export class PriceSimulator {
  private prices = new Map<string, PriceData>()
  private signalCache = new Map<string, {signal: Signal; at: number}>()

  constructor() { this.init() }

  private init() {
    for (const [mkt, list] of Object.entries(INSTRUMENTS)) {
      const cfg = MARKET_CONFIG[mkt]
      for (const inst of list) {
        const spread = inst.price * cfg.spreadPct
        this.prices.set(inst.sym, {
          symbol: inst.sym, name: inst.name, price: inst.price,
          open: inst.price, high: inst.price*1.005, low: inst.price*.995,
          change: 0, changePct: inst.dailyChg,
          volume: Math.random()*1e7+1e6, marketType: mkt,
          bid: inst.price-spread/2, ask: inst.price+spread/2, spread,
          candles: this.genAllTf(inst.price, cfg.baseVol),
        })
      }
    }
  }

  private genAllTf(price: number, bv: number): Record<string, Candle[]> {
    const r: Record<string, Candle[]> = {}
    for (const tf of Object.keys(TF_N)) r[tf] = this.genHistory(price, bv, TF_N[tf], tf)
    return r
  }

  private genHistory(price: number, bv: number, n: number, tf: string): Candle[] {
    const vol = TF_VOL[tf] ?? bv, cs: Candle[] = []
    const ms = TF_MS[tf] ?? 60000
    const now = Date.now()
    let p = Math.max(price*.1, price*(1-n*vol*.8))
    for (let i = 0; i < n; i++) {
      const o = p, mv = (Math.random()-.49)*vol*2.8, c = o*(1+mv)
      const wk = Math.abs(mv)*.7
      cs.push({ time: now-(n-i)*ms, open:o, high:Math.max(o,c)*(1+Math.random()*wk), low:Math.min(o,c)*(1-Math.random()*wk), close:c, volume:(Math.random()*.8+.6)*1e6 })
      p = c
    }
    return cs
  }

  tick(): Record<string, Partial<PriceData>> {
    const updates: Record<string, Partial<PriceData>> = {}
    for (const [sym, pd] of this.prices) {
      const cfg = MARKET_CONFIG[pd.marketType]
      const bv = cfg?.baseVol ?? .001
      // Slightly biased random walk (mean reversion tendency)
      const meanRevBias = (pd.open - pd.price) / pd.open * 0.1
      const move = (Math.random()-.499+meanRevBias) * bv
      const newP = Math.max(pd.price*.5, pd.price*(1+move))
      const spread = newP * (cfg?.spreadPct ?? .0005)
      pd.price = newP; pd.high = Math.max(pd.high,newP); pd.low = Math.min(pd.low,newP)
      pd.change = newP-pd.open; pd.changePct = ((newP-pd.open)/pd.open)*100
      pd.volume += Math.random()*50000; pd.bid = newP-spread/2; pd.ask = newP+spread/2; pd.spread = spread

      for (const tf of Object.keys(TF_VOL)) {
        const cl = pd.candles[tf]; if (!cl?.length) continue
        const last = cl[cl.length-1]
        last.close = newP; last.high = Math.max(last.high,newP); last.low = Math.min(last.low,newP); last.volume += Math.random()*40000
        if (Math.random() < (TF_CLOSE[tf]??0.01)) {
          cl.push({ time:Date.now(), open:newP, high:newP, low:newP, close:newP, volume:Math.random()*2e5+5e4 })
          if (cl.length > 400) cl.shift()
        }
      }
      updates[sym] = { symbol:sym, price:newP, change:pd.change, changePct:pd.changePct, bid:pd.bid, ask:pd.ask, spread, high:pd.high, low:pd.low, volume:pd.volume }
    }
    return updates
  }

  getSignals(): Record<string, Signal> {
    const result: Record<string, Signal> = {}
    const now = Date.now()
    for (const [sym, pd] of this.prices) {
      const cached = this.signalCache.get(sym)
      // Refresh signal every 30 seconds
      if (!cached || now - cached.at > 30000) {
        const candles = pd.candles['15m'] ?? pd.candles['1m']
        if (candles.length >= 50) {
          const sig = generateSignal(sym, candles)
          this.signalCache.set(sym, { signal: sig, at: now })
          result[sym] = sig
        }
      } else {
        result[sym] = cached.signal
      }
    }
    return result
  }

  getSignal(sym: string): Signal | undefined {
    const pd = this.prices.get(sym)
    if (!pd) return undefined
    const candles = pd.candles['15m'] ?? pd.candles['1m']
    return candles.length >= 50 ? generateSignal(sym, candles) : undefined
  }

  getSnapshot() {
    const r: Record<string, PriceData> = {}
    for (const [k,v] of this.prices) r[k] = { ...v }
    return r
  }
  getPrice(sym: string) { return this.prices.get(sym) }
  getAllPrices()        { return Array.from(this.prices.values()) }
  getCandles(sym: string, tf: string, limit = 150) {
    return (this.prices.get(sym)?.candles[tf] ?? []).slice(-limit)
  }
  getHeatmapData() {
    return Array.from(this.prices.values()).map(pd => ({
      symbol: pd.symbol, name: pd.name, marketType: pd.marketType,
      changePct: pd.changePct, price: pd.price, volume: pd.volume,
    }))
  }

  // Called by RealMarketData when a live quote arrives
  // Updates the simulated price with the real market price — zero lag
  applyLiveQuote(sym: string, quote: LiveQuote): void {
    const pd = this.prices.get(sym)
    if (!pd || !quote.price || quote.price <= 0) return

    const oldPrice = pd.price
    pd.price    = quote.price
    pd.open     = quote.open   > 0 ? quote.open  : pd.open
    pd.high     = quote.high   > 0 ? Math.max(pd.high, quote.high) : pd.high
    pd.low      = quote.low    > 0 ? Math.min(pd.low,  quote.low)  : pd.low
    pd.change   = quote.change
    pd.changePct= quote.changePct
    pd.volume   = quote.volume > 0 ? quote.volume : pd.volume
    pd.bid      = quote.bid    > 0 ? quote.bid    : quote.price * 0.9998
    pd.ask      = quote.ask    > 0 ? quote.ask    : quote.price * 1.0002
    pd.spread   = pd.ask - pd.bid

    // Update the last candle on all timeframes with the live price
    for (const tf of Object.keys(pd.candles)) {
      const cl = pd.candles[tf]
      if (!cl?.length) continue
      const last = cl[cl.length - 1]
      last.close  = quote.price
      last.high   = Math.max(last.high, quote.price)
      last.low    = Math.min(last.low,  quote.price)
    }
  }

}
