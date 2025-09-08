'use client';
import { useState } from 'react';
import { GameKey, getCurrentEraConfig, fetchRowsWithCache, rowsToCSV } from '@lib/lotto';

export default function ExportCsvButton({
  game,
  className,
}: {
  game: GameKey;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    const since = getCurrentEraConfig(game).start;

    try {
      // Try client-side export from cache/fetchRowsWithCache
      const rows = await fetchRowsWithCache({ game, since });
      if (!rows || rows.length === 0) throw new Error('No rows cached');
      const csv = rowsToCSV(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0,10);
      a.href = url;
      a.download = `${game}_current-era_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch {
      // Fallback to server — keeps working if cache/fetch fails or you move secrets server-side
      const params = new URLSearchParams({ game, since });
      window.location.href = `/api/export?${params.toString()}`;
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={className ?? 'btn btn-secondary'}
      onClick={handleClick}
      aria-label="Export CSV of draws"
      aria-busy={busy}
      disabled={busy}
      title="Export all current-era draws to CSV"
    >
      {busy ? 'Exporting…' : 'Export CSV'}
    </button>
  );
}
