// Período do dashboard do lojista. Tudo é calculado no horário de Brasília
// (UTC-3, sem horário de verão), porque o servidor roda em UTC.

const TZ = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

export type PeriodKey = "7" | "30" | "all" | "custom";

export interface Period {
  key: PeriodKey;
  /** Início do período (null = sem limite inferior). */
  start: Date | null;
  /** Fim do período (null = até agora). */
  end: Date | null;
  label: string;
  /** Período anterior de mesmo tamanho, para comparação. Null quando não existe. */
  previous: { start: Date; end: Date } | null;
}

export interface SalesPoint {
  key: string;
  label: string;
  valueInCents: number;
  count: number;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD no horário de Brasília. */
export function brtYmd(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function brtStartOfDay(ymd: string) {
  return new Date(`${ymd}T00:00:00-03:00`);
}

export function brtEndOfDay(ymd: string) {
  return new Date(`${ymd}T23:59:59.999-03:00`);
}

export function parseYmd(value?: string) {
  if (!value || !YMD.test(value)) return null;
  return Number.isNaN(brtStartOfDay(value).getTime()) ? null : value;
}

function formatYmd(ymd: string) {
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

export function resolvePeriod(
  params: { start?: string; end?: string; period?: string },
  now = new Date(),
): Period {
  let startYmd = parseYmd(params.start);
  let endYmd = parseYmd(params.end);

  if (startYmd || endYmd) {
    if (startYmd && endYmd && startYmd > endYmd) {
      [startYmd, endYmd] = [endYmd, startYmd];
    }

    const start = startYmd ? brtStartOfDay(startYmd) : null;
    const end = endYmd ? brtEndOfDay(endYmd) : null;

    let previous: Period["previous"] = null;
    if (start) {
      const effectiveEnd = end ?? now;
      const length = Math.max(effectiveEnd.getTime() - start.getTime() + 1, 1);
      previous = {
        start: new Date(start.getTime() - length),
        end: new Date(start.getTime() - 1),
      };
    }

    const label =
      startYmd && endYmd
        ? `${formatYmd(startYmd)} a ${formatYmd(endYmd)}`
        : startYmd
          ? `A partir de ${formatYmd(startYmd)}`
          : `Até ${formatYmd(endYmd!)}`;

    return { key: "custom", start, end, label, previous };
  }

  if (params.period === "all") {
    return {
      key: "all",
      start: null,
      end: null,
      label: "Todo o período",
      previous: null,
    };
  }

  const days = params.period === "7" ? 7 : 30;
  const firstDay = brtYmd(new Date(now.getTime() - (days - 1) * DAY_MS));
  const start = brtStartOfDay(firstDay);

  return {
    key: days === 7 ? "7" : "30",
    start,
    end: null,
    label: `Últimos ${days} dias`,
    previous: {
      start: new Date(start.getTime() - days * DAY_MS),
      end: new Date(start.getTime() - 1),
    },
  };
}

const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/**
 * Receita agrupada por dia (períodos de até 31 dias) ou por mês
 * (períodos maiores, no máximo os últimos 12 meses).
 */
export function buildSalesSeries(
  orders: { createdAt: Date; totalPriceInCents: number }[],
  period: Period,
  now = new Date(),
): SalesPoint[] {
  if (orders.length === 0) return [];

  const earliest = orders.reduce(
    (min, order) => (order.createdAt < min ? order.createdAt : min),
    orders[0].createdAt,
  );

  const rangeStart = period.start ?? earliest;
  const rangeEnd = period.end ?? now;
  const spanDays =
    Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS) + 1;

  const monthly = spanDays > 31;
  const totals = new Map<string, { valueInCents: number; count: number }>();

  for (const order of orders) {
    const ymd = brtYmd(order.createdAt);
    const key = monthly ? ymd.slice(0, 7) : ymd;
    const current = totals.get(key) ?? { valueInCents: 0, count: 0 };
    current.valueInCents += order.totalPriceInCents;
    current.count += 1;
    totals.set(key, current);
  }

  const points: SalesPoint[] = [];

  if (!monthly) {
    const lastYmd = brtYmd(rangeEnd);
    let cursor = brtStartOfDay(brtYmd(rangeStart));

    while (brtYmd(cursor) <= lastYmd && points.length < 32) {
      const ymd = brtYmd(cursor);
      const total = totals.get(ymd);
      points.push({
        key: ymd,
        label: `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`,
        valueInCents: total?.valueInCents ?? 0,
        count: total?.count ?? 0,
      });
      cursor = new Date(cursor.getTime() + DAY_MS);
    }

    return points;
  }

  let year = Number(brtYmd(rangeStart).slice(0, 4));
  let month = Number(brtYmd(rangeStart).slice(5, 7));
  const lastYear = Number(brtYmd(rangeEnd).slice(0, 4));
  const lastMonth = Number(brtYmd(rangeEnd).slice(5, 7));

  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const total = totals.get(key);
    points.push({
      key,
      label: `${MONTHS[month - 1]}/${String(year).slice(2)}`,
      valueInCents: total?.valueInCents ?? 0,
      count: total?.count ?? 0,
    });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return points.slice(-12);
}
