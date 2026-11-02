import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ApiError } from './api'
import App from './App'
import { DialogHost, notifyError } from './dialogs'
import './styles.css'

/** The server no longer accepts our session (signed out elsewhere, expired): go back to the sign-in page. */
function handleSessionEnded(err: unknown) {
  if (!(err instanceof ApiError) || err.status !== 401) return false
  if (queryClient.getQueryData(['me'])) queryClient.setQueryData(['me'], null)
  return true
}

const queryClient: QueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 5_000, refetchOnWindowFocus: true } },
  queryCache: new QueryCache({ onError: handleSessionEnded }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      const wasSignedIn = !!queryClient.getQueryData(['me'])
      if (handleSessionEnded(err) && wasSignedIn) return // the sign-in page is the message
      if (mutation.options.onError) return // the form shows its own error (e.g. wrong password)
      notifyError(err.message)
      // "Someone just changed this" - show the latest board straight away.
      if (err instanceof ApiError && err.status === 409) queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  }),
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <DialogHost />
    </QueryClientProvider>
  </React.StrictMode>,
)
