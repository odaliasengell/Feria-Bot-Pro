# FeriaBot Pro — Backend

FastAPI + SQLAlchemy 2 + MySQL (PyMySQL). Autenticación con JWT.

## Puesta en marcha

```powershell
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

copy .env.example .env          # y ajustar DATABASE_URL, JWT_SECRET, ADMIN_*
```

Crear la base de datos en MySQL:

```sql
CREATE DATABASE feriabot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Crear las tablas y cargar los datos de demostración, y luego levantar la API:

```powershell
.\.venv\Scripts\python -m app.seed       # --reset para borrar todo y recargar la demo
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Usar `.\.venv\Scripts\python` evita que se ejecute otro Python instalado en el sistema
(si sale "Fatal error in launcher", es eso).

- Documentación interactiva: http://localhost:8000/docs
- Las tablas también se crean solas al arrancar si no existen, junto con el usuario organizador de `.env`.

> **Imágenes:** el logo y las fotos llegan como data URL dentro del JSON. MySQL de XAMPP trae
> `max_allowed_packet=1M`, que no alcanza para 3 fotos. Subirlo a `16M` en `my.ini` (sección `[mysqld]`)
> y reiniciar MySQL.

## Estructura

```
app/
  main.py          app, CORS, manejo de errores de validación
  config.py        variables de entorno (.env)
  database.py      engine, sesión y dependencia DB
  models.py        tablas: organizadores, empresas, visitantes, leads, vistas_ficha
  schemas.py       entrada/salida en camelCase (igual que frontend/src/types.ts)
  security.py      bcrypt, JWT y dependencias de permisos por rol
  seed.py          organizador inicial y datos de demostración
  correo.py        envío por SMTP (Gmail)
  verificacion.py  códigos de verificación: generar, enviar y comprobar
  routers/         auth, empresas, visitantes, leads, vistas, demo
```

## Autenticación

Cada login devuelve `{ token, session }`, donde `session` tiene la misma forma que `Session` del frontend
(`role`, `refId`, `nombre`). El resto de llamadas envían `Authorization: Bearer <token>`.

| Rol | Endpoint | Cuerpo |
| --- | --- | --- |
| Organizador | `POST /auth/organizador` | `{ email, password }` (de `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |
| Empresa | `POST /auth/empresa` | `{ email, password }` (la contraseña la asigna el organizador al crear/editar la empresa) |
| Visitante | `POST /auth/visitante` | `{ codigo }`: código de la tarjeta o contenido del QR |
| Visitante con correo | `POST /auth/enviar-codigo` y luego `POST /auth/visitante/correo` | `{ email, proposito: "ingreso" }` → `{ email, codigo }` |

| Olvidé mi contraseña (empresa u organizador) | `POST /auth/recuperar/enviar-codigo` y luego `POST /auth/recuperar/cambiar` | `{ email, role }` → `{ email, role, codigo, password }` (devuelve la sesión iniciada) |

`GET /auth/me` devuelve la sesión del token.

`/auth/recuperar/enviar-codigo` responde lo mismo exista o no la cuenta, para no revelar qué correos están
registrados. Una empresa sin contraseña asignada también puede crear la suya por esta vía.

### Códigos de verificación por correo

- **Registro**: el frontend llama a `POST /auth/enviar-codigo` con `{ email, proposito: "registro" }` y luego a
  `POST /visitantes` con los datos y `codigoVerificacion`. El visitante solo se crea si el código es correcto.
  El organizador puede registrar visitantes sin código.
- **Ingreso con correo**: `proposito: "ingreso"` y luego `POST /auth/visitante/correo`.
- El código es de 6 dígitos, vence en `CODIGO_MINUTOS`, se puede usar una sola vez, permite 5 intentos y
  hay que esperar 60 s para pedir otro. Se guarda como hash en la tabla `codigos_verificacion`.

## Correo con Gmail

1. En la cuenta de Google que enviará los correos, activa la **verificación en 2 pasos**.
2. Crea una **contraseña de aplicación** en https://myaccount.google.com/apppasswords (16 letras).
3. En `.env`:

   ```
   SMTP_USER=tucuenta@gmail.com
   SMTP_PASSWORD=abcdefghijklmnop   # la contraseña de aplicación, sin espacios
   ```

4. Reinicia el backend.

El diseño del correo está en `app/plantillas/codigo_verificacion.html` (variables `$codigo`, `$minutos`,
`$app`). Para verlo en el navegador sin enviar nada: `.\.venv\Scripts\python -m app.correo`.

Mientras `SMTP_USER` esté vacío no se envía nada y el código aparece en la consola del backend
(`[correo no configurado] Código para ...`), útil para desarrollo. Gmail permite unos 500 correos al día;
para más volumen usa un servicio como Brevo o SendGrid cambiando `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y
`SMTP_PASSWORD`.

Credenciales de la demo: organizador `admin@feriabot.com` / `admin123`; cada empresa entra con su correo
(p. ej. `ventas@cafeandino.com`) y la contraseña `empresa123`; visitantes con su código, p. ej. `FB-7K3PQX`.

## Endpoints

| Método y ruta | Quién | Notas |
| --- | --- | --- |
| `GET /empresas` · `GET /empresas/:id` | Público | Ficha pública del stand |
| `POST /empresas` | Organizador | Acepta `password` opcional para el acceso de la empresa |
| `PATCH /empresas/:id` | Organizador, o la propia empresa | Cambios parciales; `password` cambia la contraseña |
| `DELETE /empresas/:id` | Organizador | Borra en cascada sus leads y vistas |
| `GET /visitantes` | Organizador | |
| `GET /visitantes/buscar?q=` | Organizador, empresa | Por código, contenido del QR o correo |
| `GET /visitantes/:id` | Organizador, o el propio visitante | |
| `POST /visitantes` | Público | Registro al ingresar; genera el código `FB-XXXXXX`. Con correo exige `codigoVerificacion` (salvo el organizador) |
| `POST /auth/enviar-codigo` | Público | Envía el código de 6 dígitos al correo (`registro` o `ingreso`) |
| `DELETE /visitantes/:id` | Organizador | Borra en cascada sus leads y vistas |
| `GET /leads?empresaId=&visitanteId=` | Con sesión | Con `visitante` y `empresa` embebidos. La empresa solo ve los suyos y el visitante los propios |
| `GET /leads/:empresaId/:visitanteId` | Organizador, la propia empresa | 404 si no existe |
| `PUT /leads` | Organizador, la propia empresa | `{ empresaId, visitanteId, calificacion, nota }`; crea o actualiza (uno por empresa + visitante) |
| `POST /vistas` | Organizador, el propio visitante | `{ visitanteId, empresaId }`; si ya existía actualiza la fecha |
| `GET /vistas?visitanteId=&empresaId=` | Con sesión | Con `empresa` y `visitante` embebidos; mismo alcance que leads |
| `POST /demo/reiniciar` | Organizador | Solo con `DEMO_MODE=true` |

Errores: `{ "detail": "mensaje" }` con 401 (sin sesión), 403 (sin permiso), 404, 409 (correo repetido)
o 422 (validación). Las fechas se devuelven en UTC con formato ISO (`2026-11-05T14:03:00.000Z`).

## Frontend

El frontend ya consume esta API desde `frontend/src/services/api.ts` (URL en `frontend/.env`,
`VITE_API_URL=http://localhost:8000`). Si se abre desde otra dirección (por ejemplo la IP de la red local
con `vite --host`), agregarla a `CORS_ORIGINS`.

Pendiente para producción: migraciones con Alembic (hoy se usa `create_all`) y guardar las imágenes en
un almacenamiento de archivos en lugar de data URLs en la base.
