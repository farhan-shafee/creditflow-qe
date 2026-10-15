import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'CreditFlow QE | Engineering Command Center', description: 'A synthetic credit-card ledger with executable Java, Cucumber and API automation evidence.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
