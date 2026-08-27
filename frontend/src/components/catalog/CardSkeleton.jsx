import PropTypes from 'prop-types'

// What the grid shows while the catalog is in flight.
//
// It used to be `animate-spin rounded-full h-12 w-12 border-t-2 border-b-2` —
// a spinner centred in a 16rem box. Two things are wrong with that and only one
// of them is taste. A spinner says "something is happening" and nothing else,
// so the page below it jumps into existence at an unpredictable height; these
// blocks are the shape of the thing that is coming, so the grid's geometry is
// settled before the first product lands and nothing shifts when it does.
//
// The pulse is opacity-only (`plate-sheen` in `tailwind.config.js`). A sweeping
// gradient across twelve tiles at once is compositing work paid at precisely
// the moment the main thread is busiest, and it is paused outright under
// `prefers-reduced-motion` (`index.css`).

const CardSkeleton = ({ index = 0 }) => (
    <div className="flex flex-col" aria-hidden="true">
        <div
            className="aspect-square w-full animate-plate-sheen bg-plate"
            // Staggered so the grid breathes as a field rather than blinking in
            // unison, which reads as a broken render rather than as loading.
            style={{ animationDelay: `${(index % 4) * 160}ms` }}
        />
        <div className="pt-4">
            <div className="h-2 w-12 bg-plate" />
            <div className="mt-3 h-3 w-4/5 bg-plate" />
            <div className="mt-2 h-3 w-3/5 bg-plate" />
            <div className="mt-4 h-3 w-20 bg-plate" />
            <div className="mt-3 h-px w-full bg-rule" />
        </div>
    </div>
)

CardSkeleton.propTypes = {
    index: PropTypes.number,
}

export default CardSkeleton
