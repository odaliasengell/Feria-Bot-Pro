import { useCallback, useState } from 'react';

/**
 * Muestra los errores de un formulario en el momento justo: un campo enseña su error cuando el usuario sale de él
 * (onBlur) o al intentar enviar. `errores` se recalcula en cada render con las funciones de lib/validacion.ts.
 *
 *   const v = useValidacion({ email: errorEmail(email), password: errorPassword(password) });
 *   <Field label="Correo" error={v.error('email')}><input onBlur={v.tocar('email')} aria-invalid={!!v.error('email')} /></Field>
 *   function enviar(e) { e.preventDefault(); if (!v.validar()) return; ... }
 */
export function useValidacion<K extends string>(errores: Record<K, string | null>) {
  const [tocados, setTocados] = useState<ReadonlySet<K>>(new Set());
  const [enviado, setEnviado] = useState(false);

  const error = (campo: K): string | null => (enviado || tocados.has(campo) ? errores[campo] : null);

  const tocar = useCallback(
    (campo: K) => () =>
      setTocados((prev) => {
        if (prev.has(campo)) return prev;
        const s = new Set(prev);
        s.add(campo);
        return s;
      }),
    [],
  );

  const valido = Object.values<string | null>(errores).every((e) => !e);

  /** Marca el formulario como enviado (muestra todos los errores) y lleva el foco al primer campo inválido. */
  function validar(): boolean {
    setEnviado(true);
    if (!valido) {
      requestAnimationFrame(() => {
        const campo = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        campo?.focus();
        campo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
    return valido;
  }

  const reiniciar = useCallback(() => {
    setTocados(new Set());
    setEnviado(false);
  }, []);

  return { error, tocar, validar, reiniciar, valido };
}
