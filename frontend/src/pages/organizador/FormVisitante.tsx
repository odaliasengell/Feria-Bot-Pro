import type { NuevoVisitante } from '../../types';
import { Field } from '../../components/ui';
import { errorEmail, errorNombre, errorTelefono } from '../../lib/validacion';

export const visitanteVacio: NuevoVisitante = { nombre: '', telefono: '', email: '', empresa: '', ciudad: '' };

/** Errores del formulario de visitante (para useValidacion). */
export function erroresVisitante(v: NuevoVisitante) {
  return {
    nombre: errorNombre(v.nombre, { campo: 'El nombre' }),
    telefono: errorTelefono(v.telefono),
    email: errorEmail(v.email),
    empresa: v.empresa.trim().length > 150 ? 'La empresa admite hasta 150 caracteres.' : null,
    ciudad: errorNombre(v.ciudad, { campo: 'La ciudad', max: 100 }),
  };
}

type Campo = keyof ReturnType<typeof erroresVisitante>;

export default function FormVisitante({
  value,
  onChange,
  error = () => null,
  tocar = () => () => undefined,
}: {
  value: NuevoVisitante;
  onChange: (v: NuevoVisitante) => void;
  /** De useValidacion: error visible de cada campo. */
  error?: (campo: Campo) => string | null;
  tocar?: (campo: Campo) => () => void;
}) {
  const set = (k: keyof NuevoVisitante) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const props = (k: Campo) => ({ onBlur: tocar(k), 'aria-invalid': !!error(k) });
  return (
    <div className="form-grid">
      <Field label="Nombre completo" full error={error('nombre')}>
        <input className="input" value={value.nombre} onChange={set('nombre')} {...props('nombre')} maxLength={150} autoComplete="name" placeholder="Ej. María José Castro" />
      </Field>
      <Field label="Teléfono" error={error('telefono')}>
        <input className="input" type="tel" inputMode="tel" value={value.telefono} onChange={set('telefono')} {...props('telefono')} maxLength={40} autoComplete="tel" placeholder="+593 99 123 4567" />
      </Field>
      <Field label="Correo" error={error('email')} hint="Te enviaremos un código para confirmarlo.">
        <input className="input" type="email" inputMode="email" value={value.email} onChange={set('email')} {...props('email')} maxLength={150} autoComplete="email" placeholder="tu@correo.com" />
      </Field>
      <Field label="Empresa" opcional error={error('empresa')}>
        <input className="input" value={value.empresa} onChange={set('empresa')} {...props('empresa')} maxLength={150} autoComplete="organization" placeholder="Donde trabajas" />
      </Field>
      <Field label="Ciudad" error={error('ciudad')}>
        <input className="input" value={value.ciudad} onChange={set('ciudad')} {...props('ciudad')} maxLength={100} autoComplete="address-level2" placeholder="Quito" />
      </Field>
    </div>
  );
}
