// app/about/page.tsx
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Lotto Smart Picker',
  description:
    'Our mission: transparent, data-driven lottery analysis. Learn what we provide and how we source and analyze data.',
  alternates: { canonical: 'https://lottosmartpicker.com/about' },
};

const AboutPage = () => {
  return (
    <main className="about-page container mx-auto max-w-3xl px-6 py-10 leading-relaxed">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            name: 'About Lotto Smart Picker',
            url: 'https://lottosmartpicker.com/about',
            description:
              'Mission, methods, and data sources for Lotto Smart Picker.',
            isPartOf: { '@type': 'WebSite', name: 'Lotto Smart Picker', url: 'https://lottosmartpicker.com' },
          }),
        }}
      />
      <h1 className="text-4xl font-bold mb-8 text-center">About LottoSmartPicker 9000</h1>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Our Purpose and Mission</h2>
        <p className="text-lg">
          LottoSmartPicker is dedicated to providing data-driven insights and analytical tools for lottery enthusiasts. Our mission is to empower players with information, helping them make more informed decisions based on historical data and statistical analysis. We believe in transparency and providing a clear understanding of lottery game mechanics.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">What We Provide</h2>
        <p className="text-lg">
          We offer comprehensive analysis for various draw games (like Powerball, Mega Millions, Cash4Life, and GA Fantasy 5) and detailed intelligence for Georgia scratch-off games. Our tools include:
        </p>
        <ul className="list-disc list-inside ml-4 text-lg">
          <li>Era-aware statistical analysis of past draw results.</li>
          <li>Smart ticket generation based on hot/cold numbers and patterns.</li>
          <li>Transparent scoring and ranking of scratch-off games by value.</li>
          <li>Live tracking of remaining top prizes for scratch-off games.</li>
          <li>Insights into data sources and analytical methodologies.</li>
        </ul>
        <p className="text-lg mt-2">
          <strong>Important:</strong> LottoSmartPicker is an analytical and informational platform. We do not facilitate gambling, sell lottery tickets, or guarantee wins. Our tools are for entertainment and informational purposes only.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Transparency in Data and Methodology</h2>
        <p className="text-lg">
          We are committed to transparency. Our draw game data is sourced from public APIs (e.g., Socrata APIs for New York Open Data), and our scratch-off game data is scraped directly from the official Georgia Lottery website. All analysis, including our scratch-off scoring model, is based on publicly available information and clearly defined algorithms. We aim to present this data in an understandable and accessible format.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Contact Information</h2>
        <p className="text-lg">
          If you have any questions, feedback, or concerns, please visit our <Link href="/contact">Contact Page</Link> for ways to get in touch with us.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Responsible Gambling Message</h2>
        <p className="text-lg">
          Lottery games are a form of entertainment, and it's crucial to play responsibly. LottoSmartPicker is designed for individuals 18 years or older. If you or someone you know has a gambling problem, please seek help through nationally recognized resources such as the National Council on Problem Gambling.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Legal and Compliance Notice</h2>
        <p className="text-lg mb-2">
          LottoSmartPicker is an independent analytical platform and is not affiliated with, endorsed by, or officially connected to any state lottery, the Multi-State Lottery Association (MUSL), or any governmental lottery authority. All trademarks and game names are the property of their respective owners.
        </p>
        <p className="text-lg mb-2">
          All information provided by LottoSmartPicker is for educational and entertainment purposes only. While we strive for accuracy, no information on this site should be interpreted as financial, investment, or gambling advice.
        </p>
        <p className="text-lg mb-2">
          Users are responsible for ensuring they comply with the age and eligibility requirements of their jurisdiction before participating in any lottery. Laws and minimum age requirements vary by state and country.
        </p>
        <p className="text-lg">
          or more information about your rights and data protection, please review our{' '}
          <Link href="/terms">Terms of Use</Link> and{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
};

export default AboutPage;