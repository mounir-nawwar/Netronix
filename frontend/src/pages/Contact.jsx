import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import openMailto from '../lib/openMailto.js';
import { openSupportChat } from '../lib/supportChat.js';
import { MINN_SOCIAL_LINKS } from '../lib/minn.js';
import {
  PHONE_DISPLAY,
  PHONE_HREF,
  SALES_EMAIL,
  SUPPORT_EMAIL,
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
// `paper` behind, white for the one surface that takes input, `ink` type.
// `statepurp` is kept, but only where the page answers a pointer or a keyboard:
// links, focus rings. Nothing is filled with it, so nothing competes with the
// submit button for the eye.

/** Platform names for MINN's accounts; the label names MINN for a11y. */
const PLATFORM_NAMES = {
  facebook: 'Facebook',
  twitter: 'X',
  instagram: 'Instagram',
};

// FE-014 — three of the four "Connect With Us" icons were `href="#"` and the
// fourth was a GitHub mark for an account that does not exist. The three that
// do exist are MINN's, and they come from one module shared with the footer.

const REPAIR_MAILTO = buildMailto({
  subject: 'Repair booking request',
  body: [
    'Device (make and model):',
    'What is wrong with it:',
    'Preferred drop-off date:',
    'Best number to reach you on:',
  ].join('\n'),
});

const SUBJECTS = [
  'Sales Inquiry',
  'Technical Support',
  'Product Information',
  'Returns & Warranty',
  'Partnership Opportunity',
  'Other',
];

const FIELD_CLASS =
  'w-full min-h-[44px] rounded-lg border border-rule bg-white px-3.5 py-2.5 text-base ' +
  'text-ink placeholder:text-ink-40 transition-colors ' +
  'focus:border-ink focus:outline-none focus:ring-2 focus:ring-statepurp/40';

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
    <div className="min-h-screen bg-paper text-ink pt-[80px] md:pt-[100px]">
      <Seo title="Contact" description="How to reach Netronix." />

      <div className="mx-auto w-full max-w-[980px] px-5 sm:px-6 lg:px-8">
        <header data-testid="contact-header" className="max-w-[42rem] pt-12 pb-9 md:pt-16 md:pb-12">
          <p className="text-sm font-medium tracking-wide text-ink-40">Contact</p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-[2.75rem]">
            Write to Netronix.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-60">
            Say what you need below and this page assembles the email for you. If you would
            rather go straight to a number or an address, they are further down the page.
          </p>
        </header>

        <section
          data-testid="configure-surface"
          aria-labelledby="configure-heading"
          className="rounded-xl border border-rule bg-white p-6 sm:p-9"
        >
          <h2 id="configure-heading" className="text-xl font-semibold tracking-tight">
            Compose a message
          </h2>

          <p
            id="contact-form-disclosure"
            data-testid="contact-form-disclosure"
            className="mt-2 max-w-[46rem] text-sm leading-relaxed text-ink-40"
          >
            Netronix has no message inbox on this website. Sending this form opens your own
            email app with the message already written and addressed to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-statepurp underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
            {' '}— you still have to press send there.
          </p>

          <div role="status" aria-live="polite" className="mt-6 empty:mt-0">
            {handedOff && (
              <div className="rounded-lg border border-rule bg-paper p-4">
                <p className="font-medium">Your email app should now be open.</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-60">
                  The message is waiting there as a draft to {SUPPORT_EMAIL}. If nothing
                  opened, copy what you wrote and email us directly at{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-statepurp underline underline-offset-2">
                    {SUPPORT_EMAIL}
                  </a>
                  , or call{' '}
                  <a href={PHONE_HREF} className="text-statepurp underline underline-offset-2">
                    {PHONE_DISPLAY}
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
                <dd className="min-w-0 break-words">{SUPPORT_EMAIL}</dd>
              </div>
              <div className="mt-2 flex gap-3">
                <dt className="w-16 shrink-0 text-ink-40">Subject</dt>
                <dd className="min-w-0 break-words">{draft.subject}</dd>
              </div>
            </dl>

            <button
              type="submit"
              aria-describedby="contact-form-disclosure"
              className="mt-7 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-ink px-6 py-3 text-base font-medium text-white transition-colors hover:bg-statepurp focus:outline-none focus-visible:ring-2 focus-visible:ring-statepurp focus-visible:ring-offset-2 sm:w-auto"
            >
              Open email draft
            </button>
          </form>
        </section>

        <section aria-labelledby="routes-heading" className="mt-12 md:mt-16">
          <h2 id="routes-heading" className="text-xl font-semibold tracking-tight">
            Or go direct
          </h2>

          <ul
            data-testid="support-routes"
            className="mt-4 divide-y divide-rule border-y border-rule"
          >
            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Phone</h3>
                <p className="mt-0.5 text-sm text-ink-40">Call Netronix directly.</p>
              </div>
              <a href={PHONE_HREF} data-testid="support-route-action" className={ACTION_CLASS}>
                {PHONE_DISPLAY}
              </a>
            </li>

            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Sales</h3>
                <p className="mt-0.5 text-sm text-ink-40">Pricing, stock and delivery across Lebanon.</p>
              </div>
              <a href={`mailto:${SALES_EMAIL}`} data-testid="support-route-action" className={ACTION_CLASS}>
                {SALES_EMAIL}
              </a>
            </li>

            <li data-testid="support-route" className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <h3 className="text-base font-medium">Support</h3>
                <p className="mt-0.5 text-sm text-ink-40">Orders, returns and anything already bought.</p>
              </div>
              <a href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-route-action" className={ACTION_CLASS}>
                {SUPPORT_EMAIL}
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

        <section aria-labelledby="minn-heading" className="mt-12 border-t border-rule pt-8 pb-16 md:pb-24">
          <h2 id="minn-heading" className="text-base font-semibold">Connect With MINN</h2>
          <p className="mt-1 text-sm text-ink-40">Follow the agency behind this storefront.</p>
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
