// app/(legal)/responsible-gaming/page.tsx
export const dynamic = 'force-static';

export default function ResponsibleGamingPage() {
  return (
    <main className="prose max-w-3xl mx-auto px-4 py-12">
      <h1>Responsible Gaming</h1>
      <p>
        LottoSmartPicker 9000 is committed to promoting responsible play and ensuring that our tools are used for
        informational and entertainment purposes only. Lottery participation should always be fun and voluntary—never
        viewed as a source of income.
      </p>

      <h2>Play Responsibly</h2>
      <ul>
        <li>Set a budget for lottery play and stick to it.</li>
        <li>Never chase losses or try to recover lost money through more play.</li>
        <li>Only play with discretionary funds you can afford to lose.</li>
        <li>Remember that lottery games are games of chance—no system can guarantee a win.</li>
        <li>Take breaks from play if you feel it is no longer enjoyable.</li>
      </ul>

      <h2>Age and Legal Requirements</h2>
      <p>
        You must be at least 18 years old (or the minimum legal age in your jurisdiction) to purchase or play lottery
        games. Users are responsible for ensuring compliance with local laws and age restrictions.
      </p>

      <h2>Need Help?</h2>
      <p>
        If you or someone you know has a gambling problem or is struggling to control lottery play, confidential help is
        available 24/7:
      </p>
      <ul>
        <li>
          <strong>National Council on Problem Gambling (U.S.):</strong>{' '}
          <a
            href="https://www.ncpgambling.org/help-treatment/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ncpgambling.org/help-treatment
          </a>{' '}
          or call{' '}
          <a href="tel:1-800-522-4700" title="Problem Gambling Helpline">
            1-800-522-4700
          </a>
          .
        </li>
        <li>
          <strong>Gamblers Anonymous:</strong>{' '}
          <a
            href="https://www.gamblersanonymous.org/ga/"
            target="_blank"
            rel="noopener noreferrer"
          >
            gamblersanonymous.org
          </a>
        </li>
      </ul>

      <p>
        If you are outside the United States, please consult your national or regional responsible gaming organization
        for local resources and hotlines.
      </p>
    </main>
  );
}
