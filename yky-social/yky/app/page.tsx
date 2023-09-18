import YKYSplash from './components/YKYSplash';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'YKY Home',
};  

export default function Page() {
  return (
    <>
    <h1 className="text-3xl font-bold text-center">
      <Link href='/main' className="no-underline text-current">
        YKY
      </Link>
    </h1>
    <Link href='/main'>
      <YKYSplash/>
    </Link>
    </>
  );
}
