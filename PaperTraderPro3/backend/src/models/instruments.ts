export interface Instrument {
  sym: string; name: string; price: number; dailyChg: number; sector?: string
}
export interface MarketConfig {
  baseVol: number; spreadPct: number; slippage: number
  defaultLeverage: number; maxLeverage: number
  commType: 'flat'|'pct'; commVal: number
  label: string; badge: string; color: string; emoji: string
}
export const FUTURES_MULTIPLIERS: Record<string,number> = {
  'ES=F':50,'NQ=F':20,'YM=F':5,'RTY=F':50,
  'CL=F':1000,'BZ=F':1000,'GC=F':100,'SI=F':5000,
  'NG=F':10000,'HG=F':25000,'ZW=F':5000,'ZC=F':5000,
  'ZB=F':1000,'ZN=F':1000,
  // Indian Futures multipliers (lot sizes)
  'NIFTY50.NS':50,'BANKNIFTY.NS':25,'FINNIFTY.NS':40,'MIDCPNIFTY.NS':75,
}
export const MARKET_CONFIG: Record<string,MarketConfig> = {
  US_STOCK:    {baseVol:.0008,spreadPct:.0005,slippage:.0005,defaultLeverage:1,maxLeverage:4,   commType:'flat',commVal:0,   label:'US Stock',     badge:'NYSE/NASDAQ',color:'#3b8ef8',emoji:'🇺🇸'},
  UK_STOCK:    {baseVol:.0006,spreadPct:.0008,slippage:.0008,defaultLeverage:1,maxLeverage:4,   commType:'pct', commVal:.001,label:'UK Stock',     badge:'LSE',       color:'#8b5cf6',emoji:'🇬🇧'},
  CRYPTO:      {baseVol:.002, spreadPct:.001, slippage:.001, defaultLeverage:1,maxLeverage:10,  commType:'pct', commVal:.001,label:'Crypto',       badge:'24/7',      color:'#f0b429',emoji:'₿'},
  COMMODITY:   {baseVol:.001, spreadPct:.0006,slippage:.0006,defaultLeverage:1,maxLeverage:20,  commType:'flat',commVal:2.5, label:'Commodity',    badge:'CME',       color:'#26a69a',emoji:'🪙'},
  FUTURES:     {baseVol:.0006,spreadPct:.0004,slippage:.0004,defaultLeverage:1,maxLeverage:50,  commType:'flat',commVal:2.0, label:'Futures',      badge:'E-Mini',    color:'#ef5350',emoji:'📈'},
  IN_STOCK:    {baseVol:.001, spreadPct:.0003,slippage:.0003,defaultLeverage:1,maxLeverage:5,   commType:'pct', commVal:.0003,label:'India Stock', badge:'NSE/BSE',   color:'#ff9800',emoji:'🇮🇳'},
  IN_INDEX:    {baseVol:.0008,spreadPct:.0002,slippage:.0002,defaultLeverage:1,maxLeverage:30,  commType:'flat',commVal:20,  label:'India Index',  badge:'NSE F&O',   color:'#4caf50',emoji:'📊'},
  IN_OPTION:   {baseVol:.003, spreadPct:.002, slippage:.002, defaultLeverage:1,maxLeverage:1,   commType:'flat',commVal:20,  label:'India Option', badge:'NSE OPT',   color:'#e91e63',emoji:'⚡'},
}
export const INSTRUMENTS: Record<string,Instrument[]> = {
  US_STOCK: [
    {sym:'AAPL', name:'Apple Inc.',        price:187.50,  dailyChg: 0.82, sector:'Technology'},
    {sym:'MSFT', name:'Microsoft Corp.',   price:415.20,  dailyChg: 0.45, sector:'Technology'},
    {sym:'NVDA', name:'Nvidia Corp.',      price:875.40,  dailyChg: 2.15, sector:'Technology'},
    {sym:'TSLA', name:'Tesla Inc.',        price:172.80,  dailyChg:-1.23, sector:'Automotive'},
    {sym:'AMZN', name:'Amazon.com',        price:195.60,  dailyChg: 0.67, sector:'Consumer'},
    {sym:'GOOGL',name:'Alphabet Inc.',     price:172.40,  dailyChg: 0.38, sector:'Technology'},
    {sym:'META', name:'Meta Platforms',    price:528.90,  dailyChg: 1.12, sector:'Technology'},
    {sym:'NFLX', name:'Netflix Inc.',      price:690.20,  dailyChg:-0.55, sector:'Media'},
    {sym:'JPM',  name:'JPMorgan Chase',    price:200.40,  dailyChg: 0.33, sector:'Finance'},
    {sym:'GS',   name:'Goldman Sachs',     price:462.80,  dailyChg: 0.21, sector:'Finance'},
    {sym:'SPY',  name:'S&P 500 ETF',       price:528.40,  dailyChg: 0.31, sector:'ETF'},
    {sym:'QQQ',  name:'Nasdaq 100 ETF',    price:445.80,  dailyChg: 0.58, sector:'ETF'},
    {sym:'AMD',  name:'AMD Inc.',          price:160.40,  dailyChg: 1.88, sector:'Technology'},
    {sym:'COIN', name:'Coinbase Global',   price:218.70,  dailyChg: 3.21, sector:'Finance'},
    {sym:'PLTR', name:'Palantir Tech.',    price:24.60,   dailyChg: 2.14, sector:'Technology'},
  ],
  UK_STOCK: [
    {sym:'BP.L',   name:'BP plc',          price:4.82,    dailyChg:-0.42, sector:'Energy'},
    {sym:'HSBA.L', name:'HSBC Holdings',   price:6.74,    dailyChg: 0.29, sector:'Finance'},
    {sym:'LLOY.L', name:'Lloyds Banking',  price:0.518,   dailyChg:-0.19, sector:'Finance'},
    {sym:'GSK.L',  name:'GSK plc',         price:15.62,   dailyChg: 0.51, sector:'Healthcare'},
    {sym:'AZN.L',  name:'AstraZeneca',     price:118.40,  dailyChg: 0.73, sector:'Healthcare'},
    {sym:'RIO.L',  name:'Rio Tinto plc',   price:49.20,   dailyChg:-0.64, sector:'Mining'},
    {sym:'BARC.L', name:'Barclays',        price:2.18,    dailyChg: 0.35, sector:'Finance'},
    {sym:'SHEL.L', name:'Shell plc',       price:26.80,   dailyChg: 0.44, sector:'Energy'},
  ],
  CRYPTO: [
    {sym:'BTC-USD', name:'Bitcoin',        price:67450,   dailyChg: 2.14},
    {sym:'ETH-USD', name:'Ethereum',       price:3580,    dailyChg: 1.85},
    {sym:'SOL-USD', name:'Solana',         price:172,     dailyChg: 3.42},
    {sym:'BNB-USD', name:'BNB',            price:598,     dailyChg: 0.87},
    {sym:'XRP-USD', name:'Ripple',         price:0.618,   dailyChg:-0.43},
    {sym:'DOGE-USD',name:'Dogecoin',       price:0.172,   dailyChg: 4.21},
    {sym:'ADA-USD', name:'Cardano',        price:0.489,   dailyChg: 1.63},
    {sym:'AVAX-USD',name:'Avalanche',      price:38.40,   dailyChg: 2.87},
    {sym:'LINK-USD',name:'Chainlink',      price:18.20,   dailyChg: 1.44},
    {sym:'MATIC-USD',name:'Polygon',       price:0.712,   dailyChg: 2.33},
  ],
  COMMODITY: [
    {sym:'GC=F', name:'Gold Futures',      price:2345.50, dailyChg: 0.62},
    {sym:'SI=F', name:'Silver Futures',    price:29.42,   dailyChg: 0.88},
    {sym:'CL=F', name:'WTI Crude Oil',     price:78.40,   dailyChg:-0.74},
    {sym:'BZ=F', name:'Brent Crude',       price:83.20,   dailyChg:-0.61},
    {sym:'HG=F', name:'Copper Futures',    price:4.28,    dailyChg: 0.43},
    {sym:'NG=F', name:'Natural Gas',       price:2.148,   dailyChg:-1.24},
    {sym:'ZW=F', name:'Wheat Futures',     price:562.40,  dailyChg: 0.31},
    {sym:'ZC=F', name:'Corn Futures',      price:438.20,  dailyChg:-0.18},
  ],
  FUTURES: [
    {sym:'ES=F',  name:'S&P 500 E-Mini',   price:5285.50, dailyChg: 0.42},
    {sym:'NQ=F',  name:'Nasdaq 100 E-Mini',price:18420,   dailyChg: 0.68},
    {sym:'YM=F',  name:'Dow Jones E-Mini', price:39820,   dailyChg: 0.28},
    {sym:'RTY=F', name:'Russell 2000',     price:2068,    dailyChg: 0.54},
    {sym:'ZB=F',  name:'30-Year T-Bond',   price:118.40,  dailyChg:-0.31},
    {sym:'ZN=F',  name:'10-Year T-Note',   price:109.20,  dailyChg:-0.18},
  ],
  // ── Indian Markets ───────────────────────────────────────────
  IN_STOCK: [
    {sym:'RELIANCE.NS',  name:'Reliance Industries',  price:2850,  dailyChg: 0.72, sector:'Energy'},
    {sym:'TCS.NS',       name:'Tata Consultancy',     price:4120,  dailyChg: 0.38, sector:'IT'},
    {sym:'HDFCBANK.NS',  name:'HDFC Bank',            price:1680,  dailyChg: 0.54, sector:'Finance'},
    {sym:'INFY.NS',      name:'Infosys Ltd',           price:1820,  dailyChg: 0.21, sector:'IT'},
    {sym:'ICICIBANK.NS', name:'ICICI Bank',            price:1240,  dailyChg: 0.89, sector:'Finance'},
    {sym:'HINDUNILVR.NS',name:'Hindustan Unilever',   price:2420,  dailyChg:-0.33, sector:'FMCG'},
    {sym:'BAJFINANCE.NS',name:'Bajaj Finance',         price:7200,  dailyChg: 1.24, sector:'Finance'},
    {sym:'WIPRO.NS',     name:'Wipro Ltd',             price:490,   dailyChg: 0.15, sector:'IT'},
    {sym:'ADANIPORTS.NS',name:'Adani Ports',           price:1380,  dailyChg: 1.05, sector:'Infrastructure'},
    {sym:'SUNPHARMA.NS', name:'Sun Pharma',            price:1650,  dailyChg: 0.62, sector:'Healthcare'},
    {sym:'TATAMOTORS.NS',name:'Tata Motors',           price:920,   dailyChg: 2.14, sector:'Auto'},
    {sym:'MARUTI.NS',    name:'Maruti Suzuki',         price:12400, dailyChg: 0.44, sector:'Auto'},
    {sym:'AXISBANK.NS',  name:'Axis Bank',             price:1180,  dailyChg: 0.78, sector:'Finance'},
    {sym:'LTIM.NS',      name:'LTIMindtree',           price:5800,  dailyChg: 0.32, sector:'IT'},
    {sym:'HCLTECH.NS',   name:'HCL Technologies',      price:1720,  dailyChg: 0.48, sector:'IT'},
  ],
  IN_INDEX: [
    {sym:'NIFTY50.NS',    name:'Nifty 50 Index',        price:22500, dailyChg: 0.42},
    {sym:'BANKNIFTY.NS',  name:'Bank Nifty Index',       price:48200, dailyChg: 0.68},
    {sym:'FINNIFTY.NS',   name:'Fin Nifty Index',        price:21800, dailyChg: 0.55},
    {sym:'MIDCPNIFTY.NS', name:'Midcap Nifty Index',     price:11200, dailyChg: 0.81},
    {sym:'SENSEX.BO',     name:'BSE Sensex',             price:74200, dailyChg: 0.38},
  ],
  // Option chain is generated dynamically from IN_INDEX in the API
  IN_OPTION: [],
}
