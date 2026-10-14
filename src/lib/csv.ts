/** Parses FRED `fredgraph.csv` (header: observation_date,SERIES). Missing values are "." and are skipped. */
export function parseFredCsv(text: string): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [date, v] = line.split(',');
    const value = Number(v);
    if (date && v && v !== '.' && Number.isFinite(value)) out.push({ date, value });
  }
  return out;
}
