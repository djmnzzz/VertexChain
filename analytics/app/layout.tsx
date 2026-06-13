import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Layout from '@/components/Layout';
import Providers from '@/app/providers';

export const metadata: Metadata = {
  title: 'VertexChain Analytics',
  description: 'Analytics dashboard for the VertexChain platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
