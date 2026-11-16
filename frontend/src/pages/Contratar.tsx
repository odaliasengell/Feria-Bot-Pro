import { useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, FileText, Landmark, Lock, Pencil, Upload, X } from 'lucide-react';
import type { DatosTransferencia, MetodoPago, Periodo, Plan, PlanId, SolicitudCreada } from '../types';
import { planesApi } from '../services/api';
import { useAsync } from '../lib/useAsync';
import { dinero } from '../lib/planes';
import { redimensionarImagen } from '../lib/utils';
import { errorEmail, errorNombre, errorRuc, errorTelefono, limpiarRuc } from '../lib/validacion';
import { useValidacion } from '../lib/useValidacion';
import { usePagina } from '../lib/seo';
import { Alert, Field, Loader } from '../components/ui';
import AceptoPolitica from '../components/AceptoPolitica';
import CajitaPayPhone from '../components/CajitaPayPhone';
import { CabeceraCheckout, Recibo } from '../components/Checkout';
import { MarcasAceptadas } from '../components/MarcasTarjeta';

type Datos = { nombre: string; ruc: string; contactoNombre: string; email: string; telefono: string; ciudad: string; mensaje: string };
const VACIOS: Datos = { nombre: '', ruc: '', contactoNombre: '', email: '', telefono: '', ciudad: '', mensaje: '' };

function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(file);
  });
}

/** Contratar un plan: 1) datos de la organización, 2) pago (tarjeta con PayPhone o transferencia), 3) comenzar. */
export default function Contratar() {
  usePagina({ titulo: 'Contratar un plan', descripcion: 'Contrata FeriaBot Pro para organizar tus ferias con QR, leads y control de acceso.' });
  const [params] = useSearchParams();
  const { data, cargando, error } = useAsync(() => Promise.all([planesApi.listar(), planesApi.transferencia(), planesApi.metodos()]), []);

  if (cargando && !data) return <Loader />;
  if (error || !data)
    return (
      <div className="ck-pagina">
        <CabeceraCheckout paso={1} />
        <div className="ck-cuerpo">
          <Alert>{error ?? 'No se pudieron cargar los planes.'}</Alert>
        </div>
      </div>
    );
  const [planes, banco, metodos] = data;
  const planInicial = params.get('plan') as PlanId | null;
  return (
    <Checkout
      planes={planes}
      banco={banco}
      tarjetaActiva={metodos.tarjeta}
      tarjetaDemo={metodos.demo}
      planInicial={planes.some((p) => p.id === planInicial) ? planInicial! : planes[0]!.id}
      periodoInicial={params.get('periodo') === 'anual' ? 'anual' : 'mensual'}
    />
  );
}

function Checkout({
  planes,
  banco,
  tarjetaActiva,
  tarjetaDemo,
  planInicial,
  periodoInicial,
}: {
  planes: Plan[];
  banco: DatosTransferencia;
  tarjetaActiva: boolean;
  tarjetaDemo: boolean;
  planInicial: PlanId;
  periodoInicial: Periodo;
}) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [planId, setPlanId] = useState<PlanId>(planInicial);
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [datos, setDatos] = useState<Datos>(VACIOS);
  const [acepta, setAcepta] = useState(false);
  const [trampa, setTrampa] = useState('');
  /** Solicitud ya creada (tarjeta: con la cajita; transferencia: confirmación). */
  const [solicitud, setSolicitud] = useState<SolicitudCreada | null>(null);
  const plan = planes.find((p) => p.id === planId)!;
  // Con la cajita ya generada, el plan queda fijo (el monto viaja en la cajita).
  const bloqueado = !!solicitud;

  function arriba() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="ck-pagina">
      <CabeceraCheckout paso={paso} />
      <div className="ck-cuerpo">
        <main className="ck-principal">
          {paso === 1 && (
            <PasoDatos
              datos={datos}
              setDatos={setDatos}
              acepta={acepta}
              setAcepta={setAcepta}
              trampa={trampa}
              setTrampa={setTrampa}
              onContinuar={() => {
                setPaso(2);
                arriba();
              }}
            />
          )}
          {paso === 2 && (
            <PasoPago
              plan={plan}
              periodo={periodo}
              datos={datos}
              acepta={acepta}
              trampa={trampa}
              banco={banco}
              tarjetaActiva={tarjetaActiva}
              tarjetaDemo={tarjetaDemo}
              solicitud={solicitud}
              setSolicitud={setSolicitud}
              onEditarDatos={() => {
                setSolicitud(null);
                setPaso(1);
              }}
              onTransferenciaEnviada={(s) => {
                setSolicitud(s);
                setPaso(3);
                arriba();
              }}
            />
          )}
          {paso === 3 && solicitud && <Enviada s={solicitud} />}
        </main>
        <Recibo
          plan={plan}
          periodo={periodo}
          planes={bloqueado || paso === 3 ? undefined : planes}
          onCambiarPlan={setPlanId}
          onCambiarPeriodo={setPeriodo}
        />
      </div>
    </div>
  );
}

/* ---------------- Paso 1: datos de la organización ---------------- */

function PasoDatos({
  datos: f,
  setDatos: setF,
  acepta,
  setAcepta,
  trampa,
  setTrampa,
  onContinuar,
}: {
  datos: Datos;
  setDatos: (d: Datos) => void;
  acepta: boolean;
  setAcepta: (v: boolean) => void;
  trampa: string;
  setTrampa: (v: string) => void;
  onContinuar: () => void;
}) {
  const set = (k: keyof Datos) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const v = useValidacion({
    nombre: errorNombre(f.nombre, { campo: 'El nombre de tu organización' }),
    ruc: errorRuc(f.ruc),
    contactoNombre: errorNombre(f.contactoNombre, { campo: 'Tu nombre' }),
    email: errorEmail(f.email),
    telefono: errorTelefono(f.telefono),
    acepta: acepta ? null : 'Debes aceptar la política de privacidad para continuar.',
  });
  const props = (k: Parameters<typeof v.error>[0]) => ({ onBlur: v.tocar(k), 'aria-invalid': !!v.error(k) });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (v.validar()) onContinuar();
  }

  return (
    <form onSubmit={enviar} noValidate className="ck-seccion">
      <h1 className="ck-titulo">Datos de tu organización</h1>
      <p className="muted">Con estos datos creamos tu cuenta de organizador. El acceso llega al correo que escribas.</p>
      <div className="form-grid">
        <Field label="Nombre o razón social" full error={v.error('nombre')}>
          <input className="input" value={f.nombre} onChange={set('nombre')} {...props('nombre')} maxLength={150} autoFocus />
        </Field>
        <Field label="RUC" error={v.error('ruc')}>
          <input
            className="input input-ruc"
            inputMode="numeric"
            value={f.ruc}
            onChange={(e) => setF({ ...f, ruc: e.target.value.replace(/[^\d\s-]/g, '') })}
            {...props('ruc')}
            maxLength={17}
            placeholder="13 dígitos"
          />
        </Field>
        <Field label="Ciudad" opcional>
          <input className="input" value={f.ciudad} onChange={set('ciudad')} maxLength={100} />
        </Field>
        <Field label="Tu nombre" error={v.error('contactoNombre')}>
          <input className="input" value={f.contactoNombre} onChange={set('contactoNombre')} {...props('contactoNombre')} maxLength={150} autoComplete="name" />
        </Field>
        <Field label="Teléfono" error={v.error('telefono')}>
          <input className="input" type="tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} {...props('telefono')} maxLength={40} autoComplete="tel" />
        </Field>
        <Field label="Correo" full hint="Aquí te enviaremos el acceso a tu panel." error={v.error('email')}>
          <input className="input" type="email" inputMode="email" value={f.email} onChange={set('email')} {...props('email')} maxLength={150} autoComplete="email" />
        </Field>
      </div>
      <div className="campo-trampa" aria-hidden="true">
        <label>
          Sitio web de tu empresa
          <input type="text" name="empresa_web" tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
        </label>
      </div>
      <AceptoPolitica checked={acepta} onChange={setAcepta} />
      {v.error('acepta') && <span className="field-error">{v.error('acepta')}</span>}
      <div className="ck-acciones">
        <Link to="/#planes" className="btn btn-ghost">
          <ArrowLeft size={16} /> Ver planes
        </Link>
        <button className="btn btn-primary btn-lg">
          Continuar al pago <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}

/* ---------------- Paso 2: método de pago ---------------- */

function PasoPago({
  plan,
  periodo,
  datos,
  acepta,
  trampa,
  banco,
  tarjetaActiva,
  tarjetaDemo,
  solicitud,
  setSolicitud,
  onEditarDatos,
  onTransferenciaEnviada,
}: {
  plan: Plan;
  periodo: Periodo;
  datos: Datos;
  acepta: boolean;
  trampa: string;
  banco: DatosTransferencia;
  tarjetaActiva: boolean;
  tarjetaDemo: boolean;
  solicitud: SolicitudCreada | null;
  setSolicitud: (s: SolicitudCreada | null) => void;
  onEditarDatos: () => void;
  onTransferenciaEnviada: (s: SolicitudCreada) => void;
}) {
  const [metodo, setMetodo] = useState<MetodoPago>(tarjetaActiva ? 'tarjeta' : 'transferencia');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const monto = periodo === 'anual' ? plan.precioAnual : plan.precioMensual;

  async function solicitar(metodoPago: MetodoPago, extra: { comprobante?: string; referencia?: string } = {}) {
    setEnviando(true);
    setError(null);
    try {
      const r = await planesApi.solicitar({
        planId: plan.id,
        periodo,
        metodoPago,
        ...datos,
        nombre: datos.nombre.trim(),
        ruc: limpiarRuc(datos.ruc),
        email: datos.email.trim(),
        referencia: extra.referencia ?? '',
        comprobante: extra.comprobante,
        aceptaPolitica: acepta,
        empresaWeb: trampa,
      });
      if (metodoPago === 'tarjeta') setSolicitud(r);
      else onTransferenciaEnviada(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="ck-seccion">
      <div className="ck-datos-resumen">
        <div>
          <strong>{datos.nombre}</strong>
          <span className="muted small">
            RUC {limpiarRuc(datos.ruc)} · {datos.email}
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEditarDatos}>
          <Pencil size={14} /> Editar
        </button>
      </div>

      <h1 className="ck-titulo">Selecciona un método de pago</h1>
      {error && <Alert>{error}</Alert>}

      <div className="ck-metodos" role="radiogroup" aria-label="Método de pago">
        {/* Tarjeta */}
        <div className={`ck-metodo ${metodo === 'tarjeta' ? 'is-abierto' : ''} ${tarjetaActiva ? '' : 'is-inactivo'}`}>
          <button
            type="button"
            role="radio"
            aria-checked={metodo === 'tarjeta'}
            className="ck-metodo-cabecera"
            disabled={!tarjetaActiva || (!!solicitud && metodo !== 'tarjeta')}
            onClick={() => setMetodo('tarjeta')}
          >
            <span className="ck-radio" aria-hidden />
            <span className="ck-metodo-texto">
              <strong>Tarjeta de débito o crédito</strong>
              <span>{!tarjetaActiva ? 'Próximamente' : tarjetaDemo ? 'Modo demostración · no se cobra' : 'Pago seguro con PayPhone'}</span>
            </span>
            <MarcasAceptadas />
          </button>
          {metodo === 'tarjeta' && tarjetaActiva && (
            <div className="ck-metodo-cuerpo">
              {solicitud?.cajita ? (
                <>
                  <CajitaPayPhone opciones={solicitud.cajita} />
                  <p className="ck-seguro">
                    <Lock size={14} /> Pago seguro con PayPhone: tu tarjeta no pasa por FeriaBot Pro. El formulario vence en 10 minutos; si vence, pulsa
                    «Editar» y continúa de nuevo.
                  </p>
                </>
              ) : (
                <>
                  <p className="muted">Al continuar, el formulario seguro de PayPhone aparece aquí mismo. Tu cuenta se activa en cuanto se apruebe el pago.</p>
                  <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => solicitar('tarjeta')} disabled={enviando}>
                    <Lock size={16} /> {enviando ? 'Preparando el pago…' : `Pagar ${dinero(monto)} con tarjeta`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Transferencia */}
        <div className={`ck-metodo ${metodo === 'transferencia' ? 'is-abierto' : ''}`}>
          <button
            type="button"
            role="radio"
            aria-checked={metodo === 'transferencia'}
            className="ck-metodo-cabecera"
            disabled={!!solicitud}
            onClick={() => setMetodo('transferencia')}
          >
            <span className="ck-radio" aria-hidden />
            <span className="ck-metodo-texto">
              <strong>Transferencia bancaria</strong>
              <span>Transfiere, sube el comprobante y confirmamos tu pago</span>
            </span>
            <Landmark size={22} />
          </button>
          {metodo === 'transferencia' && (
            <div className="ck-metodo-cuerpo">
              <Transferencia banco={banco} monto={monto} enviando={enviando} onEnviar={(comprobante, referencia) => solicitar('transferencia', { comprobante, referencia })} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Transferencia({
  banco,
  monto,
  enviando,
  onEnviar,
}: {
  banco: DatosTransferencia;
  monto: number;
  enviando: boolean;
  onEnviar: (comprobante: string, referencia: string) => void;
}) {
  const [comprobante, setComprobante] = useState<{ nombre: string; url: string } | null>(null);
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const hayBanco = !!(banco.banco && banco.numeroCuenta);

  async function elegir(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) return setError('El comprobante debe ser una imagen (JPG, PNG o WebP) o un PDF.');
    if (file.type === 'application/pdf' && file.size > 700 * 1024) return setError('El PDF pesa más de 700 KB. Sube una captura de pantalla del comprobante.');
    if (file.size > 15 * 1024 * 1024) return setError('La imagen pesa demasiado (máximo 15 MB).');
    setError(null);
    // Las fotos y capturas se comprimen (JPEG, máx. 1600 px): suelen bajar de varios MB a unos 200–400 KB.
    const url = file.type === 'application/pdf' ? await leerArchivo(file) : await redimensionarImagen(file, 1600, true);
    setComprobante({ nombre: file.name, url });
  }

  async function copiar(texto: string, clave: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      /* sin portapapeles: el dato está a la vista */
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!comprobante) return setError('Sube el comprobante de la transferencia.');
    onEnviar(comprobante.url, referencia.trim());
  }

  const filas: [string, string, string][] = [
    ['Banco', banco.banco, 'banco'],
    ['Tipo de cuenta', banco.tipoCuenta, 'tipo'],
    ['Número de cuenta', banco.numeroCuenta, 'numero'],
    ['Titular', banco.titular, 'titular'],
    ['RUC / C.I.', banco.identificacion, 'ident'],
    ['Monto', dinero(monto), 'monto'],
  ];

  return (
    <form onSubmit={enviar} className="stack" noValidate>
      {hayBanco ? (
        <ul className="contratar-banco">
          {filas
            .filter(([, valor]) => valor)
            .map(([etiqueta, valor, clave]) => (
              <li key={clave}>
                <span>{etiqueta}</span>
                <b>{valor}</b>
                <button type="button" className="icon-btn" onClick={() => copiar(valor, clave)} aria-label={`Copiar ${etiqueta}`} title="Copiar">
                  {copiado === clave ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <Alert tone="blue">Pronto publicaremos los datos bancarios. Escríbenos y te los enviamos.</Alert>
      )}
      {banco.instrucciones && <p className="muted small">{banco.instrucciones}</p>}

      <Field label="Comprobante" hint="Foto o captura de la transferencia (la comprimimos al subirla) o un PDF de hasta 700 KB.">
        {comprobante ? (
          <div className="comprobante-elegido">
            {comprobante.url.startsWith('data:image/') ? <img src={comprobante.url} alt="Comprobante" /> : <FileText size={28} />}
            <span>{comprobante.nombre}</span>
            <button type="button" className="icon-btn" onClick={() => setComprobante(null)} aria-label="Quitar comprobante">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button type="button" className="subir-comprobante" onClick={() => archivoRef.current?.click()}>
            <Upload size={20} /> Subir comprobante
          </button>
        )}
        <input
          ref={archivoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          hidden
          onChange={(e) => {
            elegir(e.target.files);
            e.target.value = '';
          }}
        />
      </Field>
      <Field label="Número de transacción" opcional>
        <input className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} placeholder="Ej. 123456789" />
      </Field>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn-primary btn-lg btn-block" disabled={enviando || !hayBanco}>
        {enviando ? 'Enviando…' : `Enviar comprobante · ${dinero(monto)}`}
      </button>
      <p className="muted small">Un encargado confirmará tu transferencia y te enviaremos el acceso por correo.</p>
    </form>
  );
}

/* ---------------- Paso 3: transferencia enviada ---------------- */

function Enviada({ s }: { s: SolicitudCreada }) {
  return (
    <section className="ck-seccion ck-listo">
      <CheckCircle2 size={52} />
      <h1 className="ck-titulo">¡Recibimos tu comprobante!</h1>
      <p>
        Un encargado de FeriaBot Pro confirmará tu transferencia de <b>{dinero(s.monto)}</b> y te enviaremos el acceso a tu panel a <b>{s.email}</b>.
      </p>
      <p className="muted small">Normalmente lo confirmamos en menos de un día hábil. Revisa también tu carpeta de spam.</p>
      <Link to="/" className="btn btn-primary">
        Volver al inicio
      </Link>
    </section>
  );
}
