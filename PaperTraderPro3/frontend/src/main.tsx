import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1, refetchInterval: 3000 } },
})

// Error Boundary — shows a readable error instead of blank screen
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  componentDidCatch(e: Error, info: React.ErrorInfo) { console.error('[ErrorBoundary]', e, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background:'#08101e', color:'#ef5350', fontFamily:'JetBrains Mono,monospace', padding:40, minHeight:'100vh' }}>
          <h2 style={{ color:'#ef5350', marginBottom:16 }}>⚠ Runtime Error</h2>
          <pre style={{ background:'#111f35', padding:20, borderRadius:8, color:'#d8e8f8', fontSize:12, overflow:'auto' }}>
            {this.state.error.message}\n\n{this.state.error.stack}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop:20, padding:'10px 24px', background:'#5b6cf8', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:14 }}>
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
)
