import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import Button from '../components/Button';
import openMailto from '../lib/openMailto.js';
import { openSupportChat } from '../lib/supportChat.js';
import { MINN_SOCIAL_LINKS } from '../lib/minn.js';
import {
  CONTACT_EMAIL,
  buildContactMailto,
  buildMailto,
} from '../lib/contact.js';

// The page is one instrument with a few switches beside it.
//
// What replaced what: a purple hero over a tiled board pattern with five
// drifting glyphs, then a two-column card whose left half was another purple
// panel of icon bubbles, then three equal shadowed cards under matching
// headings, then a rotating mascot. Four surfaces, all shouting, none ranked —
// and among them two opening-hour lines nobody at Netronix has confirmed.
//
// The only thing on this route a visitor cannot do anywhere else is compose a
// message, so that is the one large surface. Everything else is a destination
// they already know they want — a number, an address, the catalogue — and a
// destination needs a row and a rule under it, not a card and a shadow.
//
// `paper` behind, `ink` type, one accent. `statepurp` is kept, but only where
// the page answers a pointer or a keyboard: links, focus rings. Nothing is
// filled with it, so nothing competes with the submit button for the eye.
//
// Rebuilt again onto the site's *type*, not just its colours. This page was
// already on the tokens — `paper`/`rule`/`ink-40` in place of the three raw
// hex values a design test used to pin — and stayed there. What had not
// happened yet was everything else that makes a page read as part of this
// site: `max-w-[980px]` and `pt-12` rather than the `max-w-[1200px]` and
// `pt-[104px]` every other page shares; a sentence-case grey eyebrow with no
// rule where every other page runs a Michroma eyebrow beside a hairline that
// draws to the edge; a 32–44px system-sans `<h1>` where every other page runs
// Michroma uppercase; a `rounded-xl bg-white` card where every other bordered
// region on the site — `PlaceOrder`'s own form among them — is a square
// `border-rule` box on the page's own `paper`, with no card behind it at all.
// Contact stayed a page that happened to share a palette with the rest of the
// site rather than one that reads as part of it. `<h1>` and the container
// follow `Orders`/`Wishlist`'s scale, not `About`'s — this is a utility page,
// not a landing one. Unlike those, nothing here animates on entrance: the
// design test in this file has always required that, and still does, so
// nothing below reaches for the animation library the rest of the site uses.

/** Platform names for MINN's accounts; the label names MINN for a11y. */
const PLATFORM_NAMES = {
  facebook: 'Facebook',
  twitter: 'X',
  instagram: 'Instagram',
};

// FE-014 — three of the four "Connect With Us" icons were `href="#"` and the
// fourth was a GitHub mark for an account that does not exist. The three that
// do exist are MINN's, and they come from one module shared with the footer.

// "Preferred drop-off date" was in this template, which implies premises to
// drop a device off at. `lib/seo.js` states plainly that this project has no
// postal address and claims none in its structured data, so the template asked
// for something the shop could not receive.
const REPAIR_MAILTO = buildMailto({
  subject: 'Repair enquiry',
  body: [
    'Device (make and model):',
    'What is wrong with it:',
    'Where you are:',
  ].join('\n'),
});

// "Returns & Warranty" was one of these. Offering it as a subject line asserts
// that a returns process and a warranty programme exist to write to about, and
// neither does — there is nothing in this codebase behind either word.
const SUBJECTS = [
  'Sales Inquiry',
  'Technical Support',
  'Product Information',
  'Partnership Opportunity',
  'Other',
];

// Square now, and `focus:border-ink` rather than a ring — the same field
// idiom `PlaceOrder.jsx` and `LogIn.jsx` already use. `text-base`, not `text-sm`
// like theirs: 16px keeps iOS Safari from zooming the page in on focus, which
// is worth keeping even where it is the one field class that does not match.
const FIELD_CLASS =
  'w-full min-h-[44px] border border-rule bg-paper px-4 py-3 text-base ' +
  'text-ink placeholder:text-ink-40 transition-colors ' +
  'focus:border-ink focus:outline-none';

const LABEL_CLASS = 'block text-sm font-medium text-ink-60';

const ACTION_CLASS =
  'inline-flex min-h-[44px] shrink-0 items-center text-base font-medium text-statepurp ' +
  'underline decoration-statepurp/30 underline-offset-4 transition-colors ' +
  'hover:decoration-statepurp focus:outline-none focus-visible:ring-2 focus-visible:ring-statepurp ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-paper';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  // FE-014 / PORT-006 — this used to be `isSubmitting` plus a `submitStatus`
  // of 'success', set by a `setTimeout` that waited 1.5 s, showed "Message
  // Sent!" and cleared the form. Nothing was ever sent: there is no contact
  // endpoint, so every message a visitor wrote here was discarded while they
  // were told a tech expert would get back to them.
  //
  // There is no backend to add here, so the form does the honest version of
  // what it was pretending to do — it hands the message to the visitor's own
  // mail client, addressed and filled in, and says that is what it is doing
  // both before and after. Nothing here claims delivery, because nothing here
  // can observe it.
  const [handedOff, setHandedOff] = useState(false);

  // The summary reads out of the draft rather than describing it: one call to
  // `buildContactMailto`, parsed back for display and then handed to the mail
  // client unchanged. A preview built from a second copy of the subject rule
  // would be free to drift away from the email that actually opens.
  const draft = useMemo(() => {
    const href = buildContactMailto(formData);
    return { href, subject: new URL(href).searchParams.get('subject') ?? '' };
  }, [formData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    openMailto(draft.href);
    setHandedOff(true);
  };

  return (
    <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
      <Seo title="Contact" description="How to reach Netronix." />

      <div className="mx-auto max-w-[1200px]">
        {/* A plain `<header>`, not the animated entrance every other page's
            header gets — this file is the one the animation ban applies to,
            so the fade-and-rise every other page opens on is deliberately
            absent here. */}
        <header data-testid="contact-header" className="pt-[104px] md:pt-[132px]">
          <div className="flex items-center gap-3">
            <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
              Netronix / Contact
            </span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <h1
            className="mt-5 font-michroma uppercase leading-[0.95] tracking-tight text-ink"
            style={{ fontSize: 'clamp(2rem, 6vw, 4rem)' }}
          >
            Write to Netronix.
          </h1>

          <p className="mt-8 max-w-[60ch] text-base leading-relaxed text-ink-60">
            Say what you need below and this page assembles the email for you. If you would
            rather go straight to the address, it is further down the page.
          </p>
        </header>

        <section
          data-testid="configure-surface"
          aria-labelledby="configure-heading"
          className="mt-16 border border-rule bg-paper p-6 sm:p-9 md:mt-20"
        >
          <div className="flex items-center gap-3">
            <h2 id="configure-heading" className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">
              Compose a message
            </h2>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <p
            id="contact-form-disclosure"
            data-testid="contact-form-disclosure"
            className="mt-2 max-w-[46rem] text-sm leading-relaxed text-ink-40"
          >
            Netronix has no message inbox on this website. Sending this form opens your own
            email app with the message already written and addressed to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-statepurp underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>
            {' '}— you still have to press send there.
          </p>

          <div role="status" aria-live="polite" className="mt-6 empty:mt-0">
            {handedOff && (
              // An `ink` accent, not the purple one every other page's status
              // panels use — this file's own design test holds the accent to
              // pointer and keyboard states only, at rest nowhere, and a
              // status panel is neither.
              <div className="border-l-2 border-ink bg-wash p-4">
                <p className="font-medium">Your email app should now be open.</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-60">
                  The message is waiting there as a draft to {CONTACT_EMAIL}. If nothing
                  opened, copy what you wrote and email us directly at{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-statepurp underline underline-offset-2">
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-8">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className={LABEL_CLASS}>Full Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  autoComplete="name"
                  className={`mt-1.5 ${FIELD_CLASS}`}
                  placeholder="Rania Aoun"
                />
              </div>
              <div>
                <label htmlFor="email" className={LABEL_CLASS}>Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  className={`mt-1.5 ${FIELD_CLASS}`}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="subject" className={LABEL_CLASS}>Subject</label>
              <select
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                className={`mt-1.5 ${FIELD_CLASS}`}
              >
                <option value="">Select a subject</option>
                {SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>

            <div className="mt-5">
              <label htmlFor="message" className={LABEL_CLASS}>Message</label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={6}
                className={`mt-1.5 ${FIELD_CLASS} resize-y`}
                placeholder="What can we help with?"
              />
            </div>

            <dl
              data-testid="draft-summary"
              className="mt-7 border-t border-rule pt-5 text-sm"
            >
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-ink-40">To</dt>
                <dd className="min-w-0 break-words">{CONTACT_EMAIL}</dd>
              </div>
              <div className="mt-2 flex gap-3">
                <dt className="w-16 shrink-0 text-ink-40">Subject</dt>
                <dd className="min-w-0 break-words">{draft.subject}</dd>
              </div>
            </dl>

            {/* The one filled button on the page, and now the same component
                every other primary action on the site renders — square,
                Michroma, inverts to `statepurp` on hover — rather than a
                `rounded-lg` button in the system sans that answered to nothing
                else on the site. `min-h-[44px]` is kept explicitly, since
                `Button` does not bake in a target size and the test below
                requires it on every action here. */}
            <Button
              type="submit"
              variant="solid"
              aria-describedby="contact-form-disclosure"
              className="mt-7 min-h-[44px] w-full px-8 py-3.5 text-[10px] tracking-[0.18em] sm:w-auto"
            >
              Open email draft
            </Button>
          </form>
        </section>

        <section aria-labelledby="routes-heading" className="mt-16 md:mt-20">
          <div className="flex items-center gap-3">
            <h2 id="routes-heading" className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">
              Or go direct
            </h2>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <ul
            data-testid="support-routes"
            className="mt-4 divide-y divide-rule border-y border-rule"
          >
            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Sales</h3>
                <p className="mt-0.5 text-sm text-ink-40">Pricing and availability.</p>
              </div>
              <a
                href={buildMailto({ to: CONTACT_EMAIL, subject: 'Netronix — sales' })}
                data-testid="support-route-action"
                className={ACTION_CLASS}
              >
                {CONTACT_EMAIL}
              </a>
            </li>

            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Support</h3>
                <p className="mt-0.5 text-sm text-ink-40">Anything about an order already placed.</p>
              </div>
              <a
                href={buildMailto({ to: CONTACT_EMAIL, subject: 'Netronix — support' })}
                data-testid="support-route-action"
                className={ACTION_CLASS}
              >
                {CONTACT_EMAIL}
              </a>
            </li>

            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Catalogue</h3>
                <p className="mt-0.5 text-sm text-ink-40">Everything Netronix currently sells.</p>
              </div>
              <Link to="/products" data-testid="support-route-action" className={ACTION_CLASS}>
                Browse products
              </Link>
            </li>

            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Assistant</h3>
                <p className="mt-0.5 text-sm text-ink-40">Answers questions about the current catalogue.</p>
              </div>
              <button
                type="button"
                onClick={openSupportChat}
                data-testid="support-route-action"
                className={ACTION_CLASS}
              >
                Start chat
              </button>
            </li>

            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Repairs</h3>
                <p className="mt-0.5 text-sm text-ink-40">Prepare an email with the device details.</p>
              </div>
              <a href={REPAIR_MAILTO} data-testid="support-route-action" className={ACTION_CLASS}>
                Book a repair
              </a>
            </li>

          </ul>
        </section>

        <section aria-labelledby="minn-heading" className="mt-16 border-t border-rule pt-10 pb-16 md:pb-24">
          <h2 id="minn-heading" className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">
            Connect With MINN
          </h2>
          <p className="mt-2 text-sm text-ink-40">Follow the agency behind this storefront.</p>
          <ul className="mt-1 flex flex-wrap gap-x-7">
            {MINN_SOCIAL_LINKS.map(({ platform, url, label }) => (
              <li key={platform}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`${ACTION_CLASS} text-sm`}
                >
                  {PLATFORM_NAMES[platform]}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Contact;
