import React from 'react';
import Image from 'next/image';

const YKYSplash: React.FC = () => {
    return (
      <div className="flex flex-col items-center justify-center flex-grow py-2">
        <Image width={500} height={500} src="/YKY_Pixels.png" alt="Logo Splash"/>
      </div>
    );
};

export default YKYSplash;