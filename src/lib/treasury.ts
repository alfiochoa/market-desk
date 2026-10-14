/** Parses the Treasury "Daily Treasury Par Yield Curve Rates" XML feed (OData Atom). */
export const TENORS = ['1M', '2M', '3M', '4M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'] as const;
const FIELD: Record<string, string> = { '1M': 'BC_1MONTH', '2M': 'BC_2MONTH', '3M': 'BC_3MONTH', '4M': 'BC_4MONTH', '6M': 'BC_6MONTH', '1Y': 'BC_1YEAR', '2Y': 'BC_2YEAR', '3Y': 'BC_3YEAR', '5Y': 'BC_5YEAR', '7Y': 'BC_7YEAR', '10Y': 'BC_10YEAR', '20Y': 'BC_20YEAR', '30Y': 'BC_30YEAR' };
export interface CurvePoint { date: string; yields: Record<string, number | null> }

export function parseYieldXml(xml: string): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (const m of xml.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)) {
    const body = m[1];
    const date = /<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/.exec(body)?.[1];
    if (!date) continue;
    const yields: Record<string, number | null> = {};
    for (const t of TENORS) {
      const v = new RegExp(`<d:${FIELD[t]}[^>]*>([\\d.]+)</d:${FIELD[t]}>`).exec(body)?.[1];
      yields[t] = v ? Number(v) : null;
    }
    out.push({ date, yields });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
