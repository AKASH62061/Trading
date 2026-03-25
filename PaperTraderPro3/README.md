# PaperTrader Pro v2 — Advanced Full-Stack Trading Platform

A next-generation paper trading platform featuring an AI signal engine, real-time WebSocket streaming, professional risk management, and TradingView-quality charts.

---

## ⚡ Quick Start

```bash
# 1. Unzip and enter project
unzip PaperTraderProV2.zip
cd PaperTraderPro2

# 2. Install all dependencies (once)
npm run install:all

# 3. Run both servers simultaneously
npm run dev
```

Open **http://localhost:5173**

---

## 🏗️ Architecture

```
PaperTraderPro2/
├── backend/                    # Node.js + Express + TypeScript
│   └── src/
│       ├── index.ts            # Express + WebSocket server + all REST routes
│       ├── ai/
│       │   └── SignalEngine.ts # ★ AI technical analysis engine
│       ├── services/
│       │   ├── PriceSimulator.ts    # Realistic market simulation
│       │   └── PortfolioManager.ts  # Full trading engine + risk
│       └── models/
│           └── instruments.ts  # All 60+ instruments, market configs
│
└── frontend/                   # React + TypeScript + Vite
    └── src/
        ├── App.tsx             # React Router — 10 routes
        ├── store/useStore.ts   # Zustand global state
        ├── hooks/useWebSocket.ts    # Auto-reconnecting WS
        ├── services/api.ts     # Axios + utility functions
        ├── components/
        │   ├── layout/Layout.tsx         # Sidebar + topbar
        │   ├── chart/CandleChart.tsx     # lightweight-charts + positions
        │   ├── trading/OrderTicket.tsx   # Full order form with AI signals
        │   └── common/Notifications.tsx  # Toasts + P&L strip
        └── pages/
            ├── TradingPage      # Split: chart + positions + metrics + order
            ├── MarketsPage      # 60+ instruments with signal overlays
            ├── SignalsPage      # ★ AI signal scanner dashboard
            ├── HeatmapPage      # ★ Market heat map visualisation
            ├── PortfolioPage    # Positions, pending orders, closed trades
            ├── HistoryPage      # Full trade history table
            ├── AnalyticsPage    # Equity curve, P&L chart, market breakdown
            ├── RiskPage         # ★ Risk dashboard: VaR, margin, heat
            ├── ChartLabPage     # Drawing tools canvas
            └── SettingsPage     # Configuration
```

---

## 🤖 AI Signal Engine (the centrepiece)

Located at `backend/src/ai/SignalEngine.ts` — a from-scratch technical analysis engine that generates actionable trading signals using **17 indicators** and **10 candlestick patterns**.

### Indicators computed:
| Indicator | Details |
|---|---|
| RSI | 14-period and 7-period, with overbought/oversold thresholds |
| MACD | 12/26/9 with crossover detection |
| EMA | 9, 21, 50, 200 — trend direction and crossover signals |
| Bollinger Bands | 20-period ±2σ with %B position |
| Stochastic Oscillator | %K and %D with cross detection |
| Williams %R | Extreme reading detection |
| ATR | 14-period for SL/TP sizing |
| ADX | Trend strength filter |
| OBV | Volume trend confirmation |
| VWAP | Deviation from fair value |
| CMF | Chaikin Money Flow — smart money direction |
| Support/Resistance | Swing high/low detection |

### Candlestick patterns detected:
Doji, Hammer, Hanging Man, Shooting Star, Inverted Hammer, Bullish Engulfing, Bearish Engulfing, Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Marubozu

### Signal output:
```ts
{
  direction: 'BUY' | 'SELL' | 'NEUTRAL'
  confidence: 0–100                     // weighted score
  strength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG'
  reasons: string[]                     // up to 6 readable reasons
  suggestedEntry: number                // current price
  suggestedSL: number                   // ATR-based stop loss
  suggestedTP: number                   // 2.5× ATR take profit
  riskReward: number                    // always ≥ 1.5
  technicals: TechnicalSnapshot        // all 17 indicators
  pattern?: CandlePattern               // if pattern detected
}
```

---

## 📊 Pages & Features

### `/trading` — Main Trading Terminal
- Split-view: full candlestick chart (lightweight-charts v4)
- Live positions panel with real-time P&L (green=profit, red=loss always)
- AI signal auto-fill button in order ticket
- 5-panel metrics bar (drag to resize)
- Trailing stop, SL, TP support

### `/signals` — AI Signal Scanner
- All 60+ instruments scanned simultaneously
- Filter by BUY/SELL, confidence threshold slider
- Each card shows: confidence bar, entry/SL/TP levels, R/R ratio, indicator values, candlestick pattern

### `/heatmap` — Market Heat Map
- Colour-coded by % change: red (down) → dark (neutral) → teal (up)
- Grouped by market type
- Click any cell to jump to that symbol's chart

### `/risk` — Risk Dashboard
- Portfolio Heat (% of capital at risk from all SLs)
- Daily VaR at 95% confidence
- Margin used / available / margin level
- Position concentration bars
- Drawdown gauge (current + historical max)
- Warning alerts when risk thresholds breached

### `/analytics` — Performance Analytics
- 8 professional metrics: Sharpe, Sortino, Calmar, Profit Factor, etc.
- Equity curve with gradient fill
- P&L per trade bar chart (last 40 trades)
- Performance breakdown by market type

### `/portfolio` — Portfolio Manager
- Open positions with real-time P&L, SL/TP display, trailing stop
- Pending orders (Limit/Stop)
- Closed positions history
- Single-click close button on every position

### `/history` — Trade History
- Full table: entry, exit, commission, P&L, WIN/LOSS badge
- Summary stats in header

### `/chartlab` — Chart Lab (Drawing Tools)
- TradingView-quality candlestick chart
- 20+ drawing tools: Trend Lines, Fibonacci Retracement/Fan/Extension, Pitchfork, Gann Fan, channels, shapes
- Indicators: MA, EMA, Bollinger Bands, VWAP, RSI, MACD

---

## 📡 WebSocket Events

```
← INIT             { data: allPrices, metrics: portfolioMetrics }
← PRICE_UPDATE     { data: { SYM: { price, changePct, bid, ask, ... } } }
← PORTFOLIO_UPDATE { data: PortfolioMetrics }
← SIGNALS_UPDATE   { data: Record<symbol, Signal> }
← ORDER_FILLED     { data: Order }
← SL_HIT          { data: { symbol } }
← TP_HIT          { data: { symbol } }
→ PING             { type: 'PING' }
← PONG             { type: 'PONG', ts: number }
```

---

## 🔌 REST API

```
GET  /api/health
GET  /api/markets
GET  /api/prices
GET  /api/prices/:sym
GET  /api/prices/:sym/candles?tf=15m&limit=150
GET  /api/prices/heatmap
GET  /api/signals
GET  /api/signals/:sym
GET  /api/portfolio/metrics
GET  /api/portfolio/positions
GET  /api/portfolio/orders
POST /api/orders
DELETE /api/portfolio/positions/:id
DELETE /api/portfolio/orders/:id
POST /api/portfolio/close-all
POST /api/portfolio/reset
GET  /api/analytics
```

---

## 🎯 Markets Covered

| Market | Instruments | Leverage |
|---|---|---|
| 🇺🇸 US Stocks (NYSE/NASDAQ) | AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, NFLX, JPM, GS, AMD, COIN, PLTR, SPY, QQQ | Up to 4× |
| 🇬🇧 UK Stocks (LSE) | BP.L, HSBA.L, LLOY.L, GSK.L, AZN.L, RIO.L, BARC.L, SHEL.L, ULVR.L, DGE.L | Up to 4× |
| ₿ Crypto | BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, DOGE-USD, ADA-USD, AVAX-USD, LINK-USD, MATIC-USD | Up to 10× |
| 🪙 Commodities | GC=F, SI=F, CL=F, BZ=F, HG=F, NG=F, ZW=F, ZC=F | Up to 20× |
| 📈 Futures (E-Mini) | ES=F ($50/pt), NQ=F ($20/pt), YM=F ($5/pt), RTY=F, ZB=F, ZN=F | Up to 50× |

---

## 🛡️ Risk Engine Features

- **Portfolio Heat** — total % of equity at risk from all stop-loss levels
- **Daily VaR** — 95% 1-day Value at Risk computed from position volatilities
- **Margin Level** — equity / margin used ratio with warning at 150%
- **Trailing Stops** — auto-adjusts as price moves in your favour
- **Auto SL/TP** — positions automatically closed when levels hit
- **Max Drawdown** — computed from equity curve high-water mark

---

## 📈 Performance Metrics

| Metric | Description |
|---|---|
| Sharpe Ratio | Annualised (daily returns × √252) |
| Sortino Ratio | Sharpe using only downside deviation |
| Calmar Ratio | Annual return / max drawdown |
| Profit Factor | Gross profit / gross loss |
| Win Rate | % of closed trades that were profitable |
| Risk/Reward | Average win / average loss |
| Avg Holding Time | Average hours per closed trade |
| Current Streak | Consecutive wins or losses |

---

## ⌨️ Keyboard Shortcuts (Chart Lab)

| Key | Action |
|---|---|
| V | Cursor tool |
| T | Trend Line |
| H | Horizontal Line |
| R | Ray |
| F | Fibonacci Retracement |
| P | Pitchfork |
| A | Text Label |
| G | Rectangle |
| Esc | Cancel drawing |
| Ctrl+Z | Undo last drawing |
| Delete | Remove selected object |

---

## 💻 Tech Stack

**Frontend:** React 18 · TypeScript · Vite · React Router v6 · Zustand · TanStack Query · lightweight-charts v4 · Recharts · Framer Motion · Tailwind CSS · Lucide React

**Backend:** Node.js · Express · TypeScript · WebSocket (ws) · node-cron · express-validator · helmet · compression · cors

**AI Engine:** Custom-built from scratch — no external ML libraries, pure TypeScript mathematics
