# FeriaBot Pro — Frontend

React 18 + TypeScript + Vite.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Roles y rutas

| Rol | Ruta | Qué hace |
| --- | --- | --- |
| Público | `/` | Landing con el flujo de los tres roles |
| Público | `/registro` | El visitante se registra al ingresar y recibe su tarjeta QR |
| Público | `/ficha/:id` | Ficha digital de una empresa (lo que abre el QR del stand) |
| Organizador | `/organizador` | Resumen, empresas, visitantes y leads de toda la feria |
| Empresa | `/empresa` | Sus leads, escáner de QR de visitantes y edición de su ficha |
| Visitante | `/visitante` | Su tarjeta QR, empresas que lo registraron y fichas que visitó |

## Códigos QR

- **QR del visitante**: `FERIABOT:V:<codigo>` (por ejemplo `FERIABOT:V:FB-7K3PQX`). Lo escanea la empresa.
- **QR del stand**: URL `https://<dominio>/ficha/<empresaId>`. Cualquier cámara de celular lo abre.

La cámara del navegador solo funciona en `localhost` o con HTTPS.

## Conectar el backend

Todo el acceso a datos está en [`src/services/api.ts`](src/services/api.ts). Hoy guarda en
`localStorage` con datos de demostración ([`seed.ts`](src/services/seed.ts)). Para conectar el backend:

1. Copiar `.env.example` a `.env` y poner `VITE_API_URL`.
2. Reemplazar el cuerpo de cada función de `api.ts` por un `fetch` manteniendo las mismas firmas.
   Los tipos que espera el frontend están en [`src/types.ts`](src/types.ts).

Endpoints sugeridos:

| Función | Método y ruta |
| --- | --- |
| `empresasApi.listar / obtener / crear / actualizar / eliminar` | `GET/POST /empresas`, `GET/PATCH/DELETE /empresas/:id` |
| `visitantesApi.listar / obtener / crear / eliminar` | `GET/POST /visitantes`, `GET/DELETE /visitantes/:id` |
| `visitantesApi.buscar(codigoOEmail)` | `GET /visitantes/buscar?q=` |
| `leadsApi.listar({ empresaId?, visitanteId? })` | `GET /leads?empresaId=&visitanteId=` (con `visitante` y `empresa` embebidos) |
| `leadsApi.obtener(empresaId, visitanteId)` | `GET /leads/:empresaId/:visitanteId` |
| `leadsApi.guardar(...)` | `PUT /leads` (crea o actualiza; un lead por empresa + visitante) |
| `vistasApi.registrar / listar` | `POST /vistas`, `GET /vistas?visitanteId=&empresaId=` |

El inicio de sesión ([`src/pages/Ingresar.tsx`](src/pages/Ingresar.tsx)) es de demostración: falta autenticación
real (usuario/contraseña para organizador y empresas).
