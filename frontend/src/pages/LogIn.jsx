import { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from '../lib/toast';

import { ShopContext } from '../context/shopContext';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import { IoMailOutline, IoLockClosedOutline, IoPersonOutline, IoArrowForwardOutline } from "react-icons/io5";
import Seo from '../components/Seo';
import { CONTACT_EMAIL, buildMailto } from '../lib/contact';

const LogIn = () => {
  const [currentState, setCurrentState] = useState('Login');
  // FE-009 — signing in goes through `applySession`, which merges whatever this
  // browser had in its guest cart before it hands over. The old path set the
  // token and let an effect call `getUserCart`, which replaced local state
  // wholesale: everything chosen before signing in was discarded at exactly the
  // moment the customer committed to the site, with no message.
  const { token, applySession, navigate } = useContext(ShopContext);
  const location = useLocation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    
    try {
      const nextToken = currentState === 'Sign Up'
        ? await authApi.register({ name, email, password })
        : await authApi.login({ email, password });

      if (!nextToken) {
        toast.error('We could not sign you in. Please try again.');
        return;
      }

      if (currentState === 'Sign Up') toast.success('Account created.');
      await applySession(nextToken);
    } catch (error) {
      // The server's own message, not "Request failed with status code 401".
      toast.error(error instanceof ApiError ? error.message : 'We could not sign you in.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Back to wherever the guard sent them from, or home (FE-021).
    if (token) navigate(location.state?.from ?? '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const signingIn = currentState === 'Login';

  const field = 'w-full border border-rule bg-paper px-4 py-3 pl-11 text-sm text-ink transition-colors placeholder:text-ink-40 focus:border-ink focus:outline-none';
  const labelClass = 'mb-2 block font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40';
  const iconClass = 'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-ink-40';

  return (
    <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
      <Seo title="Sign in" description="Sign in to your Netronix account, or create one." />

      <div className="mx-auto max-w-[420px] pt-[104px] md:pt-[132px]">
        <div className="flex items-center gap-3">
          <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
            Netronix / Account
          </span>
          <span className="h-px flex-1 bg-rule" />
        </div>

        <h1
          className="mt-5 font-michroma uppercase leading-[0.95] tracking-tight text-ink"
          style={{ fontSize: 'clamp(1.75rem, 5vw, 2.75rem)' }}
        >
          {signingIn ? 'Welcome back' : 'Create account'}
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-ink-60">
          {signingIn
            ? 'Sign in to see your orders and your wishlist. You do not need an account to buy — checkout works as a guest.'
            : 'An account keeps your order history and your wishlist. Buying as a guest works without one.'}
        </p>

        <form onSubmit={onSubmitHandler} className="mt-10">
          {!signingIn && (
            <div className="mb-6">
              <label className={labelClass} htmlFor="name">Full Name</label>
              <div className="relative">
                <span className={iconClass}>
                  <IoPersonOutline aria-hidden="true" className="h-4 w-4" />
                </span>
                <input
                  id="name"
                  type="text"
                  className={field}
                  placeholder="Rania Aoun"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className={labelClass} htmlFor="email">Email Address</label>
            <div className="relative">
              <span className={iconClass}>
                <IoMailOutline aria-hidden="true" className="h-4 w-4" />
              </span>
              <input
                id="email"
                type="email"
                className={field}
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-8">
            <label className={labelClass} htmlFor="password">Password</label>
            <div className="relative">
              <span className={iconClass}>
                <IoLockClosedOutline aria-hidden="true" className="h-4 w-4" />
              </span>
              <input
                id="password"
                type="password"
                className={field}
                placeholder="••••••••"
                required
                autoComplete={signingIn ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* What used to sit here were three controls that went nowhere: a
              "Forgot Password?" `<a>` with no `href` and no handler, and
              "Terms" and "Privacy Policy" as bare `<span>`s with
              `cursor-pointer` — styled as links, pointing at routes that do not
              exist. The same defect the product card's "Quick view" and
              "Add to wishlist" buttons were: an affordance for a feature nobody
              built.

              There is no password-reset endpoint on this API, so the honest
              version of "forgot password" is an address, offered as an address.

              It said "and a person will help" until now, which was a promise
              about someone else's behaviour that this page cannot make — the
              same species of claim as the star ratings and the invented
              shipping times other passes removed. Where the mail goes is a
              fact; what happens next is not. */}
          <button
            type="submit"
            disabled={isLoading}
            className={`flex w-full items-center justify-center gap-2 py-4 font-michroma text-[10px] uppercase tracking-[0.18em] transition-colors duration-300 ${
              isLoading ? 'cursor-not-allowed bg-wash text-ink-40' : 'bg-ink text-paper hover:bg-statepurp'
            }`}
          >
            {isLoading && (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent"
              />
            )}
            {signingIn ? 'Sign In' : 'Create Account'}
            <IoArrowForwardOutline aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </form>

        <div className="mt-8 border-t border-rule pt-6 text-sm text-ink-60">
          <p>
            {signingIn ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => setCurrentState(signingIn ? 'Sign Up' : 'Login')}
              className="rule-draw pb-0.5 text-ink transition-colors hover:text-statepurp"
            >
              {signingIn ? 'Sign Up' : 'Sign In'}
            </button>
          </p>

          {signingIn && (
            <p className="mt-4 text-xs text-ink-40">
              Locked out? Write to{' '}
              <a
                href={buildMailto({ to: CONTACT_EMAIL, subject: 'Account access' })}
                className="rule-draw pb-0.5 text-ink-60 transition-colors hover:text-ink"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogIn
