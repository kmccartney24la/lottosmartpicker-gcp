// app/layout.tsx
import './styles/globals.css';

export const metadata = {
  title: 'LottoSmartPicker 9000',
  description: 'Lottery statistics and scratchers insights',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
