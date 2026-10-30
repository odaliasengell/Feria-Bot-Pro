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
  models.py        tablas: organizadores, ferias, empresas, visitantes, inscripciones, leads, vistas_ficha
  migraciones.py   cambios de esquema sobre tablas existentes (se aplican solos al arrancar)
  schemas.py       entrada/salida en camelCase (igual que frontend/src/types.ts)
  security.py      bcrypt, JWT y dependencias de permisos por rol
  seed.py          organizador inicial y datos de demostración
  correo.py        envío por SMTP (Gmail)
  verificacion.py  códigos de verificación: generar, enviar y comprobar
  routers/         auth, ferias (+ inscripciones), empresas, visitantes, leads, vistas, demo
```

## Ferias

El organizador crea las ferias (nombre, descripción, lugar, fechas e interruptor de inscripciones). Cada feria
tiene sus propias **empresas** (`empresas.feria_id`) y, por lo tanto, sus leads y vistas de ficha.

- El visitante tiene **una sola cuenta** (un código `FB-XXXXXX`) y se **inscribe** a una o varias ferias
  (tabla `inscripciones`). Al registrarse elige la feria (`POST /visitantes` con `feriaId`); con su cuenta puede
  inscribirse a otras (`POST /inscripciones`).
- Una feria acepta inscripciones (`abierta`) si el interruptor está encendido y aún no pasó `fechaFin`.
  El organizador puede inscribir aunque esté cerrada.
- `aforo` es el máximo de inscritos (`null` = sin límite). Al llegar, `llena` es `true` y el registro y
  `POST /inscripciones` responden 409 "La feria está llena"; el organizador puede pasar el límite.
- Una empresa solo puede escanear (y guardar leads de) visitantes inscritos en su feria; el visitante solo
  guarda en su historial fichas de ferias en las que está inscrito. Si no, la API responde 403.
- Al borrar una feria se borran sus empresas, leads, vistas e inscripciones; las cuentas de visitante quedan.
- Al registrarse, el visitante debe aceptar la política de privacidad (`aceptaPolitica: true` en
  `POST /visitantes`, si no responde 400). Se guarda `politicaAceptadaEn` y `politicaVersion`
  (`POLITICA_VERSION` en `.env`, consultable en `GET /politica`); al subir la versión, quien vuelva a
  registrarse con el organizador queda con la nueva aceptación.
- Al actualizar desde una versión sin ferias, el arranque crea la «Feria principal» con las empresas y
  visitantes que ya existían.

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

**Vendedores de una empresa.** La empresa agrega vendedores con su propio correo y contraseña
(`/empresas/:id/usuarios`). Entran por el mismo `POST /auth/empresa`; su sesión es la de la empresa
(`refId` = empresa, `nombre` = nombre de la empresa) más `usuarioId` y `usuarioNombre`. El correo no puede repetirse
entre empresas y vendedores. Cada lead guarda en `registradoPor` quién escaneó primero al visitante. Un vendedor
cambia su propia contraseña y su correo con `/auth/cambiar-password` y `/auth/cambiar-correo`, y puede usar
"Olvidé mi contraseña" con `role: "empresa"`; no puede administrar el equipo.

El organizador y la empresa pueden cambiar sus datos de acceso con su sesión iniciada:

- `POST /auth/cambiar-password` con `{ passwordActual, passwordNueva }` (mínimo 6 caracteres). Responde 204,
  o 400 si la actual no es correcta o la nueva es igual.
- `POST /auth/cambiar-correo` con `{ email, password }` (la contraseña actual). Devuelve `{ token, session }`
  nuevos; 409 si otra cuenta del mismo tipo ya usa ese correo, 400 si la contraseña no es correcta.

El organizador de `ADMIN_EMAIL` / `ADMIN_PASSWORD` solo se crea al arrancar si no existe ningún organizador, así
que después de cambiar el correo o la contraseña desde la app no vuelve a aparecer la cuenta por defecto.

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

Además del código, se envían dos correos de bienvenida, en segundo plano (si fallan, el registro sigue igual
y el error queda en el log):

- **Visitante nuevo con correo** (`POST /visitantes`): su código `FB-XXXXXX` y la imagen del QR
  (`FERIABOT:V:<codigo>`, plantilla `bienvenida_visitante.html`).
- **Empresa creada con contraseña** (`POST /empresas`): su correo de acceso y la contraseña
  (plantilla `acceso_empresa.html`).

**Recordatorio un día antes de la feria.** `.\.venv\Scripts\python -m app.recordatorios` envía un correo
(con la tarjeta y el QR) a los inscritos con correo de las ferias que empiezan mañana, y marca la feria en
`recordatorioEnviadoEn` para no repetirlo. Hay que programarlo una vez al día, por ejemplo con el Programador
de tareas de Windows (acción: `backend\.venv\Scripts\python.exe -m app.recordatorios`, iniciar en: `backend`).
El organizador también puede enviarlo a mano con `POST /ferias/:id/recordatorio`, que devuelve `{ enviados }`.

Los botones de esos correos apuntan a `FRONTEND_URL`. Vista previa: `.\.venv\Scripts\python -m app.correo visitante`
o `... app.correo empresa`.

Mientras `SMTP_USER` esté vacío no se envía nada y el código aparece en la consola del backend
(`[correo no configurado] Código para ...`), útil para desarrollo. Gmail permite unos 500 correos al día;
para más volumen usa un servicio como Brevo o SendGrid cambiando `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y
`SMTP_PASSWORD`.

Credenciales de la demo: organizador `admin@feriabot.com` / `admin123`; cada empresa entra con su correo
(p. ej. `ventas@cafeandino.com`) y la contraseña `empresa123`; visitantes con su código, p. ej. `FB-7K3PQX`.

## Endpoints

| Método y ruta | Quién | Notas |
| --- | --- | --- |
| `GET /ferias?activas=true&estado=` · `GET /ferias/:id` | Público | Con `abierta`, `estado` (`proxima`, `en_curso`, `finalizada`), `aforo`, `llena`, `recordatorioEnviadoEn`, `totalEmpresas` y `totalVisitantes` |
| `GET /ferias/:id/estadisticas` | Organizador | `{ totalInscritos, asistentes, inscritosPorDia: [{ fecha, total }], escaneosPorHora: [{ hora, total }], rankingEmpresas: [{ empresaId, nombre, leads, vistas }], ciudades: [{ ciudad, total }] }`. Días y horas en hora local (`ZONA_HORARIA_UTC`, por defecto -5), con los huecos en 0 |
| `POST /ferias/:id/recordatorio` | Organizador | Envía ya el recordatorio a los inscritos con correo; devuelve `{ enviados }` (409 si la feria terminó) |
| `GET /ferias/:id/publica` | Público | La feria con `empresas`: `id`, `nombre`, `rubro`, `stand` y `logo` (sin correo ni teléfono) |
| `POST /ferias` · `PATCH /ferias/:id` · `DELETE /ferias/:id` | Organizador | `{ nombre, descripcion, lugar, fechaInicio, fechaFin, inscripcionesAbiertas, aforo }`; en el PATCH, `aforo: null` quita el límite |
| `POST /ferias/:id/duplicar` | Organizador | `{ nombre, fechaInicio, fechaFin }`: nueva feria con la descripción, el lugar y el aforo de la original (las empresas no se copian porque su correo es único); 201 |
| `GET /inscripciones?visitanteId=&feriaId=` | Organizador, el propio visitante | Con la `feria` embebida y `asistioEn` (hora de entrada o null) |
| `POST /ferias/:id/asistencia` | Organizador | Control de acceso en la puerta: `{ codigo }` (código o QR) → `{ visitante, asistioEn, yaRegistrada }`. 404 si el código no existe, 403 si no está inscrito. Si ya entró, conserva la primera hora |
| `POST /inscripciones` | Visitante, organizador | `{ feriaId }` (el organizador agrega `visitanteId`); si ya estaba inscrito devuelve la misma |
| `DELETE /inscripciones/:feriaId/:visitanteId` | Organizador | Quita de la feria y borra sus leads y vistas en ella |
| `GET /empresas?feriaId=` · `GET /empresas/:id` | Público | Ficha pública del stand |
| `POST /empresas` | Organizador | Requiere `feriaId`; acepta `password` opcional para el acceso de la empresa |
| `PATCH /empresas/:id` | Organizador, o la propia empresa | Cambios parciales; `password` cambia la contraseña |
| `DELETE /empresas/:id` | Organizador | Borra en cascada sus leads, vistas y vendedores |
| `GET /empresas/:id/usuarios` | Organizador, la cuenta principal de la empresa | Vendedores: `[{ id, empresaId, nombre, email, creadoEn }]` |
| `POST /empresas/:id/usuarios` | Organizador, la cuenta principal de la empresa | `{ nombre, email, password }`; 409 si el correo ya lo usa una empresa o un vendedor; 201 |
| `DELETE /empresas/:id/usuarios/:usuarioId` | Organizador, la cuenta principal de la empresa | Quita al vendedor; sus leads se conservan; 204 |
| `GET /visitantes?feriaId=` | Organizador | Con `feriaId`, solo los inscritos |
| `GET /visitantes/buscar?q=` | Organizador, empresa | Por código, contenido del QR o correo. A la empresa le da 403 si no está inscrito en su feria |
| `GET /visitantes/:id` | Organizador, o el propio visitante | |
| `GET /politica` | Público | `{ version }` de la política de privacidad vigente |
| `POST /visitantes` | Público | Exige `aceptaPolitica: true`. Registro en una feria (`feriaId`, debe estar abierta); genera el código `FB-XXXXXX`. Con correo exige `codigoVerificacion`. Si el organizador usa un correo existente, inscribe esa cuenta |
| `PATCH /visitantes/me` | El propio visitante | `{ nombre?, telefono?, empresa?, ciudad? }`; devuelve el visitante |
| `POST /visitantes/me/correo/enviar-codigo` | El propio visitante | `{ email }`: envía un código al correo nuevo (409 si ya existe o es el mismo); 204 |
| `POST /visitantes/me/correo` | El propio visitante | `{ email, codigo }`: cambia el correo y devuelve el visitante |
| `DELETE /visitantes/me` | El propio visitante | Borra su cuenta con sus inscripciones, leads y vistas; 204 |
| `POST /auth/enviar-codigo` | Público | Envía el código de 6 dígitos al correo (`registro` o `ingreso`) |
| `DELETE /visitantes/:id` | Organizador | Borra en cascada sus leads y vistas |
| `GET /leads?empresaId=&visitanteId=&feriaId=` | Con sesión | Con `visitante` y `empresa` embebidos. La empresa solo ve los suyos y el visitante los propios |
| `GET /leads/:empresaId/:visitanteId` | Organizador, la propia empresa | 404 si no existe |
| `PUT /leads` | Organizador, la propia empresa | `{ empresaId, visitanteId, calificacion, nota }`; crea o actualiza (uno por empresa + visitante) |
| `POST /vistas` | Organizador, el propio visitante | `{ visitanteId, empresaId }`; si ya existía actualiza la fecha |
| `GET /vistas?visitanteId=&empresaId=&feriaId=` | Con sesión | Con `empresa` y `visitante` embebidos; mismo alcance que leads |
| `POST /demo/reiniciar` | Organizador | Solo con `DEMO_MODE=true` |

Errores: `{ "detail": "mensaje" }` con 401 (sin sesión), 403 (sin permiso), 404, 409 (correo repetido)
o 422 (validación). Las fechas se devuelven en UTC con formato ISO (`2026-11-05T14:03:00.000Z`).

## Frontend

El frontend ya consume esta API desde `frontend/src/services/api.ts` (URL en `frontend/.env`,
`VITE_API_URL=http://localhost:8000`). Si se abre desde otra dirección (por ejemplo la IP de la red local
con `vite --host`), agregarla a `CORS_ORIGINS`.

Pendiente para producción: migraciones con Alembic (hoy se usa `create_all`) y guardar las imágenes en
un almacenamiento de archivos en lugar de data URLs en la base.
