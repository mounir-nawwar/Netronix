import React from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types';

/**
 * The route-level error boundary (FE-021).
 *
 * There was none. A component that threw during render took the whole
 * application down to a blank white page — and one did: `ShopTheLook`
 * dereferenced a product it had looked up by a hardcoded id that any fresh
 * database lacks, so an unseeded catalog produced not a missing section but a
 * missing site (FE-004).
 *
 * That specific crash is fixed. This exists because the next one will be
 * somewhere else, and "one section is broken" has to be recoverable in a way
 * that "the page is blank" is not.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        // Somewhere a person can find it. Wiring this to a reporter is Phase 4
        // (BE-011 / DEVOPS-005); swallowing it in the meantime would be worse
        // than the blank page.
        console.error('Unhandled error in a route', error, info)
    }

    render() {
        if (!this.state.error) return this.props.children

        return (
            <div className="min-h-[60vh] flex items-center justify-center px-4 py-24" role="alert">
                <div className="max-w-md text-center">
                    <h1 className="text-2xl font-michroma text-gray-900 mb-3">Something went wrong</h1>
                    <p className="text-gray-600 mb-6">
                        This part of the page could not be displayed. The rest of the site still works.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center">
                        <button
                            type="button"
                            onClick={() => this.setState({ error: null })}
                            className="px-6 py-3 rounded-lg bg-[#6a5acd] text-white hover:bg-[#5a4cbb] transition-colors fill-button"
                        >
                            Try again
                        </button>
                        <Link
                            to="/"
                            className="px-6 py-3 rounded-lg border border-[#6a5acd] text-[#6a5acd] hover:bg-[#f5f3ff] transition-colors"
                        >
                            Back to home
                        </Link>
                    </div>
                </div>
            </div>
        )
    }
}

ErrorBoundary.propTypes = {
    children: PropTypes.node,
};

export default ErrorBoundary
