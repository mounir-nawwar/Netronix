import PropTypes from 'prop-types'

import useDialog from '../../lib/useDialog'

// Price and the variant axes, in a drawer rather than a permanent sidebar.
//
// Both browse pages devoted a fixed 16rem column to this on every viewport,
// which is a quarter of the grid's width spent on controls that most visits
// never touch. Moving it behind a button is what lets the products run edge to
// edge, and it is the single change that does the most for how the page reads.
//
// It is a real dialog, on the project's own primitive (`lib/useDialog.js`):
// focus moves in, Tab is trapped, Escape closes, focus returns to the Refine
// button, and the page behind it stops scrolling. A11Y-002 exists because four
// surfaces here had hand-rolled none of that; this one is not going to be the
// fifth.
//
// The price control is two overlapping `<input type="range">`. It looks like a
// dual-handle slider and is two real, independently keyboard-operable sliders,
// which is why `getAllByRole('slider')` finds two of them and why arrow keys
// work at all. The `max` on both is `catalogPriceCeiling(products)` — derived
// from the catalog, never the literal `1000` that used to be written into the
// state, the attribute and the track's arithmetic alike, and that hid every
// laptop in a catalog whose laptops start at $1,149 (FE-003).

const RefineDrawer = ({
    open,
    onClose,
    ceiling,
    range,
    onRangeChange,
    variantAxes,
    selectedVariants,
    onToggleVariant,
    onClear,
    resultCount,
    formatPrice,
}) => {
    const { ref } = useDialog({ open, onClose, lockScroll: true })

    if (!open) return null

    const [minimum, maximum] = range
    const safeCeiling = ceiling > 0 ? ceiling : 1
    const leftPercent = (minimum / safeCeiling) * 100
    const widthPercent = ((maximum - minimum) / safeCeiling) * 100

    // Both handles share a track, so each has to be stopped at the other rather
    // than allowed to cross it — otherwise the range inverts and the filter
    // silently matches nothing.
    const setMinimum = (value) => onRangeChange([Math.min(value, maximum), maximum])
    const setMaximum = (value) => onRangeChange([minimum, Math.max(value, minimum)])

    const thumb = `
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto
        [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink
        [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-paper
        [&::-webkit-slider-thumb]:cursor-grab
        [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:pointer-events-auto
        [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
        [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink
        [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-paper
    `

    return (
        <div className="fixed inset-0 z-50">
            {/* Not a button: it is a click target, and announcing "close dialog"
                twice — once here, once on the real control below — is noise.
                Escape and the labelled button are the accessible paths out. */}
            <div
                className="absolute inset-0 bg-ink/40"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-label="Refine products"
                className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col bg-paper sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[24rem]"
            >
                <div className="flex items-center justify-between border-b border-rule px-6 py-5">
                    <h2 className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">Refine</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40 transition-colors hover:text-ink"
                    >
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <section>
                        <h3 className="font-michroma text-[9px] uppercase tracking-[0.18em] text-ink-40">Price</h3>

                        <div className="mt-6 px-0.5">
                            <div className="relative h-px bg-rule">
                                <div
                                    className="absolute h-full bg-ink"
                                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                />
                            </div>

                            <div className="relative">
                                <input
                                    type="range"
                                    min={0}
                                    max={ceiling}
                                    value={minimum}
                                    onChange={(event) => setMinimum(parseInt(event.target.value, 10))}
                                    aria-label="Minimum price"
                                    className={`pointer-events-none absolute -top-2 h-1 w-full appearance-none bg-transparent ${thumb}`}
                                />
                                <input
                                    type="range"
                                    min={0}
                                    max={ceiling}
                                    value={maximum}
                                    onChange={(event) => setMaximum(parseInt(event.target.value, 10))}
                                    aria-label="Maximum price"
                                    className={`pointer-events-none absolute -top-2 h-1 w-full appearance-none bg-transparent ${thumb}`}
                                />
                            </div>
                        </div>

                        <div className="mt-8 flex items-center justify-between text-xs text-ink tnum">
                            <span>{formatPrice(minimum * 100)}</span>
                            <span className="h-px w-6 bg-rule" />
                            <span>{formatPrice(maximum * 100)}</span>
                        </div>
                    </section>

                    {/* The axes the catalog actually declares. An axis nothing
                        carries produces no section, rather than an empty one. */}
                    {Object.entries(variantAxes).map(([axis, options]) => (
                        <section key={axis} className="mt-10">
                            <h3 className="font-michroma text-[9px] uppercase tracking-[0.18em] text-ink-40">{axis}</h3>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {options.map((option) => {
                                    const checked = (selectedVariants[axis] ?? []).includes(option)
                                    return (
                                        <label
                                            key={option}
                                            className={`cursor-pointer border px-3 py-2 text-xs transition-colors duration-300 ${
                                                checked
                                                    ? 'border-ink bg-ink text-paper'
                                                    : 'border-rule text-ink-60 hover:border-ink hover:text-ink'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={checked}
                                                onChange={() => onToggleVariant(axis, option)}
                                                aria-label={`${axis}: ${option}`}
                                            />
                                            {option}
                                        </label>
                                    )
                                })}
                            </div>
                        </section>
                    ))}
                </div>

                <div className="flex items-center gap-3 border-t border-rule px-6 py-5">
                    <button
                        type="button"
                        onClick={onClear}
                        className="flex-1 border border-rule py-3 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-60 transition-colors duration-300 hover:border-ink hover:text-ink"
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-[2] bg-ink py-3 font-michroma text-[9px] uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:bg-statepurp"
                    >
                        Show {resultCount} {resultCount === 1 ? 'product' : 'products'}
                    </button>
                </div>
            </div>
        </div>
    )
}

RefineDrawer.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    ceiling: PropTypes.number.isRequired,
    range: PropTypes.arrayOf(PropTypes.number).isRequired,
    onRangeChange: PropTypes.func.isRequired,
    variantAxes: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
    selectedVariants: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
    onToggleVariant: PropTypes.func.isRequired,
    onClear: PropTypes.func.isRequired,
    resultCount: PropTypes.number.isRequired,
    formatPrice: PropTypes.func.isRequired,
}

export default RefineDrawer
