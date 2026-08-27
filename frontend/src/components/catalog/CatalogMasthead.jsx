import PropTypes from 'prop-types'

// The page's own name, at the size a page's name should be.
//
// Both browse surfaces opened with `<h1 className="text-3xl font-bold
// text-gray-900">Products</h1>` — the Tailwind default, in the default face, on
// a page whose homepage sets every heading in Michroma. Nothing about it said
// which shop this was.
//
// The rule-flanked eyebrow is lifted from `ShopTheLook`, which is where the
// homepage established the pattern. Reusing it rather than inventing a fourth
// heading treatment is most of what "matching the landing page" actually means.

const CatalogMasthead = ({ eyebrow, title, description, count, countLabel }) => (
    <header className="pt-[104px] md:pt-[132px]">
        <div className="flex items-center gap-3">
            <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
                {eyebrow}
            </span>
            <span className="h-px flex-1 bg-rule" />
        </div>

        {/* `clamp` rather than a breakpoint ladder: the title is one continuous
            line at every width, and a long collection name shrinks to fit
            instead of wrapping into the controls below it. */}
        <h1
            className="mt-5 font-michroma uppercase leading-[0.95] tracking-tight text-ink"
            style={{ fontSize: 'clamp(2.25rem, 7vw, 5.25rem)' }}
        >
            {title}
        </h1>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-8 md:mt-8">
            {description
                ? <p className="max-w-[52ch] text-sm leading-relaxed text-ink-60">{description}</p>
                : <span />}

            {/* `aria-live` because this number is the only feedback a filter
                gives a screen-reader user: the grid below it reflows silently. */}
            <p className="text-xs text-ink-40 tnum" aria-live="polite">
                {count} {countLabel}
            </p>
        </div>
    </header>
)

CatalogMasthead.propTypes = {
    eyebrow: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    count: PropTypes.number.isRequired,
    countLabel: PropTypes.string.isRequired,
}

export default CatalogMasthead
