import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie, FileText, Scale, ShieldCheck } from 'lucide-react';
import type { SlugLegal } from '../types';
import { legalApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { Alert, Loader } from '../components/ui';
import { usePagina } from '../lib/seo';

/** Todos los documentos legales, en el orden en que se enlazan al pie de cada uno. */
export const DOCUMENTOS_LEGALES: { slug: SlugLegal; titulo: string }[] = [
  { slug: 'aviso-legal', titulo: 'Aviso legal' },
  { slug: 'privacidad', titulo: 'Política de privacidad' },
  { slug: 'tratamiento-datos', titulo: 'Tratamiento de datos personales' },
  { slug: 'cookies', titulo: 'Política de cookies' },
];

const ICONO = { privacidad: ShieldCheck, 'tratamiento-datos': FileText, 'aviso-legal': Scale, cookies: Cookie } as const;

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «Política de privacidad» y «Tratamiento de datos» (LOPDP Ecuador). El texto viene del backend: GET /legal/:slug. */
export default function Legal({ slug }: { slug: SlugLegal }) {
  const { data: doc, cargando, error, recargar } = useAsync(() => legalApi.obtener(slug), [slug]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);
  usePagina({
    titulo: doc?.titulo ?? DOCUMENTOS_LEGALES.find((d) => d.slug === slug)?.titulo,
    descripcion: doc?.resumen,
  });

  const otros = DOCUMENTOS_LEGALES.filter((d) => d.slug !== slug);
  const Icono = ICONO[slug];

  return (
    <div className="legal-page">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link to="/" className="brand">
            <img src="/logo-64.png" alt="" width={32} height={32} />
            <span>
              FeriaBot <b>Pro</b>
            </span>
          </Link>
          <div className="topnav-actions">
            <Link to="/" className="btn btn-outline btn-sm">
              <ArrowLeft size={15} /> Volver al inicio
            </Link>
          </div>
        </div>
      </nav>

      <main className="legal-main">
        {cargando && !doc ? (
          <Loader />
        ) : error && !doc ? (
          <Alert>
            {error}{' '}
            <button type="button" className="link-btn" onClick={recargar}>
              Reintentar
            </button>
          </Alert>
        ) : doc ? (
          <article className="legal-doc">
            <header className="legal-head">
              <span className="tag-mint">
                <Icono size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> LOPDP · Ecuador
              </span>
              <h1>{doc.titulo}</h1>
              <p className="legal-lead">{doc.resumen}</p>
              <p className="muted small">
                Versión {doc.version} · Última actualización: {fechaLarga(doc.actualizado)}
              </p>
            </header>

            {doc.secciones.map((s) => (
              <section key={s.titulo} className="legal-section">
                <h2>{s.titulo}</h2>
                {s.lista.length > 0 && (
                  <ul>
                    {s.lista.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {s.parrafos.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </section>
            ))}

            <footer className="legal-foot">
              <span className="muted small">Consultas: </span>
              <a href={`mailto:${doc.responsable.email}`}>{doc.responsable.email}</a>
              <span className="grow" />
              <nav className="legal-otros" aria-label="Otros documentos legales">
                {otros.map((o) => (
                  <Link key={o.slug} to={`/${o.slug}`} className="btn btn-outline btn-sm">
                    {o.titulo}
                  </Link>
                ))}
              </nav>
            </footer>
          </article>
        ) : null}
      </main>
    </div>
  );
}
