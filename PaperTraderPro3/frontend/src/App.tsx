import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Layout from './components/layout/Layout'
import { TradingPage }    from './pages/AllPages'
import { MarketsPage }    from './pages/AllPages'
import { PortfolioPage }  from './pages/AllPages'
import { HistoryPage }    from './pages/AllPages'
import { AnalyticsPage }  from './pages/AllPages'
import { ChartLabPage }   from './pages/AllPages'
import { SignalsPage }    from './pages/AllPages'
import { HeatmapPage }    from './pages/AllPages'
import { RiskPage }       from './pages/AllPages'
import { SettingsPage }   from './pages/AllPages'
import { IndiaMarketsPage } from './pages/IndiaPagesImpl'
import { IndiaOptionChainPage } from './pages/IndiaPagesImpl'
import Notifications from './components/common/Notifications'
import { useWebSocket }   from './hooks/useWebSocket'
import { useStore }       from './store/useStore'
import { portApi }        from './services/api'

export default function App() {
  useWebSocket()
  const { setMetrics, setPortfolio } = useStore()

  useQuery({ queryKey:['metrics'],   queryFn:async()=>{ const m=await portApi.getMetrics(); setMetrics(m); return m }, refetchInterval:3000 })
  useQuery({ queryKey:['positions'], queryFn:async()=>{ const d=await portApi.getPositions(); setPortfolio({open:d.open,closed:d.closed}); return d }, refetchInterval:3000 })
  useQuery({ queryKey:['orders'],    queryFn:async()=>{ const d=await portApi.getOrders(); setPortfolio({pending:d.pending,history:d.history}); return d }, refetchInterval:3000 })

  return (
    <Layout>
      <Routes>
        <Route path="/"              element={<Navigate to="/trading" replace/>}/>
        <Route path="/trading"       element={<TradingPage/>}/>
        <Route path="/trading/:sym"  element={<TradingPage/>}/>
        <Route path="/markets"       element={<MarketsPage/>}/>
        <Route path="/portfolio"     element={<PortfolioPage/>}/>
        <Route path="/history"       element={<HistoryPage/>}/>
        <Route path="/analytics"     element={<AnalyticsPage/>}/>
        <Route path="/chartlab"      element={<ChartLabPage/>}/>
        <Route path="/chartlab/:sym" element={<ChartLabPage/>}/>
        <Route path="/signals"       element={<SignalsPage/>}/>
        <Route path="/heatmap"       element={<HeatmapPage/>}/>
        <Route path="/risk"          element={<RiskPage/>}/>
        <Route path="/settings"      element={<SettingsPage/>}/>
        <Route path="/india"         element={<IndiaMarketsPage/>}/>
        <Route path="/india/options" element={<IndiaOptionChainPage/>}/>
        <Route path="*"              element={<Navigate to="/trading" replace/>}/>
      </Routes>
      <Notifications/>
    </Layout>
  )
}
