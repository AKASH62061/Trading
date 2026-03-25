import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import cron from 'node-cron'
import { body, validationResult } from 'express-validator'

import { PriceSimulator } from './services/PriceSimulator'
import { RealMarketData } from './services/RealMarketData'
import { fetchIndianStocks, getOptionChain, analyzeOptionChain } from './services/IndianMarketData'
import { PortfolioManager } from './services/PortfolioManager'
import { INSTRUMENTS, MARKET_CONFIG, FUTURES_MULTIPLIERS } from './models/instruments'
import { ensemblePredict, EnsembleSignal } from './ai/EnsembleEngine'
import { detectRegime } from './ai/RegimeDetector'
import { calcKelly, calcCVaR, calcPortfolioHeat, calcDrawdownControl, calcCorrelationMatrix, calcSharpe, calcSortino } from './ai/RiskEngine'
import { computeAdvancedSignal, TIMEFRAME_CONFIGS, TradingMode } from './ai/AdvancedAI'

dotenv.config()

const app = express()
const srv = createServer(app)
const wss = new WebSocketServer({ server: srv, path: '/ws' })

export const sim     = new PriceSimulator()
export const pm      = new PortfolioManager(sim)
export const realMkt = new RealMarketData()

const indianQuotes = new Map<string, any>()
async function refreshIndianData() {
  try {
    const quotes = await fetchIndianStocks()
    quotes.forEach((q, sym) => { indianQuotes.set(sym, q); sim.applyLiveQuote(sym, q) })
  } catch (e) { console.warn('[IndianMkt]', (e as Error).message) }
}
refreshIndianData()
setInterval(refreshIndianData, 15_000)

realMkt.onUpdate((quotes) => { for (const [sym, q] of quotes) sim.applyLiveQuote(sym, q) })
realMkt.start().catch(e => console.warn('[RealMkt]', e.message))

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({ origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['http://localhost:5173','http://localhost:5174','http://localhost:5175'], credentials: true }))
app.use(compression())
app.use(express.json({ limit: '10mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use('/api/', rateLimit({ windowMs: 60_000, max: 800, standardHeaders: true, legacyHeaders: false }))

const ensembleCache = new Map<string, { signal: EnsembleSignal; at: number }>()
const advancedCache = new Map<string, { signal: any; at: number }>()

function getEnsembleSignal(sym: string): EnsembleSignal | null {
  const pd = sim.getPrice(sym); if (!pd) return null
  const candles = pd.candles['15m'] ?? pd.candles['1m']
  if (!candles || candles.length < 50) return null
  const cached = ensembleCache.get(sym)
  if (cached && Date.now() - cached.at < 30000) return cached.signal
  try { const s = ensemblePredict(sym, candles); ensembleCache.set(sym, { signal:s, at:Date.now() }); return s } catch { return null }
}

function getAdvancedSignal(sym: string, mode: TradingMode = 'INTRADAY_15M'): any | null {
  const pd = sim.getPrice(sym); if (!pd) return null
  const key = `${sym}:${mode}`
  const cached = advancedCache.get(key)
  if (cached && Date.now() - cached.at < 45000) return cached.signal
  try {
    const cfg = TIMEFRAME_CONFIGS[mode]
    const candles = pd.candles[cfg.candleTimeframe] ?? pd.candles['15m'] ?? pd.candles['1m']
    if (!candles || candles.length < 30) return null
    const s = computeAdvancedSignal(sym, candles, mode, pd.candles['1m'], pd.candles['5m'], pd.candles['1h'])
    advancedCache.set(key, { signal:s, at:Date.now() }); return s
  } catch(e) { console.warn('[AdvAI]', sym, (e as Error).message); return null }
}

function getAllEnsembleSignals(): Record<string, EnsembleSignal> {
  const result: Record<string, EnsembleSignal> = {}
  for (const [, list] of Object.entries(INSTRUMENTS))
    list.forEach(inst => { const s = getEnsembleSignal(inst.sym); if (s) result[inst.sym] = s })
  return result
}

app.get('/api/health', (_, res) => res.json({
  status: 'ok', uptime: process.uptime(), symbols: Object.values(INSTRUMENTS).flat().length,
  indianSymbols: indianQuotes.size,
  aiStack: ['LSTM','TCN','Transformer','XGBoost','Mamba SSM','WaveNet','Q-Learning RL','ANFIS','Monte Carlo 500x','Hurst Exponent','Order Flow Imbalance','Multi-Timeframe Confluence','Dynamic RR 1:1.5+','Kelly+CVaR']
}))

app.get('/api/prices',              (_, res) => res.json(sim.getSnapshot()))
app.get('/api/prices/heatmap',      (_, res) => res.json(sim.getHeatmapData()))
app.get('/api/prices/live-status',  (_, res) => { const q = realMkt.getAllQuotes(); res.json({ liveSymbols: q.size + indianQuotes.size, symbols: Array.from(q.keys()), indianSymbols: Array.from(indianQuotes.keys()), lastUpdate: Date.now() }) })
app.get('/api/prices/:sym',         (req, res) => { const d = sim.getPrice(req.params.sym); d ? res.json(d) : res.status(404).json({ error: 'Not found' }) })
app.get('/api/prices/:sym/candles', (req, res) => { const { tf = '15m', limit = '200' } = req.query as any; res.json(sim.getCandles(req.params.sym, tf, parseInt(limit))) })

app.get('/api/signals',     (_, res) => res.json(getAllEnsembleSignals()))
app.get('/api/signals/:sym',(req, res) => { const s = getEnsembleSignal(req.params.sym); s ? res.json(s) : res.status(404).json({ error: 'No signal' }) })

app.get('/api/advanced-signal/:sym', (req, res) => {
  const mode = (req.query.mode as TradingMode) || 'INTRADAY_15M'
  const s = getAdvancedSignal(req.params.sym, mode)
  s ? res.json(s) : res.status(404).json({ error: 'No advanced signal' })
})

app.get('/api/mega-signal/:sym', (req, res) => {
  const mode = (req.query.mode as TradingMode) || 'INTRADAY_15M'
  const ens = getEnsembleSignal(req.params.sym)
  const adv = getAdvancedSignal(req.params.sym, mode)
  if (!ens && !adv) return res.status(404).json({ error: 'No signal data' })
  let buyScore = 0, sellScore = 0
  if (ens?.direction === 'BUY')  buyScore  += (ens.ensembleConfidence||0) * 0.40
  if (ens?.direction === 'SELL') sellScore += (ens.ensembleConfidence||0) * 0.40
  if (adv?.advancedDirection === 'BUY')  buyScore  += (adv.advancedConfidence||0) * 0.60
  if (adv?.advancedDirection === 'SELL') sellScore += (adv.advancedConfidence||0) * 0.60
  const megaDir  = buyScore > sellScore + 5 ? 'BUY' : sellScore > buyScore + 5 ? 'SELL' : 'NEUTRAL'
  const megaConf = Math.round(Math.max(buyScore, sellScore))
  res.json({
    symbol: req.params.sym, megaDirection: megaDir, megaConfidence: megaConf,
    riskReward: adv?.dynamicRR?.riskReward ?? ens?.riskReward ?? 1.5,
    dynamicRR: adv?.dynamicRR ?? null,
    ensemble: ens ? { direction: ens.direction, confidence: ens.ensembleConfidence, modelVotes: ens.modelVotes, regime: ens.regime } : null,
    advanced: adv ? { direction: adv.advancedDirection, confidence: adv.advancedConfidence, mambaScore: adv.mambaScore, wavenetBull: adv.wavenetBull, wavenetBear: adv.wavenetBear, transformerScore: adv.transformerScore, anfisScore: adv.anfisScore, qLearningAction: adv.qLearningAction, mcProbProfit: adv.mcProbProfit, hurstH: adv.hurstH, orderFlowImbalance: adv.orderFlowImbalance, microSentiment: adv.microSentiment, multiTF: adv.multiTF, thinkingNotes: adv.thinkingNotes } : null,
    reasons: [...(ens?.reasons?.slice(0,3)??[]), ...(adv?.thinkingNotes?.slice(0,4)??[])],
    timestamp: Date.now(),
  })
})

app.get('/api/regime', (_, res) => {
  const out: Record<string, any> = {}
  for (const [, list] of Object.entries(INSTRUMENTS)) list.forEach(inst => { const pd = sim.getPrice(inst.sym); if (!pd) return; const c = pd.candles['15m'] ?? pd.candles['1m']; if (c?.length) out[inst.sym] = detectRegime(c) })
  res.json(out)
})
app.get('/api/regime/:sym', (req, res) => { const pd = sim.getPrice(req.params.sym); if (!pd) return res.status(404).json({ error: 'Not found' }); const c = pd.candles['15m'] ?? pd.candles['1m']; res.json(detectRegime(c ?? [])) })

app.get('/api/kelly/:sym', (req, res) => {
  const sig = getEnsembleSignal(req.params.sym)
  if (!sig) return res.status(404).json({ error: 'No signal' })
  res.json({ symbol: req.params.sym, kelly: calcKelly(sig.confidence/100, sig.riskReward, sig.confidence/100), signal: { direction: sig.direction, confidence: sig.confidence, riskReward: sig.riskReward } })
})

app.get('/api/risk', (_, res) => {
  const openPos = pm.getOpenPositions(), metrics = pm.getMetrics(), equity = metrics.totalEquity
  const volMap = { US_STOCK:0.015, UK_STOCK:0.012, CRYPTO:0.035, COMMODITY:0.018, FUTURES:0.020, IN_STOCK:0.016, IN_INDEX:0.012, IN_OPTION:0.050 }
  const cvar = calcCVaR(openPos, equity, volMap), heat = calcPortfolioHeat(openPos, equity)
  const dd = calcDrawdownControl(metrics.equityCurve, equity), sharpe = calcSharpe(metrics.equityCurve), sortino = calcSortino(metrics.equityCurve)
  const priceHist: Record<string, number[]> = {}
  openPos.forEach(pos => { const c = sim.getCandles(pos.symbol, '1d', 60); if (c.length > 1) priceHist[pos.symbol] = c.slice(1).map((x,i) => (x.close-c[i].close)/c[i].close) })
  const corr = Object.keys(priceHist).length >= 2 ? calcCorrelationMatrix(priceHist) : { symbols: openPos.map(p=>p.symbol), matrix:[[1]], clusters:[openPos.map(p=>p.symbol)] }
  const marginUsed = openPos.reduce((s,p) => s+p.avgEntryPrice*p.quantity*p.multiplier/p.leverage, 0)
  res.json({ cvar, heat, drawdown:dd, correlation:corr, sharpe, sortino, metrics:{ marginUsed, marginAvailable: equity-marginUsed, betaDelta: openPos.filter(p=>p.side==='BUY').length - openPos.filter(p=>p.side==='SELL').length } })
})

app.get('/api/markets', (_, res) => {
  const all: any[] = []
  for (const [mkt, list] of Object.entries(INSTRUMENTS)) {
    list.forEach(i => {
      const pd = sim.getPrice(i.sym), iq = indianQuotes.get(i.sym)
      const price = pd?.price ?? iq?.price ?? i.price
      const changePct = pd?.changePct ?? iq?.changePct ?? i.dailyChg
      all.push({ ...i, marketType:mkt, config:MARKET_CONFIG[mkt], multiplier:FUTURES_MULTIPLIERS[i.sym]??1, currentPrice:price, changePct, volume:pd?.volume??iq?.volume??0 })
    })
  }
  res.json(all)
})
app.get('/api/markets/config', (_, res) => res.json({ markets: MARKET_CONFIG, multipliers: FUTURES_MULTIPLIERS }))
app.get('/api/markets/:type',  (req, res) => { const l = INSTRUMENTS[req.params.type]; l ? res.json(l) : res.status(404).json({ error: 'Unknown market' }) })

// Indian market routes
app.get('/api/india/quotes', (_, res) => { const q: any[] = []; indianQuotes.forEach(v => q.push(v)); res.json(q) })
app.get('/api/india/quotes/:sym', (req, res) => {
  const q = indianQuotes.get(req.params.sym) ?? (() => { const pd = sim.getPrice(req.params.sym); return pd ? { symbol:req.params.sym, price:pd.price, changePct:pd.changePct } : null })()
  q ? res.json(q) : res.status(404).json({ error: 'Not found' })
})

const INDEX_SYMS = ['NIFTY50.NS','BANKNIFTY.NS','FINNIFTY.NS','MIDCPNIFTY.NS']
app.get('/api/india/option-chain/:sym', (req, res) => {
  const sym = req.params.sym
  if (!INDEX_SYMS.includes(sym)) return res.status(400).json({ error: 'Option chain only available for Nifty indices' })
  const weeks = parseInt(req.query.weeks as string || '0', 10)
  const spotPrice = indianQuotes.get(sym)?.price ?? sim.getPrice(sym)?.price ?? 22500
  try { res.json(getOptionChain(sym, spotPrice, weeks)) } catch(e) { res.status(500).json({ error: (e as Error).message }) }
})

app.get('/api/india/option-analysis/:sym', (req, res) => {
  const sym = req.params.sym
  if (!INDEX_SYMS.includes(sym)) return res.status(400).json({ error: 'Indices only' })
  const weeks = parseInt(req.query.weeks as string || '0', 10)
  const spotPrice = indianQuotes.get(sym)?.price ?? sim.getPrice(sym)?.price ?? 22500
  try { const oc = getOptionChain(sym, spotPrice, weeks); res.json({ ...analyzeOptionChain(oc), spotPrice, optionChain: oc }) } catch(e) { res.status(500).json({ error: (e as Error).message }) }
})

app.get('/api/india/all-options', (_, res) => {
  const result: any = {}
  for (const sym of ['NIFTY50.NS','BANKNIFTY.NS','FINNIFTY.NS']) {
    const spot = indianQuotes.get(sym)?.price ?? sim.getPrice(sym)?.price ?? 22500
    try { const oc = getOptionChain(sym, spot); result[sym] = { ...analyzeOptionChain(oc), spotPrice:spot, impliedMove:oc.impliedMove, maxPain:oc.maxPainStrike, pcr:oc.pcr, support:oc.supportLevel, resistance:oc.resistanceLevel } } catch {}
  }
  res.json(result)
})

app.get('/api/portfolio/metrics',    (_, res) => res.json(pm.getMetrics()))
app.get('/api/portfolio/positions',  (_, res) => res.json({ open: pm.getOpenPositions(), closed: pm.getClosedPositions() }))
app.get('/api/portfolio/orders',     (_, res) => res.json({ pending: pm.getPendingOrders(), history: pm.getTradeHistory() }))
app.post('/api/portfolio/close-all', (_, res) => { pm.closeAll(); res.json({ success: true }) })
app.post('/api/portfolio/reset',     (_, res) => { pm.reset(); res.json({ success: true }) })
app.delete('/api/portfolio/positions/:id', (req, res) => res.json(pm.closePosition(req.params.id)))
app.delete('/api/portfolio/orders/:id',    (req, res) => res.json({ success: pm.cancelOrder(req.params.id) }))

app.get('/api/analytics', (_, res) => {
  const m = pm.getMetrics(), closed = pm.getClosedPositions()
  const bySymbol: Record<string,any> = {}, byMarket: Record<string,any> = {}
  closed.forEach(p => {
    if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { wins:0,losses:0,totalPnl:0,trades:0 }
    bySymbol[p.symbol].trades++; bySymbol[p.symbol].totalPnl += p.realisedPnl
    p.realisedPnl > 0 ? bySymbol[p.symbol].wins++ : bySymbol[p.symbol].losses++
    if (!byMarket[p.marketType]) byMarket[p.marketType] = { wins:0,losses:0,totalPnl:0,trades:0 }
    byMarket[p.marketType].trades++; byMarket[p.marketType].totalPnl += p.realisedPnl
    p.realisedPnl > 0 ? byMarket[p.marketType].wins++ : byMarket[p.marketType].losses++
  })
  res.json({ metrics:m, bySymbol, byMarket, recentTrades: closed.slice(0,30) })
})

app.post('/api/orders', [body('symbol').isString().notEmpty(), body('side').isIn(['BUY','SELL']), body('type').isIn(['MARKET','LIMIT','STOP']), body('quantity').isFloat({min:0.000001})],
  (req, res) => { const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() }); const result = pm.placeOrder({...req.body, symbolName: req.body.symbolName||req.body.symbol}); result.error ? res.status(400).json({error:result.error}) : res.json(result.order) })

const clients = new Set<WebSocket>()
wss.on('connection', ws => {
  clients.add(ws)
  ws.send(JSON.stringify({ type:'INIT', data:sim.getSnapshot(), metrics:pm.getMetrics() }))
  ws.on('message', raw => { try { const m = JSON.parse(raw.toString()); if (m.type==='PING') ws.send(JSON.stringify({type:'PONG',ts:Date.now()})) } catch {} })
  ws.on('close',  () => clients.delete(ws))
  ws.on('error',  () => { try { ws.close() } catch {} clients.delete(ws) })
})
function broadcast(p: string) { clients.forEach(ws => { if (ws.readyState===WebSocket.OPEN) ws.send(p) }) }

cron.schedule('* * * * * *',    () => { const t = sim.tick(); pm.processTickFills(t); broadcast(JSON.stringify({type:'PRICE_UPDATE',data:t,ts:Date.now()})) })
cron.schedule('*/3 * * * * *',  () => broadcast(JSON.stringify({type:'PORTFOLIO_UPDATE',data:pm.getMetrics(),ts:Date.now()})))
cron.schedule('*/20 * * * * *', () => broadcast(JSON.stringify({type:'SIGNALS_UPDATE',data:getAllEnsembleSignals(),ts:Date.now()})))

const PORT = parseInt(process.env.PORT||'4000', 10)
srv.listen(PORT, () => {
  console.log(`\n🚀 PaperTrader Pro v3 — World's Best AI  →  http://localhost:${PORT}`)
  console.log(`🤖 AI: LSTM+TCN+Transformer+XGBoost+Mamba SSM+WaveNet+Q-Learning+ANFIS+Monte Carlo`)
  console.log(`🇮🇳 Indian Markets: NSE/BSE + Nifty/BankNifty Option Chain\n`)
})
export default app
