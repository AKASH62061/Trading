/**
 * Advanced Risk Engine
 * Kelly Criterion, CVaR, Correlation-adjusted heat, Dynamic drawdown control
 */
import { Position } from '../services/PortfolioManager'

export interface KellyResult {
  fullKelly:    number   // 0–1 fraction of capital
  halfKelly:    number   // recommended (half Kelly)
  suggestedQty: (price: number, capital: number, multiplier?: number) => number
  rationale:    string
}

export interface CVaRResult {
  var95:    number   // 95% VaR in $
  cvar95:   number   // 95% CVaR (Expected Shortfall) in $
  var99:    number   // 99% VaR in $
  cvar99:   number   // 99% CVaR in $
  worstDay: number   // worst single-day scenario in $
}

export interface CorrelationMatrix {
  symbols:  string[]
  matrix:   number[][]   // correlation coefficients
  clusters: string[][]   // correlated groups
}

export interface PortfolioHeat {
  totalHeat:        number   // % capital at risk from all SLs
  byPosition:       Array<{ symbol: string; heat: number; contribution: number }>
  overLimit:        boolean  // > 20% is dangerous
  recommendation:   string
}

export interface DrawdownMetrics {
  current:          number   // current drawdown from peak %
  max:              number   // maximum historical %
  velociy:          number   // rate of drawdown (% per day)
  scaleFactor:      number   // 1.0 = full size, 0.5 = half size
  paused:           boolean  // stop trading if extreme DD
}

// ── Kelly Criterion ──────────────────────────────────────────────
export function calcKelly(
  winProbability: number,
  riskReward:     number,
  confidenceAdj = 1.0    // confidence adjustment (0–1)
): KellyResult {
  const p  = Math.min(0.95, Math.max(0.05, winProbability))
  const b  = Math.max(0.1, riskReward)
  const q  = 1 - p

  const fullKelly = Math.max(0, (b * p - q) / b)
  const halfKelly = Math.min(0.25, fullKelly * 0.5 * confidenceAdj)  // cap at 25%

  const suggestedQty = (price: number, capital: number, multiplier = 1): number => {
    if (price <= 0 || multiplier <= 0) return 1
    const riskCapital = capital * halfKelly
    const qty = Math.floor(riskCapital / (price * multiplier))
    return Math.max(1, qty)
  }

  let rationale = ''
  if (fullKelly < 0.05)    rationale = 'Edge too thin — skip or minimum size'
  else if (fullKelly < 0.1) rationale = 'Small edge — conservative sizing recommended'
  else if (fullKelly < 0.2) rationale = 'Moderate edge — half-Kelly appropriate'
  else                     rationale = 'Strong edge — half-Kelly (capped) for safety'

  return { fullKelly, halfKelly, suggestedQty, rationale }
}

// ── CVaR (Conditional Value at Risk / Expected Shortfall) ────────
export function calcCVaR(
  positions:     Position[],
  totalEquity:   number,
  marketVolMap:  Record<string, number>  // marketType → daily vol estimate
): CVaRResult {
  if (!positions.length || totalEquity <= 0) {
    return { var95: 0, cvar95: 0, var99: 0, cvar99: 0, worstDay: 0 }
  }

  // Monte Carlo simulation: 5000 scenarios, 1-day horizon
  const N = 5000
  const pnls: number[] = []

  for (let sim = 0; sim < N; sim++) {
    let portPnl = 0
    for (const pos of positions) {
      const vol   = marketVolMap[pos.marketType] ?? 0.015
      const shock = gaussianRand() * vol   // 1-day random return
      const posSize = pos.marketValue ?? (pos.currentPrice * pos.quantity * pos.multiplier)
      const pnl     = posSize * shock * (pos.side === 'BUY' ? 1 : -1) * pos.leverage
      portPnl += pnl
    }
    pnls.push(portPnl)
  }

  pnls.sort((a, b) => a - b)   // ascending

  const idx95 = Math.floor(N * 0.05)   // worst 5%
  const idx99 = Math.floor(N * 0.01)   // worst 1%

  const var95  = -pnls[idx95]
  const var99  = -pnls[idx99]
  const cvar95 = -pnls.slice(0, idx95 + 1).reduce((s, v) => s + v, 0) / (idx95 + 1)
  const cvar99 = -pnls.slice(0, idx99 + 1).reduce((s, v) => s + v, 0) / (idx99 + 1)
  const worstDay = -pnls[0]

  return { var95, cvar95, var99, cvar99, worstDay }
}

// Box-Muller transform for Gaussian random numbers
function gaussianRand(): number {
  const u1 = Math.random(), u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

// ── Correlation matrix ────────────────────────────────────────────
export function calcCorrelationMatrix(
  priceHistories: Record<string, number[]>  // symbol → array of daily returns
): CorrelationMatrix {
  const symbols = Object.keys(priceHistories)
  if (symbols.length < 2) {
    return { symbols, matrix: [[1]], clusters: [symbols] }
  }

  const n = symbols.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const r = pearsonCorr(priceHistories[symbols[i]], priceHistories[symbols[j]])
      matrix[i][j] = r
      matrix[j][i] = r
    }
  }

  // Simple clustering: group symbols with correlation > 0.6
  const clusters: string[][] = []
  const assigned = new Set<string>()
  for (let i = 0; i < n; i++) {
    if (assigned.has(symbols[i])) continue
    const cluster = [symbols[i]]
    assigned.add(symbols[i])
    for (let j = i + 1; j < n; j++) {
      if (!assigned.has(symbols[j]) && matrix[i][j] > 0.6) {
        cluster.push(symbols[j])
        assigned.add(symbols[j])
      }
    }
    clusters.push(cluster)
  }

  return { symbols, matrix, clusters }
}

function pearsonCorr(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  if (len < 3) return 0
  const ax = a.slice(-len), bx = b.slice(-len)
  const meanA = ax.reduce((s, v) => s + v, 0) / len
  const meanB = bx.reduce((s, v) => s + v, 0) / len
  const num = ax.reduce((s, v, i) => s + (v - meanA) * (bx[i] - meanB), 0)
  const denA = Math.sqrt(ax.reduce((s, v) => s + (v - meanA) ** 2, 0))
  const denB = Math.sqrt(bx.reduce((s, v) => s + (v - meanB) ** 2, 0))
  return denA * denB > 0 ? num / (denA * denB) : 0
}

// ── Portfolio heat ────────────────────────────────────────────────
export function calcPortfolioHeat(
  positions: Position[],
  totalEquity: number
): PortfolioHeat {
  const byPosition = positions
    .filter(p => p.status === 'OPEN')
    .map(pos => {
      const heat = pos.stopLoss
        ? Math.abs(pos.currentPrice - pos.stopLoss) * pos.quantity * pos.multiplier * pos.leverage
        : pos.marketValue * 0.02  // default 2% stop assumption
      return { symbol: pos.symbol, heat, contribution: totalEquity > 0 ? heat / totalEquity * 100 : 0 }
    })
    .sort((a, b) => b.heat - a.heat)

  const totalHeat = byPosition.reduce((s, p) => s + p.contribution, 0)
  const overLimit = totalHeat > 20

  const recommendation = totalHeat > 30
    ? '🔴 CRITICAL: Close positions or add stop losses immediately'
    : totalHeat > 20
    ? '🟡 WARNING: Portfolio heat above safe threshold (20%). Reduce size.'
    : totalHeat > 12
    ? '🟢 MODERATE: Consider tightening stops to reduce exposure'
    : '✅ SAFE: Portfolio heat within acceptable range'

  return { totalHeat, byPosition, overLimit, recommendation }
}

// ── Dynamic drawdown control ──────────────────────────────────────
export function calcDrawdownControl(
  equityCurve:   number[],
  currentEquity: number
): DrawdownMetrics {
  if (equityCurve.length < 2) {
    return { current: 0, max: 0, velociy: 0, scaleFactor: 1, paused: false }
  }

  const peak   = Math.max(...equityCurve)
  const current = peak > 0 ? (peak - currentEquity) / peak * 100 : 0

  let maxDD = 0, runPeak = equityCurve[0]
  equityCurve.forEach(v => {
    if (v > runPeak) runPeak = v
    const dd = (runPeak - v) / runPeak * 100
    if (dd > maxDD) maxDD = dd
  })

  // Velocity: drawdown rate over last 5 equity readings
  const recent = equityCurve.slice(-5)
  const velocity = recent.length >= 2
    ? (recent[recent.length - 1] - recent[0]) / recent[0] * -100 / recent.length
    : 0

  // Scale factor: reduce position size as drawdown increases
  let scaleFactor = 1.0
  if (current > 25)      scaleFactor = 0.0   // stop trading
  else if (current > 20) scaleFactor = 0.25  // 25% size
  else if (current > 15) scaleFactor = 0.50  // 50% size
  else if (current > 10) scaleFactor = 0.75  // 75% size

  return {
    current, max: maxDD, velociy: velocity,
    scaleFactor, paused: current > 25
  }
}

// ── Sharpe & Sortino ──────────────────────────────────────────────
export function calcSharpe(equityCurve: number[]): number {
  if (equityCurve.length < 10) return 0
  const returns = equityCurve.slice(1).map((v, i) => (v - equityCurve[i]) / equityCurve[i])
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const std  = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
  return std > 0 ? (mean / std) * Math.sqrt(252) : 0
}

export function calcSortino(equityCurve: number[]): number {
  if (equityCurve.length < 10) return 0
  const returns = equityCurve.slice(1).map((v, i) => (v - equityCurve[i]) / equityCurve[i])
  const mean    = returns.reduce((a, b) => a + b, 0) / returns.length
  const downRet = returns.filter(r => r < 0)
  const downStd = downRet.length
    ? Math.sqrt(downRet.reduce((s, r) => s + r ** 2, 0) / downRet.length)
    : Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length)
  return downStd > 0 ? (mean / downStd) * Math.sqrt(252) : 0
}
