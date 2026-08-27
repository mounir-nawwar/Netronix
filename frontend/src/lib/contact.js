// How a visitor actually reaches the people behind Netronix.
//
// This module used to settle an argument between two Netronix domains — the
// footer advertised `support@netronix.com`, Contact advertised
// `support@netronix.tech` — and picked `.tech`. That was the wrong question.
// **Nobody reads either of them.** Netronix is a portfolio build, not a trading
// company; `support@netronix.tech` and `info@netronix.tech` route to a mailbox
// no person opens, which is worse than a bounce, because a bounce at least
// tells the sender their message went nowhere.
//
// So there is one address, and it belongs to the agency that actually exists:
// `contact@minnagency.com`. Both names below resolve to it. Two names for one
// mailbox is deliberate rather than redundant — the Contact page's Sales and
// Support rows give their drafts different `?subject=` lines, which is how a
// single inbox stays sortable.
//
// There is no telephone number here any more, for the same reason. A published
// number that rings nowhere is a promise, and this project does not make ones
// it cannot keep.
//
// The storefront has no message-sending backend. Everything that looks like it
// sends a message is built on `mailto:` — see `buildMailto` — and the UI says
// so rather than reporting a success that never happened.

/** The one address a person genuinely reads. */
export const CONTACT_EMAIL = 'contact@minnagency.com'

export const SUPPORT_EMAIL = CONTACT_EMAIL
export const SALES_EMAIL = CONTACT_EMAIL

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
