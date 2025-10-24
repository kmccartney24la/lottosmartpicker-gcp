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
        {/* Support / Ko-fi */}
      <div className="footer-donate" role="complementary" aria-label="Support this site">
        <p className="footer-donate-text">
          Buy me a coffee on <strong>Ko-fi</strong> when you win big! Good luck!
        </p>
        <a
          href="https://ko-fi.com/kmccartney"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-support"
          aria-label="Support on Ko-fi (opens in a new tab)"
        >
          {/* simple heart mug icon (inline SVG so it inherits currentColor) */}
          <svg className="btn-support__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A2.5 2.5 0 0 1 17 6.5v.75h1.25A2.75 2.75 0 0 1 21 10v.5A3.5 3.5 0 0 1 17.5 14H17v.5A3.5 3.5 0 0 1 13.5 18h-8A2.5 2.5 0 0 1 3 15.5v-9Zm2.5-.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h8A2 2 0 0 0 15.5 14v-7a.5.5 0 0 0-.5-.5h-9Zm13 3.75H17V12h.5A1.5 1.5 0 0 0 19 10.5v-.25ZM9.5 9.25c.7-.76 2.02-.76 2.72 0l.28.3.28-.3c.7-.76 2.02-.76 2.72 0 .73.79.71 2-.06 2.77l-2.94 2.94a.75.75 0 0 1-1.06 0L8.84 12.02c-.77-.77-.79-1.98-.06-2.77Z" />
          </svg>
          <span className="btn-support__text">Support on Ko-fi</span>
        </a>
      </div>
      </div>
    </footer>
  );
}
