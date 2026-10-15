import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ContactRound,
  IdCard,
  LayoutDashboard,
  Store,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Columna {
  tone: 'blue' | 'teal' | 'orange';
  titulo: string;
  sub: string;
  icon: LucideIcon;
  pasos: { t: string; d: string }[];
  resultado: string;
  link: string;
}

const COLUMNAS: Columna[] = [
  {
    tone: 'blue',
    titulo: 'Organizador',
    sub: 'Administra la feria y sus datos',
    icon: LayoutDashboard,
    pasos: [
      { t: 'Carga las empresas participantes', d: 'Nombre, rubro y datos del negocio' },
      { t: 'Registra a los visitantes', d: 'Nombre, teléfono, correo, empresa y ciudad' },
      { t: 'Consulta la información', d: 'Leads de empresas y base de visitantes' },
    ],
    resultado: 'Panel de empresas + base de visitantes para gestionar contactos de la feria',
    link: '/ingresar?rol=organizador',
  },
  {
    tone: 'teal',
    titulo: 'Visitante',
    sub: 'Recibe una tarjeta con QR personal',
    icon: IdCard,
    pasos: [
      { t: 'Se registra al ingresar', d: 'Comparte sus datos de contacto' },
      { t: 'Presenta su QR en los stands', d: 'La empresa lo escanea y registra su interés' },
      { t: 'Escanea el QR del stand', d: 'Abre la ficha digital de esa empresa' },
    ],
    resultado: 'Ve qué empresas registraron su visita y consulta sus datos de contacto',
    link: '/registro',
  },
  {
    tone: 'orange',
    titulo: 'Empresa participante',
    sub: 'Portal y webapp de captura',
    icon: Store,
    pasos: [
      { t: 'Completa su ficha digital', d: 'Servicios, logo y 2–3 fotos' },
      { t: 'Escanea el QR del visitante', d: 'Usa la webapp desde el stand' },
      { t: 'Califica el contacto', d: 'Visita, correo, interesado o no' },
    ],
    resultado: 'Consulta sus leads en el portal con nombre, correo y teléfono',
    link: '/ingresar?rol=empresa',
  },
];

const QR_ON = [0, 1, 2, 4, 6, 7, 8, 13, 14, 16, 20, 22, 24, 25, 28, 30, 34, 35, 36, 40, 42, 43, 44, 46, 48];

export default function Landing() {
  const { session } = useAuth();

  return (
    <div className="landing">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link to="/" className="brand">
            <img src="/favicon.png" alt="" width={32} height={32} />
            <span>
              FeriaBot <b>Pro</b>
            </span>
          </Link>
          <div className="topnav-links">
            <a href="#flujo">Cómo funciona</a>
            <a href="#recorridos">Recorridos QR</a>
            <a href="#resultados">Resultados</a>
            <Link to="/ferias">Ferias</Link>
            <Link to="/nosotros">Nosotros</Link>
          </div>
          <div className="topnav-actions">
            {session ? (
              <Link to={`/${session.role}`} className="btn btn-primary btn-sm">
                Ir a mi panel <ArrowRight size={15} />
              </Link>
            ) : (
              <>
                <Link to="/ingresar" className="btn btn-outline btn-sm">
                  Ingresar
                </Link>
                <Link to="/registro" className="btn btn-accent btn-sm">
                  Registrarme
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <header className="hero">
        <div>
          <span className="tag-mint">Ferias conectadas con QR</span>
          <h1>
            Cada visita al stand, un <span className="hl">contacto útil</span>.
          </h1>
          <p className="hero-lead">
            FeriaBot Pro conecta organizadores, visitantes y empresas en un solo flujo: credenciales con QR, fichas
            digitales de cada stand y leads ordenados sin papeles.
          </p>
          <div className="hero-ctas">
            <Link to="/registro" className="btn btn-accent btn-lg">
              Soy visitante <ArrowRight size={18} />
            </Link>
            <Link to="/ingresar?rol=empresa" className="btn btn-primary btn-lg">
              <Store size={18} /> Soy empresa <ArrowRight size={18} />
            </Link>
            <Link to="/ferias" className="btn btn-outline btn-lg">
              <CalendarDays size={18} /> Ver ferias
            </Link>
          </div>
          <div className="cmd-bar" aria-label="Ejemplo de escaneo">
            <span className="prompt">$</span>
            <code>
              <span className="f">escanear</span> <span className="s">FB-7K3PQX</span> <span className="k">--stand</span> A-04
            </code>
            <span className="cmd-ok">
              <Check size={13} /> lead guardado
            </span>
          </div>
        </div>

        <div className="hero-visual" aria-hidden>
          <span className="hv-label">// feria en vivo</span>
          <div className="hv-card hv-badge">
            <div className="hv-badge-top">
              FeriaBot <span>VISITANTE</span>
            </div>
            <div className="hv-qr">
              {Array.from({ length: 49 }, (_, i) => (
                <i key={i} className={QR_ON.includes(i) ? 'on' : ''} />
              ))}
            </div>
            <strong>María José Castro</strong>
            <small>Hotel Plaza · Quito</small>
            <div>
              <span className="hv-code">FB-7K3PQX</span>
            </div>
          </div>
          <div className="hv-card hv-lead">
            <div className="hv-lead-row">
              <span className="hv-dot" />
              <div>
                <strong>Nuevo lead</strong>
                <small>Café Andino · Stand A-04</small>
              </div>
            </div>
            <div className="hv-chips">
              <span className="chip-mini teal">Interesado</span>
              <span className="chip-mini blue">Visita</span>
              <span className="chip-mini orange">Correo</span>
            </div>
          </div>
          <div className="hv-card hv-stats">
            <small>Leads hoy</small>
            <strong>24</strong>
            <div className="hv-bars">
              {[40, 65, 50, 85, 70, 95].map((h, i) => (
                <span key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="band-paper" id="flujo">
        <section className="section">
          <div className="section-head">
            <span className="tag-mint">Flujo de cada usuario</span>
            <h2>Tres roles, un mismo recorrido.</h2>
            <p>Cada participante tiene su propio espacio, pero todos se conectan con un escaneo.</p>
          </div>
          <div className="flow-grid">
            {COLUMNAS.map((c) => (
              <article key={c.titulo} className={`flow-col tone-${c.tone}`}>
                <div className="flow-bar" />
                <div className="flow-head">
                  <span className="flow-icon">
                    <c.icon size={21} />
                  </span>
                  <div>
                    <h3>{c.titulo}</h3>
                    <p>{c.sub}</p>
                  </div>
                </div>
                <ol className="flow-steps">
                  {c.pasos.map((p, i) => (
                    <li key={p.t}>
                      <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{p.t}</strong>
                        <span>{p.d}</span>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flow-result">{c.resultado}</div>
                <Link to={c.link} className="flow-link">
                  Entrar como {c.titulo.toLowerCase()} <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="section" id="recorridos">
        <div className="section-head">
          <span className="tag-mint">Dos recorridos QR</span>
          <h2>Un escaneo, dos resultados.</h2>
        </div>
        <div className="qr-band-grid">
          <article className="qr-path">
            <div className="qr-path-head">
              <span className="qr-path-label">
                <IdCard size={14} /> qr-visitante → empresa
              </span>
              <span className="qr-path-dots">
                <i />
                <i />
                <i />
              </span>
            </div>
            <pre className="qr-code-block">
              <span className="c">// en el stand, desde la webapp</span>
              {'\n'}
              <span className="k">const</span> visitante = <span className="f">escanear</span>(<span className="s">"FB-7K3PQX"</span>);
              {'\n'}
              <span className="f">calificar</span>(visitante, <span className="s">"interesado"</span>);
              {'\n'}
              <span className="f">guardarContacto</span>(); <span className="c">// → lead</span>
            </pre>
            <div className="qr-path-body">
              <strong>Escanear → calificar interés → guardar contacto</strong>
              <p>La empresa obtiene un lead; el visitante ve quién registró su visita.</p>
            </div>
          </article>
          <article className="qr-path">
            <div className="qr-path-head">
              <span className="qr-path-label">
                <Store size={14} /> qr-stand → visitante
              </span>
              <span className="qr-path-dots">
                <i />
                <i />
                <i />
              </span>
            </div>
            <pre className="qr-code-block">
              <span className="c">// con la cámara del celular</span>
              {'\n'}
              <span className="k">const</span> ficha = <span className="f">abrir</span>(<span className="s">"/ficha/cafe-andino"</span>);
              {'\n'}
              <span className="f">conocer</span>(ficha.servicios, ficha.fotos);
              {'\n'}
              <span className="f">contactar</span>(ficha.whatsapp);
            </pre>
            <div className="qr-path-body">
              <strong>Escanear → abrir ficha → conocer y contactar</strong>
              <p>Consulta servicios, fotos, logo y datos del negocio.</p>
            </div>
          </article>
        </div>
      </section>

      <div className="band-paper" id="resultados">
        <section className="section outcome-split">
          <div className="section-head">
            <span className="tag-mint">Al final de la feria</span>
            <h2>Cada uno encuentra su información.</h2>
            <p>Sin hojas sueltas ni tarjetas perdidas: los contactos quedan ordenados para el seguimiento.</p>
            <div className="hero-ctas">
              <Link to="/ingresar" className="btn btn-sky">
                Ver un ejemplo <ArrowRight size={16} />
              </Link>
              <Link to="/nosotros" className="btn btn-outline">
                Conoce FeriaBot Pro <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="outcome-stack">
            <div className="outcome">
              <span className="badge tone-orange">
                <ContactRound size={13} /> Empresa
              </span>
              <h3>Leads con nivel de interés</h3>
              <p>Nombre, teléfono, correo y calificación de cada contacto, más su ficha pública con información y fotos.</p>
            </div>
            <div className="outcome">
              <span className="badge tone-blue">
                <LayoutDashboard size={13} /> Organizador
              </span>
              <h3>La feria completa en un panel</h3>
              <p>Empresas participantes, visitantes registrados y todos los contactos generados.</p>
            </div>
            <div className="outcome">
              <span className="badge tone-teal">
                <Users size={13} /> Visitante
              </span>
              <h3>Su propio historial</h3>
              <p>Las empresas que escanearon su QR y las fichas que visitó, con sus datos de contacto.</p>
            </div>
          </div>
        </section>
      </div>

      <footer className="landing-foot">
        <div className="foot-inner">
          <div>
            <Link to="/" className="brand">
              <img src="/favicon.png" alt="" width={30} height={30} />
              <span>
                FeriaBot <b>Pro</b>
              </span>
            </Link>
            <p>Una conexión en el stand puede convertirse en una conversación después de la feria.</p>
          </div>
          <div className="foot-col">
            <h4>Participa</h4>
            <Link to="/ferias">Ver ferias</Link>
            <Link to="/registro">
              <UserPlus size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              Registro de visitante
            </Link>
            <Link to="/ingresar?rol=empresa">Portal de empresas</Link>
            <Link to="/ingresar?rol=organizador">Panel del organizador</Link>
          </div>
          <div className="foot-col">
            <h4>Producto</h4>
            <a href="#flujo">Cómo funciona</a>
            <a href="#recorridos">Recorridos QR</a>
            <a href="#resultados">Resultados</a>
            <Link to="/nosotros">Nosotros</Link>
          </div>
          <div className="foot-col">
            <h4>Legal</h4>
            <Link to="/privacidad">Política de privacidad</Link>
            <Link to="/tratamiento-datos">Tratamiento de datos</Link>
          </div>
        </div>
        <div className="foot-legal">
          <span>© {new Date().getFullYear()} FeriaBot Pro</span>
          <span>Datos personales tratados conforme a la LOPDP (Ecuador)</span>
        </div>
      </footer>
    </div>
  );
}
