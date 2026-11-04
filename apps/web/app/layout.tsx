import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const inter = localFont({ src: './fonts/InterVariable.woff2', display: 'swap', variable: '--font-ui', weight: '100 900' });
export const metadata: Metadata = { title: 'CreditFlow QE | Engineering Command Center', description: 'A synthetic credit-card ledger with executable Java, Cucumber and API automation evidence.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={inter.variable}><body>{children}</body></html>;
}
