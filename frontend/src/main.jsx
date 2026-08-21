import { startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import ShopContextProvider from './context/ShopContext.jsx'

// A11Y-001 — `reducedMotion="user"` is the one line that makes every
// `framer-motion` animation in the application honour the visitor's operating
// system preference. It disables transform and layout animations while leaving
// opacity ones, which is exactly the right trade: content still appears, it
// just does not fly in. Without it each of the ~19 files importing
// `framer-motion` would need its own `useReducedMotion()` call, and the ones
// added later would silently not have one.
//
// The provider stays inside `BrowserRouter` because the context calls
// `useNavigate` (FE-001).
//
// TEST-002 — the `StrictMode` this file imported was never rendered, which is
// what ESLint was reporting. It is removed rather than switched on: enabling
// it double-invokes effects in development, and the browser suite asserts that
// a page load issues exactly one `GET /api/product/list` (FE-001). Turning
// StrictMode on is a real decision with a real test consequence, not a lint
// fix, and it is not this phase's to make.
// PERF-003 — the first mount is a transition, and the reason is total blocking
// time rather than anything a visitor sees.
//
// A default-priority `root.render` builds the whole tree in **one
// uninterruptible task**. On the homepage Lighthouse measured that task at
// 464 ms on a mobile profile, and blocking time charges every millisecond of a
// task past its first fifty — so a single 464 ms render costs 414 ms of the
// metric, where the same work in ten slices costs nothing. At transition
// priority React 18 renders in slices and yields to the browser between them.
//
// It does not defer, skip or reorder anything: React still commits the entire
// tree in one consistent pass, and nothing paints half-built. What changes is
// that the main thread is available in between — which is the actual property
// the metric is a proxy for.
const root = createRoot(document.getElementById('root'))
startTransition(() => {
  root.render(
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <ShopContextProvider>
          <App />
        </ShopContextProvider>
      </MotionConfig>
    </BrowserRouter>,
  )
})
