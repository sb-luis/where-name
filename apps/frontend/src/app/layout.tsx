import type { Metadata, Viewport } from 'next';
import { GeoDataProvider } from '@/lib/geo/GeoDataContext';
import { SocketProvider } from '@/lib/multiplayer/SocketContext';
import { GameProvider } from '@/lib/game/GameContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'guess the country',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <SocketProvider>
          <GeoDataProvider>
            <GameProvider>{children}</GameProvider>
          </GeoDataProvider>
        </SocketProvider>
      </body>
    </html>
  );
}
