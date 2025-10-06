// app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="grid" style={{ padding: 24 }}>
      <h1>LottoSmartPicker</h1>
      <p>Welcome back. Try the Scratchers view:</p>
      <p><Link href="/scratchers">Go to Scratchers</Link></p>
    </main>
  );
}
