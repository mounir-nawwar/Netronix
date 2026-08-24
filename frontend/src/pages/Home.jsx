import Hero from '../components/Hero'
import ScrollingText from '../components/ScrollingText'
import Slider from '../components/Slider'
import LogoMarquee from '../components/LogoMarquee'
import FeaturedProducts from '../components/FeaturedProducts'
import ComparisonSection from '../components/ComparisonSection'
import HeroVideo from '../components/HeroVideo'
import FeaturedProduct from '../components/FeaturedProduct'
import ShopTheLook from '../components/ShopTheLook'
import CountdownBanner from '../components/CountdownBanner'
import Seo from '../components/Seo'
import { organizationLd, websiteLd } from '../lib/seo'

const Home = () => {
  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden">
      {/* SEO-004 — Organization and WebSite only. Both carry nothing but the
          shop's name, its URL and its logo: there is no address, no telephone
          and no AggregateRating here, because Netronix has no premises and no
          review model, and structured data that says otherwise is a claim
          search engines will repeat. */}
      <Seo path="/" jsonLd={[organizationLd(), websiteLd()]} />
      <Hero/>
      <div className="slider-container w-full">
        <Slider/>
      </div>
      {/* PERF-003 — everything from here down is `content-visibility: auto`
          (`.paint-on-approach` in `index.css`). It is **not** the reverted
          deferred-mounting experiment: every section below is mounted by React
          on the first render exactly as before, is in the DOM, is in the
          accessibility tree and is reachable by find-in-page. What is deferred
          is the browser's own style, layout and paint work for a subtree
          nobody has scrolled to — which is the platform feature written for
          this, and which no observer has to fire for the content to exist.
          The `--approach-height` values are the measured heights of these
          sections at 412 px, so the scroll length is right before they render. */}
      <div className="paint-on-approach" style={{ '--approach-height': '160px' }}>
        <LogoMarquee/>
      </div>
      <div className="paint-on-approach px-4 sm:px-[5vw] md:px-[7vw] lg:px-[9vw]" style={{ '--approach-height': '600px' }}>
          <FeaturedProducts/>
      </div>
      <div className="paint-on-approach" style={{ '--approach-height': '160px' }}>
        <CountdownBanner />
      </div>
      {/* Still deliberately all mounted, and this is the paragraph that says why
          the class above is not the thing that was thrown away.

          Phase 4 tried deferring these sections at the React level — not
          rendering them until a visitor approached — and measured a real win.
          It was reverted anyway, because in Chromium the sections did not
          reliably mount even once the page was scrolled to the bottom: five
          browser tests caught a homepage whose lower two-thirds simply was not
          there. That failure mode is impossible here. There is no observer, no
          state and no conditional render; the components mount on the first
          pass exactly as they always did, and the only thing the browser holds
          back is the paint. The reverted attempt is recorded in
          `.local-audit/25_PHASE_4_STATUS.md`. */}
      <div className="paint-on-approach" style={{ '--approach-height': '705px' }}>
        <ComparisonSection/>
      </div>
      <div className="paint-on-approach" style={{ '--approach-height': '230px' }}>
        <HeroVideo/>
      </div>
      <div className="paint-on-approach" style={{ '--approach-height': '1090px' }}>
        <FeaturedProduct/>
      </div>
      <div className="paint-on-approach" style={{ '--approach-height': '95px' }}>
        <ScrollingText text="Premium tech · Exceptional performance" />
      </div>
      <div className="paint-on-approach" style={{ '--approach-height': '900px' }}>
        <ShopTheLook/>
      </div>
    </div>
  )
}

export default Home