/**
 * Genera un Excel real (.xlsx) en el navegador, sin librerías: columnas separadas, encabezado en negrita con fondo,
 * primera fila fija, filtros y anchos de columna según el contenido.
 *
 * Por qué no CSV: Excel en español espera «;» y no «,» (todo quedaba en la columna A) e interpreta los datos
 * (teléfonos «+593…» como fórmulas, códigos y RUC como números sin ceros). En un .xlsx cada celda va como texto.
 *
 * Un .xlsx es un ZIP con varios XML; aquí se arma con el método «store» (sin comprimir), que todos los programas leen.
 */

type Celda = string | number | null | undefined;

export interface OpcionesExcel {
  /** Nombre de la hoja (máx. 31 caracteres). */
  hoja?: string;
  /** Anchos de columna en caracteres; si falta alguno se calcula con el contenido. */
  anchos?: number[];
  /** Columnas con texto largo (se ajusta en varias líneas). Índices desde 0. */
  ajustar?: number[];
}

const enc = new TextEncoder();

function xml(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // caracteres que el XML no admite
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columna(n: number): string {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function hojaXml(filas: Celda[][], op: OpcionesExcel): string {
  const nCols = Math.max(1, ...filas.map((f) => f.length));
  const anchos = Array.from({ length: nCols }, (_, c) => {
    if (op.anchos?.[c]) return op.anchos[c]!;
    const largo = Math.max(...filas.map((f) => String(f[c] ?? '').split('\n')[0]!.length));
    return Math.min(60, Math.max(10, largo + 2));
  });
  const ajustar = new Set(op.ajustar ?? []);
  const cols = anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const cuerpo = filas
    .map((fila, r) => {
      const celdas = Array.from({ length: nCols }, (_, c) => {
        const ref = `${columna(c)}${r + 1}`;
        const estilo = r === 0 ? 1 : ajustar.has(c) ? 2 : 0;
        const v = fila[c];
        if (v === null || v === undefined || v === '') return estilo ? `<c r="${ref}" s="${estilo}"/>` : '';
        if (typeof v === 'number' && Number.isFinite(v) && r > 0) return `<c r="${ref}" s="${estilo}"><v>${v}</v></c>`;
        return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${celdas}</row>`;
    })
    .join('');
  const ultima = `${columna(nCols - 1)}${Math.max(1, filas.length)}`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols><sheetData>${cuerpo}</sheetData>` +
    `<autoFilter ref="A1:${ultima}"/>` +
    '</worksheet>'
  );
}

const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0A0E1C"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function archivos(filas: Celda[][], op: OpcionesExcel): [string, string][] {
  const hoja = xml((op.hoja ?? 'Datos').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  return [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${hoja}" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${hoja}'!$A$1:$${columna(Math.max(1, ...filas.map((f) => f.length)) - 1)}$${Math.max(1, filas.length)}</definedName></definedNames>` +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', hojaXml(filas, op)],
  ];
}

/* ---------------- ZIP (método store) ---------------- */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entradas: [string, string][]): Blob {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

  for (const [nombre, contenido] of entradas) {
    const n = enc.encode(nombre);
    const datos = enc.encode(contenido);
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // store
    local.setUint16(10, hora, true);
    local.setUint16(12, fecha, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, n.length, true);
    partes.push(new Uint8Array(local.buffer), n, datos);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, hora, true);
    cd.setUint16(14, fecha, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, datos.length, true);
    cd.setUint32(24, datos.length, true);
    cd.setUint16(28, n.length, true);
    cd.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(cd.buffer), n);
    desplazamiento += 30 + n.length + datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, entradas.length, true);
  fin.setUint16(10, entradas.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** El archivo .xlsx como Blob (sin descargarlo). */
export function crearExcel(filas: Celda[][], opciones: OpcionesExcel = {}): Blob {
  return zip(archivos(filas, opciones));
}

/** Descarga `filas` (la primera es el encabezado) como un archivo .xlsx. */
export function descargarExcel(nombreArchivo: string, filas: Celda[][], opciones: OpcionesExcel = {}): void {
  const nombre = nombreArchivo.replace(/\.(csv|xlsx)$/i, '') + '.xlsx';
  const url = URL.createObjectURL(crearExcel(filas, opciones));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
