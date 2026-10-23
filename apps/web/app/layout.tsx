import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'NEXALID | SmartBiz Cloud',
  description: 'Operasional bisnis, dalam satu kendali.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
