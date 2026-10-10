import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import type { SlugLegal } from '../types';
import { legalApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { Alert, Loader } from '../components/ui';

const OTRO: Record<SlugLegal, { slug: SlugLegal; titulo: string }> = {
  privacidad: { slug: 'tratamiento-datos', titulo: 'Tratamiento de datos personales' },
  'tratamiento-datos': { slug: 'privacidad', titulo: 'Política de privacidad' },
};

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
  useEffect(() => {
    if (doc) document.title = `${doc.titulo} · FeriaBot Pro`;
  }, [doc]);

  const otro = OTRO[slug];
  const Icono = slug === 'privacidad' ? ShieldCheck : FileText;

  return (
    <div className="legal-page">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link to="/" className="brand">
            <img src="/favicon.png" alt="" width={32} height={32} />
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
              <Link to={`/${otro.slug}`} className="btn btn-outline btn-sm">
                Ver {otro.titulo}
              </Link>
            </footer>
          </article>
        ) : null}
      </main>
    </div>
  );
}
