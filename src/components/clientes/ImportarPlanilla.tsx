/**
 * Admin → Clientes → "Importar planilla" (parte 2.3, 16/11/2026). Pasate en 2 minutos:
 * 1) subí la planilla de Wona, ATC, armatuMatch o tu Excel, 2) revisá los números, 3) confirmá con el permiso.
 * Wireframe aprobado: project files informes/diferenciacion-mejoras/wireframes-parte2-demo-5-minutos.png (3).
 * La planilla se lee en el navegador; al servidor (`clientesImportar`) solo van las filas limpias. No manda mensajes.
 */
import React, { useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { Club } from '../../types/padel';
import { functions, DEMO_MODE } from '../../lib/firebase';
import { cleanPlayers, type MigrationReport } from '../../lib/migracion';
import { readPlanilla } from '../../lib/leerPlanilla';
import { fixedLabel, planImport, rowsFromReport, type ImportRow } from '../../lib/importarClientes';
import { samplePlanillaCsv } from '../../lib/planillaEjemplo';
import { downloadBytes, CSV_MIME } from '../../lib/planilla';
import { formatPhone } from '../../lib/clientes';
import { formatCategory } from '../../lib/padelUtils';
import type { Staff } from '../../services/cajaService';
import { useClientes } from './data';

const PERMISSION = 'Tengo permiso de mis jugadores para pasar sus datos (Ley 18.331)';

interface Result {
  created: number;
  already: number;
  fixed: number;
  weeksSkipped: number;
  noCourt: string[];
}

const Step: React.FC<{ n: number; title: string; done?: boolean; children: React.ReactNode }> = ({ n, title, done, children }) => (
  <section className="rounded-2xl border border-line bg-white p-4">
    <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${done ? 'bg-ok text-white' : 'bg-brand text-white'}`}>{done ? '✓' : n}</span>
      {title}
    </h3>
    <div className="mt-2">{children}</div>
  </section>
);

const Row: React.FC<{ k: string; v: React.ReactNode; strong?: boolean }> = ({ k, v, strong }) => (
  <div className="flex justify-between gap-3 py-2">
    <dt className="text-muted">{k}</dt>
    <dd className={`text-right tabular-nums text-ink ${strong ? 'font-bold' : 'font-semibold'}`}>{v}</dd>
  </div>
);

export const ImportarPlanilla: React.FC<{ club: Club; staff: Staff; onToast: (m: string) => void; onClose: () => void }> = ({ club, staff, onToast, onClose }) => {
  const { clients } = useClientes();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState('');
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showList, setShowList] = useState(false);

  const rows: ImportRow[] = useMemo(() => (report ? rowsFromReport(report) : []), [report]);
  const live = useMemo(() => (report ? planImport(rows, clients, { merged: report.duplicates.length, discarded: report.discarded.length }) : null), [report, rows, clients]);
  // Al cargar se congela: si no, las fichas recién creadas aparecerían como "ya estaban".
  const [frozen, setFrozen] = useState<typeof live>(null);
  const plan = frozen ?? live;

  const load = async (name: string, bytes: Uint8Array) => {
    setError('');
    setReport(null);
    setResult(null);
    setOk(false);
    setFrozen(null);
    try {
      const raw = await readPlanilla(name, bytes);
      const rep = cleanPlayers(raw);
      if (!rep.rows) throw new Error('La planilla está vacía.');
      if (!rep.ready.length && !rep.noEmail.length) throw new Error('No encontramos columnas de nombre, celular o mail. Revisá que la primera fila tenga los títulos.');
      setFile(name);
      setReport(rep);
    } catch (e) {
      setError((e as Error).message || 'No pudimos leer el archivo.');
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setError('El archivo pesa más de 10 MB. Bajá solo la lista de clientes.');
      return;
    }
    await load(f.name, new Uint8Array(await f.arrayBuffer()));
  };

  const confirm = async () => {
    if (!plan || !report) return;
    setBusy(true);
    setFrozen(plan);
    try {
      const today = new Date().toLocaleDateString('es-UY');
      const r = await httpsCallable<Record<string, unknown>, Result>(functions, 'clientesImportar', { timeout: 300000 })({
        clubId: club.id,
        rows,
        permission: `${PERMISSION}. Declarado en Admin → Clientes por ${staff.name} el ${today}.`,
        sourceFile: file,
        fileRows: report.rows,
        merged: report.duplicates.length,
        discarded: report.discarded.length,
      });
      setResult(r.data);
      onToast(`Listo: ${r.data.created} fichas nuevas.`);
    } catch (e) {
      setFrozen(null);
      onToast((e as Error).message?.includes('permiso') ? 'Solo el dueño o el administrador puede importar.' : 'No se pudo cargar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const c = plan?.counts;
  const total = rows.length;

  return (
    <div className="space-y-3" data-testid="importar-planilla">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Pasate en 2 minutos</h2>
          <p className="text-[13px] text-muted">Traé a tus jugadores desde la planilla que ya tenés.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-brand hover:bg-mist cursor-pointer">
          Volver a clientes
        </button>
      </div>

      <Step n={1} title="Subí tu planilla" done={!!report}>
        <p className="text-[13px] text-muted">La que exportás de Wona, ATC, armatuMatch o tu Excel. Reconocemos las columnas solas (nombre, celular, mail, categoría, turno fijo).</p>
        <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-3 h-11 w-full cursor-pointer rounded-xl border border-brand bg-white text-sm font-semibold text-brand hover:bg-mist"
        >
          {file ? `Cambiar archivo (${file})` : 'Elegir archivo .csv o .xlsx'}
        </button>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px]">
          <button type="button" onClick={() => downloadBytes('planilla-de-ejemplo.csv', '﻿' + samplePlanillaCsv(), CSV_MIME)} className="font-semibold text-brand underline-offset-2 hover:underline cursor-pointer">
            Bajar planilla de ejemplo
          </button>
          {DEMO_MODE && (
            <button type="button" onClick={() => void load('planilla-de-ejemplo.csv', new TextEncoder().encode(samplePlanillaCsv()))} className="font-semibold text-brand underline-offset-2 hover:underline cursor-pointer">
              Probar con la planilla de ejemplo
            </button>
          )}
        </div>
        {error && <p className="mt-3 rounded-xl bg-due-bg px-3.5 py-2.5 text-sm text-due">{error}</p>}
      </Step>

      {report && c && (
        <Step n={2} title="Revisá" done={!!result}>
          <dl className="divide-y divide-line text-sm">
            <Row k="Jugadores encontrados" v={c.found} strong />
            <Row k="Con celular" v={c.withPhone} />
            <Row k="Con categoría" v={c.withCategory} />
            <Row k="Repetidos que juntamos" v={c.merged} />
            <Row k="Turnos fijos" v={c.fixed} />
            {c.already > 0 && <Row k="Ya estaban en el club (no se duplican)" v={c.already} />}
            <Row k="Para revisar a mano" v={c.review} />
          </dl>
          {report.discarded.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-xl bg-mist p-3 text-[13px] text-ink">
              {report.discarded.slice(0, 8).map((d) => (
                <li key={d.row}>
                  Fila {d.row}: {d.reason}
                </li>
              ))}
              {report.discarded.length > 8 && <li className="text-muted">y {report.discarded.length - 8} más</li>}
            </ul>
          )}
          <button type="button" onClick={() => setShowList((v) => !v)} className="mt-2 text-[13px] font-semibold text-brand cursor-pointer">
            {showList ? 'Ocultar la lista' : `Ver los ${total} jugadores`}
          </button>
          {showList && (
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-mist text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Nombre</th>
                    <th className="px-3 py-2 font-semibold">Celular</th>
                    <th className="px-3 py-2 font-semibold">Cat.</th>
                    <th className="px-3 py-2 font-semibold">Turno fijo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-1.5 text-ink">{r.name}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-ink">{r.phone ? formatPhone(r.phone) : '—'}</td>
                      <td className="px-3 py-1.5 text-ink">{r.category ? formatCategory(r.category) : '—'}</td>
                      <td className="px-3 py-1.5 text-ink">{r.fixed ? fixedLabel(r.fixed) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.withCategory < c.found && (
            <p className="mt-2 text-[13px] text-muted">Los que no tienen categoría (o tienen nivel con decimales) la eligen al entrar a la app, y el club la confirma.</p>
          )}
        </Step>
      )}

      {report && plan && !result && (
        <Step n={3} title="Confirmá">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" />
            <span>{PERMISSION}</span>
          </label>
          <button
            type="button"
            disabled={!ok || busy || plan.create.length + plan.update.length === 0}
            onClick={confirm}
            className="mt-3 h-12 w-full cursor-pointer rounded-xl bg-action text-[15px] font-bold text-on-action disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Cargando…' : plan.create.length ? `Cargar ${plan.create.length} jugadores` : 'Completar las fichas que ya estaban'}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            No se manda ningún mensaje. Cuando cada jugador se registra con su mail, la app lo une a su ficha y a su turno fijo.
          </p>
        </Step>
      )}

      {result && (
        <section className="rounded-2xl bg-ok-bg p-4 text-sm text-ok" data-testid="importar-listo">
          <p className="font-display text-[15px] font-bold">¡Listo! Tus jugadores ya están en Clientes.</p>
          <ul className="mt-2 space-y-1">
            <li>{result.created} fichas nuevas{result.already ? ` y ${result.already} que ya estaban, completadas` : ''}.</li>
            <li>
              {result.fixed} turnos fijos cargados por 12 semanas
              {result.weeksSkipped ? ` (${result.weeksSkipped} semanas salteadas porque la cancha ya estaba ocupada)` : ''}.
            </li>
            {result.noCourt.length > 0 && <li>Sin cancha que coincida, cargalos a mano en Turnos fijos: {result.noCourt.join(', ')}.</li>}
          </ul>
          <button type="button" onClick={onClose} className="mt-3 h-11 w-full cursor-pointer rounded-xl bg-brand text-sm font-semibold text-white">
            Ver clientes
          </button>
        </section>
      )}
    </div>
  );
};
