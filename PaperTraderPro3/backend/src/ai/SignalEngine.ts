/**
 * AI Signal Engine
 * Generates buy/sell signals using multiple technical analysis strategies:
 * - Trend following (EMA crossover, MACD)
 * - Mean reversion (RSI, Bollinger Bands)
 * - Momentum (Rate of Change, Stochastic)
 * - Volume analysis (OBV, VWAP deviation)
 * - Pattern recognition (Doji, Engulfing, Hammer, etc.)
 * - Multi-timeframe confluence scoring
 */

export interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number
}

export interface Signal {
  symbol: string
  direction: 'BUY' | 'SELL' | 'NEUTRAL'
  confidence: number       // 0–100
  strength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG'
  reasons: string[]
  suggestedEntry: number
  suggestedSL: number
  suggestedTP: number
  riskReward: number
  technicals: TechnicalSnapshot
  pattern?: CandlePattern
  timestamp: number
}

export interface TechnicalSnapshot {
  rsi14: number; rsi7: number
  macdLine: number; macdSignal: number; macdHist: number
  ema9: number; ema21: number; ema50: number; ema200: number
  bb_upper: number; bb_mid: number; bb_lower: number; bb_pct: number
  atr14: number; adx14: number
  obv: number; obvTrend: 'UP'|'DOWN'|'FLAT'
  vwapDev: number       // % deviation from VWAP
  stochK: number; stochD: number
  williamsR: number
  cmf: number           // Chaikin Money Flow
  trend: 'STRONG_UP'|'UP'|'SIDEWAYS'|'DOWN'|'STRONG_DOWN'
  supportLevels: number[]; resistanceLevels: number[]
}

export interface CandlePattern {
  name: string
  type: 'BULLISH'|'BEARISH'|'NEUTRAL'
  reliability: number   // 0–100
}

// ── Mathematical helpers ─────────────────────────────────────

function sma(data: number[], n: number): number[] {
  return data.map((_, i) => i < n-1 ? NaN : data.slice(i-n+1,i+1).reduce((a,b)=>a+b)/n)
}

function ema(data: number[], n: number): number[] {
  const k = 2/(n+1); const r: number[] = []
  let prev = NaN
  data.forEach(v => {
    if (isNaN(prev)) { prev = v; r.push(v); return }
    prev = v*k + prev*(1-k); r.push(prev)
  })
  return r
}

function rsi(closes: number[], n = 14): number[] {
  const result: number[] = new Array(n).fill(NaN)
  for (let i = n; i < closes.length; i++) {
    let gains = 0, losses = 0
    for (let j = i-n+1; j <= i; j++) {
      const d = closes[j] - closes[j-1]
      if (d > 0) gains += d; else losses -= d
    }
    const rs = losses === 0 ? 100 : (gains/n)/(losses/n)
    result.push(100 - 100/(1+rs))
  }
  return result
}

function macd(closes: number[]): { line: number[]; signal: number[]; hist: number[] } {
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  const line = e12.map((v,i) => v - e26[i])
  const signal = ema(line.filter(v => !isNaN(v)), 9)
  const padded = new Array(line.length - signal.length).fill(NaN).concat(signal)
  const hist = line.map((v,i) => v - padded[i])
  return { line, signal: padded, hist }
}

function bollingerBands(closes: number[], n = 20, mult = 2) {
  const mid = sma(closes, n)
  const upper: number[] = [], lower: number[] = []
  closes.forEach((_, i) => {
    if (i < n-1) { upper.push(NaN); lower.push(NaN); return }
    const slice = closes.slice(i-n+1, i+1)
    const m = mid[i]
    const std = Math.sqrt(slice.reduce((s,v) => s+(v-m)**2, 0)/n)
    upper.push(m + std*mult); lower.push(m - std*mult)
  })
  return { upper, mid, lower }
}

function atr(candles: Candle[], n = 14): number[] {
  const trs = candles.map((c,i) => {
    if (i === 0) return c.high - c.low
    const prev = candles[i-1].close
    return Math.max(c.high-c.low, Math.abs(c.high-prev), Math.abs(c.low-prev))
  })
  return sma(trs, n)
}

function adx(candles: Candle[], n = 14): number {
  if (candles.length < n+1) return 25
  const dmp: number[] = [], dmm: number[] = [], trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i-1]
    const upMove = c.high - p.high, downMove = p.low - c.low
    dmp.push(upMove > downMove && upMove > 0 ? upMove : 0)
    dmm.push(downMove > upMove && downMove > 0 ? downMove : 0)
    trs.push(Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close)))
  }
  const sl = dmp.slice(-n), sl2 = dmm.slice(-n), sl3 = trs.slice(-n)
  const atrN = sl3.reduce((a,b)=>a+b)/n
  const diP = (sl.reduce((a,b)=>a+b)/n)/atrN*100
  const diM = (sl2.reduce((a,b)=>a+b)/n)/atrN*100
  return diP+diM > 0 ? Math.abs(diP-diM)/(diP+diM)*100 : 0
}

function obv(candles: Candle[]): number[] {
  const result: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    const prev = result[i-1], c = candles[i]
    if (c.close > candles[i-1].close) result.push(prev + c.volume)
    else if (c.close < candles[i-1].close) result.push(prev - c.volume)
    else result.push(prev)
  }
  return result
}

function vwap(candles: Candle[]): number {
  let tv = 0, v = 0
  candles.forEach(c => { tv += (c.high+c.low+c.close)/3*c.volume; v += c.volume })
  return v > 0 ? tv/v : candles[candles.length-1]?.close ?? 0
}

function stochastic(candles: Candle[], k=14, d=3): {K: number; D: number} {
  const sl = candles.slice(-k)
  const h = Math.max(...sl.map(c=>c.high)), l = Math.min(...sl.map(c=>c.low))
  const K = h===l ? 50 : ((sl[sl.length-1].close - l)/(h-l))*100
  // simplified D
  const kVals = candles.slice(-k-d+1).map((_,i) => {
    const sl2 = candles.slice(i, i+k)
    const h2 = Math.max(...sl2.map(c=>c.high)), l2 = Math.min(...sl2.map(c=>c.low))
    return h2===l2 ? 50 : ((sl2[sl2.length-1].close-l2)/(h2-l2))*100
  })
  const D = kVals.slice(-d).reduce((a,b)=>a+b,0)/d
  return { K, D }
}

function williamsR(candles: Candle[], n=14): number {
  const sl = candles.slice(-n)
  const h = Math.max(...sl.map(c=>c.high)), l = Math.min(...sl.map(c=>c.low))
  return h===l ? -50 : ((h - sl[sl.length-1].close)/(h-l))*-100
}

function cmf(candles: Candle[], n=20): number {
  const sl = candles.slice(-n)
  let mfv = 0, vol = 0
  sl.forEach(c => {
    const hl = c.high-c.low || 1
    mfv += ((c.close-c.low)-(c.high-c.close))/hl * c.volume
    vol += c.volume
  })
  return vol > 0 ? mfv/vol : 0
}

// Support / resistance: find local swing highs/lows
function findSRLevels(candles: Candle[], n = 3): {support: number[]; resistance: number[]} {
  const support: number[] = [], resistance: number[] = []
  for (let i = n; i < candles.length - n; i++) {
    const win = candles.slice(i-n, i+n+1)
    if (candles[i].low  === Math.min(...win.map(c=>c.low)))  support.push(candles[i].low)
    if (candles[i].high === Math.max(...win.map(c=>c.high))) resistance.push(candles[i].high)
  }
  return {
    support:    support.slice(-3).sort((a,b)=>b-a),
    resistance: resistance.slice(-3).sort((a,b)=>a-b),
  }
}

// ── Candlestick pattern recognition ──────────────────────────

function detectPattern(candles: Candle[]): CandlePattern | undefined {
  if (candles.length < 3) return undefined
  const [c3, c2, c1] = candles.slice(-3)
  const body1 = Math.abs(c1.close-c1.open), body2 = Math.abs(c2.close-c2.open), body3 = Math.abs(c3.close-c3.open)
  const range1 = c1.high-c1.low || .001
  const isGreen = (c: Candle) => c.close > c.open
  const isRed   = (c: Candle) => c.close < c.open

  // Doji
  if (body1/range1 < 0.1) return {name:'Doji',type:'NEUTRAL',reliability:60}
  // Hammer / Hanging Man
  const lowerWick1 = Math.min(c1.open,c1.close)-c1.low
  const upperWick1 = c1.high-Math.max(c1.open,c1.close)
  if (lowerWick1 > body1*2 && upperWick1 < body1*.5) {
    return isGreen(c1) ? {name:'Hammer',type:'BULLISH',reliability:72} : {name:'Hanging Man',type:'BEARISH',reliability:68}
  }
  // Shooting Star / Inverted Hammer
  if (upperWick1 > body1*2 && lowerWick1 < body1*.5) {
    return isRed(c1) ? {name:'Shooting Star',type:'BEARISH',reliability:74} : {name:'Inverted Hammer',type:'BULLISH',reliability:65}
  }
  // Engulfing
  if (isGreen(c1) && isRed(c2) && c1.close > c2.open && c1.open < c2.close)
    return {name:'Bullish Engulfing',type:'BULLISH',reliability:80}
  if (isRed(c1) && isGreen(c2) && c1.close < c2.open && c1.open > c2.close)
    return {name:'Bearish Engulfing',type:'BEARISH',reliability:80}
  // Morning Star
  if (isRed(c3) && body2 < body3*.3 && isGreen(c1) && c1.close > (c3.open+c3.close)/2)
    return {name:'Morning Star',type:'BULLISH',reliability:82}
  // Evening Star
  if (isGreen(c3) && body2 < body3*.3 && isRed(c1) && c1.close < (c3.open+c3.close)/2)
    return {name:'Evening Star',type:'BEARISH',reliability:82}
  // Three White Soldiers
  if (isGreen(c1) && isGreen(c2) && isGreen(c3) && body1>range1*.6 && body2>0 && body3>0)
    return {name:'Three White Soldiers',type:'BULLISH',reliability:85}
  // Three Black Crows
  if (isRed(c1) && isRed(c2) && isRed(c3) && body1>range1*.6 && body2>0 && body3>0)
    return {name:'Three Black Crows',type:'BEARISH',reliability:85}
  // Marubozu
  if (body1/range1 > 0.95) return isGreen(c1) ? {name:'Bullish Marubozu',type:'BULLISH',reliability:70} : {name:'Bearish Marubozu',type:'BEARISH',reliability:70}

  return undefined
}

// ── Main signal generator ────────────────────────────────────

export function generateSignal(symbol: string, candles: Candle[]): Signal {
  if (candles.length < 50) return neutralSignal(symbol, candles)

  const closes  = candles.map(c=>c.close)
  const highs   = candles.map(c=>c.high)
  const lows    = candles.map(c=>c.low)
  const last    = closes[closes.length-1]

  // Compute indicators
  const rsi14   = rsi(closes, 14)
  const rsi7    = rsi(closes, 7)
  const _macd   = macd(closes)
  const bb      = bollingerBands(closes)
  const e9      = ema(closes, 9)
  const e21     = ema(closes, 21)
  const e50     = ema(closes, 50)
  const e200    = ema(closes, 200)
  const atr14   = atr(candles, 14)
  const obvArr  = obv(candles)
  const vwapVal = vwap(candles.slice(-20))
  const stoch   = stochastic(candles)
  const willR   = williamsR(candles)
  const cmfVal  = cmf(candles)
  const {support, resistance} = findSRLevels(candles)
  const pattern = detectPattern(candles)

  const n = closes.length-1
  const curRsi14   = rsi14[n]   || 50
  const curRsi7    = rsi7[n]    || 50
  const curMacdL   = _macd.line[n]   || 0
  const curMacdS   = _macd.signal[n] || 0
  const curMacdH   = _macd.hist[n]   || 0
  const curE9      = e9[n]   || last
  const curE21     = e21[n]  || last
  const curE50     = e50[n]  || last
  const curE200    = e200[n] || last
  const curBbU     = bb.upper[n] || last*1.02
  const curBbM     = bb.mid[n]   || last
  const curBbL     = bb.lower[n] || last*.98
  const curAtr     = atr14[n]   || last*.01
  const curAdx     = adx(candles)
  const curObv     = obvArr[n]
  const prevObv    = obvArr[n-5]
  const obvTrend   = curObv > prevObv*1.005 ? 'UP' : curObv < prevObv*.995 ? 'DOWN' : 'FLAT'
  const vwapDev    = ((last - vwapVal)/vwapVal)*100
  const bbPct      = curBbU-curBbL > 0 ? (last-curBbL)/(curBbU-curBbL)*100 : 50

  // Determine trend
  let trend: TechnicalSnapshot['trend'] = 'SIDEWAYS'
  const aboveE21 = last > curE21, aboveE50 = last > curE50, aboveE200 = last > curE200
  if (aboveE21 && aboveE50 && aboveE200 && curE9 > curE21) trend = 'STRONG_UP'
  else if (aboveE21 && aboveE50) trend = 'UP'
  else if (!aboveE21 && !aboveE50 && !aboveE200 && curE9 < curE21) trend = 'STRONG_DOWN'
  else if (!aboveE21 && !aboveE50) trend = 'DOWN'

  // ── Scoring system ──────────────────────────────────────
  let bullScore = 0, bearScore = 0
  const reasons: string[] = []

  // RSI
  if (curRsi14 < 30) { bullScore += 20; reasons.push(`RSI oversold (${curRsi14.toFixed(1)})`) }
  else if (curRsi14 < 45) { bullScore += 8 }
  if (curRsi14 > 70) { bearScore += 20; reasons.push(`RSI overbought (${curRsi14.toFixed(1)})`) }
  else if (curRsi14 > 55) { bearScore += 8 }
  // RSI divergence (price vs RSI)
  if (curRsi7 > 50 && rsi7[n-1] < 50) { bullScore += 10; reasons.push('RSI bullish crossover') }
  if (curRsi7 < 50 && rsi7[n-1] > 50) { bearScore += 10; reasons.push('RSI bearish crossover') }

  // MACD
  if (curMacdH > 0 && (_macd.hist[n-1]||0) < 0) { bullScore += 18; reasons.push('MACD bullish crossover') }
  if (curMacdH < 0 && (_macd.hist[n-1]||0) > 0) { bearScore += 18; reasons.push('MACD bearish crossover') }
  if (curMacdL > 0 && curMacdH > 0) { bullScore += 6 }
  if (curMacdL < 0 && curMacdH < 0) { bearScore += 6 }

  // EMA trend
  if (trend === 'STRONG_UP')   { bullScore += 20; reasons.push('Strong uptrend (EMA alignment)') }
  else if (trend === 'UP')     { bullScore += 10 }
  if (trend === 'STRONG_DOWN') { bearScore += 20; reasons.push('Strong downtrend (EMA alignment)') }
  else if (trend === 'DOWN')   { bearScore += 10 }

  // EMA crossovers
  if (curE9 > curE21 && (e9[n-1]||0) < (e21[n-1]||0)) { bullScore += 15; reasons.push('EMA 9/21 golden cross') }
  if (curE9 < curE21 && (e9[n-1]||0) > (e21[n-1]||0)) { bearScore += 15; reasons.push('EMA 9/21 death cross') }

  // Bollinger Bands
  if (last <= curBbL) { bullScore += 15; reasons.push('Price at lower Bollinger Band') }
  if (last >= curBbU) { bearScore += 15; reasons.push('Price at upper Bollinger Band') }
  if (bbPct > 80)     { bearScore += 8 }
  if (bbPct < 20)     { bullScore += 8 }

  // Stochastic
  if (stoch.K < 20 && stoch.K > stoch.D) { bullScore += 12; reasons.push(`Stochastic oversold crossup (${stoch.K.toFixed(0)})`) }
  if (stoch.K > 80 && stoch.K < stoch.D) { bearScore += 12; reasons.push(`Stochastic overbought crossdown (${stoch.K.toFixed(0)})`) }

  // Williams %R
  if (willR < -80) { bullScore += 10; reasons.push('Williams %R extreme oversold') }
  if (willR > -20) { bearScore += 10; reasons.push('Williams %R extreme overbought') }

  // CMF
  if (cmfVal > 0.1) { bullScore += 10; reasons.push('Strong money inflow (CMF)') }
  if (cmfVal < -0.1){ bearScore += 10; reasons.push('Strong money outflow (CMF)') }

  // OBV trend
  if (obvTrend === 'UP')   { bullScore += 8;  reasons.push('OBV rising — volume confirms') }
  if (obvTrend === 'DOWN') { bearScore += 8;  reasons.push('OBV falling — distribution') }

  // VWAP
  if (vwapDev > 1.5) { bearScore += 8 }
  if (vwapDev < -1.5){ bullScore += 8 }

  // ADX strength filter
  const strongTrend = curAdx > 25
  if (strongTrend) { const mult = 1.2; bullScore *= mult; bearScore *= mult }

  // Candlestick pattern
  if (pattern) {
    const w = (pattern.reliability/100) * 15
    if (pattern.type === 'BULLISH') { bullScore += w; reasons.push(`Pattern: ${pattern.name}`) }
    if (pattern.type === 'BEARISH') { bearScore += w; reasons.push(`Pattern: ${pattern.name}`) }
  }

  // Support/Resistance proximity
  const nearSupport    = support.some(s    => Math.abs(last-s)/last    < 0.005)
  const nearResistance = resistance.some(r => Math.abs(last-r)/last    < 0.005)
  if (nearSupport)    { bullScore += 12; reasons.push('Price near key support') }
  if (nearResistance) { bearScore += 12; reasons.push('Price near key resistance') }

  // ── Decision ────────────────────────────────────────────
  const net = bullScore - bearScore
  const totalScore = Math.max(bullScore, bearScore)
  const confidence = Math.min(95, Math.round(totalScore * 0.7))
  const strength: Signal['strength'] = confidence >= 75 ? 'VERY_STRONG' : confidence >= 55 ? 'STRONG' : confidence >= 35 ? 'MODERATE' : 'WEAK'
  const direction: Signal['direction'] = Math.abs(net) < 10 ? 'NEUTRAL' : net > 0 ? 'BUY' : 'SELL'

  // SL/TP calculation using ATR
  const atrMult = 1.5
  const suggestedEntry = last
  const suggestedSL    = direction === 'BUY' ? last - curAtr*atrMult : last + curAtr*atrMult
  const suggestedTP    = direction === 'BUY' ? last + curAtr*atrMult*2.5 : last - curAtr*atrMult*2.5
  const riskReward     = Math.abs(suggestedTP-suggestedEntry)/Math.abs(suggestedSL-suggestedEntry)

  const technicals: TechnicalSnapshot = {
    rsi14: curRsi14, rsi7: curRsi7,
    macdLine: curMacdL, macdSignal: curMacdS, macdHist: curMacdH,
    ema9: curE9, ema21: curE21, ema50: curE50, ema200: curE200,
    bb_upper: curBbU, bb_mid: curBbM, bb_lower: curBbL, bb_pct: bbPct,
    atr14: curAtr, adx14: curAdx,
    obv: curObv, obvTrend, vwapDev,
    stochK: stoch.K, stochD: stoch.D,
    williamsR: willR, cmf: cmfVal,
    trend, supportLevels: support, resistanceLevels: resistance,
  }

  return { symbol, direction, confidence, strength, reasons: reasons.slice(0,6), suggestedEntry, suggestedSL, suggestedTP, riskReward, technicals, pattern, timestamp: Date.now() }
}

function neutralSignal(symbol: string, candles: Candle[]): Signal {
  const last = candles[candles.length-1]?.close ?? 100
  return { symbol, direction:'NEUTRAL', confidence:0, strength:'WEAK', reasons:['Insufficient data'], suggestedEntry:last, suggestedSL:last*.99, suggestedTP:last*1.01, riskReward:1, technicals:{rsi14:50,rsi7:50,macdLine:0,macdSignal:0,macdHist:0,ema9:last,ema21:last,ema50:last,ema200:last,bb_upper:last*1.02,bb_mid:last,bb_lower:last*.98,bb_pct:50,atr14:last*.01,adx14:25,obv:0,obvTrend:'FLAT',vwapDev:0,stochK:50,stochD:50,williamsR:-50,cmf:0,trend:'SIDEWAYS',supportLevels:[],resistanceLevels:[]}, timestamp:Date.now() }
}
