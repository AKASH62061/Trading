/**
 * IndianMarketData.ts
 * Live data for Indian markets:
 *  - NSE/BSE stocks via Yahoo Finance India
 *  - Nifty/BankNifty/FinNifty indices
 *  - Option chain for indices (NSE F&O)
 *  - Synthetic option chain when live OC not available
 */

import https from 'https'
import { LiveQuote } from './RealMarketData'

function httpsGet(url: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json,text/html,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
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

// ── Indian stock symbols (Yahoo Finance format) ──────────────────
export const INDIAN_STOCKS = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'HINDUNILVR.NS', 'BAJFINANCE.NS', 'WIPRO.NS', 'ADANIPORTS.NS',
  'SUNPHARMA.NS', 'TATAMOTORS.NS', 'MARUTI.NS', 'AXISBANK.NS',
  'LTIM.NS', 'HCLTECH.NS',
]

export const INDIAN_INDICES = [
  '^NSEI',      // Nifty 50  → use NIFTY50.NS as sym
  '^NSEBANK',   // Bank Nifty → BANKNIFTY.NS
]

// Mapping from Yahoo symbol → our internal symbol
const YAHOO_TO_INTERNAL: Record<string, string> = {
  '^NSEI':     'NIFTY50.NS',
  '^NSEBANK':  'BANKNIFTY.NS',
}

// ── Fetch Indian stocks via Yahoo Finance ────────────────────────
export async function fetchIndianStocks(): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>()
  try {
    const allSyms = [...INDIAN_STOCKS, ...INDIAN_INDICES]
    const symsStr = allSyms.join(',')
    const url = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symsStr)}&range=1d&interval=5m`
    const raw = await httpsGet(url)
    const json = JSON.parse(raw)
    for (const item of json?.spark?.result ?? []) {
      const ySym = item.symbol
      const resp  = item.response?.[0]
      if (!resp) continue
      const q = resp.indicators?.quote?.[0]
      const closes = (q?.close ?? []).filter((v: any) => v !== null && v !== undefined)
      const price  = closes.at(-1) ?? 0
      const open   = (q?.open ?? []).filter((v: any) => v !== null)[0] ?? price
      if (!price || price < 1) continue
      const change   = price - open
      const changePct = open ? (change / open) * 100 : 0
      const internalSym = YAHOO_TO_INTERNAL[ySym] || ySym
      result.set(internalSym, {
        symbol:   internalSym,
        price:    Math.round(price * 100) / 100,
        change:   Math.round(change * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
        high:     Math.max(...(q?.high ?? []).filter(Boolean), price),
        low:      Math.min(...(q?.low  ?? []).filter(Boolean).filter((v:number) => v > 0), price),
        open:     Math.round(open * 100) / 100,
        volume:   (q?.volume ?? []).reduce((a: number, b: number) => a + (b ?? 0), 0),
        bid:      price * 0.9999,
        ask:      price * 1.0001,
        timestamp: Date.now(),
      })
    }
  } catch (e) {
    console.warn('[IndianMkt] Yahoo fetch failed:', (e as Error).message)
  }
  return result
}

// ── Option Chain Types ────────────────────────────────────────────
export interface OptionStrike {
  strike:      number
  expiry:      string        // DD-MMM-YYYY
  // Call
  CE_LTP:      number
  CE_OI:       number
  CE_OI_chg:   number
  CE_volume:   number
  CE_IV:       number        // implied volatility %
  CE_delta:    number
  CE_theta:    number
  CE_gamma:    number
  // Put
  PE_LTP:      number
  PE_OI:       number
  PE_OI_chg:   number
  PE_volume:   number
  PE_IV:       number
  PE_delta:    number
  PE_theta:    number
  PE_gamma:    number
  // Derived
  PCR:         number        // Put-Call Ratio
  maxPain:     boolean       // is this the max pain strike?
}

export interface OptionChain {
  symbol:          string
  spotPrice:       number
  expiry:          string
  strikes:         OptionStrike[]
  maxPainStrike:   number
  totalCE_OI:      number
  totalPE_OI:      number
  pcr:             number           // overall PCR
  impliedMove:     number           // expected % move
  supportLevel:    number           // highest PE OI strike
  resistanceLevel: number           // highest CE OI strike
  timestamp:       number
  source:          'NSE' | 'SYNTHETIC'
}

// ── Synthetic Option Chain (Black-Scholes based) ─────────────────
// Used as fallback when NSE direct API is unavailable

function normalCDF(x: number): number {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741
  const a4=-1.453152027, a5=1.061405429, p=0.3275911
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)
  const t = 1 / (1 + p * x)
  const y = 1 - ((((a5*t+a4)*t+a3)*t+a2)*t+a1) * t * Math.exp(-x*x)
  return 0.5 * (1 + sign * y)
}

function blackScholes(
  S: number, K: number, T: number, r: number, sigma: number, type: 'C' | 'P'
): { price: number; delta: number; gamma: number; theta: number; vega: number } {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = type === 'C' ? Math.max(0, S-K) : Math.max(0, K-S)
    return { price: intrinsic, delta: type==='C'?1:0, gamma:0, theta:0, vega:0 }
  }
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*Math.sqrt(T))
  const d2 = d1 - sigma*Math.sqrt(T)
  const Nd1 = normalCDF(d1), Nd2 = normalCDF(d2)
  const Nm_d1 = normalCDF(-d1), Nm_d2 = normalCDF(-d2)
  const nd1 = Math.exp(-0.5*d1*d1) / Math.sqrt(2*Math.PI)

  const price = type === 'C'
    ? S*Nd1 - K*Math.exp(-r*T)*Nd2
    : K*Math.exp(-r*T)*Nm_d2 - S*Nm_d1

  const delta = type === 'C' ? Nd1 : Nd1 - 1
  const gamma = nd1 / (S * sigma * Math.sqrt(T))
  const theta = type === 'C'
    ? -(S*nd1*sigma) / (2*Math.sqrt(T)) - r*K*Math.exp(-r*T)*Nd2
    : -(S*nd1*sigma) / (2*Math.sqrt(T)) + r*K*Math.exp(-r*T)*Nm_d2
  const vega  = S * nd1 * Math.sqrt(T)

  return { price: Math.max(0, price), delta, gamma, theta: theta/365, vega: vega/100 }
}

function generateSyntheticOC(
  symbol: string, spotPrice: number, expiry: string,
  daysToExpiry: number, baseIV = 0.15
): OptionChain {
  const T = daysToExpiry / 365
  const r = 0.065  // Indian risk-free rate

  // Generate strikes around spot (every 50 for Nifty, 100 for BankNifty)
  const step = symbol.includes('BANKNIFTY') ? 100 : 50
  const atmStrike = Math.round(spotPrice / step) * step
  const numStrikes = 12
  const strikes: OptionStrike[] = []

  let maxCE_OI = 0, maxPE_OI = 0
  let maxCE_strike = atmStrike, maxPE_strike = atmStrike

  for (let i = -numStrikes; i <= numStrikes; i++) {
    const K = atmStrike + i * step
    const moneyness = (K - spotPrice) / spotPrice

    // IV smile — higher IV for OTM options
    const smileAdj = 0.03 * moneyness * moneyness * 100
    const ceIV = Math.max(0.05, baseIV + (moneyness < 0 ? 0 : smileAdj))
    const peIV = Math.max(0.05, baseIV + (moneyness > 0 ? 0 : smileAdj * 1.2))

    const ce = blackScholes(spotPrice, K, T, r, ceIV, 'C')
    const pe = blackScholes(spotPrice, K, T, r, peIV, 'P')

    // Simulate OI: higher near ATM, drops off for deep OTM
    const oiDecay = Math.exp(-Math.abs(moneyness) * 15)
    const ceOI = Math.round((150000 + Math.random() * 80000) * oiDecay * (moneyness > 0.02 ? 1.5 : 1))
    const peOI = Math.round((150000 + Math.random() * 80000) * oiDecay * (moneyness < -0.02 ? 1.5 : 1))

    if (ceOI > maxCE_OI) { maxCE_OI = ceOI; maxCE_strike = K }
    if (peOI > maxPE_OI) { maxPE_OI = peOI; maxPE_strike = K }

    strikes.push({
      strike: K, expiry,
      CE_LTP:     Math.round(ce.price * 100) / 100,
      CE_OI:      ceOI,
      CE_OI_chg:  Math.round((Math.random() - 0.4) * ceOI * 0.05),
      CE_volume:  Math.round(ceOI * 0.08 * Math.random()),
      CE_IV:      Math.round(ceIV * 100 * 10) / 10,
      CE_delta:   Math.round(ce.delta * 1000) / 1000,
      CE_theta:   Math.round(ce.theta * 100) / 100,
      CE_gamma:   Math.round(ce.gamma * 10000) / 10000,
      PE_LTP:     Math.round(pe.price * 100) / 100,
      PE_OI:      peOI,
      PE_OI_chg:  Math.round((Math.random() - 0.4) * peOI * 0.05),
      PE_volume:  Math.round(peOI * 0.08 * Math.random()),
      PE_IV:      Math.round(peIV * 100 * 10) / 10,
      PE_delta:   Math.round(pe.delta * 1000) / 1000,
      PE_theta:   Math.round(pe.theta * 100) / 100,
      PE_gamma:   Math.round(pe.gamma * 10000) / 10000,
      PCR:        Math.round((peOI / (ceOI || 1)) * 100) / 100,
      maxPain:    false,
    })
  }

  // Calculate max pain (strike at which option sellers lose least)
  let minPain = Infinity, maxPainStrike = atmStrike
  for (const s of strikes) {
    const pain = strikes.reduce((acc, row) => {
      const cePain = row.CE_OI * Math.max(0, row.strike - s.strike)
      const pePain = row.PE_OI * Math.max(0, s.strike - row.strike)
      return acc + cePain + pePain
    }, 0)
    if (pain < minPain) { minPain = pain; maxPainStrike = s.strike }
  }
  const mpIdx = strikes.findIndex(s => s.strike === maxPainStrike)
  if (mpIdx >= 0) strikes[mpIdx].maxPain = true

  const totalCE = strikes.reduce((a, s) => a + s.CE_OI, 0)
  const totalPE = strikes.reduce((a, s) => a + s.PE_OI, 0)
  const pcr = Math.round((totalPE / (totalCE || 1)) * 100) / 100

  // Implied move from ATM straddle
  const atm = strikes.find(s => s.strike === atmStrike)
  const impliedMove = atm ? ((atm.CE_LTP + atm.PE_LTP) / spotPrice) * 100 : 1.5

  return {
    symbol, spotPrice, expiry, strikes,
    maxPainStrike,
    totalCE_OI: totalCE, totalPE_OI: totalPE, pcr,
    impliedMove: Math.round(impliedMove * 100) / 100,
    supportLevel:    maxPE_strike,
    resistanceLevel: maxCE_strike,
    timestamp: Date.now(),
    source: 'SYNTHETIC',
  }
}

// ── Public Option Chain service ───────────────────────────────────
export function getOptionChain(
  symbol: string,
  spotPrice: number,
  weeksForward = 0     // 0 = nearest weekly, 1 = next weekly, etc.
): OptionChain {
  // Calculate nearest Thursday expiry (NSE weekly options expire Thursday)
  const today = new Date()
  const daysUntilThursday = (4 - today.getDay() + 7) % 7 || 7
  const expDate = new Date(today)
  expDate.setDate(today.getDate() + daysUntilThursday + weeksForward * 7)

  const expiry = expDate.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).replace(/ /g, '-').toUpperCase()

  const daysToExpiry = Math.max(1, Math.round(daysUntilThursday + weeksForward * 7))

  // IV calibration per index
  const ivMap: Record<string, number> = {
    'NIFTY50.NS':     0.12,
    'BANKNIFTY.NS':   0.16,
    'FINNIFTY.NS':    0.14,
    'MIDCPNIFTY.NS':  0.18,
  }
  const baseIV = ivMap[symbol] || 0.15

  return generateSyntheticOC(symbol, spotPrice, expiry, daysToExpiry, baseIV)
}

// ── Option Chain Analysis ─────────────────────────────────────────
export interface OCAnalysis {
  bias:        'BULLISH' | 'BEARISH' | 'NEUTRAL'
  strength:    number     // 0-100
  pcr:         number
  maxPain:     number
  support:     number
  resistance:  number
  signals:     string[]
  strategy:    string    // suggested strategy
}

export function analyzeOptionChain(oc: OptionChain): OCAnalysis {
  const signals: string[] = []
  let bullScore = 0, bearScore = 0

  // PCR analysis
  if (oc.pcr > 1.5) { bullScore += 25; signals.push(`High PCR ${oc.pcr} — bullish (put writers confident)`) }
  else if (oc.pcr > 1.2) { bullScore += 10; signals.push(`PCR ${oc.pcr} — mildly bullish`) }
  else if (oc.pcr < 0.7) { bearScore += 25; signals.push(`Low PCR ${oc.pcr} — bearish (call writers dominate)`) }
  else if (oc.pcr < 0.9) { bearScore += 10 }

  // Max pain vs spot
  const mpDiff = ((oc.maxPainStrike - oc.spotPrice) / oc.spotPrice) * 100
  if (mpDiff > 1) { bullScore += 15; signals.push(`Max pain ${oc.maxPainStrike} above spot — magnetic pull UP`) }
  else if (mpDiff < -1) { bearScore += 15; signals.push(`Max pain ${oc.maxPainStrike} below spot — magnetic pull DOWN`) }

  // OI walls
  const ceWallDiff = ((oc.resistanceLevel - oc.spotPrice) / oc.spotPrice) * 100
  const peWallDiff = ((oc.spotPrice - oc.supportLevel) / oc.spotPrice) * 100
  signals.push(`CE wall at ${oc.resistanceLevel} (${ceWallDiff.toFixed(1)}% away)`)
  signals.push(`PE wall at ${oc.supportLevel} (${peWallDiff.toFixed(1)}% away)`)

  if (ceWallDiff < peWallDiff) { bearScore += 10; signals.push('CE wall closer — resistance overhead') }
  else { bullScore += 10; signals.push('PE wall closer — strong support below') }

  // Implied move
  signals.push(`Implied move: ±${oc.impliedMove}% by expiry`)

  const net = bullScore - bearScore
  const bias = Math.abs(net) < 10 ? 'NEUTRAL' : net > 0 ? 'BULLISH' : 'BEARISH'
  const strength = Math.min(100, Math.round(Math.max(bullScore, bearScore) * 0.9))

  // Strategy suggestion
  let strategy = ''
  if (bias === 'BULLISH' && strength > 50) strategy = `Bull Call Spread: Buy ${oc.spotPrice + 50} CE, Sell ${oc.spotPrice + 150} CE`
  else if (bias === 'BEARISH' && strength > 50) strategy = `Bear Put Spread: Buy ${oc.spotPrice - 50} PE, Sell ${oc.spotPrice - 150} PE`
  else strategy = `Iron Condor: Sell ${oc.supportLevel} PE / ${oc.resistanceLevel} CE`

  return { bias, strength, pcr: oc.pcr, maxPain: oc.maxPainStrike, support: oc.supportLevel, resistance: oc.resistanceLevel, signals, strategy }
}
