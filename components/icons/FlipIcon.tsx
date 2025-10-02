import React from 'react';

const FlipIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3v18"/>
    <path d="M4 7h8"/>
    <path d="M4 12h8"/>
    <path d="M4 17h8"/>
    <path d="m20 7-4 5 4 5"/>
  </svg>
);

export default FlipIcon;
