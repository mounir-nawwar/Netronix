// How a visitor actually reaches Netronix.
//
// The footer advertised `support@netronix.com` while Contact advertised
// `support@netronix.tech`. Both domains publish MX records, but a storefront
// must not present two different support addresses. The `.tech` address was
// already the Contact page's canonical destination, so every surface reads it
// from here now.
//
// The storefront has no message-sending backend. Everything that looks like it
// sends a message is built on `mailto:` — see `buildMailto` — and the UI says
// so rather than reporting a success that never happened.

export const SUPPORT_EMAIL = 'support@netronix.tech'
export const SALES_EMAIL = 'info@netronix.tech'

export const PHONE_DISPLAY = '+961 81 995 653'
/** E.164, no spaces: a dialler cannot parse the display form. */
export const PHONE_HREF = 'tel:+96181995653'

/**
 * A `mailto:` URL with the subject and body pre-filled.
 *
 * `encodeURIComponent` rather than `URLSearchParams`, because the latter
 * encodes a space as `+` and mail clients render that literally — a body would
 * arrive reading "Hello+there".
 */
export function buildMailto({ to = SUPPORT_EMAIL, subject = '', body = '' } = {}) {
    const query = [
        subject && `subject=${encodeURIComponent(subject)}`,
        body && `body=${encodeURIComponent(body)}`,
    ].filter(Boolean).join('&')

    return query ? `mailto:${to}?${query}` : `mailto:${to}`
}

/** The Contact form's message, as the email it will open. */
export function buildContactMailto({ name = '', email = '', subject = '', message = '' } = {}) {
    return buildMailto({
        to: SUPPORT_EMAIL,
        subject: subject ? `${subject} — ${name}`.trim() : `Website enquiry — ${name}`.trim(),
        body: [
            `Name: ${name}`,
            `Email: ${email}`,
            `Subject: ${subject}`,
            '',
            message,
        ].join('\n'),
    })
}
