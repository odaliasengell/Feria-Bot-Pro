/**
 * Capa de datos del frontend.
 *
 * Por ahora guarda todo en localStorage (modo demo) para poder trabajar sin backend.
 * Cuando el backend esté listo, reemplazar el cuerpo de cada función por un `fetch`
 * a `import.meta.env.VITE_API_URL` manteniendo las mismas firmas: las páginas no
 * necesitan cambiar.
 */
import type {
  Calificacion,
  Empresa,
  Lead,
  LeadDetalle,
  NuevaEmpresa,
  NuevoVisitante,
  Visitante,
  VistaDetalle,
} from '../types';
import { generarCodigo, uid } from '../lib/utils';
import { crearSeed, type DB } from './seed';

const DB_KEY = 'feriabot.db.v1';

function cargar(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* datos corruptos: se regeneran */
  }
  const db = crearSeed();
  guardar(db);
  return db;
}

function guardar(db: DB): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    throw new Error('No hay espacio para guardar. Prueba con imágenes más livianas.');
  }
}

const esperar = (ms = 150) => new Promise((r) => setTimeout(r, ms));

async function leer<T>(fn: (db: DB) => T): Promise<T> {
  await esperar();
  return structuredClone(fn(cargar()));
}

async function escribir<T>(fn: (db: DB) => T): Promise<T> {
  await esperar();
  const db = cargar();
  const r = fn(db);
  guardar(db);
  return structuredClone(r);
}

function noEncontrado(que: string): never {
  throw new Error(`${que} no encontrado`);
}

function detallarLead(db: DB, lead: Lead): LeadDetalle {
  return {
    ...lead,
    visitante: db.visitantes.find((v) => v.id === lead.visitanteId),
    empresa: db.empresas.find((e) => e.id === lead.empresaId),
  };
}

const masReciente = (a: { creadoEn: string }, b: { creadoEn: string }) => b.creadoEn.localeCompare(a.creadoEn);

/* ------------------------------------------------------------------ */

export const empresasApi = {
  listar: () => leer((db) => [...db.empresas].sort((a, b) => a.nombre.localeCompare(b.nombre))),

  obtener: (id: string) => leer((db) => db.empresas.find((e) => e.id === id) ?? null),

  crear: (data: NuevaEmpresa) =>
    escribir((db) => {
      const empresa: Empresa = { ...data, id: uid('emp-'), creadoEn: new Date().toISOString() };
      db.empresas.push(empresa);
      return empresa;
    }),

  actualizar: (id: string, cambios: Partial<NuevaEmpresa>) =>
    escribir((db) => {
      const e = db.empresas.find((x) => x.id === id) ?? noEncontrado('Empresa');
      Object.assign(e, cambios);
      return e;
    }),

  eliminar: (id: string) =>
    escribir((db) => {
      db.empresas = db.empresas.filter((e) => e.id !== id);
      db.leads = db.leads.filter((l) => l.empresaId !== id);
      db.vistas = db.vistas.filter((v) => v.empresaId !== id);
    }),
};

export const visitantesApi = {
  listar: () => leer((db) => [...db.visitantes].sort(masReciente)),

  obtener: (id: string) => leer((db) => db.visitantes.find((v) => v.id === id) ?? null),

  /** Busca por código de tarjeta o por correo. */
  buscar: (codigoOEmail: string) =>
    leer((db) => {
      const q = codigoOEmail.trim().toLowerCase();
      return db.visitantes.find((v) => v.codigo.toLowerCase() === q || v.email.toLowerCase() === q) ?? null;
    }),

  crear: (data: NuevoVisitante) =>
    escribir((db) => {
      const email = data.email.trim().toLowerCase();
      if (email && db.visitantes.some((v) => v.email.toLowerCase() === email)) {
        throw new Error('Ya existe un visitante registrado con ese correo.');
      }
      let codigo = generarCodigo();
      while (db.visitantes.some((v) => v.codigo === codigo)) codigo = generarCodigo();
      const visitante: Visitante = { ...data, email, id: uid('vis-'), codigo, creadoEn: new Date().toISOString() };
      db.visitantes.push(visitante);
      return visitante;
    }),

  eliminar: (id: string) =>
    escribir((db) => {
      db.visitantes = db.visitantes.filter((v) => v.id !== id);
      db.leads = db.leads.filter((l) => l.visitanteId !== id);
      db.vistas = db.vistas.filter((v) => v.visitanteId !== id);
    }),
};

export const leadsApi = {
  listar: (filtro: { empresaId?: string; visitanteId?: string } = {}) =>
    leer((db) =>
      db.leads
        .filter((l) => (!filtro.empresaId || l.empresaId === filtro.empresaId) && (!filtro.visitanteId || l.visitanteId === filtro.visitanteId))
        .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
        .map((l) => detallarLead(db, l)),
    ),

  obtener: (empresaId: string, visitanteId: string) =>
    leer((db) => db.leads.find((l) => l.empresaId === empresaId && l.visitanteId === visitanteId) ?? null),

  /** Una empresa guarda (o actualiza) la calificación de un visitante escaneado. */
  guardar: (empresaId: string, visitanteId: string, calificacion: Calificacion, nota: string) =>
    escribir((db) => {
      const ahora = new Date().toISOString();
      let lead = db.leads.find((l) => l.empresaId === empresaId && l.visitanteId === visitanteId);
      if (lead) {
        Object.assign(lead, { calificacion, nota, actualizadoEn: ahora });
      } else {
        lead = { id: uid('lead-'), empresaId, visitanteId, calificacion, nota, creadoEn: ahora, actualizadoEn: ahora };
        db.leads.push(lead);
      }
      return detallarLead(db, lead);
    }),
};

export const vistasApi = {
  /** El visitante abrió la ficha de una empresa escaneando el QR del stand. */
  registrar: (visitanteId: string, empresaId: string) =>
    escribir((db) => {
      const ahora = new Date().toISOString();
      const existente = db.vistas.find((v) => v.visitanteId === visitanteId && v.empresaId === empresaId);
      if (existente) existente.creadoEn = ahora;
      else db.vistas.push({ id: uid('vf-'), visitanteId, empresaId, creadoEn: ahora });
    }),

  listar: (filtro: { visitanteId?: string; empresaId?: string } = {}) =>
    leer((db): VistaDetalle[] =>
      db.vistas
        .filter((v) => (!filtro.visitanteId || v.visitanteId === filtro.visitanteId) && (!filtro.empresaId || v.empresaId === filtro.empresaId))
        .sort(masReciente)
        .map((v) => ({
          ...v,
          empresa: db.empresas.find((e) => e.id === v.empresaId),
          visitante: db.visitantes.find((x) => x.id === v.visitanteId),
        })),
    ),
};

export const demoApi = {
  reiniciar: () =>
    escribir((db) => {
      Object.assign(db, crearSeed());
    }),
};
