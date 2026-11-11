import { useId, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { fuerzaPassword } from '../lib/validacion';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  /** Muestra el medidor de fuerza y los requisitos (para contraseñas nuevas). */
  mostrarFuerza?: boolean;
  invalid?: boolean;
  autoComplete?: 'current-password' | 'new-password' | 'off';
  autoFocus?: boolean;
  placeholder?: string;
  /** Empieza mostrando el texto (útil cuando el organizador crea una contraseña para entregarla). */
  visibleInicial?: boolean;
  ariaLabel?: string;
}

/** Campo de contraseña con botón para ver/ocultar y, opcionalmente, medidor de fuerza. */
export default function PasswordInput({
  value,
  onChange,
  onBlur,
  mostrarFuerza = false,
  invalid = false,
  autoComplete = 'current-password',
  autoFocus,
  placeholder,
  visibleInicial = false,
  ariaLabel,
}: Props) {
  const [visible, setVisible] = useState(visibleInicial);
  const idAyuda = useId();
  const fuerza = fuerzaPassword(value);

  return (
    <>
      <div className="password-wrap">
        <input
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          maxLength={72}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-label={ariaLabel}
          aria-describedby={mostrarFuerza && value ? idAyuda : undefined}
          spellCheck={false}
          autoCapitalize="off"
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>

      {mostrarFuerza && value && (
        <div className="fuerza" id={idAyuda} aria-live="polite">
          <div className="fuerza-barra" data-nivel={fuerza.nivel} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={i <= Math.max(1, fuerza.nivel) ? 'on' : ''} />
            ))}
          </div>
          <span className="fuerza-etiqueta" data-nivel={fuerza.nivel}>
            Seguridad: <b>{fuerza.etiqueta}</b>
          </span>
          {fuerza.consejo && <span className="fuerza-consejo">{fuerza.consejo}</span>}
          <ul className="fuerza-requisitos">
            {fuerza.requisitos.map((r) => (
              <li key={r.texto} className={r.ok ? 'ok' : ''}>
                {r.ok ? <Check size={13} /> : <X size={13} />} {r.texto}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
