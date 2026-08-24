// Handing a `mailto:` URL to the browser.
//
// Its own module for one reason: it is the single side effect in the Contact
// form's submit path, so a test can replace it and assert the address that
// would have been opened without jsdom trying to navigate.

export default function openMailto(href) {
    window.location.href = href
}
