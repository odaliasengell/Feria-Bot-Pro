import type { NuevoVisitante } from '../../types';
import { Field } from '../../components/ui';

export const visitanteVacio: NuevoVisitante = { nombre: '', telefono: '', email: '', empresa: '', ciudad: '' };

export default function FormVisitante({ value, onChange }: { value: NuevoVisitante; onChange: (v: NuevoVisitante) => void }) {
  const set = (k: keyof NuevoVisitante) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="form-grid">
      <Field label="Nombre completo" full>
        <input className="input" value={value.nombre} onChange={set('nombre')} required autoComplete="name" placeholder="Ej. María José Castro" />
      </Field>
      <Field label="Teléfono">
        <input className="input" type="tel" value={value.telefono} onChange={set('telefono')} required autoComplete="tel" placeholder="+593 99 123 4567" />
      </Field>
      <Field label="Correo">
        <input className="input" type="email" value={value.email} onChange={set('email')} required autoComplete="email" placeholder="tu@correo.com" />
      </Field>
      <Field label="Empresa" hint="Opcional">
        <input className="input" value={value.empresa} onChange={set('empresa')} autoComplete="organization" placeholder="Donde trabajas" />
      </Field>
      <Field label="Ciudad">
        <input className="input" value={value.ciudad} onChange={set('ciudad')} required autoComplete="address-level2" placeholder="Quito" />
      </Field>
    </div>
  );
}
