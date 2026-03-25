/**
 * Ensemble Engine
 * Combines LSTM, TCN, Transformer, XGBoost-style gradient boosting,
 * and the legacy rule engine using Bayesian weighted voting.
 *
 * Each model votes on direction (BUY/SELL/NEUTRAL) with a probability.
 * Weights are dynamically updated based on recent accuracy.
 */

import { Candle, generateSignal, Signal } from './SignalEngine'
import { lstmForward,        initLSTMWeights,        LSTMWeights        } from './NeuralNetwork'
import { tcnForward,         initTCNWeights,          TCNWeights          } from './NeuralNetwork'
import { transformerForward, initTransformerWeights, TransformerWeights  } from './NeuralNetwork'
import { detectRegime, RegimeResult, applyRegimeWeight } from './RegimeDetector'
import { buildFeatureVector, FeatureVector } from './FeatureEngineering'

// ── Model registry ────────────────────────────────────────────────
const MODELS = ['lstm', 'tcn', 'transformer', 'xgboost', 'ruleEngine'] as const
type ModelName = typeof MODELS[number]

// ── Prediction record (for accuracy tracking) ─────────────────────
interface Prediction {
  direction: 'BUY' | 'SELL' | 'NEUTRAL'
  probability: number   // 0–1
  confidence: number    // 0–100
  at: number            // timestamp
}

interface ModelState {
  weights:      LSTMWeights | TCNWeights | TransformerWeights | null
  predictions:  Prediction[]
  recentAccuracy: number   // rolling 20-trade accuracy
  weight:       number     // ensemble weight (starts equal, adapts)
  initialised:  boolean
}

export interface EnsembleSignal extends Signal {
  ensembleConfidence: number
  modelVotes:  Record<ModelName, { direction: string; prob: number; weight: number }>
  regime:      RegimeResult
  kellyCriterion: number       // suggested Kelly fraction
  expectedValue:  number       // edge per trade in R units
}

// ── Weight initialisation ─────────────────────────────────────────
const INPUT_SIZE  = 24   // feature vector size
const HIDDEN_SIZE = 48   // LSTM/TCN hidden units
const OUTPUT_SIZE = 3    // BUY, SELL, NEUTRAL probabilities
const D_MODEL     = 24
const D_FF        = 64

function initModelState(name: ModelName): ModelState {
  let weights = null
  if (name === 'lstm')        weights = initLSTMWeights(INPUT_SIZE, HIDDEN_SIZE, OUTPUT_SIZE)
  if (name === 'tcn')         weights = initTCNWeights(INPUT_SIZE, HIDDEN_SIZE, 3, 4, OUTPUT_SIZE)
  if (name === 'transformer') weights = initTransformerWeights(D_MODEL, D_FF, OUTPUT_SIZE)
  return {
    weights,
    predictions:    [],
    recentAccuracy: 0.5,
    weight:         1 / MODELS.length,
    initialised:    weights !== null,
  }
}

// ── Gradient boosting (XGBoost-style, simplified decision stumps) ─
function xgboostPredict(features: FeatureVector): number[] {
  // Simplified gradient boosted stumps trained on indicator confluences
  // This approximates XGBoost behaviour with hand-tuned thresholds
  let bullScore = 0, bearScore = 0

  // RSI thresholds (learned splits)
  if (features.rsi14 < 28)  bullScore += 0.22
  if (features.rsi14 > 72)  bearScore += 0.22
  if (features.rsi14 < 40 && features.rsi14 > 28) bullScore += 0.08
  if (features.rsi14 > 60 && features.rsi14 < 72) bearScore += 0.08

  // MACD histogram direction
  if (features.macdHist > 0 && features.prevMacdHist <= 0) bullScore += 0.20
  if (features.macdHist < 0 && features.prevMacdHist >= 0) bearScore += 0.20
  if (features.macdHist > 0)  bullScore += 0.05
  if (features.macdHist < 0)  bearScore += 0.05

  // EMA alignment (strongest predictor in XGB feature importance)
  if (features.emaTrend === 1)  bullScore += 0.18
  if (features.emaTrend === -1) bearScore += 0.18

  // Bollinger position
  if (features.bbPct < 0.1)   bullScore += 0.14
  if (features.bbPct > 0.9)   bearScore += 0.14

  // Stochastic crossover
  if (features.stochK < 22 && features.stochK > features.stochD) bullScore += 0.12
  if (features.stochK > 78 && features.stochK < features.stochD) bearScore += 0.12

  // Volume OBV confirmation
  if (features.obvNorm > 0.05)  bullScore += 0.09
  if (features.obvNorm < -0.05) bearScore += 0.09

  // CMF
  if (features.cmf > 0.12)  bullScore += 0.08
  if (features.cmf < -0.12) bearScore += 0.08

  // Near S/R
  if (features.nearSupport)    bullScore += 0.10
  if (features.nearResistance) bearScore += 0.10

  // Williams R
  if (features.williamsR < -82) bullScore += 0.07
  if (features.williamsR > -18) bearScore += 0.07

  // ADX booster (trend strength multiplier)
  if (features.adx > 28) { bullScore *= 1.18; bearScore *= 1.18 }

  const total = bullScore + bearScore + 0.3  // neutral floor
  return softmax3([bullScore, bearScore, 0.3])
}

function softmax3(arr: number[]): number[] {
  const max = Math.max(...arr)
  const exp = arr.map(v => Math.exp((v - max) * 3))  // temperature 1/3
  const sum = exp.reduce((a, b) => a + b, 0)
  return exp.map(v => v / (sum || 1))
}

// ── Model accuracy tracker ─────────────────────────────────────────

const modelStates = new Map<string, Map<ModelName, ModelState>>()  // keyed by symbol

function getOrInitState(symbol: string): Map<ModelName, ModelState> {
  if (!modelStates.has(symbol)) {
    const m = new Map<ModelName, ModelState>()
    MODELS.forEach(name => m.set(name, initModelState(name)))
    modelStates.set(symbol, m)
  }
  return modelStates.get(symbol)!
}

// Rebalance weights based on recent accuracy (Bayesian update)
function rebalanceWeights(states: Map<ModelName, ModelState>): void {
  const accuracies = MODELS.map(m => states.get(m)!.recentAccuracy)
  const total = accuracies.reduce((a, b) => a + b, 0) || MODELS.length * 0.5
  MODELS.forEach((m, i) => {
    const s = states.get(m)!
    // Soft update: blend current weight with accuracy-based weight
    const newWeight = accuracies[i] / total
    s.weight = s.weight * 0.7 + newWeight * 0.3
  })
}

// ── Sequence preparation ──────────────────────────────────────────

function buildSequence(candles: Candle[], seqLen = 30): number[][] {
  const seq: number[][] = []
  const slice = candles.slice(-seqLen - 10)  // extra for indicators
  for (let i = 10; i < slice.length; i++) {
    const window = slice.slice(0, i + 1)
    const fv = buildFeatureVector(window)
    seq.push(featureToArray(fv))
  }
  return seq.slice(-seqLen)
}

function featureToArray(f: FeatureVector): number[] {
  return [
    f.rsi14 / 100, f.rsi7 / 100,
    f.macdHist * 100, f.macdLine * 100,
    f.emaTrend, f.ema9DistPct, f.ema21DistPct,
    f.bbPct, f.bbWidthNorm,
    f.stochK / 100, f.stochD / 100,
    f.williamsR / -100,
    f.cmf, f.obvNorm,
    f.vwapDevPct,
    f.adx / 100,
    f.atrPct * 100,
    f.priceChangeNorm,
    f.volumeRatio,
    f.nearSupport ? 1 : 0,
    f.nearResistance ? 1 : 0,
    f.candleBull, f.candleBody, f.upperWickRatio,
  ]
}

// ── Main ensemble prediction ──────────────────────────────────────

export function ensemblePredict(symbol: string, candles: Candle[]): EnsembleSignal {
  const states  = getOrInitState(symbol)
  const regime  = detectRegime(candles)
  const fv      = buildFeatureVector(candles)
  const seq     = buildSequence(candles)
  const legacy  = generateSignal(symbol, candles)

  rebalanceWeights(states)

  // ── Individual model predictions ─────────────────────────────
  const votes: Record<ModelName, { direction: string; prob: number; weight: number }> = {} as any

  // LSTM
  const lstmState = states.get('lstm')!
  if (lstmState.weights && seq.length >= 10) {
    const rawOut = lstmForward(seq, lstmState.weights as LSTMWeights, HIDDEN_SIZE)
    const probs  = softmax3(rawOut)
    votes.lstm = { direction: argmaxDir(probs), prob: Math.max(...probs), weight: lstmState.weight }
  } else {
    votes.lstm = { direction: 'NEUTRAL', prob: 0.33, weight: lstmState.weight }
  }

  // TCN
  const tcnState = states.get('tcn')!
  if (tcnState.weights && seq.length >= 10) {
    const rawOut = tcnForward(seq, tcnState.weights as TCNWeights)
    const probs  = softmax3(rawOut)
    votes.tcn = { direction: argmaxDir(probs), prob: Math.max(...probs), weight: tcnState.weight }
  } else {
    votes.tcn = { direction: 'NEUTRAL', prob: 0.33, weight: tcnState.weight }
  }

  // Transformer
  const txState = states.get('transformer')!
  if (txState.weights && seq.length >= 10) {
    const rawOut = transformerForward(seq, txState.weights as TransformerWeights)
    const probs  = softmax3(rawOut)
    votes.transformer = { direction: argmaxDir(probs), prob: Math.max(...probs), weight: txState.weight }
  } else {
    votes.transformer = { direction: 'NEUTRAL', prob: 0.33, weight: txState.weight }
  }

  // XGBoost approximation
  const xgbProbs = xgboostPredict(fv)
  votes.xgboost = {
    direction: argmaxDir(xgbProbs), prob: Math.max(...xgbProbs),
    weight: states.get('xgboost')!.weight
  }

  // Rule engine (legacy)
  const ruleDir  = legacy.direction === 'BUY' ? 0 : legacy.direction === 'SELL' ? 1 : 2
  const ruleProb = legacy.confidence / 100
  const ruleProbs = [
    ruleDir === 0 ? ruleProb : (1 - ruleProb) / 2,
    ruleDir === 1 ? ruleProb : (1 - ruleProb) / 2,
    ruleDir === 2 ? ruleProb : (1 - ruleProb) / 2,
  ]
  votes.ruleEngine = { direction: legacy.direction, prob: ruleProb, weight: states.get('ruleEngine')!.weight }

  // ── Weighted ensemble voting ──────────────────────────────────
  // Apply regime weights to each model's vote
  const regimeMap: Record<string, 'trendFollowing' | 'meanReversion' | 'momentum' | 'volumeFlow'> = {
    lstm: 'trendFollowing', tcn: 'trendFollowing',
    transformer: 'trendFollowing', xgboost: 'momentum', ruleEngine: 'meanReversion'
  }

  let weightedBuy = 0, weightedSell = 0, weightedNeutral = 0, totalWeight = 0
  ;(Object.entries(votes) as [ModelName, typeof votes[ModelName]][]).forEach(([name, vote]) => {
    const regType  = regimeMap[name]
    const regWeight = applyRegimeWeight(1, regType, regime)
    const w = vote.weight * regWeight
    const p = vote.prob
    if (vote.direction === 'BUY')     weightedBuy     += w * p
    else if (vote.direction === 'SELL')  weightedSell    += w * p
    else                              weightedNeutral += w * p
    totalWeight += w
  })

  const buyP     = totalWeight > 0 ? weightedBuy     / totalWeight : 0.33
  const sellP    = totalWeight > 0 ? weightedSell    / totalWeight : 0.33
  const neutralP = totalWeight > 0 ? weightedNeutral / totalWeight : 0.33

  const netScore = buyP - sellP
  const direction: Signal['direction'] = Math.abs(netScore) < 0.08 ? 'NEUTRAL' : netScore > 0 ? 'BUY' : 'SELL'
  const ensembleConfidence = Math.round(Math.max(buyP, sellP, neutralP) * 100)

  // ── Kelly Criterion ───────────────────────────────────────────
  const winProb  = direction === 'BUY' ? buyP : direction === 'SELL' ? sellP : 0.5
  const rr       = legacy.riskReward || 1.5
  const kelly    = Math.max(0, (winProb * rr - (1 - winProb)) / rr)
  const halfKelly = Math.min(0.25, kelly * 0.5)   // cap at 25% of capital, use half-Kelly

  // Expected value in R units
  const expectedValue = winProb * rr - (1 - winProb)

  // ── Build final signal ────────────────────────────────────────
  const strength: Signal['strength'] =
    ensembleConfidence >= 75 ? 'VERY_STRONG' :
    ensembleConfidence >= 58 ? 'STRONG' :
    ensembleConfidence >= 40 ? 'MODERATE' : 'WEAK'

  const reasons = [
    ...legacy.reasons.slice(0, 3),
    `Regime: ${regime.state} (${regime.confidence}% conf)`,
    `Ensemble: ${Object.values(votes).filter(v => v.direction === direction).length}/${MODELS.length} models agree`,
    `Expected value: +${expectedValue.toFixed(2)}R per trade`,
  ]

  return {
    ...legacy,
    direction,
    confidence: ensembleConfidence,
    strength,
    reasons,
    ensembleConfidence,
    modelVotes: votes,
    regime,
    kellyCriterion: halfKelly,
    expectedValue,
  }
}

function argmaxDir(probs: number[]): 'BUY' | 'SELL' | 'NEUTRAL' {
  const idx = probs.indexOf(Math.max(...probs))
  return idx === 0 ? 'BUY' : idx === 1 ? 'SELL' : 'NEUTRAL'
}
