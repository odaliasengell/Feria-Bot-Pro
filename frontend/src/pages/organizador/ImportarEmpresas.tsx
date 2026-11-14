import { useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Download, Upload } from 'lucide-react';
import type { Feria, ResultadoImportacion } from '../../types';
import { empresasApi } from '../../services/api';
import { Alert } from '../../components/ui';

/** Carga masiva de empresas: plantilla, subida del .xlsx y resultado con los errores por fila. */
export default function ImportarEmpresas({ feria, onImportadas }: { feria: Feria; onImportadas: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [bajando, setBajando] = useState(false);

  async function plantilla() {
    setBajando(true);
    setError(null);
    try {
      await empresasApi.descargarPlantilla();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar la plantilla');
    } finally {
      setBajando(false);
    }
  }

  async function subir(e: FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith('.xlsx')) {
      setError('El archivo debe ser un Excel .xlsx (usa la plantilla).');
      return;
    }
    setSubiendo(true);
    setError(null);
    setResultado(null);
    try {
      const r = await empresasApi.importar(feria.id, archivo);
      setResultado(r);
      if (r.creadas > 0) onImportadas();
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar el archivo');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="stack">
      <ol className="import-pasos">
        <li>
          Descarga la plantilla y completa una empresa por fila (nombre, RUC y correo son obligatorios).{' '}
          <button type="button" className="btn btn-outline btn-sm" onClick={plantilla} disabled={bajando}>
            <Download size={14} /> {bajando ? 'Descargando…' : 'Descargar plantilla'}
          </button>
        </li>
        <li>Sube el archivo: las empresas se crean en «{feria.nombre}».</li>
        <li>Las filas con errores no se cargan; corrígelas y vuelve a subir solo esas filas.</li>
      </ol>

      <form className="import-archivo" onSubmit={subir}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setError(null);
          }}
          aria-label="Archivo Excel"
        />
        <button className="btn btn-primary" disabled={!archivo || subiendo}>
          <Upload size={16} /> {subiendo ? 'Importando…' : 'Importar'}
        </button>
      </form>

      {error && <Alert>{error}</Alert>}

      {resultado && (
        <>
          <Alert tone={resultado.creadas > 0 ? 'teal' : 'orange'}>
            <CheckCircle2 size={16} style={{ verticalAlign: -3 }} />{' '}
            {resultado.creadas === 0
              ? 'No se creó ninguna empresa.'
              : `${resultado.creadas} ${resultado.creadas === 1 ? 'empresa creada' : 'empresas creadas'}.`}{' '}
            {resultado.errores.length > 0 &&
              `${resultado.errores.length} ${resultado.errores.length === 1 ? 'fila con errores' : 'filas con errores'}.`}
          </Alert>
          {resultado.errores.length > 0 && (
            <div className="import-errores">
              <table className="table">
                <thead>
                  <tr>
                    <th className="num">Fila</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.errores.map((e, i) => (
                    <tr key={`${e.fila}-${i}`}>
                      <td className="num">{e.fila}</td>
                      <td>{e.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
