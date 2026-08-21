import { Suspense, lazy, useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './components/Login'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAdminSession } from './lib/useAdminSession'

// PERF-003 — the admin shipped as one 965 kB chunk, and Recharts was most of
// it. Exactly one route draws a chart. Splitting by route means the operator
// who opens /list or /orders never downloads the charting library at all, and
// the one who opens the dashboard downloads it once and keeps it cached
// separately from the application code.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Add = lazy(() => import('./pages/Add'))
const Edit = lazy(() => import('./pages/Edit'))
const List = lazy(() => import('./pages/List'))
const Orders = lazy(() => import('./pages/Orders'))
const Users = lazy(() => import('./pages/Users'))
const Settings = lazy(() => import('./pages/Settings'))

const RouteFallback = () => (
  <div className='min-h-[50vh] flex items-center justify-center' role='status' aria-live='polite'>
    <span className='inline-block h-8 w-8 border-2 border-[#6a5acd] border-t-transparent rounded-full animate-spin' />
    <span className='sr-only'>Loading…</span>
  </div>
)

// backendUrl and currency now live in src/config.js, where the environment is
// validated before the app renders (DEVOPS-002).
//
// SEC-012 — the console is gated on a *server-verified* session.
//
// It used to render the entire admin shell whenever `localStorage.token` was
// any non-empty string. Nothing inspected the token, so junk unlocked the UI
// and the deception only ended at the first API call — which then failed with
// an unexplained error on a page that looked signed-in. Worse, it meant the
// front door of the admin console was a client-side string comparison.
//
// The shell now renders only after `GET /api/user/admin/session` succeeds.
// That endpoint sits behind `adminAuth`, so reaching it at all is the proof:
// valid signature, live user, current token version, and `role === 'admin'`.
//
// There are three states, not two — `checking` matters, because rendering the
// login form while a perfectly good session is being verified would flash the
// sign-in page on every reload.
const App = () => {

  const { token, setToken, session, verifySession, logout } = useAdminSession();

  // ADM-012 / A-10 — a 250 px fixed sidebar with a matching `ml-[250px]` left
  // the console unusable below about 900 px: the content column was pushed
  // entirely off-screen. Below `lg` the sidebar is now off-canvas and the
  // navbar carries a disclosure button for it. This is the minimum responsive
  // treatment the plan asks for, not a redesign — at `lg` and above every
  // pixel is where it was.
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Navigating closes the drawer; leaving it open over the new page is how a
  // mobile nav traps someone who thinks they have moved on.
  useEffect(() => { setNavOpen(false) }, [location.pathname]);


  /**
   * The single logout path (ADM-011).
   *
   * Navbar cleared React state; Sidebar removed the key and forced a full page
   * reload. Both are now this one function, and it does the thing neither did:
   * tells the server, so the token is actually revoked rather than merely
   * forgotten by one browser (SEC-003).
   *
   * Revocation is best-effort. If the request fails the local state is cleared
   * regardless — a user who clicks "log out" must end up logged out of this
   * browser whatever the network did.
   */

  return (
    <div className='bg-gray-50 min-h-screen'>
      <ToastContainer/>
      {session.status === 'checking'
        ? (
          <div className='min-h-screen flex items-center justify-center' role='status' aria-live='polite'>
            <span className='inline-block h-8 w-8 border-2 border-[#6a5acd] border-t-transparent rounded-full animate-spin' />
            <span className='sr-only'>Verifying your session…</span>
          </div>
        )
        : session.status === 'unavailable'
          ? (
            <div className='min-h-screen flex items-center justify-center p-6'>
              <div role='alert' className='max-w-md rounded-lg bg-amber-50 p-5 text-amber-900'>
                <p>Session verification is temporarily unavailable. The console remains locked.</p>
                <button
                  type='button'
                  className='mt-4 rounded bg-[#6a5acd] px-4 py-2 text-white'
                  onClick={() => verifySession(token)}
                >
                  Retry verification
                </button>
              </div>
            </div>
          )
          : session.status !== 'signed-in'
            ? <Login setToken={setToken}/>
            : <>
            <Navbar onLogout={logout} admin={session.admin} navOpen={navOpen} onToggleNav={() => setNavOpen((open) => !open)} />
            <div className='flex'>
              <Sidebar onLogout={logout} open={navOpen} onDismiss={() => setNavOpen(false)} />
              <main id='main-content' tabIndex={-1} className='w-full lg:ml-[250px] lg:w-[calc(100%-250px)] pt-20 p-4 sm:p-8'>
                <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path='/' element={<Dashboard token={token} />} />
                  <Route path='/dashboard' element={<Dashboard token={token} />} />
                  <Route path='/add' element={<Add token={token} />} />
                  {/* ADM-002 — products can be corrected instead of destroyed
                      and re-created, which used to orphan them in every order
                      that referenced them (DB-007). */}
                  <Route path='/edit/:id' element={<Edit token={token} />} />
                  <Route path='/list' element={<List token={token} />} />
                  <Route path='/orders' element={<Orders token={token} />} />
                  <Route path='/users' element={<Users token={token} />} />
                  <Route path='/settings' element={<Settings token={token} />} />
                  <Route path='*' element={<Navigate to="/" replace />} />
                </Routes>
                </Suspense>
              </main>
            </div>
          </>
      }
    </div>
  )
}

export default App
