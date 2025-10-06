// app/(legal)/privacy/page.tsx
export const dynamic = 'force-static';

export default function PrivacyPage() {
  const today = new Date().toISOString().slice(0,10);
  return (
    <main className="prose max-w-3xl mx-auto px-4 py-12">
      <h1>Privacy Policy</h1>
      <p><em>Last updated: {today}</em></p>
      <p>LottoSmartPicker 9000 (“we”, “us”, “our”) provides lottery analysis tools for informational and entertainment use only. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website.</p>

      <h2>1. Information We Collect</h2>
      <p>We collect minimal information necessary for the operation and improvement of our services. This includes:</p>
      <ul>
        <li><strong>Essential Site Data:</strong> Non-personally identifiable information related to site security, performance, and basic functionality (e.g., IP address, browser type, device information). This data is processed to ensure our website functions correctly and securely.</li>
        <li><strong>Analytics Data:</strong> With your explicit consent, we collect data about your interaction with our website (e.g., pages visited, time spent on pages, clicks). This helps us understand user behavior and improve our services.</li>
        <li><strong>Advertising Data:</strong> With your explicit consent, we collect data to facilitate personalized advertising (e.g., ad impressions, interactions). This allows us to show you more relevant advertisements.</li>
      </ul>
      <p><strong>Sensitive data:</strong> We do not knowingly collect or process sensitive personal information.</p>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect for the following purposes:</p>
      <ul>
        <li>To operate, maintain, and improve our website and services.</li>
        <li>To analyze how users interact with our site, with your consent.</li>
        <li>To display personalized advertisements, with your consent.</li>
        <li>To detect, prevent, and address technical issues and security incidents.</li>
      </ul>

      <h2>3. Cookies and Tracking Technologies</h2>
      <p>We use cookies and similar tracking technologies to enhance your experience and for advertising and analytics purposes. These include:</p>
      <ul>
        <li><strong>Essential Cookies:</strong> Necessary for the website to function and cannot be switched off.</li>
        <li><strong>Analytics Cookies:</strong> With your consent, these help us understand how visitors interact with our website by collecting and reporting information anonymously.</li>
        <li><strong>Advertising Cookies:</strong> With your consent, these are used to make advertising messages more relevant to you. They perform functions like preventing the same ad from continuously reappearing, ensuring that ads are properly displayed, and in some cases selecting advertisements that are based on your interests.</li>
      </ul>
      <p>You can manage your cookie preferences at any time through our Consent Management Platform (CMP) or your browser settings. Until you give consent, Consent Mode restricts advertising and analytics storage as described below.</p>

      <h2>4. Third-Party Advertising (Google AdSense)</h2>
      <p>We partner with Google AdSense to display advertisements on our website. Google AdSense, as a third-party vendor, uses cookies to serve ads based on your prior visits to our website or other websites. This enables Google and its partners to serve ads to you based on your visit to our site and/or other sites on the Internet.</p>
      <ul>
        <li>Google's use of advertising cookies enables it and its partners to serve ads to your users based on their visit to your sites and/or other sites on the Internet.</li>
        <li>You may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google's Ad Settings</a>. Alternatively, you can opt out of some third-party vendors’ uses of cookies for personalized advertising by visiting <a href="http://www.aboutads.info/choices" target="_blank" rel="noopener noreferrer">www.aboutads.info</a>.</li>
      </ul>
      <p>For more information on how Google uses data, please visit <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">Google's Privacy & Terms site</a>.</p>

      <h2>5. Consent Management</h2>
      <p>We use a Google-certified Consent Management Platform (CMP) to manage your consent preferences. Until you give consent, Google Consent Mode v2 sets <code>ad_storage</code>, <code>analytics_storage</code>, <code>ad_user_data</code>, and <code>ad_personalization</code> to <strong>denied</strong>. You can modify your consent choices at any time via the CMP interface, which can typically be accessed through a link in our website footer.</p>

      <h2>6. Data Sharing and Disclosure</h2>
      <p>We do not sell your personal information. We may share your information with:</p>
      <ul>
        <li><strong>Service Providers:</strong> Third-party vendors, consultants, and other service providers who perform services for us or on our behalf (e.g., hosting, analytics, advertising).</li>
        <li><strong>Legal Requirements:</strong> When required by law or in response to valid requests by public authorities (e.g., a court order or government agency).</li>
      </ul>

      <h2>7. Data Retention</h2>
      <p>We retain information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. If consented, analytics and advertising data are aggregated or deleted when no longer needed for their intended purpose.</p>

      <h2>8. Your Data Protection Rights (GDPR & CCPA)</h2>
      <p>Depending on your location, you may have the following rights regarding your personal data:</p>
      <ul>
        <li><strong>Right to Access:</strong> You have the right to request copies of your personal data.</li>
        <li><strong>Right to Rectification:</strong> You have the right to request that we correct any information you believe is inaccurate or complete information you believe is incomplete.</li>
        <li><strong>Right to Erasure:</strong> You have the right to request that we erase your personal data, under certain conditions.</li>
        <li><strong>Right to Restrict Processing:</strong> You have the right to request that we restrict the processing of your personal data, under certain conditions.</li>
        <li><strong>Right to Object to Processing:</strong> You have the right to object to our processing of your personal data, under certain conditions.</li>
        <li><strong>Right to Data Portability:</strong> You have the right to request that we transfer the data that we have collected to another organization, or directly to you, under certain conditions.</li>
        <li><strong>Right to Withdraw Consent:</strong> You have the right to withdraw your consent at any time where LottoSmartPicker 9000 relied on your consent to process your personal information.</li>
      </ul>
      <p>To exercise any of these rights, please contact us using the details provided below. We will respond to your request within one month (or as required by applicable law).</p>

      <h2>9. U.S. State Privacy Rights (e.g., CA, CO, CT, VA, UT)</h2>
      <p>If you are a resident of a U.S. state with a comprehensive privacy law, you may have the rights described above (access, deletion, correction, portability) and the right to opt out of <em>sale</em> or <em>sharing</em> of personal information (including cross-context behavioral advertising). We do not sell personal information for money. Where our use of advertising cookies constitutes “sharing” under certain state laws, you can opt out via our CMP and the AdChoices tools linked above.</p>
      <p>You may submit rights requests by emailing <a href="mailto:support@lottosmartpicker.com">support@lottosmartpicker.com</a>. If we deny your request, you may appeal by replying to our decision email and stating “Privacy Request Appeal.”</p>

      <h2>10. Children’s Privacy</h2>
      <p>Our website is intended for individuals aged 18 and older and is not directed to children under 13. We do not knowingly collect personal information from children under 13 (or under 16 where applicable). If you believe a child has provided us personal information, please contact us and we will delete it.</p>

      <h2>11. Do Not Track</h2>
      <p>Some browsers offer a “Do Not Track” (DNT) signal. Because there is no common standard, our site does not respond to DNT at this time. We honor your choices made through our CMP and the opt-outs referenced above.</p>

      <h2>12. Security</h2>
      <p>We implement reasonable administrative, technical, and organizational measures designed to protect your information. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</p>

      <h2>13. International Data Transfers</h2>
      <p>We are based in the United States. If you access the site from outside the U.S., your information may be processed in the U.S. and other countries which may have data protection laws different from those in your jurisdiction.</p>

      <h2>14. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. The “Last updated” date at the top indicates when this Policy was last revised. Material changes will be posted on this page.</p>

      <h2>15. Contact Us</h2>
      <p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
      <p>Email: support@lottosmartpicker.com</p>
    </main>
  );
}
