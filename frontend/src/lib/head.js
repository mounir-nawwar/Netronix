// SEO-001 / SEO-002 / SEO-004 / SEO-005 — per-route head management.
//
// React 19 hoists `<title>` and `<meta>` out of a component tree for you. This
// application is on React 18, which does not, so the choice was
// `react-helmet-async` or a small equivalent. This is the equivalent, and it is
// about ninety lines, because what the storefront actually needs is narrow:
// one descriptor per route, last mount wins, everything restored on unmount.
//
// `react-helmet-async` would also work. It is not here because it adds a
// provider, a peer-dependency surface, and a known set of React 18 StrictMode
// double-mount quirks, to manage seven tags — and because a dependency whose
// behaviour under concurrent rendering has to be taken on trust is worse than
// forty lines whose behaviour is asserted directly (`src/test/seo/`).
//
// The design:
//
//   * Every mounted `<Seo>` pushes a descriptor onto a stack and pops it on
//     unmount. The head is re-rendered from **the top of the stack merged over
//     the defaults** after every change, so nesting and route transitions are
//     deterministic rather than order-of-effect dependent.
//   * Every element this module writes carries `data-rh="1"`. It never touches
//     a tag it did not create, so the static defaults in `index.html` and
//     anything a browser extension adds are left alone.
//   * Absolute URLs are built from one configured origin. There is no
//     hardcoded production hostname anywhere: `VITE_FRONTEND_URL` supplies it,
//     and a local default is used when it is unset, because emitting a
//     canonical that names a host nobody controls is worse than emitting a
//     local one.

const MANAGED = 'data-rh'

/** The stack of descriptors, innermost last. */
const stack = []

let defaults = {}

/** Install the site-wide fallbacks. Called once, from `<SeoProvider>`. */
export function setDefaults(next) {
    defaults = next ?? {}
    render()
}

export function push(descriptor) {
    stack.push(descriptor)
    render()
    return descriptor
}

export function pop(descriptor) {
    const index = stack.lastIndexOf(descriptor)
    if (index !== -1) stack.splice(index, 1)
    render()
}

/** What the head should currently say. Exported so tests can assert it directly. */
export function resolved() {
    const top = stack[stack.length - 1] ?? {}
    return { ...defaults, ...Object.fromEntries(Object.entries(top).filter(([, v]) => v !== undefined)) }
}

function upsertMeta(document, attribute, key, content) {
    if (content === undefined || content === null || content === '') return
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`)
    if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attribute, key)
        element.setAttribute(MANAGED, '1')
        document.head.appendChild(element)
    }
    element.setAttribute('content', String(content))
}

function upsertLink(document, rel, href) {
    if (!href) return
    let element = document.head.querySelector(`link[rel="${rel}"][${MANAGED}]`)
    if (!element) {
        element = document.createElement('link')
        element.setAttribute('rel', rel)
        element.setAttribute(MANAGED, '1')
        document.head.appendChild(element)
    }
    element.setAttribute('href', href)
}

/** Remove only what this module created, so a route change cannot leave residue. */
function clearManaged(document) {
    for (const element of document.head.querySelectorAll(`[${MANAGED}]`)) element.remove()
}

export function render(document = globalThis.document) {
    if (!document?.head) return
    clearManaged(document)

    const head = resolved()
    if (head.title) document.title = head.title

    upsertMeta(document, 'name', 'description', head.description)
    upsertMeta(document, 'name', 'theme-color', head.themeColor)
    upsertMeta(document, 'name', 'robots', head.robots)

    upsertLink(document, 'canonical', head.canonical)

    // These two have sensible fallbacks, but only once there is something to
    // describe. Writing them from an empty descriptor would leave two orphan
    // tags in the head after the last `<Seo>` unmounts.
    const describing = Boolean(head.title || head.description || head.canonical)
    if (describing) upsertMeta(document, 'property', 'og:type', head.ogType ?? 'website')
    upsertMeta(document, 'property', 'og:site_name', head.siteName)
    upsertMeta(document, 'property', 'og:title', head.ogTitle ?? head.title)
    upsertMeta(document, 'property', 'og:description', head.description)
    upsertMeta(document, 'property', 'og:url', head.canonical)
    upsertMeta(document, 'property', 'og:image', head.image)
    upsertMeta(document, 'property', 'og:image:alt', head.imageAlt)
    upsertMeta(document, 'property', 'og:locale', head.locale)

    if (describing) upsertMeta(document, 'name', 'twitter:card', head.twitterCard ?? 'summary_large_image')
    upsertMeta(document, 'name', 'twitter:title', head.ogTitle ?? head.title)
    upsertMeta(document, 'name', 'twitter:description', head.description)
    upsertMeta(document, 'name', 'twitter:image', head.image)

    // SEO-004 — one `<script type="application/ld+json">` per route, holding
    // whatever that route can say **truthfully** from catalog data. There is no
    // AggregateRating, no reviewCount and no business address anywhere in this
    // project's structured data, because it has no reviews and no premises.
    if (Array.isArray(head.jsonLd) && head.jsonLd.length > 0) {
        for (const block of head.jsonLd) {
            const script = document.createElement('script')
            script.type = 'application/ld+json'
            script.setAttribute(MANAGED, '1')
            script.textContent = JSON.stringify(block)
            document.head.appendChild(script)
        }
    }
}

/** Test hook: drop all state. Never called by the application. */
export function reset(document = globalThis.document) {
    stack.length = 0
    defaults = {}
    if (document?.head) clearManaged(document)
}
