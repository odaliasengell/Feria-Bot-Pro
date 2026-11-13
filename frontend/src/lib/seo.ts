import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Título, descripción, Open Graph, URL canónica, robots y datos estructurados (JSON-LD) de cada página.
 *
 * La app es de una sola página: Google ejecuta el JavaScript y lee estas etiquetas. Las vistas previas de WhatsApp y
 * redes no lo ejecutan y usan las de index.html; para que muestren la portada de cada feria hace falta
 * renderizado en el servidor al publicar.
 *
 * VITE_SITE_URL (por ejemplo https://feriabot.ec) se usa para la URL canónica y las imágenes absolutas.
 */

export const NOMBRE_SITIO = 'FeriaBot Pro';
export const DESCRIPCION_SITIO =
  'Credenciales con QR para visitantes, fichas digitales de cada stand y leads ordenados para las empresas de tu feria.';

export function urlSitio(): string {
  return (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
}

interface Pagina {
  /** Sin el nombre del sitio: se agrega solo («Ferias · FeriaBot Pro»). */
  titulo?: string;
  descripcion?: string;
  /** Imagen para compartir: URL https o data URL (las data URL no sirven a las redes y se ignoran). */
  imagen?: string | null;
  /** true en áreas privadas, formularios de acceso y la página 404. */
  noIndex?: boolean;
  /** Datos estructurados schema.org. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
  tipo?: 'website' | 'article' | 'event';
}

function meta(atributo: 'name' | 'property', clave: string, valor: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${atributo}="${clave}"]`);
  if (valor === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(atributo, clave);
    document.head.appendChild(el);
  }
  el.content = valor;
}

function canonica(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

function datosEstructurados(datos: Pagina['jsonLd']) {
  document.getElementById('jsonld-pagina')?.remove();
  if (!datos) return;
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.id = 'jsonld-pagina';
  el.textContent = JSON.stringify(datos);
  document.head.appendChild(el);
}

export function usePagina({ titulo, descripcion = DESCRIPCION_SITIO, imagen, noIndex = false, jsonLd = null, tipo = 'website' }: Pagina) {
  const { pathname } = useLocation();
  const claveJson = JSON.stringify(jsonLd);

  useEffect(() => {
    const tituloCompleto = titulo ? `${titulo} · ${NOMBRE_SITIO}` : `${NOMBRE_SITIO} · Ferias conectadas con QR`;
    const url = urlSitio() + pathname;
    const img = imagen && /^https?:\/\//.test(imagen) ? imagen : `${urlSitio()}/pwa-512x512.png`;

    document.title = tituloCompleto;
    meta('name', 'description', descripcion);
    meta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');
    meta('property', 'og:title', tituloCompleto);
    meta('property', 'og:description', descripcion);
    meta('property', 'og:type', tipo === 'event' ? 'website' : tipo);
    meta('property', 'og:url', url);
    meta('property', 'og:image', img);
    meta('property', 'og:site_name', NOMBRE_SITIO);
    meta('property', 'og:locale', 'es_EC');
    meta('name', 'twitter:card', 'summary_large_image');
    meta('name', 'twitter:title', tituloCompleto);
    meta('name', 'twitter:description', descripcion);
    meta('name', 'twitter:image', img);
    canonica(noIndex ? null : url);
    datosEstructurados(noIndex ? null : jsonLd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, descripcion, imagen, noIndex, claveJson, tipo, pathname]);
}

/** Datos de la organización para la portada (Google los usa en el panel de conocimiento). */
export function jsonLdOrganizacion() {
  const url = urlSitio();
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: NOMBRE_SITIO,
      url,
      logo: `${url}/pwa-512x512.png`,
      description: DESCRIPCION_SITIO,
      areaServed: 'EC',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: NOMBRE_SITIO,
      url,
      inLanguage: 'es',
    },
  ];
}

/** Una feria como evento de schema.org (fechas, lugar, estado de inscripción). */
export function jsonLdFeria(f: {
  id: string;
  nombre: string;
  descripcion: string;
  lugar: string;
  fechaInicio: string;
  fechaFin: string;
  portada: string | null;
  abierta: boolean;
  llena: boolean;
  estado: 'proxima' | 'en_curso' | 'finalizada';
}) {
  const url = `${urlSitio()}/ferias/${f.id}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: f.nombre,
    description: f.descripcion || `Feria ${f.nombre}${f.lugar ? ` en ${f.lugar}` : ''}.`,
    startDate: f.fechaInicio,
    endDate: f.fechaFin,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url,
    image: f.portada && /^https?:\/\//.test(f.portada) ? [f.portada] : [`${urlSitio()}/pwa-512x512.png`],
    location: f.lugar
      ? { '@type': 'Place', name: f.lugar, address: { '@type': 'PostalAddress', streetAddress: f.lugar, addressCountry: 'EC' } }
      : undefined,
    organizer: { '@type': 'Organization', name: NOMBRE_SITIO, url: urlSitio() },
    offers: {
      '@type': 'Offer',
      url: `${urlSitio()}/registro/${f.id}`,
      price: 0,
      priceCurrency: 'USD',
      availability: f.abierta && !f.llena ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      validThrough: f.fechaFin,
    },
  };
}
