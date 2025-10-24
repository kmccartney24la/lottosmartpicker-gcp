// app/(legal)/terms/page.tsx
export const dynamic = 'force-static';

export default function TermsPage() {
  const today = new Date().toISOString().slice(0,10);
  return (
    <main className="prose max-w-3xl mx-auto px-4 py-12">
      <h1>Terms of Use</h1>
      <p><em>Last updated: {today}</em></p>
      <h2>1. Entertainment-Only</h2>
      <p>
        LottoSmartPicker 9000 provides descriptive analytics, statistical summaries, and heuristics for lottery games.
        All content is for informational and entertainment purposes only. We do not predict outcomes, guarantee results,
        or provide any financial or gambling advice.
      </p>

      <h2>2. Eligibility and Legal Use</h2>
      <p>
        This site is intended for users aged 18 years or older (or the minimum legal age in their jurisdiction). Users are
        responsible for ensuring compliance with all applicable local laws and age restrictions regarding lottery
        participation.
      </p>

      <h2>3. Affiliations</h2>
      <p>
        LottoSmartPicker is an independent analytical platform and is not affiliated with, endorsed by, or officially
        connected to any state lottery, the Multi-State Lottery Association (MUSL), or any governmental lottery authority.
        All trademarks and game names are the property of their respective owners.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>
        You agree not to use this website in any way that violates applicable law or regulation, including but not limited
        to attempting to scrape, copy, reverse-engineer, interfere with, or disrupt the site or its services. Automated
        data collection, spam, or any activity that could impair performance is prohibited.
      </p>

      <h2>5. Intellectual Property</h2>
      <p>
        All text, design, and code on this website are protected by intellectual property laws. You may view and print
        content for personal, non-commercial use only. Reproduction, redistribution, or commercial use requires prior
        written permission.
      </p>

      <h2>6. Limitation of Liability</h2>
      <p>
        This website and all content are provided “as is” without warranties of any kind. We are not liable for any direct,
        indirect, incidental, consequential, or special damages arising from or in connection with your use of this site,
        including gambling or financial losses.
      </p>

      <h2>7. External Links</h2>
      <p>
        Our site may contain links to third-party websites. We are not responsible for the content, accuracy, or practices
        of any linked sites. The inclusion of any link does not imply endorsement.
      </p>

      <h2>8. Privacy</h2>
      <p>
        Your use of this site is also governed by our <a href="/privacy">Privacy Policy</a>, which explains how we collect
        and process data. By using this site, you consent to such processing and warrant that all data provided by you is
        accurate.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may revise these Terms of Use from time to time. The “Last updated” date above indicates when this page was
        last changed. Continued use of the website following any changes constitutes acceptance of those modifications.
      </p>

      <h2>10. Governing Law and Jurisdiction</h2>
      <p>
        These Terms are governed by the laws of the United States and the State of Georgia, without regard to conflict of
        law principles. Any disputes arising from or related to the use of this site shall be resolved exclusively in the
        courts located in Georgia, United States.
      </p>

      <h2>11. Contact</h2>
      <p>
        If you have questions about these Terms, please contact us at <a href="mailto:support@lottosmartpicker.com">support@lottosmartpicker.com</a>.
      </p>
    </main>
  );
}
