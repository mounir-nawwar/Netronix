import { useState, useEffect } from 'react';
// PERF-004 — a 241 kB 1555×600 PNG became a 25 kB WebP, with an 11 kB copy
// for narrow viewports. Explicit dimensions keep the strip from reflowing the
// countdown that sits on top of it.
import banner800 from '../assets/optimised/countdown-banner-800.webp';
import banner1555 from '../assets/optimised/countdown-banner-1555.webp';

const CountdownBanner = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 28,
    hours: 5,
    minutes: 24,
    seconds: 26
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prevTime => {
        const newSeconds = prevTime.seconds - 1;
        const newMinutes = newSeconds < 0 ? prevTime.minutes - 1 : prevTime.minutes;
        const newHours = newMinutes < 0 ? prevTime.hours - 1 : prevTime.hours;
        const newDays = newHours < 0 ? prevTime.days - 1 : prevTime.days;

        return {
          days: newDays,
          hours: newHours < 0 ? 23 : newHours,
          minutes: newMinutes < 0 ? 59 : newMinutes,
          seconds: newSeconds < 0 ? 59 : newSeconds
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-t-3xl">
      {/* Banner Image with Overlay */}
      <div className="relative w-full">
        <img
          src={banner1555}
          srcSet={`${banner800} 800w, ${banner1555} 1555w`}
          sizes="100vw"
          alt="MacBook M4"
          width={1555}
          height={600}
          className="w-full"
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* Countdown Timer and Button - Centered at Bottom */}
      <div className="absolute -bottom-4 md:bottom-0 left-1/2 -translate-x-1/2 text-white z-10 text-center w-full md:w-auto">
        <div className="flex justify-center gap-2 sm:gap-4 md:gap-8 mb-4 md:mb-8 font-michroma px-2">
          <div className="text-center">
            <div className="text-sm sm:text-2xl md:text-4xl">{timeLeft.days}</div>
            <div className="text-[8px] sm:text-xs md:text-sm uppercase mt-0.5 md:mt-1">Days</div>
          </div>
          <div className="text-xl sm:text-2xl md:text-4xl self-start">:</div>
          <div className="text-center">
            <div className="text-sm sm:text-2xl md:text-4xl">{timeLeft.hours.toString().padStart(2, '0')}</div>
            <div className="text-[8px] sm:text-xs md:text-sm uppercase mt-0.5 md:mt-1">Hours</div>
          </div>
          <div className="text-xl sm:text-2xl md:text-4xl self-start">:</div>
          <div className="text-center">
            <div className="text-sm sm:text-2xl md:text-4xl">{timeLeft.minutes.toString().padStart(2, '0')}</div>
            <div className="text-[8px] sm:text-xs md:text-sm uppercase mt-0.5 md:mt-1">Mins</div>
          </div>
          <div className="text-xl sm:text-2xl md:text-4xl self-start">:</div>
          <div className="text-center">
            <div className="text-sm sm:text-2xl md:text-4xl">{timeLeft.seconds.toString().padStart(2, '0')}</div>
            <div className="text-[8px] sm:text-xs md:text-sm uppercase mt-0.5 md:mt-1">Secs</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CountdownBanner;