import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { useLocation } from 'react-router-dom'

import { pop, push, setDefaults, render } from '../lib/head'
import { absolute, robotsFor, siteDefaults, pageTitle } from '../lib/seo'

// SEO-001 / SEO-002 — `<title>` was the literal string "Netronix" on every
// route: every product page, every collection, the cart, the checkout and the
// order history all shared it, and there was no description, no Open Graph and
// no Twitter Card anywhere. Sharing any Netronix URL produced a bare link.
//
// `<Seo>` is how a page says what it is. Mount one per route with whatever it
// knows; anything it does not set falls back to the site defaults.

/** Installs the site-wide defaults. Mounted once, above the routes. */
export const SeoProvider = ({ children }) => {
    // Before the first paint, so the head is right even if a route's own
    // `<Seo>` is still suspended behind its lazy chunk.
    const installed = useRef(false)
    if (!installed.current) {
        setDefaults(siteDefaults())
        installed.current = true
    }

    useEffect(() => {
        setDefaults(siteDefaults())
        return () => setDefaults({})
    }, [])

    return children
}

SeoProvider.propTypes = { children: PropTypes.node }

/**
 * @param {object}   props
 * @param {string}   [props.title]        Page name; the site suffix is added.
 * @param {string}   [props.rawTitle]     A complete title, used verbatim.
 * @param {string}   [props.description]
 * @param {string}   [props.path]         Canonical path; defaults to the current route.
 * @param {string}   [props.image]        Absolute or root-relative OG image.
 * @param {string}   [props.ogType]
 * @param {Array}    [props.jsonLd]       Structured-data blocks, already truthful.
 * @param {boolean}  [props.noIndex]      Force `noindex, nofollow`.
 */
const Seo = ({ title, rawTitle, description, path, image, ogType, jsonLd, noIndex }) => {
    const location = useLocation()
    const canonicalPath = path ?? location.pathname

    // The descriptor is rebuilt on every render and the effect re-applies it,
    // so a page whose data arrives late (a product name from a fetch) updates
    // the head rather than being stuck with the loading-state title.
    const descriptor = {
        title: rawTitle ?? (title ? pageTitle(title) : undefined),
        description,
        canonical: absolute(canonicalPath),
        image: image ? (image.startsWith('http') ? image : absolute(image)) : undefined,
        ogType,
        jsonLd: (jsonLd ?? []).filter(Boolean),
        robots: noIndex ? 'noindex, nofollow' : robotsFor(canonicalPath),
    }

    const key = JSON.stringify(descriptor)
    const entry = useRef(null)

    useEffect(() => {
        const next = JSON.parse(key)
        if (entry.current) pop(entry.current)
        entry.current = push(next)
        return () => {
            if (entry.current) {
                pop(entry.current)
                entry.current = null
            }
            render()
        }
    }, [key])

    return null
}

Seo.propTypes = {
    title: PropTypes.string,
    rawTitle: PropTypes.string,
    description: PropTypes.string,
    path: PropTypes.string,
    image: PropTypes.string,
    ogType: PropTypes.string,
    jsonLd: PropTypes.arrayOf(PropTypes.object),
    noIndex: PropTypes.bool,
}

export default Seo
