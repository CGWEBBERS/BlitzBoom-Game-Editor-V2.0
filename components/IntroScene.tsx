
import React, { useEffect, useState } from 'react';

interface IntroSceneProps {
  onComplete: () => void;
}

const IntroScene: React.FC<IntroSceneProps> = ({ onComplete }) => {
  const [animationStarted, setAnimationStarted] = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    // Show text after a short delay for effect
    const textTimeout = setTimeout(() => setShowText(true), 500);
    // Start progress bar animation
    const animTimeout = setTimeout(() => setAnimationStarted(true), 100);
    // Trigger completion after the animation has run
    const completeTimeout = setTimeout(onComplete, 4500);

    return () => {
      clearTimeout(textTimeout);
      clearTimeout(animTimeout);
      clearTimeout(completeTimeout);
    };
  }, [onComplete]);

  return (
    <div 
      className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center text-white transition-opacity duration-500"
      style={{
        background: 'radial-gradient(ellipse at center, #1e3a8a 0%, #111827 70%)',
      }}
    >
      <div className={`text-center transition-opacity duration-1000 ${showText ? 'opacity-100' : 'opacity-0'}`}>
        <h1 
          className="text-7xl font-bold tracking-widest uppercase"
          style={{ animation: 'glow 2s ease-in-out infinite, flicker 3s linear 1' }}
        >
          BlitzBoom
        </h1>
        <p className="text-2xl font-light tracking-[0.3em] uppercase opacity-80 mt-2">
          Game Editor
        </p>
      </div>

      <div className="absolute bottom-16 w-80 h-2 bg-cyan-900/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-[4000ms] ease-in-out"
          style={{ 
            width: animationStarted ? '100%' : '0%',
            boxShadow: '0 0 10px #67e8f9, 0 0 15px #c084fc',
          }}
        />
      </div>
    </div>
  );
};

export default IntroScene;
