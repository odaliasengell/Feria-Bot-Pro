import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, ChevronDown, MapPin, Search, Settings2, Users } from 'lucide-react';
import type { EstadoFeria, Feria } from '../types';
import { useFeria } from '../context/FeriaContext';
import { normalizar, rangoFechas } from '../lib/utils';
import { ESTADO_FERIA, ordenarFerias } from '../lib/ferias';
import PortadaFeria from './PortadaFeria';
import { EmptyState, Loader } from './ui';

const GRUPOS: { estado: EstadoFeria; titulo: string }[] = [
  { estado: 'en_curso', titulo: 'En curso' },
  { estado: 'proxima', titulo: 'Próximas' },
  { estado: 'finalizada', titulo: 'Finalizadas' },
];

/** Selector de la feria que administra el organizador: barra compacta con un menú agrupado por estado. */
export function FeriaSelector() {
  const { ferias, feria, elegir } = useFeria();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [activa, setActiva] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const filtradas = useMemo(() => {
    const nq = normalizar(q);
    return [...ferias].sort(ordenarFerias).filter((f) => !nq || normalizar(`${f.nombre} ${f.lugar}`).includes(nq));
  }, [ferias, q]);

  // Al abrir: limpiar la búsqueda, marcar la feria actual y enfocar el buscador.
  useEffect(() => {
    if (!abierto) return;
    setQ('');
    setActiva(Math.max(0, [...ferias].sort(ordenarFerias).findIndex((f) => f.id === feria?.id)));
    requestAnimationFrame(() => buscador.current?.focus());
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto, ferias, feria?.id]);

  useEffect(() => {
    document.getElementById(`${listaId}-${activa}`)?.scrollIntoView({ block: 'nearest' });
  }, [activa, listaId]);

  if (!feria) return null;
  const est = ESTADO_FERIA[feria.estado];

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  function seleccionar(f: Feria) {
    elegir(f.id);
    cerrar();
  }

  function teclas(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiva((i) => Math.min(filtradas.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiva((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && filtradas[activa]) {
      e.preventDefault();
      seleccionar(filtradas[activa]);
    }
  }

  return (
    <div className="fsel no-print" ref={raiz}>
      <button
        ref={boton}
        type="button"
        className={`fsel-actual ${abierto ? 'is-abierto' : ''}`}
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Feria: ${feria.nombre}. Cambiar de feria`}
      >
        <PortadaFeria nombre={feria.nombre} portada={feria.portada} portadaAlt={feria.portadaAlt} variante="mini" className="fsel-portada" />
        <span className="fsel-texto">
          <span className="fsel-titulo">
            <strong>{feria.nombre}</strong>
            <span className={`badge tone-${est.tone}`}>{est.label}</span>
          </span>
          <span className="fsel-meta">
            <span>
              <CalendarDays size={13} /> {rangoFechas(feria.fechaInicio, feria.fechaFin)}
            </span>
            {feria.lugar && (
              <span className="fsel-lugar">
                <MapPin size={13} /> {feria.lugar}
              </span>
            )}
          </span>
        </span>
        <span className="fsel-cambiar">
          {ferias.length > 1 && <span className="fsel-cambiar-texto">Cambiar</span>}
          <ChevronDown size={18} />
        </span>
      </button>

      {abierto && (
        <>
          <div className="fsel-fondo" onClick={cerrar} aria-hidden="true" />
          <div className="fsel-menu" onKeyDown={teclas}>
            <div className="fsel-buscar">
              <Search size={16} />
              <input
                ref={buscador}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActiva(0);
                }}
                placeholder="Buscar feria…"
                aria-label="Buscar feria"
                aria-controls={listaId}
                aria-activedescendant={filtradas[activa] ? `${listaId}-${activa}` : undefined}
              />
            </div>
            <div className="fsel-lista" id={listaId} role="listbox" aria-label="Ferias">
              {filtradas.length === 0 && <p className="fsel-vacio muted small">Ninguna feria coincide con «{q}».</p>}
              {GRUPOS.map(({ estado, titulo }) => {
                const delGrupo = filtradas.filter((f) => f.estado === estado);
                if (!delGrupo.length) return null;
                return (
                  <div key={estado} className="fsel-grupo" role="group" aria-label={titulo}>
                    <div className="fsel-grupo-titulo">
                      {titulo} <span>{delGrupo.length}</span>
                    </div>
                    {delGrupo.map((f) => {
                      const i = filtradas.indexOf(f);
                      const actual = f.id === feria.id;
                      return (
                        <div
                          key={f.id}
                          id={`${listaId}-${i}`}
                          role="option"
                          aria-selected={actual}
                          className={`fsel-opcion ${i === activa ? 'is-activa' : ''} ${actual ? 'is-actual' : ''}`}
                          onMouseEnter={() => setActiva(i)}
                          onClick={() => seleccionar(f)}
                        >
                          <PortadaFeria nombre={f.nombre} portada={f.portada} portadaAlt={f.portadaAlt} variante="mini" className="fsel-portada" />
                          <span className="fsel-opcion-texto">
                            <strong>{f.nombre}</strong>
                            <span className="muted small">{rangoFechas(f.fechaInicio, f.fechaFin)}</span>
                          </span>
                          <span className="fsel-opcion-cifras" title={`${f.totalVisitantes} inscritos · ${f.totalEmpresas} empresas`}>
                            <Users size={13} /> {f.totalVisitantes}
                          </span>
                          <span className="fsel-check">{actual && <Check size={16} />}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <Link to="/organizador/ferias" className="fsel-pie" onClick={() => setAbierto(false)}>
              <Settings2 size={16} /> Gestionar ferias
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Muestra el contenido solo si hay una feria seleccionada; si no, invita a crear una. */
export function ConFeria({ children }: { children: (feria: Feria) => ReactNode }) {
  const { feria, cargando } = useFeria();
  if (cargando) return <Loader />;
  if (!feria)
    return (
      <EmptyState icon={<CalendarDays />} title="Primero crea una feria">
        Las empresas, los visitantes y los leads se organizan por feria.
        <div>
          <Link to="/organizador/ferias" className="btn btn-primary">Ir a Ferias</Link>
        </div>
      </EmptyState>
    );
  return <>{children(feria)}</>;
}
