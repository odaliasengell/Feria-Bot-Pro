import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Landmark, Save, Users } from 'lucide-react';
import type { DatosTransferencia, PlanAdmin } from '../../types';
import { adminApi, planesApi } from '../../services/api';
import { useAsync } from '../../lib/useAsync';
import { mensajeError, useToast } from '../../context/ToastContext';
import { useConfirmar } from '../../context/ConfirmarContext';
import { PLAN_TONO, cifra, dinero } from '../../lib/planes';
import { Alert, Card, Field, Loader, PageHeader } from '../../components/ui';

/** El Super Administrador edita precios, límites y visibilidad de cada plan. */
export default function AdminPlanes() {
  const { data, cargando, error, recargar } = useAsync(() => adminApi.planes(), []);
  return (
    <>
      <PageHeader
        title="Planes y precios"
        subtitle="Lo que cobras a los organizadores y lo que incluye cada plan. Los precios se muestran en la página principal."
      />
      {cargando && !data ? (
        <Loader />
      ) : error || !data ? (
        <Alert>{error}</Alert>
      ) : (
        <div className="planes-editor">
          {data.map((p) => (
            <EditorPlan key={p.id} plan={p} onGuardado={recargar} />
          ))}
        </div>
      )}
      <CuentaTransferencia />
      <p className="muted small admin-nota">
        Los precios son en dólares (USD). Si bajas un límite, rige de inmediato para los organizadores con ese plan: lo que ya
        tienen no se borra, pero no pueden crear más hasta quedar por debajo.
      </p>
    </>
  );
}

function EditorPlan({ plan, onGuardado }: { plan: PlanAdmin; onGuardado: () => void }) {
  const [f, setF] = useState({
    nombre: plan.nombre,
    descripcion: plan.descripcion,
    precioMensual: String(plan.precioMensual),
    precioAnual: String(plan.precioAnual),
    ferias: String(plan.ferias),
    empresasPorFeria: String(plan.empresasPorFeria),
    visitantesPorFeria: String(plan.visitantesPorFeria),
    publico: plan.publico,
  });
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  const confirmar = useConfirmar();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const num = (v: string) => Number(v.replace(',', '.'));
  const errores = {
    nombre: f.nombre.trim().length < 2 ? 'Escribe el nombre.' : null,
    precioMensual: !(num(f.precioMensual) >= 0) || f.precioMensual.trim() === '' ? 'Precio no válido.' : null,
    precioAnual: !(num(f.precioAnual) >= 0) || f.precioAnual.trim() === '' ? 'Precio no válido.' : null,
    ferias: !(Number.isInteger(num(f.ferias)) && num(f.ferias) >= 1) ? 'Mínimo 1.' : null,
    empresasPorFeria: !(Number.isInteger(num(f.empresasPorFeria)) && num(f.empresasPorFeria) >= 1) ? 'Mínimo 1.' : null,
    visitantesPorFeria: !(Number.isInteger(num(f.visitantesPorFeria)) && num(f.visitantesPorFeria) >= 1) ? 'Mínimo 1.' : null,
  };
  const hayError = Object.values(errores).some(Boolean);
  const cambiado =
    f.nombre !== plan.nombre ||
    f.descripcion !== plan.descripcion ||
    num(f.precioMensual) !== plan.precioMensual ||
    num(f.precioAnual) !== plan.precioAnual ||
    num(f.ferias) !== plan.ferias ||
    num(f.empresasPorFeria) !== plan.empresasPorFeria ||
    num(f.visitantesPorFeria) !== plan.visitantesPorFeria ||
    f.publico !== plan.publico;
  const doceMeses = num(f.precioMensual) * 12;
  const ahorro = doceMeses > 0 && num(f.precioAnual) < doceMeses ? Math.round((1 - num(f.precioAnual) / doceMeses) * 100) : 0;
  const baja =
    num(f.ferias) < plan.ferias || num(f.empresasPorFeria) < plan.empresasPorFeria || num(f.visitantesPorFeria) < plan.visitantesPorFeria;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (hayError || !cambiado) return;
    if (baja && plan.clientes > 0) {
      const ok = await confirmar({
        titulo: `Bajar límites del plan ${plan.nombre}`,
        mensaje: (
          <>
            <p>
              <b>{plan.clientes}</b> {plan.clientes === 1 ? 'organizador tiene' : 'organizadores tienen'} este plan. Los límites nuevos rigen de inmediato.
            </p>
            <p className="muted small">No se borra nada: quien ya pase el límite no podrá crear más hasta quedar por debajo.</p>
          </>
        ),
        confirmar: 'Guardar de todos modos',
      });
      if (!ok) return;
    }
    setGuardando(true);
    try {
      await adminApi.actualizarPlan(plan.id, {
        nombre: f.nombre.trim(),
        descripcion: f.descripcion.trim(),
        precioMensual: num(f.precioMensual),
        precioAnual: num(f.precioAnual),
        ferias: num(f.ferias),
        empresasPorFeria: num(f.empresasPorFeria),
        visitantesPorFeria: num(f.visitantesPorFeria),
        publico: f.publico,
      });
      toast.exito(`Plan ${f.nombre.trim()} actualizado.`);
      onGuardado();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo guardar el plan.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className={`plan-editor ${f.publico ? '' : 'is-oculto'}`} onSubmit={guardar}>
      <div className="plan-editor-cabecera">
        <span className={`badge tone-${PLAN_TONO[plan.id]}`}>{plan.id}</span>
        <span className="muted small">
          <Users size={13} /> {plan.clientes} {plan.clientes === 1 ? 'cliente' : 'clientes'}
        </span>
        <button
          type="button"
          className={`btn btn-sm ${f.publico ? 'btn-ghost' : 'btn-outline'}`}
          onClick={() => setF({ ...f, publico: !f.publico })}
          title={f.publico ? 'Se muestra en la página principal' : 'Oculto en la página principal'}
        >
          {f.publico ? <Eye size={15} /> : <EyeOff size={15} />} {f.publico ? 'Visible' : 'Oculto'}
        </button>
      </div>

      <Field label="Nombre" error={errores.nombre}>
        <input className="input" value={f.nombre} onChange={set('nombre')} maxLength={60} />
      </Field>
      <Field label="Descripción" opcional>
        <textarea className="input" rows={2} value={f.descripcion} onChange={set('descripcion')} maxLength={300} />
      </Field>

      <div className="plan-editor-precios">
        <Field label="Precio mensual (USD)" error={errores.precioMensual}>
          <div className="input-dinero">
            <span>$</span>
            <input className="input" inputMode="decimal" value={f.precioMensual} onChange={set('precioMensual')} />
          </div>
        </Field>
        <Field label="Precio anual (USD)" error={errores.precioAnual} hint={ahorro > 0 ? `${ahorro} % menos que 12 meses (${dinero(doceMeses)})` : undefined}>
          <div className="input-dinero">
            <span>$</span>
            <input className="input" inputMode="decimal" value={f.precioAnual} onChange={set('precioAnual')} />
          </div>
        </Field>
      </div>

      <div className="plan-editor-limites">
        <Field label="Ferias a la vez" error={errores.ferias}>
          <input className="input" inputMode="numeric" value={f.ferias} onChange={set('ferias')} />
        </Field>
        <Field label="Empresas por feria" error={errores.empresasPorFeria}>
          <input className="input" inputMode="numeric" value={f.empresasPorFeria} onChange={set('empresasPorFeria')} />
        </Field>
        <Field label="Visitantes por feria" error={errores.visitantesPorFeria}>
          <input className="input" inputMode="numeric" value={f.visitantesPorFeria} onChange={set('visitantesPorFeria')} />
        </Field>
      </div>

      <div className="plan-editor-pie">
        <span className="muted small">
          {cambiado ? 'Cambios sin guardar' : `${dinero(plan.precioMensual)}/mes · ${cifra(plan.visitantesPorFeria)} visitantes por feria`}
        </span>
        <button className="btn btn-primary btn-sm" disabled={!cambiado || hayError || guardando}>
          <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

const SIN_DATOS: DatosTransferencia = { banco: '', tipoCuenta: '', numeroCuenta: '', titular: '', identificacion: '', correo: '', instrucciones: '' };

/** Cuenta bancaria que ven los clientes al contratar por transferencia. */
function CuentaTransferencia() {
  const [f, setF] = useState<DatosTransferencia | null>(null);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  useEffect(() => {
    planesApi.transferencia().then(setF).catch(() => setF(SIN_DATOS));
  }, []);
  if (!f) return <Loader />;
  const set = (k: keyof DatosTransferencia) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      setF(await adminApi.guardarTransferencia(f!));
      toast.exito('Datos bancarios guardados. Ya se muestran al contratar.');
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudieron guardar los datos bancarios.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card title="Datos para transferencia" className="cuenta-transferencia">
      <form onSubmit={guardar} className="empresa-grid">
        <p className="muted small span-3">
          <Landmark size={14} /> Los ve quien contrata un plan en la página principal. Al aprobar una solicitud confirmas que el dinero llegó a esta cuenta.
        </p>
        <Field label="Banco">
          <input className="input" value={f.banco} onChange={set('banco')} maxLength={100} placeholder="Banco Pichincha" />
        </Field>
        <Field label="Tipo de cuenta">
          <input className="input" value={f.tipoCuenta} onChange={set('tipoCuenta')} maxLength={40} placeholder="Corriente / Ahorros" />
        </Field>
        <Field label="Número de cuenta">
          <input className="input input-ruc" value={f.numeroCuenta} onChange={set('numeroCuenta')} maxLength={40} />
        </Field>
        <Field label="Titular">
          <input className="input" value={f.titular} onChange={set('titular')} maxLength={150} />
        </Field>
        <Field label="RUC / C.I. del titular">
          <input className="input input-ruc" value={f.identificacion} onChange={set('identificacion')} maxLength={20} />
        </Field>
        <Field label="Correo para pagos" opcional>
          <input className="input" type="email" value={f.correo} onChange={set('correo')} maxLength={150} />
        </Field>
        <Field label="Instrucciones" opcional full>
          <input className="input" value={f.instrucciones} onChange={set('instrucciones')} maxLength={500} placeholder="Ej. Escribe tu RUC en la descripción de la transferencia." />
        </Field>
        <div className="span-3 plan-editor-pie">
          <span className="muted small">{f.banco && f.numeroCuenta ? 'Visible en el formulario de contratación.' : 'Sin datos: el formulario pide escribirte.'}</span>
          <button className="btn btn-primary btn-sm" disabled={guardando}>
            <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar datos bancarios'}
          </button>
        </div>
      </form>
    </Card>
  );
}
