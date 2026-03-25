/**
 * RealMarketData.ts  v3
 * Multi-source live market data:
 *   1. Stooq CSV   — US stocks (completely free, no key, very reliable)
 *   2. Binance REST — crypto (free, no key, fast)
 *   3. CoinGecko   — crypto fallback (free, no key)
 *   4. Yahoo v8 spark — futures/UK stocks fallback
 */

import https from 'https'

export interface LiveQuote {
  symbol:    string
  price:     number
  change:    number
  changePct: number
  high:      number
  low:       number
  open:      number
  volume:    number
  bid:       number
  ask:       number
  timestamp: number
}

function httpsGet(url: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/csv,*/*' },
      timeout: timeoutMs,
    }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location)
        return httpsGet(res.headers.location, timeoutMs).then(resolve, reject)
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

// ── Source 1: Stooq CSV (stocks) ──────────────────────────────────────────
async function fetchStooqQuotes(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  const toStooq = (s: string): string | null => {
    if (s.includes('=F') || s.includes('-USD')) return null
    if (s.endsWith('.L')) return s.toLowerCase()
    return s.toLowerCase() + '.us'
  }
  const fetches = symbols.map(async sym => {
    const stooqSym = toStooq(sym)
    if (!stooqSym) return
    try {
      const csv = await httpsGet(`https://stooq.com/q/l/?s=${stooqSym}&f=sd2t2ohlcvn&h&e=csv`, 5000)
      const lines = csv.trim().split('\n')
      if (lines.length < 2) return
      const parts = lines[1].split(',')
      const price = parseFloat(parts[6]), open = parseFloat(parts[3])
      const high = parseFloat(parts[4]), low = parseFloat(parts[5])
      if (!price || isNaN(price) || price <= 0) return
      const change = price - open
      result.set(sym, {
        symbol: sym, price, change,
        changePct: open ? (change / open) * 100 : 0,
        high, low, open, volume: parseFloat(parts[7]) || 0,
        bid: price * 0.9998, ask: price * 1.0002, timestamp: Date.now(),
      })
    } catch { }
  })
  for (let i = 0; i < fetches.length; i += 6) await Promise.all(fetches.slice(i, i + 6))
  return result
}

// ── Source 2: Binance (crypto) ────────────────────────────────────────────
async function fetchBinanceQuotes(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  const relevant = symbols.filter(s => s.endsWith('-USD'))
  if (!relevant.length) return result
  try {
    const raw = await httpsGet('https://api.binance.com/api/v3/ticker/24hr', 7000)
    const arr = JSON.parse(raw) as any[]
    for (const sym of relevant) {
      const t = arr.find((x: any) => x.symbol === sym.replace('-USD', 'USDT'))
      if (!t) continue
      const price = parseFloat(t.lastPrice)
      result.set(sym, {
        symbol: sym, price,
        change: parseFloat(t.priceChange),
        changePct: parseFloat(t.priceChangePercent),
        high: parseFloat(t.highPrice), low: parseFloat(t.lowPrice),
        open: parseFloat(t.openPrice),
        volume: parseFloat(t.volume) * price,
        bid: parseFloat(t.bidPrice) || price * 0.9997,
        ask: parseFloat(t.askPrice) || price * 1.0003,
        timestamp: t.closeTime,
      })
    }
  } catch (e) { console.warn('[Binance]', (e as Error).message) }
  return result
}

// ── Source 3: CoinGecko fallback ──────────────────────────────────────────
const COINGECKO_IDS: Record<string, string> = {
  'BTC-USD': 'bitcoin', 'ETH-USD': 'ethereum', 'SOL-USD': 'solana',
  'BNB-USD': 'binancecoin', 'XRP-USD': 'ripple', 'DOGE-USD': 'dogecoin',
  'ADA-USD': 'cardano', 'AVAX-USD': 'avalanche-2', 'LINK-USD': 'chainlink',
  'MATIC-USD': 'matic-network',
}
async function fetchCryptoFallback(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  const relevant = symbols.filter(s => COINGECKO_IDS[s])
  if (!relevant.length) return result
  try {
    const ids = relevant.map(s => COINGECKO_IDS[s]).join(',')
    const raw = await httpsGet(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_24h=true&include_low_24h=true&include_last_updated_at=true`, 9000)
    const json = JSON.parse(raw)
    for (const sym of relevant) {
      const d = json[COINGECKO_IDS[sym]]
      if (!d) continue
      const price = d.usd ?? 0, pct = d.usd_24h_change ?? 0
      result.set(sym, {
        symbol: sym, price, change: price * pct / 100, changePct: pct,
        high: d.usd_24h_high ?? price, low: d.usd_24h_low ?? price,
        open: price / (1 + pct / 100), volume: d.usd_24h_vol ?? 0,
        bid: price * 0.9997, ask: price * 1.0003,
        timestamp: (d.last_updated_at ?? 0) * 1000,
      })
    }
  } catch (e) { console.warn('[CoinGecko]', (e as Error).message) }
  return result
}

// ── Source 4: Yahoo spark fallback (futures/UK) ───────────────────────────
const YF_FUTURES_UK = ['GC=F','SI=F','CL=F','BZ=F','HG=F','NG=F','ZW=F','ZC=F','ES=F','NQ=F','YM=F','RTY=F','ZB=F','ZN=F','BP.L','HSBA.L','LLOY.L','GSK.L','AZN.L','RIO.L','BARC.L','SHEL.L']
async function fetchYahooFallback(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  if (!symbols.length) return result
  try {
    const syms = symbols.join(',')
    const raw = await httpsGet(`https://query2.finance.yahoo.com/v8/finance/spark?symbols=${syms}&range=1d&interval=5m`, 8000)
    const json = JSON.parse(raw)
    for (const item of json?.spark?.result ?? []) {
      const sym = item.symbol, resp = item.response?.[0]
      if (!resp) continue
      const q = resp.indicators?.quote?.[0]
      const closes = (q?.close ?? []).filter(Boolean)
      const price = closes.at(-1) ?? 0
      const open  = (q?.open ?? []).filter(Boolean)[0] ?? price
      if (!price) continue
      const change = price - open
      result.set(sym, {
        symbol: sym, price, change,
        changePct: open ? (change / open) * 100 : 0,
        high: Math.max(...(q?.high ?? []).filter(Boolean), price),
        low:  Math.min(...(q?.low  ?? []).filter(Boolean), price),
        open, volume: (q?.volume ?? []).reduce((a: number, b: number) => a + (b ?? 0), 0),
        bid: price * 0.9998, ask: price * 1.0002, timestamp: Date.now(),
      })
    }
  } catch (e) { console.warn('[YahooSpark]', (e as Error).message) }
  return result
}

const US_STOCKS = ['AAPL','MSFT','NVDA','TSLA','AMZN','GOOGL','META','NFLX','JPM','GS','SPY','QQQ','AMD','COIN','PLTR']

export class RealMarketData {
  private cache         = new Map<string, LiveQuote>()
  private lastFetch     = 0
  private fetchInterval = 8_000
  private isRunning     = false
  private listeners: Array<(quotes: Map<string, LiveQuote>) => void> = []

  onUpdate(cb: (quotes: Map<string, LiveQuote>) => void) { this.listeners.push(cb) }

  async start() {
    if (this.isRunning) return
    this.isRunning = true
    await this.fetchAll()
    setInterval(() => this.fetchAll(), this.fetchInterval)
    console.log('[RealMarketData] Live feed started — 8s refresh (Stooq + Binance + CoinGecko + Yahoo fallback)')
  }

  private async fetchAll() {
    const now = Date.now()
    if (now - this.lastFetch < 6000) return
    this.lastFetch = now
    try {
      const [stooqR, binanceR, geckoR, yfR] = await Promise.allSettled([
        fetchStooqQuotes(US_STOCKS),
        fetchBinanceQuotes(Object.keys(COINGECKO_IDS)),
        fetchCryptoFallback(Object.keys(COINGECKO_IDS)),
        fetchYahooFallback(YF_FUTURES_UK),
      ])
      const get = (r: PromiseSettledResult<Map<string, LiveQuote>>) =>
        r.status === 'fulfilled' ? r.value : new Map<string, LiveQuote>()
      const stooq   = get(stooqR)
      const binance = get(binanceR)
      const gecko   = get(geckoR)
      const yf      = get(yfR)
      for (const [s, q] of yf)      this.cache.set(s, q)
      for (const [s, q] of stooq)   this.cache.set(s, q)
      for (const [s, q] of gecko)   { if (!binance.has(s)) this.cache.set(s, q) }
      for (const [s, q] of binance) this.cache.set(s, q)
      if (this.cache.size > 0) this.listeners.forEach(cb => cb(this.cache))
    } catch (e) { console.warn('[RealMarketData] fetchAll error:', (e as Error).message) }
  }

  getQuote(sym: string): LiveQuote | undefined { return this.cache.get(sym) }
  getAllQuotes(): Map<string, LiveQuote>         { return this.cache }
  hasLive(sym: string): boolean                 { return this.cache.has(sym) }
}
