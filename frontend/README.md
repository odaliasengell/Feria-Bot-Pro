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

## Backend

Los datos vienen del backend FastAPI de [`../backend`](../backend) (ver su README para levantarlo).
Todo el acceso está en [`src/services/api.ts`](src/services/api.ts) y la URL se configura en `.env`:

```bash
VITE_API_URL=http://localhost:8000
```

Si se deja vacío se usa el mismo host desde el que se abrió la app, en el puerto 8000. Si abres el
frontend desde otra dirección (por ejemplo la IP de tu red local), agrégala a `CORS_ORIGINS` del backend.

## Inicio de sesión

- **Organizador**: correo y contraseña (`ADMIN_EMAIL` / `ADMIN_PASSWORD` del backend).
- **Empresa**: su correo y la contraseña que le asigna el organizador en *Empresas → Editar*.
- **Visitante**: el código de su tarjeta o el contenido del QR. Si escribe su correo, recibe un código
  de 6 dígitos para entrar. Al registrarse también confirma su correo con un código.

El token se guarda en `localStorage` y, si vence, la app vuelve a la pantalla de ingreso.
Datos de demo: `admin@feriabot.com` / `admin123`, empresas con su correo y `empresa123`, visitante `FB-7K3PQX`.
