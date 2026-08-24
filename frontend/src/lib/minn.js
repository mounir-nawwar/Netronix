// The MINN attribution, in one place.
//
// Footer, NewsLetterBar and Contact all render MINN's social accounts. When
// each of them carried its own copy they drifted: the footer pointed at
// `https://facebook.com`, the floating bar at `#`, and Contact at `#` — three
// different wrong answers to the same question. There is one answer here.
//
// These URLs are the confirmed accounts. There is no MINN YouTube or GitHub;
// the icons that used to imply otherwise are gone rather than pointed at a
// guess.

export const MINN_NAME = 'MINN'
export const MINN_URL = 'https://minnagency.com'

export const MINN_FACEBOOK_URL = 'https://www.facebook.com/61592823123599'
export const MINN_INSTAGRAM_URL = 'https://www.instagram.com/minnagency/'
export const MINN_X_URL = 'https://x.com/MINN_agency'

/**
 * The three accounts, in the order they are shown.
 *
 * `platform` is the key `NewsLetterBar` switches on for its inline icons;
 * `label` is the accessible name every link gets, and it names MINN explicitly
 * because these are MINN's accounts rendered inside Netronix's chrome.
 */
export const MINN_SOCIAL_LINKS = Object.freeze([
    Object.freeze({ platform: 'facebook', url: MINN_FACEBOOK_URL, label: 'MINN on Facebook' }),
    Object.freeze({ platform: 'twitter', url: MINN_X_URL, label: 'MINN on X' }),
    Object.freeze({ platform: 'instagram', url: MINN_INSTAGRAM_URL, label: 'MINN on Instagram' }),
])
