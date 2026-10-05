import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Globe, ImageIcon, Mail, MapPin, MessageCircle, Phone, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { empresasApi, vistasApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { Avatar, EmptyState, Loader } from '../components/ui';

/** Ficha digital de una empresa. Es lo que abre el QR del stand. */
export default function FichaPublica() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { data: empresa, cargando } = useAsync(() => empresasApi.obtener(id), [id]);
  const [registrada, setRegistrada] = useState(false);
  const [fotoActiva, setFotoActiva] = useState<string | null>(null);

  useEffect(() => {
    if (empresa && session?.role === 'visitante' && session.refId) {
      vistasApi.registrar(session.refId, empresa.id).then(() => setRegistrada(true));
    }
  }, [empresa, session]);

  if (cargando) return <div className="ficha-page"><Loader /></div>;
  if (!empresa)
    return (
      <div className="ficha-page">
        <EmptyState icon={<ImageIcon />} title="Esta ficha no existe">
          <Link to="/" className="btn btn-primary">Ir al inicio</Link>
        </EmptyState>
      </div>
    );

  const tel = empresa.telefono.replace(/[^\d+]/g, '');
  const wa = tel.replace(/^\+/, '');

  return (
    <div className="ficha-page">
      <div className="ficha-cover">
        <button className="icon-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Volver">
          <ArrowLeft size={20} />
        </button>
        <span className="brand-mini">FeriaBot Pro · Ficha digital</span>
      </div>

      <div className="ficha">
        <div className="ficha-head card">
          <Avatar nombre={empresa.nombre} src={empresa.logo} size={84} square />
          <div className="ficha-head-text">
            <span className="badge tone-orange">
              <MapPin size={13} /> Stand {empresa.stand}
            </span>
            <h1>{empresa.nombre}</h1>
            <p className="muted">{empresa.rubro}</p>
          </div>
        </div>

        {registrada && (
          <div className="alert tone-teal ficha-visto">
            <CheckCircle2 size={18} /> Guardamos esta empresa en tu historial de la feria.
          </div>
        )}
        {!session && (
          <div className="alert tone-blue ficha-visto">
            ¿Eres visitante? <Link to="/ingresar?rol=visitante">Ingresa</Link> para guardar esta empresa en tu historial.
          </div>
        )}

        <section className="card">
          <h2 className="ficha-h2">Sobre nosotros</h2>
          <p className="ficha-desc">{empresa.descripcion || 'Esta empresa aún no ha completado su descripción.'}</p>
          {empresa.servicios.length > 0 && (
            <>
              <h3 className="ficha-h3">Servicios</h3>
              <div className="tags">
                {empresa.servicios.map((s) => (
                  <span key={s} className="tag">{s}</span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2 className="ficha-h2">Galería</h2>
          {empresa.fotos.length ? (
            <div className="galeria">
              {empresa.fotos.map((f, i) => (
                <button key={i} className="galeria-item" onClick={() => setFotoActiva(f)}>
                  <img src={f} alt={`Foto ${i + 1} de ${empresa.nombre}`} />
                </button>
              ))}
            </div>
          ) : (
            <div className="galeria">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`galeria-item placeholder p${i}`}>
                  <ImageIcon size={26} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="ficha-h2">Contacto</h2>
          <ul className="contact-list">
            {empresa.contactoNombre && (
              <li>
                <UserRound size={18} /> {empresa.contactoNombre}
              </li>
            )}
            <li>
              <Mail size={18} /> <a href={`mailto:${empresa.email}`}>{empresa.email}</a>
            </li>
            <li>
              <Phone size={18} /> <a href={`tel:${tel}`}>{empresa.telefono}</a>
            </li>
            {empresa.sitioWeb && (
              <li>
                <Globe size={18} /> <a href={empresa.sitioWeb} target="_blank" rel="noreferrer">{empresa.sitioWeb.replace(/^https?:\/\//, '')}</a>
              </li>
            )}
          </ul>
          <div className="ficha-actions">
            <a className="btn btn-teal" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
              <MessageCircle size={17} /> WhatsApp
            </a>
            <a className="btn btn-outline" href={`mailto:${empresa.email}`}>
              <Mail size={17} /> Escribir correo
            </a>
          </div>
        </section>
      </div>

      {fotoActiva && (
        <div className="lightbox" onClick={() => setFotoActiva(null)}>
          <img src={fotoActiva} alt="" />
        </div>
      )}
    </div>
  );
}
