'use client';

import React from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const YKYProfilePhoto: React.FC = () => {
    const { data, error: _error, isLoading:_iL } = useSWR(`/dogetmediakey`, fetcher);

    return (
      <div className="flex flex-col flex-grow items-center justify-center py-2">
        <img width={500} height={"auto"} src={data?.url === undefined ? '/YKY_Pixels.png' : data?.url} alt="Profile Photo"/>
      </div>
    );
};

export default YKYProfilePhoto;