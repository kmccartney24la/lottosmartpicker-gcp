
'use client';
export default function Info({ tip }: { tip: string }) {
  return (
    <span className="help" role="button" aria-label={tip} tabIndex={0} data-tip={tip}>i</span>
  );
}
