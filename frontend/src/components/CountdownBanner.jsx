import React, { useState, useEffect } from 'react';
import bannerImage from '../assets/all/macbook m4.png';

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
          src={bannerImage} 
          alt="MacBook M4" 
          className="w-full"
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