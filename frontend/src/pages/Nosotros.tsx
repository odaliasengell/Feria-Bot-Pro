import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePagina } from '../lib/seo';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  IdCard,
  LayoutDashboard,
  QrCode,
  ScanLine,
  Store,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

const PASOS: { icon: LucideIcon; t: string; d: string }[] = [
  {
    icon: UserPlus,
    t: 'Te registras en la feria',
    d: 'El visitante completa sus datos en un minuto y recibe una credencial digital con su QR personal.',
  },
  {
    icon: ScanLine,
    t: 'Se escanea en el stand',
    d: 'La empresa escanea el QR del visitante y califica su interés; el visitante escanea el QR del stand y abre su ficha.',
  },
  {
    icon: Check,
    t: 'Cada uno conserva sus contactos',
    d: 'Empresas, visitantes y organizador consultan después la información, ordenada y lista para el seguimiento.',
  },
];

interface Rol {
  id: string;
  tone: 'blue' | 'teal' | 'orange';
  icon: LucideIcon;
  titulo: string;
  sub: string;
  beneficios: string[];
  cta: { texto: string; link: string };
}

const ROLES: Rol[] = [
  {
    id: 'visitantes',
    tone: 'teal',
    icon: IdCard,
    titulo: 'Para visitantes',
    sub: 'Recorre la feria sin llenar formularios en cada stand',
    beneficios: [
      'Una sola credencial con QR para toda la feria.',
      'Tus datos solo llegan a las empresas a las que presentas tu QR.',
      'Historial de las empresas que registraron tu visita y de las fichas que abriste.',
      'Fichas digitales con servicios, fotos y datos de contacto de cada stand.',
    ],
    cta: { texto: 'Registrarme como visitante', link: '/registro' },
  },
  {
    id: 'empresas',
    tone: 'orange',
    icon: Store,
    titulo: 'Para empresas',
    sub: 'Convierte cada visita al stand en un lead útil',
    beneficios: [
      'Escanea el QR del visitante desde el celular, sin apps que instalar.',
      'Califica el contacto: interesado, visita, correo o no interesado, con notas.',
      'Ficha pública del negocio con logo, servicios y fotos, accesible con el QR del stand.',
      'Portal con todos tus leads: nombre, teléfono, correo y nivel de interés.',
    ],
    cta: { texto: 'Entrar al portal de empresas', link: '/ingresar?rol=empresa' },
  },
  {
    id: 'organizadores',
    tone: 'blue',
    icon: LayoutDashboard,
    titulo: 'Para organizadores',
    sub: 'La feria completa en un solo panel',
    beneficios: [
      'Crea ferias y abre o cierra las inscripciones con un enlace o QR de registro.',
      'Carga las empresas participantes y genera sus accesos.',
      'Registra visitantes en la entrada e imprime sus credenciales.',
      'Consulta visitantes, leads y estadísticas de toda la feria.',
    ],
    cta: { texto: 'Entrar al panel del organizador', link: '/ingresar?rol=organizador' },
  },
];

/** Página pública «Nosotros»: qué es FeriaBot Pro, cómo funciona y qué ofrece a cada rol. */
export default function Nosotros() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  usePagina({
    titulo: 'Nosotros',
    descripcion: 'Qué es FeriaBot Pro y cómo ayuda a organizadores, empresas y visitantes a aprovechar cada feria.',
  });

  return (
    <div className="landing">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link to="/" className="brand">
            <img src="/logo-64.png" alt="" width={32} height={32} />
            <span>
              FeriaBot <b>Pro</b>
            </span>
          </Link>
          <div className="topnav-links">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#visitantes">Visitantes</a>
            <a href="#empresas">Empresas</a>
            <a href="#organizadores">Organizadores</a>
          </div>
          <div className="topnav-actions">
            <Link to="/" className="btn btn-outline btn-sm">
              <ArrowLeft size={15} /> Inicio
            </Link>
          </div>
        </div>
      </nav>

      <header className="section about-hero">
        <span className="tag-mint">Nosotros</span>
        <h1>
          Conectamos ferias con un <span className="hl">escaneo</span>.
        </h1>
        <p className="hero-lead">
          FeriaBot Pro es una plataforma web para ferias y exposiciones que reemplaza las tarjetas de presentación y las
          hojas de registro por credenciales con QR. Organizadores, visitantes y empresas participantes comparten un mismo
          flujo: cada visita a un stand queda registrada como un contacto útil para después de la feria.
        </p>
        <div className="hero-ctas">
          <Link to="/registro" className="btn btn-accent btn-lg">
            Soy visitante <ArrowRight size={18} />
          </Link>
          <Link to="/ingresar?rol=empresa" className="btn btn-primary btn-lg">
            <Store size={18} /> Soy empresa
          </Link>
        </div>
      </header>

      <div className="band-paper" id="como-funciona">
        <section className="section">
          <div className="section-head">
            <span className="tag-mint">Cómo funciona</span>
            <h2>Tres pasos, sin papeles.</h2>
          </div>
          <ol className="about-steps">
            {PASOS.map((p, i) => (
              <li key={p.t} className="about-step">
                <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="about-step-icon">
                  <p.icon size={22} />
                </span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <span className="tag-mint">
            <QrCode size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Un espacio para cada rol
          </span>
          <h2>Qué ofrece FeriaBot Pro.</h2>
        </div>
        <div className="flow-grid">
          {ROLES.map((r) => (
            <article key={r.id} id={r.id} className={`flow-col tone-${r.tone} about-role`}>
              <div className="flow-bar" />
              <div className="flow-head">
                <span className="flow-icon">
                  <r.icon size={21} />
                </span>
                <div>
                  <h3>{r.titulo}</h3>
                  <p>{r.sub}</p>
                </div>
              </div>
              <ul className="about-list">
                {r.beneficios.map((b) => (
                  <li key={b}>
                    <Check size={15} /> <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link to={r.cta.link} className="flow-link">
                {r.cta.texto} <ArrowRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-foot">
        <div className="foot-legal">
          <span>© {new Date().getFullYear()} FeriaBot Pro</span>
          <span>
            <Link to="/">Inicio</Link> · <Link to="/aviso-legal">Aviso legal</Link> ·{' '}
            <Link to="/privacidad">Política de privacidad</Link> · <Link to="/tratamiento-datos">Tratamiento de datos</Link> ·{' '}
            <Link to="/cookies">Cookies</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
