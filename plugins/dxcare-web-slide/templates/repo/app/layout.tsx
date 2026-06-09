import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DXCare Slides',
  description: '',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-paper text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
