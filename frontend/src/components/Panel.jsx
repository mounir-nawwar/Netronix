import PropTypes from 'prop-types'

/**
 * The empty, failed and loading-failed states, which are the same shape.
 *
 * Lifted out of `Cart` when `Orders` needed the third copy. It was already
 * declared at module scope there rather than inside the render body, for a
 * reason worth keeping written down: a component defined in a render body is a
 * *new component type* on every render, so React unmounts and remounts the whole
 * subtree each time — which throws away focus and restarts any animation inside
 * it. Harmless for a static panel, and exactly the kind of thing that stops
 * being harmless the moment someone puts a field in one.
 */
const Panel = ({ role, heading, body, action }) => (
    <div className="border border-rule px-6 py-20 text-center" role={role}>
        <h2 className="font-michroma text-sm uppercase tracking-[0.16em] text-ink">{heading}</h2>
        <p className="mx-auto mt-4 max-w-[42ch] text-sm text-ink-60">{body}</p>
        {action}
    </div>
)

Panel.propTypes = {
    role: PropTypes.string,
    heading: PropTypes.node.isRequired,
    body: PropTypes.node,
    action: PropTypes.node,
}

export default Panel
