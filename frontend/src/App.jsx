import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import SearchBar from './components/SearchBar'
import Footer from './components/Footer'
import NewsLetterBar from './components/NewsLetterBar'
import ErrorBoundary from './components/ErrorBoundary'
import RequireAuth from './components/RequireAuth'
import { SeoProvider } from './components/Seo'
import ToastHost from './components/ToastHost'
import ChatBotWidget from './components/Chatbot/ChatBotWidget'

// PERF-003 — every one of these eleven pages used to be a static top-level
// import, so a visitor who landed on the homepage downloaded the checkout form,
// the order history, the wishlist, the about page and every dependency each of
// them pulls in. They are route-level `React.lazy` chunks now: the homepage
// fetches the homepage.
//
// `Home` is lazy along with the rest deliberately. It is the largest page in
// the application — hero, slider, marquee, comparison, video, Shop the Look,
// testimonials — and keeping it in the entry chunk would mean every *other*
// route paid for it.
const Home = lazy(() => import('./pages/Home'))
const Collections = lazy(() => import('./pages/Collections'))
const AllProducts = lazy(() => import('./pages/AllProducts'))
const Product = lazy(() => import('./pages/Product'))
const Cart = lazy(() => import('./pages/Cart'))
const PlaceOrder = lazy(() => import('./pages/PlaceOrder'))
const LogIn = lazy(() => import('./pages/LogIn'))
const Orders = lazy(() => import('./pages/Orders'))
const About = lazy(() => import('./pages/About'))
const Contact = lazy(() => import('./pages/Contact'))
const Wishlist = lazy(() => import('./pages/Wishlist'))
const NotFound = lazy(() => import('./components/NotFound'))

/**
 * What fills the routed area while a page chunk is in flight.
 *
 * `role="status"` with polite live semantics, so a screen reader is told the
 * page is loading rather than being left on a silent empty region.
 *
 * `min-h-screen`, and the height is the whole point. At `60vh` the newsletter
 * bar and the footer painted *inside* the first viewport and were then shoved
 * down when the route chunk resolved: Lighthouse measured a single layout shift
 * worth **CLS 0.40** on the homepage, four times the 0.1 "good" threshold. A
 * full viewport of reserved space puts them below the fold from the first
 * paint, so the growth shifts nothing anybody can see.
 */
const RouteFallback = () => (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <span className="font-michroma text-sm text-gray-500">Loading…</span>
    </div>
)

// FE-001 — there is exactly one `ShopContextProvider`, and it is in `main.jsx`.
//
// This file used to mount a second one around its own tree. Consumers bound to
// the inner provider, so the outer one ran every effect with zero consumers:
// `GET /api/product/list`, `POST /api/cart/get` and `POST /api/user/wishlist/get`
// each ran twice on every load, and the results of one copy were thrown away.
// The provider has to stay inside `BrowserRouter`, because the context calls
// `useNavigate` — which is why it lives in `main.jsx` rather than here.
//
// FE-008 — the `backendUrl` this file exported is gone too. It defaulted to port
// 5000 while the backend listens on 4000, disagreed with the context's copy, and
// nothing imported it. The one validated source is `src/config.js`.

function App() {
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  // FE-023 — the previous position is a ref rather than state, so the scroll
  // handler does not re-subscribe on every scroll event.
  const prevScrollPos = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPos = window.scrollY;
      setVisible(prevScrollPos.current > currentScrollPos || currentScrollPos < 10);
      prevScrollPos.current = currentScrollPos;
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <SeoProvider>
    <div className='bg-white'>
      {/* A11Y-008 — the first focusable element on every page. A keyboard user
          otherwise walks the entire navbar, the products dropdown, the account
          menu and the cart before reaching the content, on every navigation.
          It is off-screen until focused (`.skip-link` in index.css). */}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Navbar visible={visible} />
      <SearchBar />
      {/* FE-021 — one boundary around the routed area, so a component that
          throws costs its page rather than the whole application. The chrome
          outside it keeps rendering, which is what makes the failure
          recoverable without a reload. */}
      <ErrorBoundary>
        <main id="main-content" tabIndex={-1}>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path='/' element={<Home />} />
          {/* FE-003 — the route has to *name* the parameter the page reads.
              It was `/collections/*`, a splat, so `useParams()` produced
              `{ '*': 'laptops' }` and `const { type } = useParams()` was
              `undefined` on every typed collection. The tag filter therefore
              never applied in the running application, however correct it was
              in isolation — which is exactly the class of defect a component
              test mounting its own `<Route path="/collections/:type">` cannot
              see, and the browser suite caught. */}
          <Route path='/collections' element={<Collections />} />
          {/* `/products`, `/collections` and `/collections/all` used to render a
              byte-identical page unfiltered, under three self-referencing
              canonical URLs — and `/collections/all` published itself under the
              title "all — Netronix" (`Collections.jsx` passed the raw `:type`
              to `<Seo>`). It is the target of the site's loudest CTAs, so it
              redirects rather than 404ing; `/products` is the one full-catalog
              route now. React Router ranks a static segment above a dynamic
              one regardless of declaration order, so this wins over
              `/collections/:type` below for exactly this path. */}
          <Route path='/collections/all' element={<Navigate to='/products' replace />} />
          <Route path='/collections/:type' element={<Collections />} />
          <Route path='/products' element={<AllProducts />} />
          <Route path='/product/:productId' element={<Product />} />
          <Route path='/cart' element={<Cart />} />
          <Route path='/login' element={<LogIn />} />
          {/* Guest checkout stays public on purpose: buying without an account
              is a supported path (11–12 in the flow traces). */}
          <Route path='/placeorder' element={<PlaceOrder />} />
          <Route path='/orders' element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path='/wishlist' element={<RequireAuth><Wishlist /></RequireAuth>} />
          <Route path='/about' element={<About />} />
          <Route path='/contact' element={<Contact />} />
          <Route path='*' element={<NotFound />} />
        </Routes>
        </Suspense>
        </main>
      </ErrorBoundary>
      <NewsLetterBar />
      {/* PERF-003 — the footer is below the fold on every route, and on the
          cart it is two viewports down. `.paint-on-approach` lets the browser
          skip its style, layout and paint until it is approached; it stays in
          the DOM, in the accessibility tree and in find-in-page. The newsletter
          tab above deliberately does not get the same treatment: it is
          `position: fixed`, and containment would fix it to the section rather
          than to the viewport. */}
      <div className="paint-on-approach" style={{ '--approach-height': '1775px' }}>
        <Footer />
      </div>
      <ChatBotWidget />
      {/* PERF-003 — the `<ToastContainer>` and its stylesheet used to be static
          imports of this file, so `react-toastify` was downloaded, parsed and
          render-blocking on every first load. `ToastHost` mounts the same
          container from a chunk fetched on the first toast or the first user
          interaction, whichever comes first. See `src/lib/toast.js`. */}
      <ToastHost />
    </div>
    </SeoProvider>
  )
}

export default App
