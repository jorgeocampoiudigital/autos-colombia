/** Formateadores es-CO / zona America/Bogota. Las fechas "solo día" se interpretan localmente. */
const TZ = 'America/Bogota';

export function aFecha(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : new Date(v);
}

function esSoloDia(v: string | Date | null | undefined): boolean {
  return typeof v === 'string' && v.length === 10;
}

function partes(v: string | Date | null | undefined, conAnio: boolean): string {
  const d = aFecha(v);
  if (!d) return '—';
  const o: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: conAnio ? 'numeric' : undefined };
  const f = new Intl.DateTimeFormat('es-CO', esSoloDia(v) ? o : { ...o, timeZone: TZ }).formatToParts(d);
  const g = (t: string) => (f.find(x => x.type === t)?.value ?? '').replace(/\./g, '');
  return [g('day'), g('month'), conAnio ? g('year') : ''].filter(Boolean).join(' ');   // "18 oct 2026"
}

export const fecha = (v: string | Date | null | undefined) => partes(v, true);
export const fechaCorta = (v: string | Date | null | undefined) => partes(v, false);

export function hora(v: string | Date | null | undefined): string {
  const d = aFecha(v);
  if (!d || esSoloDia(v)) return '—';
  const p = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ })
    .formatToParts(d);
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '';
  const periodo = get('dayPeriod').toLowerCase().replace(/[\s.\u00a0\u202f]/g, '').startsWith('a') ? 'a. m.' : 'p. m.';
  return `${get('hour')}:${get('minute')} ${periodo}`;
}
export const fechaHora = (v: string | Date | null | undefined) => `${fecha(v)} · ${hora(v)}`;
export const fechaLarga = (v: Date) => {
  const t = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ })
    .format(v).replace(/\./g, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function cop(n: number | null | undefined): string {
  return `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n ?? 0)}`;
}
export function copSolo(n: number | null | undefined): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n ?? 0);
}

export function iniciales(nombre: string): string {
  return nombre.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
export function mesISO(): string { return hoyISO().slice(0, 7); }

export function normalizarPlaca(v: string): string {
  return v.replace(/[\s-]/g, '').toUpperCase();
}

export function descargarCsv(nombre: string, columnas: string[], filas: (string | number | null)[][]): void {
  const esc = (x: string | number | null) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [columnas, ...filas].map(f => f.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

export function hora24(v: string | Date | null | undefined): string {
  const d = aFecha(v);
  return d ? new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(d) : '—';
}

/** 52418762 -> 52.418.762 */
export function docFmt(doc: string | null | undefined): string {
  if (!doc) return '—';
  return /^\d+$/.test(doc) ? doc.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : doc;
}
/** 3104567890 -> 310 456 7890 */
export function telFmt(t: string | null | undefined): string {
  if (!t) return '—';
  return /^\d{10}$/.test(t) ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t;
}
