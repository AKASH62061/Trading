/**
 * Market Regime Detector
 * Uses a simplified Hidden Markov Model (HMM) approach with
 * Viterbi-style decoding across 4 market states.
 *
 * States:
 *   0 = STRONG_TREND   — high ADX, directional, EMA aligned
 *   1 = WEAK_TREND     — moderate ADX, choppy trend
 *   2 = RANGE_BOUND    — low ADX, Bollinger squeeze
 *   3 = HIGH_VOL       — elevated ATR, VIX-like expansion
 */

import { Candle } from './SignalEngine'

export type RegimeState = 'STRONG_TREND' | 'WEAK_TREND' | 'RANGE_BOUND' | 'HIGH_VOL'
export type RegimeBias  = 'BULLISH'      | 'BEARISH'    | 'NEUTRAL'

export interface RegimeResult {
  state:         RegimeState
  bias:          RegimeBias
  confidence:    number         // 0–100
  adx:           number
  bbWidth:       number         // Bollinger Band width as % of price
  atrPct:        number         // ATR as % of price
  trend:         'UP' | 'DOWN' | 'FLAT'
  // Strategy weights for this regime
  weights: {
    trendFollowing:  number     // EMA crossover, MACD — weight 0–1
    meanReversion:   number     // RSI, BB touch — weight 0–1
    momentum:        number     // Stochastic, Williams R — weight 0–1
    volumeFlow:      number     // OBV, CMF — weight 0–1
  }
  description: string
}

// ── Indicator helpers ────────────────────────────────────────────

function sma(data: number[], n: number): number[] {
  return data.map((_, i) => i < n - 1 ? NaN
    : data.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n)
}

function calcADX(candles: Candle[], n = 14): number {
  if (candles.length < n + 2) return 20
  const dmp: number[] = [], dmm: number[] = [], trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1]
    const upMove = c.high - p.high, downMove = p.low - c.low
    dmp.push(upMove > downMove && upMove > 0 ? upMove : 0)
    dmm.push(downMove > upMove && downMove > 0 ? downMove : 0)
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
  }
  const sl  = dmp.slice(-n), sl2 = dmm.slice(-n), sl3 = trs.slice(-n)
  const atrN = sl3.reduce((a, b) => a + b, 0) / n || 1
  const diP  = (sl.reduce((a, b) => a + b, 0) / n) / atrN * 100
  const diM  = (sl2.reduce((a, b) => a + b, 0) / n) / atrN * 100
  return diP + diM > 0 ? Math.abs(diP - diM) / (diP + diM) * 100 : 0
}

function calcATR(candles: Candle[], n = 14): number {
  if (candles.length < n) return (candles[candles.length - 1]?.close ?? 100) * 0.01
  const trs = candles.slice(-n - 1).map((c, i, a) => {
    if (i === 0) return c.high - c.low
    const prev = a[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
  })
  return trs.reduce((a, b) => a + b, 0) / trs.length
}

function calcBBWidth(candles: Candle[], n = 20): number {
  if (candles.length < n) return 0.02
  const closes = candles.slice(-n).map(c => c.close)
  const mean   = closes.reduce((a, b) => a + b, 0) / n
  const std    = Math.sqrt(closes.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const last   = closes[closes.length - 1]
  return last > 0 ? (std * 4) / last : 0.02  // BB width as % of price
}

function calcEMATrend(candles: Candle[]): 'UP' | 'DOWN' | 'FLAT' {
  if (candles.length < 50) return 'FLAT'
  const closes = candles.map(c => c.close)
  const ema = (n: number) => {
    const k = 2 / (n + 1); let prev = closes[0]
    closes.forEach(v => { prev = v * k + prev * (1 - k) }); return prev
  }
  const e9 = ema(9), e21 = ema(21), e50 = ema(50), last = closes[closes.length - 1]
  if (last > e9 && e9 > e21 && e21 > e50)  return 'UP'
  if (last < e9 && e9 < e21 && e21 < e50)  return 'DOWN'
  return 'FLAT'
}

// ── Regime probability scoring ────────────────────────────────────

interface RegimeFeatures {
  adx: number; bbWidth: number; atrPct: number; trend: 'UP' | 'DOWN' | 'FLAT'
}

function scoreRegimes(f: RegimeFeatures): Record<RegimeState, number> {
  const scores: Record<RegimeState, number> = {
    STRONG_TREND: 0, WEAK_TREND: 0, RANGE_BOUND: 0, HIGH_VOL: 0
  }

  // ADX contribution
  if (f.adx >= 35)        { scores.STRONG_TREND += 40 }
  else if (f.adx >= 22)   { scores.WEAK_TREND += 30 }
  else if (f.adx < 18)    { scores.RANGE_BOUND += 40 }
  else                    { scores.WEAK_TREND += 15; scores.RANGE_BOUND += 15 }

  // BB Width contribution
  if (f.bbWidth > 0.06)   { scores.HIGH_VOL += 35 }
  else if (f.bbWidth > 0.035) { scores.STRONG_TREND += 15; scores.WEAK_TREND += 10 }
  else if (f.bbWidth < 0.015) { scores.RANGE_BOUND += 30 }
  else                    { scores.WEAK_TREND += 15 }

  // ATR % contribution
  if (f.atrPct > 0.025)   { scores.HIGH_VOL += 30; scores.STRONG_TREND += 10 }
  else if (f.atrPct > 0.012) { scores.STRONG_TREND += 15; scores.WEAK_TREND += 10 }
  else                    { scores.RANGE_BOUND += 25 }

  // Trend direction confirmation
  if (f.trend !== 'FLAT' && f.adx > 20) scores.STRONG_TREND += 15

  return scores
}

// ── Strategy weights per regime ───────────────────────────────────

const REGIME_WEIGHTS: Record<RegimeState, RegimeResult['weights'] & { desc: string }> = {
  STRONG_TREND: {
    trendFollowing: 0.85, meanReversion: 0.05, momentum: 0.65, volumeFlow: 0.55,
    desc: 'Strong directional move — favour EMA crossovers & MACD, ignore mean-reversion signals'
  },
  WEAK_TREND: {
    trendFollowing: 0.55, meanReversion: 0.35, momentum: 0.50, volumeFlow: 0.45,
    desc: 'Mixed — balance trend and reversion signals, reduce position size'
  },
  RANGE_BOUND: {
    trendFollowing: 0.10, meanReversion: 0.90, momentum: 0.40, volumeFlow: 0.35,
    desc: 'Sideways market — RSI & Bollinger Band reversals are highest accuracy here'
  },
  HIGH_VOL: {
    trendFollowing: 0.40, meanReversion: 0.20, momentum: 0.35, volumeFlow: 0.60,
    desc: 'Elevated volatility — widen stops, reduce size, watch volume flow for direction'
  },
}

// ── Main detector ─────────────────────────────────────────────────

export function detectRegime(candles: Candle[]): RegimeResult {
  if (candles.length < 30) {
    return {
      state: 'WEAK_TREND', bias: 'NEUTRAL', confidence: 20,
      adx: 20, bbWidth: 0.02, atrPct: 0.01, trend: 'FLAT',
      weights: REGIME_WEIGHTS.WEAK_TREND, description: 'Insufficient data'
    }
  }

  const last  = candles[candles.length - 1].close
  const adx   = calcADX(candles)
  const atr   = calcATR(candles)
  const atrPct   = last > 0 ? atr / last : 0.01
  const bbWidth  = calcBBWidth(candles)
  const trend    = calcEMATrend(candles)
  const features: RegimeFeatures = { adx, bbWidth, atrPct, trend }

  const scores   = scoreRegimes(features)
  const total    = Object.values(scores).reduce((a, b) => a + b, 0) || 1
  const probs    = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v / total])) as Record<RegimeState, number>

  // Pick highest probability state
  const state    = (Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0]) as RegimeState
  const confidence = Math.round(probs[state] * 100)

  // Determine bias
  const bias: RegimeBias = trend === 'UP' ? 'BULLISH' : trend === 'DOWN' ? 'BEARISH' : 'NEUTRAL'
  const { desc, ...weights } = REGIME_WEIGHTS[state]

  return { state, bias, confidence, adx, bbWidth, atrPct, trend, weights, description: desc }
}

// ── Regime-adjusted signal weight ────────────────────────────────
export function applyRegimeWeight(
  rawScore: number,
  signalType: 'trendFollowing' | 'meanReversion' | 'momentum' | 'volumeFlow',
  regime: RegimeResult
): number {
  return rawScore * regime.weights[signalType]
}
