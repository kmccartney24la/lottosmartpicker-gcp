// app/contact/page.tsx
import React from 'react';
import Link from 'next/link';

const ContactPage = () => {
  return (
    <main className="container mx-auto max-w-3xl px-6 py-10 leading-relaxed">
      <h1 className="text-4xl font-bold mb-8 text-center">Contact Us</h1>

      <section className="mb-6">
        <p className="text-lg">
          We appreciate your interest in LottoSmartPicker. If you have any questions, feedback, suggestions, or encounter any issues, please don't hesitate to reach out to us.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">General Inquiries</h2>
        <p className="text-lg">
          For general questions and support, you can email us at:
        </p>
        <p className="text-lg font-semibold mt-2">
          <a href="mailto:support@lottosmartpicker.com">support@lottosmartpicker.com</a>
        </p>
        <p className="text-sm text-muted mt-1">
          Emails are used only to respond to your inquiry and are not shared or added to marketing lists.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Feedback and Suggestions</h2>
        <p className="text-lg">
          Your feedback is valuable as it helps us improve LottoSmartPicker. Please feel free to send us your thoughts on how we can enhance your experience or add new features.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">More Information</h2>
        <p className="text-lg">
          To learn more about our mission, what we offer, and our data methodologies, please visit our <Link href="/about">About Us page</Link>.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Responsible Gambling</h2>
        <p className="text-lg">
          If you have concerns about responsible gambling or need help resources, please visit our{' '}
          <Link href="/legal/responsible-gaming">Responsible Gaming page</Link>{' '}
          or see the links on our{' '}
          <Link href="/about">About Us page</Link>. You can also review our{' '}
          <Link href="/legal/terms">Terms of Use</Link> for more details about responsible play and compliance.
        </p>
      </section>
    </main>
  );
};

export default ContactPage;