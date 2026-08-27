import { Link } from 'react-router-dom'

import Seo from './Seo'
import Button from './Button'

/**
 * The 404 page (FE-020).
 *
 * `App.jsx` declared eleven routes and no `path="*"`, so any URL that matched
 * none of them rendered the navbar, the footer, the newsletter bar and nothing
 * in between — a page that looks like it loaded and simply has no content. A
 * mistyped URL, a stale link and a deleted product all landed there, and none of
 * them said so.
 */
const NotFound = () => (
    <div className="flex min-h-[70vh] items-center bg-paper px-4 py-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
        {/* SEO — a 404 that a crawler is told is a 404. This is a client-side
            route, so the HTTP status is still 200; `noindex, nofollow` is the
            part that is in this application's gift. */}
        <Seo rawTitle="Page not found — Netronix" description="This page does not exist." noIndex />

        <div className="mx-auto w-full max-w-[1200px]">
            <div className="flex items-center gap-3">
                <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
                    Netronix / 404
                </span>
                <span className="h-px flex-1 bg-rule" />
            </div>

            <h1
                className="mt-5 font-michroma uppercase leading-[0.95] tracking-tight text-ink"
                style={{ fontSize: 'clamp(2rem, 6vw, 4rem)' }}
            >
                Page not found
            </h1>

            <p className="mt-8 max-w-[52ch] text-base leading-relaxed text-ink-60">
                That page does not exist. It may have moved, or the link may be out of date.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
                <Button as={Link} to="/" variant="solid" className="px-8 py-3.5 text-[10px] tracking-[0.18em]">
                    Back to home
                </Button>
                {/* `/products` is the whole catalog; `/collections/all` was a
                    fourth address for the same page and now redirects here (Phase 1). */}
                <Button as={Link} to="/products" variant="quiet" className="px-8 py-3.5 text-[10px] tracking-[0.18em]">
                    Browse products
                </Button>
            </div>
        </div>
    </div>
)

export default NotFound
