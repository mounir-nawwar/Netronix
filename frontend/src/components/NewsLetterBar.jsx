import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const NewsLetterBar = ({
  position = 'left-0',
  heading = 'Newsletter',
  showSocial = true,
  socialLinks = [
    { platform: 'facebook', url: '#', icon: 'facebook' },
    { platform: 'instagram', url: '#', icon: 'instagram' },
    { platform: 'twitter', url: '#', icon: 'twitter' }
  ],
  mobileDisabled = false,
  mobileHideSocial = true,
  onClick = () => { }
}) => {
  const socialIconsRef = useRef([]);

  useEffect(() => {
    // Magnetic effect for social icons
    const handleMagneticEffect = (e, element) => {
      const bound = element.getBoundingClientRect();
      const magnetStrength = 25;

      const x = ((e.clientX - bound.left) / element.offsetWidth - 0.5) * magnetStrength;
      const y = ((e.clientY - bound.top) / element.offsetHeight - 0.5) * magnetStrength;

      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const handleMouseLeave = (element) => {
      element.style.transform = 'translate3d(0, 0, 0)';
    };

    const attached = [];
    socialIconsRef.current.forEach((icon) => {
      if (!icon) return;
      const onMove = (event) => handleMagneticEffect(event, icon);
      const onLeave = () => handleMouseLeave(icon);
      icon.addEventListener('mousemove', onMove);
      icon.addEventListener('mouseleave', onLeave);
      attached.push({ icon, onMove, onLeave });
    });

    // TEST-002 — the cleanup read `socialIconsRef.current` *at cleanup time*,
    // which React warns about because by then the ref may point at different
    // nodes than the ones the listeners were attached to. Worse, it passed
    // brand-new arrow functions to `removeEventListener`, which therefore
    // removed nothing at all: every remount leaked two listeners per icon.
    // The nodes and their exact handlers are captured here instead.
    const icons = attached;

    return () => {
      icons.forEach(({ icon, onMove, onLeave }) => {
        icon.removeEventListener('mousemove', onMove);
        icon.removeEventListener('mouseleave', onLeave);
      });
    };
  }, []);

  // Social media icons
  const renderSocialIcon = (platform) => {
    switch (platform) {
      case 'facebook':
        return (
          <svg viewBox="0 0 24 24" stroke="none" fill="currentColor">
            <path d="M9.03153 23L9 13H5V9H9V6.5C9 2.7886 11.2983 1 14.6091 1C16.1951 1 17.5581 1.11807 17.9553 1.17085V5.04948L15.6591 5.05052C13.8584 5.05052 13.5098 5.90614 13.5098 7.16171V9H18.75L16.75 13H13.5098V23H9.03153Z" />
          </svg>
        );
      case 'instagram':
        return (
          <svg viewBox="0 0 24 24" stroke="none" fill="currentColor">
            <path d="M12 2.98C14.94 2.98 15.28 2.99 16.44 3.04C17.14 3.04 17.83 3.18 18.48 3.42C18.96 3.6 19.39 3.88 19.75 4.24C20.12 4.59 20.4 5.03 20.57 5.51C20.81 6.16 20.94 6.85 20.95 7.55C21 8.71 21.01 9.06 21.01 12C21.01 14.94 21 15.28 20.95 16.44C20.95 17.14 20.81 17.83 20.57 18.48C20.39 18.95 20.11 19.39 19.75 19.75C19.39 20.11 18.96 20.39 18.48 20.57C17.83 20.81 17.14 20.94 16.44 20.95C15.28 21 14.93 21.01 12 21.01C9.07 21.01 8.72 21 7.55 20.95C6.85 20.95 6.16 20.81 5.51 20.57C5.03 20.39 4.6 20.11 4.24 19.75C3.87 19.4 3.59 18.96 3.42 18.48C3.18 17.83 3.05 17.14 3.04 16.44C2.99 15.28 2.98 14.93 2.98 12C2.98 9.07 2.99 8.72 3.04 7.55C3.04 6.85 3.18 6.16 3.42 5.51C3.6 5.03 3.88 4.6 4.24 4.24C4.59 3.87 5.03 3.59 5.51 3.42C6.16 3.18 6.85 3.05 7.55 3.04C8.71 2.99 9.06 2.98 12 2.98ZM12 1C9.01 1 8.64 1.01 7.47 1.07C6.56 1.09 5.65 1.26 4.8 1.58C4.07 1.86 3.4 2.3 2.85 2.85C2.3 3.41 1.86 4.07 1.58 4.8C1.26 5.65 1.09 6.56 1.07 7.47C1.02 8.64 1 9.01 1 12C1 14.99 1.01 15.36 1.07 16.53C1.09 17.44 1.26 18.35 1.58 19.2C1.86 19.93 2.3 20.6 2.85 21.15C3.41 21.7 4.07 22.14 4.8 22.42C5.65 22.74 6.56 22.91 7.47 22.93C8.64 22.98 9.01 23 12 23C14.99 23 15.36 22.99 16.53 22.93C17.44 22.91 18.35 22.74 19.2 22.42C19.93 22.14 20.6 21.7 21.15 21.15C21.7 20.59 22.14 19.93 22.42 19.2C22.74 18.35 22.91 17.44 22.93 16.53C22.98 15.36 23 14.99 23 12C23 9.01 22.99 8.64 22.93 7.47C22.91 6.56 22.74 5.65 22.42 4.8C22.14 4.07 21.7 3.4 21.15 2.85C20.59 2.3 19.93 1.86 19.2 1.58C18.35 1.26 17.44 1.09 16.53 1.07C15.36 1.02 14.99 1 12 1ZM12 6.35C10.88 6.35 9.79 6.68 8.86 7.3C7.93 7.92 7.21 8.8 6.78 9.84C6.35 10.87 6.24 12.01 6.46 13.1C6.68 14.2 7.22 15.2 8.01 15.99C8.8 16.78 9.81 17.32 10.9 17.54C12 17.76 13.13 17.65 14.16 17.22C15.19 16.79 16.07 16.07 16.7 15.14C17.32 14.21 17.65 13.12 17.65 12C17.65 10.5 17.05 9.06 16 8.01C14.94 6.95 13.5 6.36 12.01 6.36L12 6.35ZM12 15.67C11.27 15.67 10.57 15.45 9.96 15.05C9.36 14.65 8.89 14.07 8.61 13.4C8.33 12.73 8.26 11.99 8.4 11.28C8.54 10.57 8.89 9.92 9.4 9.4C9.91 8.88 10.57 8.54 11.28 8.4C11.99 8.26 12.73 8.33 13.4 8.61C14.07 8.89 14.64 9.36 15.05 9.96C15.45 10.56 15.67 11.27 15.67 12C15.67 12.97 15.28 13.91 14.6 14.59C13.91 15.28 12.98 15.66 12.01 15.66L12 15.67ZM17.87 7.45C18.6 7.45 19.19 6.86 19.19 6.13C19.19 5.4 18.6 4.81 17.87 4.81C17.14 4.81 16.55 5.4 16.55 6.13C16.55 6.86 17.14 7.45 17.87 7.45Z" />
          </svg>
        );
      case 'twitter':
        return (
          <svg viewBox="0 0 24 24" stroke="none" fill="currentColor">
            <path d="M13.8984 10.4679L21.3339 2H19.5687L13.1074 9.35221L7.95337 2H2L9.80183 13.1157L2 22H3.7652L10.5845 14.2315L16.03 22H21.9833M4.398 3.29892H7.10408L19.5687 20.7594H16.8626" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`
      newsletter-bar
      z-30
      fixed
      ${position}
      grid
      gap-3
      rounded-full
      ${mobileDisabled ? 'hidden md:grid' : ''}
      ${mobileHideSocial ? 'sm:without-social' : ''}
      bg-white
      backdrop-blur-md
      border
      border-gray-200
      transition-transform
      duration-300
      ease-out
      hover:shadow-lg
    `} style={{ 
        opacity: 0,
        animation: 'navbarFadeIn 5s ease-in-out forwards'
    }}>
      {showSocial && (
        <div className={`newsletter-bar__social ${mobileHideSocial ? 'hidden md:block' : ''}`}>
          <ul className="flex flex-col items-center p-0 m-0 list-none">
            {socialLinks.map((link, index) => (
              <li key={index} className="mb-1 last:mb-0 max-w-6 ">
                <a
                  ref={el => socialIconsRef.current[index] = el}
                  href={link.url}
                  className="social_platform text-black transition-all duration-300 ease-out"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Follow us on ${link.platform}`}
                >
                  {renderSocialIcon(link.platform)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {heading && (
        <button
          onClick={onClick}
          className="newsletter-bar__button flex items-center justify-center text-xs tracking-wider uppercase rounded-full cursor-pointer transition-all duration-300 ease-out hover:bg-black/10"
        >
          <span className="transform transition-transform duration-300">{heading}</span>
        </button>
      )}
    </div>
  );
};

NewsLetterBar.propTypes = {
  position: PropTypes.string,
  heading: PropTypes.string,
  showSocial: PropTypes.bool,
  socialLinks: PropTypes.arrayOf(PropTypes.shape({
    platform: PropTypes.string,
    url: PropTypes.string,
    icon: PropTypes.string,
  })),
  mobileDisabled: PropTypes.bool,
  mobileHideSocial: PropTypes.bool,
  onClick: PropTypes.func,
};

export default NewsLetterBar; 