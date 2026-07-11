import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI API Integration Generator',
  description: 'Paste an OpenAPI/Postman/GraphQL spec, get typed Axios services + React Query hooks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
