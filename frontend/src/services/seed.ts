import type { Empresa, Lead, Visitante, VistaFicha } from '../types';

export interface DB {
  empresas: Empresa[];
  visitantes: Visitante[];
  leads: Lead[];
  vistas: VistaFicha[];
}

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** Datos de demostración para trabajar el frontend sin backend. */
export function crearSeed(): DB {
  const empresas: Empresa[] = [
    {
      id: 'emp-andina',
      nombre: 'Café Andino',
      rubro: 'Alimentos y bebidas',
      descripcion: 'Tostadores de café de especialidad de altura. Vendemos a cafeterías, hoteles y oficinas.',
      servicios: ['Café en grano', 'Máquinas para oficina', 'Capacitación de baristas'],
      contactoNombre: 'Lucía Mendoza',
      email: 'ventas@cafeandino.com',
      telefono: '+593 99 123 4567',
      sitioWeb: 'https://cafeandino.com',
      stand: 'A-04',
      fotos: [],
      creadoEn: hace(60 * 30),
    },
    {
      id: 'emp-solarix',
      nombre: 'Solarix Energía',
      rubro: 'Energía renovable',
      descripcion: 'Diseñamos e instalamos sistemas solares para hogares, comercios e industria.',
      servicios: ['Paneles solares', 'Baterías', 'Auditoría energética'],
      contactoNombre: 'Andrés Paredes',
      email: 'hola@solarix.ec',
      telefono: '+593 98 555 0101',
      stand: 'B-12',
      fotos: [],
      creadoEn: hace(60 * 29),
    },
    {
      id: 'emp-tejelab',
      nombre: 'TejeLab',
      rubro: 'Textil y diseño',
      descripcion: 'Uniformes corporativos y textiles personalizados con producción local.',
      servicios: ['Uniformes', 'Bordado', 'Merchandising'],
      contactoNombre: 'Sofía Rivas',
      email: 'pedidos@tejelab.com',
      telefono: '+593 97 222 3344',
      stand: 'A-09',
      fotos: [],
      creadoEn: hace(60 * 28),
    },
    {
      id: 'emp-nubecontable',
      nombre: 'Nube Contable',
      rubro: 'Software y servicios',
      descripcion: 'Facturación electrónica y contabilidad en la nube para pymes.',
      servicios: ['Facturación electrónica', 'Nómina', 'Asesoría tributaria'],
      contactoNombre: 'Diego Salazar',
      email: 'demo@nubecontable.app',
      telefono: '+593 96 410 7788',
      sitioWeb: 'https://nubecontable.app',
      stand: 'C-01',
      fotos: [],
      creadoEn: hace(60 * 27),
    },
    {
      id: 'emp-agroverde',
      nombre: 'AgroVerde',
      rubro: 'Agroindustria',
      descripcion: 'Insumos orgánicos y asesoría técnica para cultivos sostenibles.',
      servicios: ['Fertilizantes orgánicos', 'Riego tecnificado', 'Asesoría agronómica'],
      contactoNombre: 'Marcela Torres',
      email: 'info@agroverde.com',
      telefono: '+593 95 300 9090',
      stand: 'B-03',
      fotos: [],
      creadoEn: hace(60 * 26),
    },
  ];

  const datos: [string, string, string, string, string][] = [
    ['María José Castro', '+593 99 876 5432', 'mjcastro@gmail.com', 'Hotel Plaza', 'Quito'],
    ['Carlos Andrade', '+593 98 765 4321', 'candrade@outlook.com', 'Constructora Andrade', 'Guayaquil'],
    ['Valentina Ruiz', '+593 97 654 3210', 'vruiz@empresa.com', 'Restaurante Sabores', 'Cuenca'],
    ['Jorge Villacís', '+593 96 543 2109', 'jvillacis@gmail.com', 'Independiente', 'Quito'],
    ['Daniela Ortiz', '+593 95 432 1098', 'dortiz@colegio.edu.ec', 'Colegio Los Andes', 'Ambato'],
    ['Pablo Herrera', '+593 94 321 0987', 'pherrera@agro.ec', 'Hacienda La Esperanza', 'Ibarra'],
    ['Camila Vega', '+593 93 210 9876', 'cvega@startup.io', 'Startup Lab', 'Quito'],
  ];
  const codigos = ['FB-7K3PQX', 'FB-M4R8TZ', 'FB-H2N6WY', 'FB-Q9D5LC', 'FB-T3V7BE', 'FB-X8J2GA', 'FB-C5P4RN'];
  const visitantes: Visitante[] = datos.map(([nombre, telefono, email, empresa, ciudad], i) => ({
    id: `vis-${i + 1}`,
    codigo: codigos[i]!,
    nombre,
    telefono,
    email,
    empresa,
    ciudad,
    creadoEn: hace(60 * 6 - i * 25),
  }));

  const l = (n: number, e: string, v: number, c: Lead['calificacion'], nota: string, min: number): Lead => ({
    id: `lead-${n}`,
    empresaId: e,
    visitanteId: `vis-${v}`,
    calificacion: c,
    nota,
    creadoEn: hace(min),
    actualizadoEn: hace(min),
  });

  const leads: Lead[] = [
    l(1, 'emp-andina', 1, 'interesado', 'Busca proveedor para el desayuno del hotel.', 240),
    l(2, 'emp-andina', 3, 'visita', 'Visitar el restaurante la próxima semana.', 200),
    l(3, 'emp-solarix', 2, 'correo', 'Enviar cotización para obra en Samborondón.', 180),
    l(4, 'emp-solarix', 6, 'interesado', 'Riego con bombeo solar.', 150),
    l(5, 'emp-tejelab', 5, 'visita', 'Uniformes para 400 estudiantes.', 120),
    l(6, 'emp-nubecontable', 7, 'interesado', '', 90),
    l(7, 'emp-nubecontable', 4, 'no_interesado', 'Ya tiene sistema.', 75),
    l(8, 'emp-agroverde', 6, 'visita', 'Agendar visita técnica a la hacienda.', 60),
    l(9, 'emp-andina', 7, 'correo', 'Catálogo de máquinas para oficina.', 30),
  ];

  const vistas: VistaFicha[] = [
    { id: 'vf-1', visitanteId: 'vis-1', empresaId: 'emp-andina', creadoEn: hace(245) },
    { id: 'vf-2', visitanteId: 'vis-1', empresaId: 'emp-tejelab', creadoEn: hace(210) },
    { id: 'vf-3', visitanteId: 'vis-2', empresaId: 'emp-solarix', creadoEn: hace(185) },
    { id: 'vf-4', visitanteId: 'vis-6', empresaId: 'emp-agroverde', creadoEn: hace(65) },
    { id: 'vf-5', visitanteId: 'vis-7', empresaId: 'emp-nubecontable', creadoEn: hace(95) },
  ];

  return { empresas, visitantes, leads, vistas };
}
