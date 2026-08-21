import { Link } from 'react-router-dom'

import Seo from './Seo'

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
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-24">
        {/* SEO — a 404 that a crawler is told is a 404. This is a client-side
            route, so the HTTP status is still 200; `noindex, nofollow` is the
            part that is in this application's gift. */}
        <Seo rawTitle="Page not found — Netronix" description="This page does not exist." noIndex />
        <div className="max-w-md text-center">
            <p className="text-sm font-michroma text-[#6a5acd] mb-2">404</p>
            <h1 className="text-3xl font-michroma text-gray-900 mb-3">Page not found</h1>
            <p className="text-gray-600 mb-8">
                That page does not exist. It may have moved, or the link may be out of date.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
                <Link
                    to="/"
                    className="px-6 py-3 rounded-lg bg-[#6a5acd] text-white hover:bg-[#5a4cbb] transition-colors fill-button"
                >
                    Back to home
                </Link>
                <Link
                    to="/collections/all"
                    className="px-6 py-3 rounded-lg border border-[#6a5acd] text-[#6a5acd] hover:bg-[#f5f3ff] transition-colors"
                >
                    Browse products
                </Link>
            </div>
        </div>
    </div>
)

export default NotFound
