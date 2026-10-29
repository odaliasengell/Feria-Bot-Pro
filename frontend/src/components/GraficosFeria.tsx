import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { EstadisticasFeria } from '../types';
import { Card } from './ui';

/**
 * Gráficos del resumen del organizador (recharts). Cada gráfico tiene una sola serie: la nombra el título,
 * sin leyenda. Color de serie validado contra la superficie clara (contraste ≥ 3:1).
 */
const SERIE = '#2a78d6';
const GRID = '#e5e7eb';
const TEXTO = '#56575a';
const MAX_CIUDADES = 8;

const eje = { fontSize: 12, fill: TEXTO };

function diaCorto(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function horaTexto(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** Tooltip con tokens de texto (no el color de la serie). */
function Burbuja({ active, payload, label, titulo, unidad }: TooltipProps<number, string> & { titulo: (l: string | number) => string; unidad: [string, string] }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].value ?? 0);
  return (
    <div className="viz-tip">
      <span className="viz-tip-label">{titulo(label)}</span>
      <strong>
        {v} {v === 1 ? unidad[0] : unidad[1]}
      </strong>
    </div>
  );
}

/** Tabla con los mismos datos del gráfico (accesible y para lectores de pantalla). */
function VerDatos({ columnas, filas }: { columnas: [string, string]; filas: [string, number][] }) {
  return (
    <details className="viz-datos">
      <summary>Ver datos</summary>
      <table className="table">
        <thead>
          <tr>
            <th>{columnas[0]}</th>
            <th className="num">{columnas[1]}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="num">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function SinDatos({ children }: { children: ReactNode }) {
  return <p className="viz-vacio muted small">{children}</p>;
}

export default function GraficosFeria({ stats }: { stats: EstadisticasFeria }) {
  return (
    <div className="viz-grid">
      <Asistencia asistentes={stats.asistentes} inscritos={stats.totalInscritos} />
      <InscritosPorDia datos={stats.inscritosPorDia} />
      <EscaneosPorHora datos={stats.escaneosPorHora} />
      <Ciudades datos={stats.ciudades} />
    </div>
  );
}

/** Parte de un todo con un solo valor: medidor con cifra destacada, no un gráfico circular. */
function Asistencia({ asistentes, inscritos }: { asistentes: number; inscritos: number }) {
  const pct = inscritos ? Math.round((asistentes / inscritos) * 100) : 0;
  return (
    <Card title="Asistencia frente a inscritos">
      <div className="viz-meter">
        <div className="viz-hero">
          <strong>{pct}%</strong>
          <span className="muted">
            {asistentes} de {inscritos} {inscritos === 1 ? 'inscrito' : 'inscritos'} entraron a la feria
          </span>
        </div>
        <div
          className="viz-meter-track"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={inscritos}
          aria-valuenow={asistentes}
          aria-label="Asistentes sobre inscritos"
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="viz-meter-legend small muted">
          <span>Asistieron: {asistentes}</span>
          <span>No asistieron: {inscritos - asistentes}</span>
        </div>
      </div>
    </Card>
  );
}

function InscritosPorDia({ datos }: { datos: EstadisticasFeria['inscritosPorDia'] }) {
  return (
    <Card title="Inscritos por día">
      {datos.length === 0 ? (
        <SinDatos>Aún no hay inscripciones.</SinDatos>
      ) : (
        <>
          <div className="viz-plot">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="fecha" tickFormatter={diaCorto} tick={eje} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
                <YAxis allowDecimals={false} tick={eje} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ stroke: TEXTO, strokeDasharray: '3 3' }}
                  content={<Burbuja titulo={(l) => diaCorto(String(l))} unidad={['inscrito', 'inscritos']} />}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={SERIE}
                  strokeWidth={2}
                  dot={datos.length <= 14 ? { r: 3, fill: SERIE, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, fill: SERIE, stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <VerDatos columnas={['Día', 'Inscritos']} filas={datos.map((d) => [diaCorto(d.fecha), d.total])} />
        </>
      )}
    </Card>
  );
}

function EscaneosPorHora({ datos }: { datos: EstadisticasFeria['escaneosPorHora'] }) {
  return (
    <Card title="Escaneos por hora">
      {datos.length === 0 ? (
        <SinDatos>Aún no hay escaneos en los stands.</SinDatos>
      ) : (
        <>
          <div className="viz-plot">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barCategoryGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="hora" tickFormatter={horaTexto} tick={eje} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={8} />
                <YAxis allowDecimals={false} tick={eje} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: 'rgba(10, 14, 28, 0.05)' }}
                  content={<Burbuja titulo={(l) => `${horaTexto(Number(l))} – ${horaTexto((Number(l) + 1) % 24)}`} unidad={['escaneo', 'escaneos']} />}
                />
                <Bar dataKey="total" fill={SERIE} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <VerDatos columnas={['Hora', 'Escaneos']} filas={datos.map((d) => [horaTexto(d.hora), d.total])} />
        </>
      )}
    </Card>
  );
}

function Ciudades({ datos }: { datos: EstadisticasFeria['ciudades'] }) {
  // Las primeras ciudades y el resto agrupado en «Otras», para que las barras se puedan leer.
  const filas =
    datos.length > MAX_CIUDADES
      ? [
          ...datos.slice(0, MAX_CIUDADES - 1),
          { ciudad: 'Otras', total: datos.slice(MAX_CIUDADES - 1).reduce((s, c) => s + c.total, 0) },
        ]
      : datos;
  const alto = Math.max(140, filas.length * 34 + 24);

  return (
    <Card title="Visitantes por ciudad">
      {filas.length === 0 ? (
        <SinDatos>Aún no hay visitantes inscritos.</SinDatos>
      ) : (
        <>
          <div style={{ height: alto }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filas} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={4}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={eje} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="ciudad" tick={eje} tickLine={false} axisLine={{ stroke: GRID }} width={104} />
                <Tooltip cursor={{ fill: 'rgba(10, 14, 28, 0.05)' }} content={<Burbuja titulo={(l) => String(l)} unidad={['visitante', 'visitantes']} />} />
                <Bar
                  dataKey="total"
                  fill={SERIE}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                  label={{ position: 'right', fontSize: 12, fill: TEXTO }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <VerDatos columnas={['Ciudad', 'Visitantes']} filas={filas.map((c) => [c.ciudad, c.total])} />
        </>
      )}
    </Card>
  );
}
