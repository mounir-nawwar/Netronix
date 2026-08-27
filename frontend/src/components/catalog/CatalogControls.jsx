import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

import useDialog from '../../lib/useDialog'
import { SORT_OPTIONS } from '../../lib/catalogView'

// The sticky control bar.
//
// What it replaces, on both browse pages: a native `<select>` for sort, a
// column of raw `<input type="checkbox">` for the taxonomy, and — on
// `/products` — a `bg-gradient-to-r from-indigo-600 to-purple-600` header bar,
// a gradient that appears nowhere else in this brand and is the single most
// recognisable "assembled by a tool" signal on the page.
//
// Three deliberate decisions:
//
//   * **The taxonomy is chips, in the bar, not a sidebar.** A permanent 16rem
//     sidebar was costing the grid a quarter of its width on every viewport in
//     order to show a list that is usually five items long. The chips are still
//     real `<input type="checkbox">` elements with real `<label>`s — visually
//     hidden inputs, styled labels — so they stay keyboard-operable, stay
//     announced as checkboxes, and stay reachable as `getByLabelText(tag)` in
//     both the component and browser suites. A `<button aria-pressed>` would
//     have looked identical and been worse on all three counts.
//   * **Sort is a listbox, not a `<select>`.** The native control cannot be
//     styled to match anything, and renders as OS chrome that differs on every
//     machine the site is looked at on. This is built on the project's own
//     `useDialog` — focus trap, Escape, focus restore — because the house rule
//     is explicit that a UI kit is not worth its runtime here.
//   * **Density is offered, not chosen for you.** Three-up is the default
//     because these are $1,149–$3,299 machines and a dense grid reads as a
//     bargain bin; four-up is there for anyone scanning rather than shopping.


const SortMenu = ({ value, onChange }) => {
    const [open, setOpen] = useState(false)
    const wrapperRef = useRef(null)
    const { ref } = useDialog({ open, onClose: () => setOpen(false) })

    const active = SORT_OPTIONS.find((option) => option.value === value) ?? SORT_OPTIONS[0]

    // Escape and Tab are `useDialog`'s; a click on the page behind is not, and
    // a popover that survives one is a popover the visitor has to come back and
    // dismiss.
    useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
            if (!wrapperRef.current?.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('touchstart', onPointerDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('touchstart', onPointerDown)
        }
    }, [open])

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex items-center gap-2 whitespace-nowrap border border-rule bg-paper px-4 py-2 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink transition-colors duration-300 hover:border-ink md:text-[10px]"
            >
                <span className="text-ink-40">Sort</span>
                <span>{active.label}</span>
                <span aria-hidden="true" className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
                    &#8964;
                </span>
            </button>

            {open && (
                <div
                    ref={ref}
                    role="listbox"
                    aria-label="Sort products by"
                    className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[15rem] border border-rule bg-paper py-1 shadow-none"
                >
                    {SORT_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={option.value === value}
                            onClick={() => { onChange(option.value); setOpen(false) }}
                            className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-xs transition-colors duration-200 hover:bg-plate ${
                                option.value === value ? 'text-ink' : 'text-ink-60'
                            }`}
                        >
                            <span>{option.label}</span>
                            {option.value === value && <span aria-hidden="true" className="text-statepurp">&#9679;</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

SortMenu.propTypes = {
    value: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
}

const DensityToggle = ({ value, onChange }) => (
    <div className="hidden items-center border border-rule xl:flex" role="group" aria-label="Grid density">
        {[
            { key: 'comfortable', label: 'Comfortable', glyph: '▦' },
            { key: 'compact', label: 'Compact', glyph: '▥' },
        ].map((option) => (
            <button
                key={option.key}
                type="button"
                onClick={() => onChange(option.key)}
                aria-pressed={value === option.key}
                aria-label={`${option.label} grid`}
                className={`px-3 py-2 text-sm transition-colors duration-300 ${
                    value === option.key ? 'bg-ink text-paper' : 'text-ink-40 hover:text-ink'
                }`}
            >
                <span aria-hidden="true">{option.glyph}</span>
            </button>
        ))}
    </div>
)

DensityToggle.propTypes = {
    value: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
}

const CatalogControls = ({
    tags,
    selectedTags,
    onToggleTag,
    onClearTags,
    sortBy,
    onSortChange,
    density,
    onDensityChange,
    onOpenRefine,
    refineCount,
}) => (
    /* Bled to the page's gutters so the rules run edge to edge, and nearly
       opaque rather than half transparent: an editorial tile scrolling under it
       is a full-bleed photograph, and 15% of one showing through a blur reads
       as a rendering fault rather than as depth. */
    <div className="catalog-bar -mx-4 border-y border-rule bg-paper/95 px-4 backdrop-blur-md sm:-mx-[5vw] sm:px-[5vw] md:-mx-[7vw] md:px-[7vw] lg:-mx-[9vw] lg:px-[9vw]">
        <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:gap-6">
            {/* The taxonomy. `tagsOf`/`/product/tags` only — never an invented
                list. `addMissingCategories` used to inject about forty category
                names no product carried, so forty of these could only ever
                produce an empty grid (FE-010). */}
            {/* `min-w-0` alongside `flex-1`, because a flex item's default
                `min-width: auto` is its content's width: on the `lg:flex-row`
                layout a long taxonomy would otherwise refuse to shrink and push
                the sort and Refine controls off the end of the bar rather than
                scrolling under them.

                Measured at 390 px: the rail is 366 px wide over 1089 px of
                chips and scrolls, and the page's own `scrollX` stays 0. */}
            <div className="scrollbar-hide rail-fade -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
                <button
                    type="button"
                    onClick={onClearTags}
                    aria-pressed={selectedTags.length === 0}
                    className={`whitespace-nowrap border px-4 py-2 font-michroma text-[9px] uppercase tracking-[0.16em] transition-colors duration-300 md:text-[10px] ${
                        selectedTags.length === 0
                            ? 'border-ink bg-ink text-paper'
                            : 'border-rule text-ink-60 hover:border-ink hover:text-ink'
                    }`}
                >
                    All
                </button>

                {tags.map((tag) => {
                    const checked = selectedTags.includes(tag)
                    return (
                        <label
                            key={tag}
                            className={`cursor-pointer whitespace-nowrap border px-4 py-2 font-michroma text-[9px] uppercase tracking-[0.16em] transition-colors duration-300 md:text-[10px] ${
                                checked
                                    ? 'border-ink bg-ink text-paper'
                                    : 'border-rule text-ink-60 hover:border-ink hover:text-ink'
                            }`}
                        >
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => onToggleTag(tag)}
                                aria-label={tag}
                            />
                            {tag}
                        </label>
                    )
                })}
            </div>

            <div className="flex shrink-0 items-center gap-2">
                <DensityToggle value={density} onChange={onDensityChange} />

                <button
                    type="button"
                    onClick={onOpenRefine}
                    className="flex items-center gap-2 whitespace-nowrap border border-rule bg-paper px-4 py-2 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink transition-colors duration-300 hover:border-ink md:text-[10px]"
                >
                    <span>Refine</span>
                    {refineCount > 0 && (
                        <span className="tnum flex h-4 min-w-[1rem] items-center justify-center bg-statepurp px-1 text-[9px] text-white">
                            {refineCount}
                        </span>
                    )}
                </button>

                <SortMenu value={sortBy} onChange={onSortChange} />
            </div>
        </div>
    </div>
)

CatalogControls.propTypes = {
    tags: PropTypes.arrayOf(PropTypes.string).isRequired,
    selectedTags: PropTypes.arrayOf(PropTypes.string).isRequired,
    onToggleTag: PropTypes.func.isRequired,
    onClearTags: PropTypes.func.isRequired,
    sortBy: PropTypes.string.isRequired,
    onSortChange: PropTypes.func.isRequired,
    density: PropTypes.string.isRequired,
    onDensityChange: PropTypes.func.isRequired,
    onOpenRefine: PropTypes.func.isRequired,
    refineCount: PropTypes.number.isRequired,
}

export default CatalogControls
