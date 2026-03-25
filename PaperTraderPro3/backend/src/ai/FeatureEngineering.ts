/**
 * Feature Engineering
 * Builds a normalised 24-dimensional feature vector from candle data.
 * All features are scaled to approximately [-1, 1] for neural network input.
 */
import { Candle } from './SignalEngine'

export interface FeatureVector {
  // Oscillators
  rsi14:         number   // 0–100
  rsi7:          number   // 0–100
  stochK:        number   // 0–100
  stochD:        number   // 0–100
  williamsR:     number   // -100–0
  // Momentum
  macdHist:      number   // normalised histogram
  macdLine:      number   // normalised MACD line
  prevMacdHist:  number
  // Trend
  emaTrend:      number   // -1 down, 0 sideways, 1 up
  ema9DistPct:   number   // % distance from EMA9
  ema21DistPct:  number   // % distance from EMA21
  // Volatility / Bands
  bbPct:         number   // 0–1 position within bands
  bbWidthNorm:   number   // normalised BB width
  atrPct:        number   // ATR as % of price
  adx:           number   // 0–100
  // Volume
  cmf:           number   // -1–1
  obvNorm:       number   // normalised OBV change
  volumeRatio:   number   // current vol / 20-period avg vol
  // Price action
  vwapDevPct:    number   // % deviation from VWAP
  priceChangeNorm: number // normalised 1-period return
  nearSupport:   boolean
  nearResistance: boolean
  // Candle shape
  candleBull:    number   // 1=bullish, 0=bearish
  candleBody:    number   // body as % of range
  upperWickRatio: number  // upper wick / range
}

// ── Indicator implementations ────────────────────────────────────

function ema(data: number[], n: number): number {
  const k = 2 / (n + 1); let prev = data[0] ?? 0
  data.forEach(v => { prev = v * k + prev * (1 - k) }); return prev
}

function rsi(closes: number[], n: number): number {
  if (closes.length < n + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  const rs = losses === 0 ? 100 : (gains / n) / (losses / n)
  return 100 - 100 / (1 + rs)
}

function stoch(candles: Candle[], k = 14): { K: number; D: number } {
  const sl = candles.slice(-k)
  const h = Math.max(...sl.map(c => c.high)), l = Math.min(...sl.map(c => c.low))
  const K = h === l ? 50 : ((sl[sl.length - 1].close - l) / (h - l)) * 100
  return { K, D: K }  // simplified D
}

function macdCalc(closes: number[]): { line: number; signal: number; hist: number; prevHist: number } {
  if (closes.length < 26) return { line: 0, signal: 0, hist: 0, prevHist: 0 }
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  const line = e12 - e26
  const prevLine = ema(closes.slice(0, -1), 12) - ema(closes.slice(0, -1), 26)
  const signal = line * (2 / 10) + prevLine * (1 - 2 / 10)
  return { line, signal, hist: line - signal, prevHist: prevLine - signal }
}

function bollingerBands(closes: number[], n = 20): { upper: number; mid: number; lower: number; pct: number; widthNorm: number } {
  if (closes.length < n) return { upper: closes[closes.length-1]*1.02, mid: closes[closes.length-1], lower: closes[closes.length-1]*.98, pct: .5, widthNorm: .02 }
  const sl   = closes.slice(-n)
  const mean = sl.reduce((a, b) => a + b, 0) / n
  const std  = Math.sqrt(sl.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const upper = mean + std * 2, lower = mean - std * 2
  const last  = closes[closes.length - 1]
  const range = upper - lower || 1
  return { upper, mid: mean, lower, pct: (last - lower) / range, widthNorm: range / mean }
}

function calcCMF(candles: Candle[], n = 20): number {
  const sl = candles.slice(-n)
  let mfv = 0, vol = 0
  sl.forEach(c => {
    const hl = c.high - c.low || 1
    mfv += ((c.close - c.low) - (c.high - c.close)) / hl * c.volume
    vol += c.volume
  })
  return vol > 0 ? Math.max(-1, Math.min(1, mfv / vol)) : 0
}

function calcOBV(candles: Candle[]): { current: number; prev5: number } {
  let obv = 0
  const obvArr: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume
    obvArr.push(obv)
  }
  return { current: obvArr[obvArr.length - 1], prev5: obvArr[Math.max(0, obvArr.length - 6)] }
}

function calcVWAP(candles: Candle[]): number {
  const sl = candles.slice(-20)
  let tv = 0, v = 0
  sl.forEach(c => { tv += (c.high + c.low + c.close) / 3 * c.volume; v += c.volume })
  return v > 0 ? tv / v : candles[candles.length - 1]?.close ?? 0
}

function calcADX(candles: Candle[], n = 14): number {
  if (candles.length < n + 2) return 20
  const dmp: number[] = [], dmm: number[] = [], trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1]
    const um = c.high - p.high, dm = p.low - c.low
    dmp.push(um > dm && um > 0 ? um : 0)
    dmm.push(dm > um && dm > 0 ? dm : 0)
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
  }
  const sl = dmp.slice(-n), sl2 = dmm.slice(-n), sl3 = trs.slice(-n)
  const atrN = sl3.reduce((a, b) => a + b, 0) / n || 1
  const diP = (sl.reduce((a, b) => a + b, 0) / n) / atrN * 100
  const diM = (sl2.reduce((a, b) => a + b, 0) / n) / atrN * 100
  return diP + diM > 0 ? Math.abs(diP - diM) / (diP + diM) * 100 : 0
}

function findSR(candles: Candle[], n = 3): { support: number[]; resistance: number[] } {
  const support: number[] = [], resistance: number[] = []
  for (let i = n; i < candles.length - n; i++) {
    const win = candles.slice(i - n, i + n + 1)
    if (candles[i].low  === Math.min(...win.map(c => c.low)))  support.push(candles[i].low)
    if (candles[i].high === Math.max(...win.map(c => c.high))) resistance.push(candles[i].high)
  }
  return { support: support.slice(-3), resistance: resistance.slice(-3) }
}

// ── Main builder ──────────────────────────────────────────────────

export function buildFeatureVector(candles: Candle[]): FeatureVector {
  if (candles.length < 10) {
    return {
      rsi14: 50, rsi7: 50, stochK: 50, stochD: 50, williamsR: -50,
      macdHist: 0, macdLine: 0, prevMacdHist: 0,
      emaTrend: 0, ema9DistPct: 0, ema21DistPct: 0,
      bbPct: 0.5, bbWidthNorm: 0.02, atrPct: 0.01, adx: 20,
      cmf: 0, obvNorm: 0, volumeRatio: 1,
      vwapDevPct: 0, priceChangeNorm: 0,
      nearSupport: false, nearResistance: false,
      candleBull: 0.5, candleBody: 0.5, upperWickRatio: 0.2,
    }
  }

  const closes  = candles.map(c => c.close)
  const last    = closes[closes.length - 1]
  const prev    = closes[closes.length - 2] ?? last

  const r14     = rsi(closes, 14)
  const r7      = rsi(closes, 7)
  const { K: sK, D: sD } = stoch(candles)
  const wR      = (() => {
    const sl = candles.slice(-14)
    const h = Math.max(...sl.map(c => c.high)), l = Math.min(...sl.map(c => c.low))
    return h === l ? -50 : ((h - last) / (h - l)) * -100
  })()

  const macd    = macdCalc(closes)
  const bb      = bollingerBands(closes)

  const e9  = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200)
  const eTrend = (last > e21 && e21 > e50 && e9 > e21) ? 1 : (last < e21 && e21 < e50 && e9 < e21) ? -1 : 0

  const atr = (() => {
    const sl = candles.slice(-14)
    const trs = sl.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - sl[i-1].close), Math.abs(c.low - sl[i-1].close)))
    return trs.reduce((a, b) => a + b, 0) / trs.length
  })()

  const adx     = calcADX(candles)
  const cmf     = calcCMF(candles)
  const { current: obvC, prev5: obvP } = calcOBV(candles)
  const obvNorm = obvP !== 0 ? (obvC - obvP) / Math.abs(obvP) : 0
  const vwapDev = last > 0 ? ((last - calcVWAP(candles)) / last) * 100 : 0
  const volAvg  = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20
  const volR    = volAvg > 0 ? candles[candles.length - 1].volume / volAvg : 1

  const { support, resistance } = findSR(candles)
  const nearS = support.some(s => Math.abs(last - s) / last < 0.006)
  const nearR = resistance.some(r => Math.abs(last - r) / last < 0.006)

  const lastC  = candles[candles.length - 1]
  const range  = lastC.high - lastC.low || 1
  const body   = Math.abs(lastC.close - lastC.open)
  const uWick  = lastC.high - Math.max(lastC.close, lastC.open)

  return {
    rsi14: r14, rsi7: r7, stochK: sK, stochD: sD, williamsR: wR,
    macdHist: macd.hist, macdLine: macd.line, prevMacdHist: macd.prevHist,
    emaTrend: eTrend, ema9DistPct: e9 > 0 ? (last - e9) / e9 * 100 : 0, ema21DistPct: e21 > 0 ? (last - e21) / e21 * 100 : 0,
    bbPct: bb.pct, bbWidthNorm: bb.widthNorm, atrPct: last > 0 ? atr / last : 0.01, adx,
    cmf, obvNorm: Math.max(-1, Math.min(1, obvNorm)), volumeRatio: Math.min(5, volR),
    vwapDevPct: vwapDev, priceChangeNorm: prev > 0 ? (last - prev) / prev * 100 : 0,
    nearSupport: nearS, nearResistance: nearR,
    candleBull: lastC.close >= lastC.open ? 1 : 0, candleBody: body / range, upperWickRatio: uWick / range,
  }
}
