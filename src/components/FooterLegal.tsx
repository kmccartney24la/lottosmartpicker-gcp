// src/components/FooterLegal.tsx
// server component (no "use client")
import './FooterLegal.css';
export default function FooterLegal() {
  return (
    <footer className="footer-legal">
      <div className="footer-legal__inner">
        <div className="footer-legal__content">
          <p id="footer-legal-text" className="footer-legal-text">
            <strong>Disclaimer:</strong> LottoSmartPicker is an independent analytical platform and is not affiliated with, endorsed by, or officially connected to any state lottery, the Multi-State Lottery Association (MUSL), or any governmental lottery authority. All trademarks and game names are the property of their respective owners.
          </p>
          <p className="footer-legal-text footer-legal-subtext">
            All information is provided for educational and entertainment purposes only and should not be construed as financial, investment, or gambling advice. Users are responsible for complying with the age and eligibility requirements in their jurisdiction; laws and minimum age thresholds vary by state and country. If you or someone you know has a gambling problem, help is available at&nbsp;
            <a
              className="footer-legal-link"
              href="https://www.ncpgambling.org/"
              target="_blank"
              rel="noopener noreferrer"
              title="National Council on Problem Gambling"
            >
              ncpgambling.org
            </a>
            &nbsp;or by calling&nbsp;
            <a className="footer-legal-link" href="tel:1-800-522-4700" title="Problem Gambling Helpline">
              1-800-522-4700
            </a>
            .
          </p>
          </div>
        {/* Links row + brand are in one row so the brand can match the links block height */}
        <div className="footer-legal__links-row">
          <nav className="footer-legal-nav" aria-label="Site links" aria-describedby="footer-legal-text">
            <ul className="footer-legal-list" role="list">
              <li className="footer-legal-item"><a href="/privacy" className="footer-legal-link">Privacy Policy</a></li>
              <li className="footer-legal-item"><a href="/about" className="footer-legal-link">About Us</a></li>
              <li className="footer-legal-item"><a href="/terms" className="footer-legal-link">Terms of Use</a></li>
              <li className="footer-legal-item"><a href="/contact" className="footer-legal-link">Contact</a></li>
              <li className="footer-legal-item">
                <a
                  href="/responsible-gaming"
                  className="footer-legal-link"
                  title="Learn about responsible play and get help resources"
                >
                  Responsible Gaming
                </a>
              </li>
            </ul>
          </nav>
          {/* Brand image aligns to the links row height and right edge */}
          <div className="footer-legal__brand" aria-hidden="true">
            <img src="/brand/logo-full.svg" alt="" className="footer-legal__brand-img" />
          </div>
        </div>
      </div>
    </footer>
  );
}
