# FeriaBot Pro — Backend

FastAPI + SQLAlchemy 2 + MySQL (PyMySQL). Autenticación con JWT.

## Puesta en marcha

```powershell
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

copy .env.example .env          # y ajustar DATABASE_URL, JWT_SECRET, ADMIN_*, SMTP_*
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
- Las tablas se crean solas al arrancar si no existen, junto con el organizador de `.env`. Las columnas nuevas de
  tablas que ya existían las agrega `app/migraciones.py` en el mismo arranque (no hace falta tocar MySQL).
- **Después de cada `git pull`** vuelve a correr `.\.venv\Scripts\python -m pip install -r requirements.txt`:
  desde octubre se agregaron `qrcode[png]` (QR de los correos), `openpyxl` (Excel) y `python-multipart`
  (subida de archivos).

> **Imágenes:** el logo y las fotos llegan como data URL dentro del JSON. MySQL de XAMPP trae
> `max_allowed_packet=1M`, que no alcanza para 3 fotos. Subirlo a `16M` en `my.ini` (sección `[mysqld]`)
> y reiniciar MySQL.

## Variables de entorno

Todas van en `backend/.env` (plantilla en `.env.example`). Solo `DATABASE_URL`, `JWT_SECRET` y las de correo
suelen cambiarse; el resto tiene un valor por defecto razonable.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | `mysql+pymysql://root:@localhost:3306/feriabot?charset=utf8mb4` | Conexión a MySQL |
| `JWT_SECRET` | `cambia-esta-clave` | Firma de los tokens. En producción, una clave larga y aleatoria |
| `JWT_EXPIRE_MINUTES` | `720` | Duración de la sesión (12 h) |
| `CORS_ORIGINS` | `["http://localhost:5173","http://127.0.0.1:5173"]` | Orígenes del frontend que pueden llamar a la API (lista JSON) |
| `ADMIN_EMAIL` · `ADMIN_PASSWORD` · `ADMIN_NOMBRE` | `admin@feriabot.com` · `admin123` · `Organización` | Organizador que se crea al arrancar **solo si no existe ninguno** |
| `DEMO_MODE` | `true` | Habilita `POST /demo/reiniciar` |
| `SMTP_HOST` · `SMTP_PORT` | `smtp.gmail.com` · `587` | Servidor de correo (465 usa SSL directo) |
| `SMTP_USER` · `SMTP_PASSWORD` | vacío | Cuenta y contraseña de aplicación. Vacío = no se envía nada y los códigos salen en la consola |
| `MAIL_FROM_NAME` | `FeriaBot Pro` | Nombre del remitente y de la app en los correos |
| `CODIGO_MINUTOS` | `10` | Vigencia de los códigos de verificación |
| `ZONA_HORARIA_UTC` | `-5` | Diferencia con UTC de la hora local (Ecuador). Las fechas se guardan en UTC; las estadísticas y el Excel de leads usan la hora local |
| `FRONTEND_URL` | `http://localhost:5173` | Dirección del frontend para los botones de los correos. Cambiarla al publicar la app |
| `POLITICA_VERSION` | `2026-10` | Versión vigente de la política de privacidad. Subirla cuando cambien los textos legales |
| `RESPONSABLE_NOMBRE` · `RESPONSABLE_RUC` · `RESPONSABLE_DIRECCION` · `RESPONSABLE_EMAIL` · `RESPONSABLE_TELEFONO` | `FeriaBot Pro` · vacío · `Quito, Ecuador` · `privacidad@feriabot.com` · vacío | Responsable del tratamiento de datos que aparece en los textos legales (LOPDP) |

## Estructura

```
app/
  main.py           app, CORS, manejo de errores de validación, /politica y /health
  config.py         variables de entorno (.env)
  database.py       engine, sesión y dependencia DB
  models.py         tablas: organizadores, ferias, empresas, usuarios_empresa, visitantes, inscripciones,
                    codigos_verificacion, leads, vistas_ficha
  migraciones.py    columnas nuevas sobre tablas existentes (se aplican solas al arrancar)
  schemas.py        entrada/salida en camelCase (igual que frontend/src/types.ts)
  security.py       bcrypt, JWT y dependencias de permisos por rol
  seed.py           organizador inicial y datos de demostración
  correo.py         envío por SMTP, correos de código, bienvenida, acceso de empresa y recordatorio
  verificacion.py   códigos de verificación: generar, enviar y comprobar
  recordatorios.py  comando del recordatorio un día antes de la feria
  estadisticas.py   cálculo de GET /ferias/:id/estadisticas
  exportar.py       Excel de leads (GET /leads/exportar)
  importar.py       carga masiva de empresas y su plantilla
  legal.py          textos de la política de privacidad y del tratamiento de datos (LOPDP)
  plantillas/       HTML de los correos
  routers/          auth, ferias (+ inscripciones), empresas, visitantes, leads, vistas, legal, demo
```

## Ferias

El organizador crea las ferias (nombre, descripción, lugar, fechas, aforo e interruptor de inscripciones). Cada
feria tiene sus propias **empresas** (`empresas.feria_id`) y, por lo tanto, sus leads y vistas de ficha.

- El visitante tiene **una sola cuenta** (un código `FB-XXXXXX`) y se **inscribe** a una o varias ferias
  (tabla `inscripciones`). Al registrarse elige la feria (`POST /visitantes` con `feriaId`); con su cuenta puede
  inscribirse a otras (`POST /inscripciones`).
- Una feria acepta inscripciones (`abierta`) si el interruptor está encendido y aún no pasó `fechaFin`.
  El organizador puede inscribir aunque esté cerrada.
- `estado` es `proxima`, `en_curso` o `finalizada` según la fecha de hoy.
- `aforo` es el máximo de inscritos (`null` = sin límite). Al llegar, `llena` es `true` y el registro y
  `POST /inscripciones` responden 409 "La feria está llena"; el organizador puede pasar el límite.
- Una empresa solo puede escanear (y guardar leads de) visitantes inscritos en su feria; el visitante solo
  guarda en su historial fichas de ferias en las que está inscrito. Si no, la API responde 403.
- En la puerta, el organizador registra la entrada con `POST /ferias/:id/asistencia` (`asistioEn` de la
  inscripción).
- Al borrar una feria se borran sus empresas, leads, vistas e inscripciones; las cuentas de visitante quedan.
- Al registrarse, el visitante debe aceptar la política de privacidad (`aceptaPolitica: true` en
  `POST /visitantes`, si no responde 400). Se guarda `politicaAceptadaEn` y `politicaVersion`
  (`POLITICA_VERSION`, consultable en `GET /politica`); al subir la versión, quien vuelva a registrarse con el
  organizador queda con la nueva aceptación. Los textos completos se sirven en `GET /legal/:slug`.
- Al actualizar desde una versión sin ferias, el arranque crea la «Feria principal» con las empresas y
  visitantes que ya existían.

## Autenticación

Cada login devuelve `{ token, session }`. `session` tiene la forma de `Session` del frontend: `role`, `refId`,
`nombre` y, solo para los vendedores de una empresa, `usuarioId` y `usuarioNombre`. El resto de llamadas envían
`Authorization: Bearer <token>`.

| Quién | Endpoint | Cuerpo |
| --- | --- | --- |
| Organizador | `POST /auth/organizador` | `{ email, password }` (al inicio, los de `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |
| Empresa o vendedor | `POST /auth/empresa` | `{ email, password }` (la contraseña la asigna el organizador; los vendedores, la empresa) |
| Visitante | `POST /auth/visitante` | `{ codigo }`: código de la tarjeta o contenido del QR |
| Visitante con correo | `POST /auth/enviar-codigo` y luego `POST /auth/visitante/correo` | `{ email, proposito: "ingreso" }` → `{ email, codigo }` |
| Olvidé mi contraseña (empresa, vendedor u organizador) | `POST /auth/recuperar/enviar-codigo` y luego `POST /auth/recuperar/cambiar` | `{ email, role }` → `{ email, role, codigo, password }` (devuelve la sesión iniciada) |

`GET /auth/me` devuelve la sesión del token.

`/auth/recuperar/enviar-codigo` responde lo mismo exista o no la cuenta, para no revelar qué correos están
registrados. Una empresa sin contraseña asignada también puede crear la suya por esta vía.

El organizador y la empresa (o el vendedor, sobre su propia cuenta) cambian sus datos de acceso con su sesión
iniciada:

- `POST /auth/cambiar-password` con `{ passwordActual, passwordNueva }` (mínimo 6 caracteres). Responde 204,
  o 400 si la actual no es correcta o la nueva es igual.
- `POST /auth/cambiar-correo` con `{ email, password }` (la contraseña actual). Devuelve `{ token, session }`
  nuevos; 409 si el correo ya lo usa otra cuenta, 400 si la contraseña no es correcta.

El organizador de `ADMIN_EMAIL` / `ADMIN_PASSWORD` solo se crea al arrancar si no existe ningún organizador, así
que después de cambiar el correo o la contraseña desde la app no vuelve a aparecer la cuenta por defecto.

**Vendedores de una empresa.** La cuenta principal de la empresa (o el organizador) agrega vendedores con su
propio correo y contraseña (`/empresas/:id/usuarios`). Entran por el mismo `POST /auth/empresa`; su sesión es la
de la empresa (`refId` y `nombre` de la empresa) más `usuarioId` y `usuarioNombre`. El correo no puede repetirse
entre empresas y vendedores. Cada lead guarda en `registradoPor` quién escaneó primero al visitante. Un vendedor
no puede administrar el equipo. Si se borra un vendedor ya no puede ingresar, pero una sesión abierta dura hasta
que vence (`JWT_EXPIRE_MINUTES`).

### Códigos de verificación por correo

- **Registro**: el frontend llama a `POST /auth/enviar-codigo` con `{ email, proposito: "registro" }` y luego a
  `POST /visitantes` con los datos y `codigoVerificacion`. El visitante solo se crea si el código es correcto.
  El organizador puede registrar visitantes sin código.
- **Ingreso con correo**: `proposito: "ingreso"` y luego `POST /auth/visitante/correo`.
- **Cambio de correo del visitante**: `POST /visitantes/me/correo/enviar-codigo` y luego
  `POST /visitantes/me/correo`; el código solo sirve para la cuenta que lo pidió.
- El código es de 6 dígitos, vence en `CODIGO_MINUTOS`, se puede usar una sola vez, permite 5 intentos y
  hay que esperar 60 s para pedir otro (429). Se guarda como hash en la tabla `codigos_verificacion`.

## Correos

### Gmail

1. En la cuenta de Google que enviará los correos, activa la **verificación en 2 pasos**.
2. Crea una **contraseña de aplicación** en https://myaccount.google.com/apppasswords (16 letras).
3. En `.env`:

   ```
   SMTP_USER=tucuenta@gmail.com
   SMTP_PASSWORD=abcdefghijklmnop   # la contraseña de aplicación, sin espacios
   ```

4. Reinicia el backend.

Mientras `SMTP_USER` esté vacío no se envía nada y cada correo aparece como una línea en la consola del backend
(`[correo no configurado] ...`), útil para desarrollo. Gmail permite unos 500 correos al día; para más volumen
usa un servicio como Brevo o SendGrid cambiando `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASSWORD`.

### Qué correos se envían

| Correo | Cuándo | Plantilla |
| --- | --- | --- |
| Código de verificación | Registro, ingreso con correo, olvidé mi contraseña, cambio de correo | `codigo_verificacion.html` |
| Bienvenida con la tarjeta (código y QR `FERIABOT:V:<codigo>`) | Cada vez que un visitante con correo queda inscrito en una feria nueva para él: registro (`POST /visitantes`), inscripción con su cuenta (`POST /inscripciones`) o el organizador lo inscribe. No se repite si ya estaba inscrito | `bienvenida_visitante.html` |
| Acceso de empresa (correo y contraseña) | `POST /empresas` o `POST /empresas/importar` con contraseña | `acceso_empresa.html` |
| Recordatorio con la tarjeta | Un día antes de la feria (comando) o a mano (`POST /ferias/:id/recordatorio`) | `recordatorio_feria.html` |

Si la feria tiene **portada**, la bienvenida, el acceso de empresa y el recordatorio la muestran arriba del
contenido (va adjunta al correo, como el QR; si es una URL https se enlaza). Sin portada el bloque no aparece.

La bienvenida y el acceso de empresa se envían en segundo plano: si fallan, el registro sigue igual y el error
queda en el log. Los botones apuntan a `FRONTEND_URL`.

**Recordatorio automático.** `.\.venv\Scripts\python -m app.recordatorios` lo envía a los inscritos con correo de
las ferias que empiezan mañana y marca la feria en `recordatorioEnviadoEn` para no repetirlo. Hay que
programarlo una vez al día, por ejemplo con el Programador de tareas de Windows (programa:
`backend\.venv\Scripts\python.exe`, argumentos: `-m app.recordatorios`, iniciar en: `backend`).

**Vista previa sin enviar nada** (abre el HTML en el navegador):

```powershell
.\.venv\Scripts\python -m app.correo                # código de verificación
.\.venv\Scripts\python -m app.correo visitante      # bienvenida con QR
.\.venv\Scripts\python -m app.correo empresa        # acceso de empresa
.\.venv\Scripts\python -m app.correo recordatorio   # recordatorio
```

Para verlos con portada, agrega el id de una feria (toma su nombre, fechas, lugar y portada de la base) o la
ruta de una imagen: `.\.venv\Scripts\python -m app.correo recordatorio feria-abc123` o
`... app.correo visitante C:\fotos\recinto.jpg`.

Credenciales de la demo: organizador `admin@feriabot.com` / `admin123`; cada empresa entra con su correo
(p. ej. `ventas@cafeandino.com`) y la contraseña `empresa123`; visitantes con su código, p. ej. `FB-7K3PQX`.

## Endpoints

`:id` es el identificador del recurso. "Con sesión" = cualquier rol con token.

### Ferias e inscripciones

| Método y ruta | Quién | Notas |
| --- | --- | --- |
| `GET /ferias?activas=true&estado=` · `GET /ferias/:id` | Público | Con `abierta`, `estado` (`proxima`, `en_curso`, `finalizada`), `aforo`, `llena`, `recordatorioEnviadoEn`, `totalEmpresas` y `totalVisitantes` |
| `GET /ferias/:id/publica` | Público | La feria con `empresas`: `id`, `nombre`, `rubro`, `stand` y `logo` (sin correo ni teléfono) |
| `POST /ferias` · `PATCH /ferias/:id` · `DELETE /ferias/:id` | Organizador | `{ nombre, descripcion, lugar, portada, portadaAlt, fechaInicio, fechaFin, inscripcionesAbiertas, aforo }`. `portada` es opcional: data URL JPG, PNG o WebP (máx. 1,5 MB) o URL `https://`; `portadaAlt` es su texto alternativo. En el PATCH, `aforo: null` quita el límite y `portada: null` quita la imagen |
| `POST /ferias/:id/duplicar` | Organizador | `{ nombre, fechaInicio, fechaFin }`: nueva feria con la descripción, el lugar, la portada y el aforo de la original (las empresas no se copian porque su correo es único); 201 |
| `GET /ferias/:id/estadisticas` | Organizador | `{ totalInscritos, asistentes, inscritosPorDia: [{ fecha, total }], escaneosPorHora: [{ hora, total }], rankingEmpresas: [{ empresaId, nombre, leads, vistas }], ciudades: [{ ciudad, total }] }`. Días y horas en hora local (`ZONA_HORARIA_UTC`), con los huecos en 0 |
| `POST /ferias/:id/asistencia` | Organizador | Control de acceso en la puerta: `{ codigo }` (código o QR) → `{ visitante, asistioEn, yaRegistrada }`. 404 si el código no existe, 403 si no está inscrito. Si ya entró, conserva la primera hora |
| `POST /ferias/:id/recordatorio` | Organizador | Envía ya el recordatorio a los inscritos con correo; devuelve `{ enviados }` (409 si la feria terminó) |
| `GET /inscripciones?visitanteId=&feriaId=` | Organizador, el propio visitante | Con la `feria` embebida y `asistioEn` (hora de entrada o null) |
| `POST /inscripciones` | Visitante, organizador | `{ feriaId }` (el organizador agrega `visitanteId`); si ya estaba inscrito devuelve la misma |
| `DELETE /inscripciones/:feriaId/:visitanteId` | Organizador, el propio visitante | Quita de la feria (el visitante cancela su propia inscripción) y borra sus leads y vistas en ella; la cuenta se conserva. 404 si no estaba inscrito |

### Empresas

| Método y ruta | Quién | Notas |
| --- | --- | --- |
| `GET /empresas?feriaId=` · `GET /empresas/:id` | Público | Ficha pública del stand (incluye `feriaId`) |
| `POST /empresas` | Organizador | Requiere `feriaId`; acepta `password` opcional para el acceso de la empresa |
| `PATCH /empresas/:id` | Organizador, o la propia empresa | Cambios parciales; `password` cambia la contraseña |
| `DELETE /empresas/:id` | Organizador | Borra en cascada sus leads, vistas y vendedores |
| `GET /empresas/plantilla` | Público | Plantilla .xlsx vacía para la carga masiva (hojas Empresas e Instrucciones) |
| `POST /empresas/importar?feriaId=` | Organizador | Multipart con el campo `archivo` (.xlsx, máx. 5 MB, 2000 filas). Columnas `nombre`, `rubro`, `stand`, `contacto`, `email`, `telefono`, `password` (obligatorias: nombre y email; acepta títulos con tildes como "Correo electrónico"). Devuelve `{ creadas, errores: [{ fila, motivo }] }`: las filas con errores (correo inválido, repetido o ya usado, contraseña corta…) no se cargan y no detienen al resto. 400 si el archivo no es un .xlsx o faltan columnas |
| `GET /empresas/:id/usuarios` | Organizador, la cuenta principal de la empresa | Vendedores: `[{ id, empresaId, nombre, email, creadoEn }]` |
| `POST /empresas/:id/usuarios` | Organizador, la cuenta principal de la empresa | `{ nombre, email, password }`; 409 si el correo ya lo usa una empresa o un vendedor; 201 |
| `DELETE /empresas/:id/usuarios/:usuarioId` | Organizador, la cuenta principal de la empresa | Quita al vendedor; sus leads se conservan; 204 |

### Visitantes

| Método y ruta | Quién | Notas |
| --- | --- | --- |
| `POST /visitantes` | Público | Exige `aceptaPolitica: true`. Registro en una feria (`feriaId`, debe estar abierta y con cupo); genera el código `FB-XXXXXX`. Con correo exige `codigoVerificacion`. Si el organizador usa un correo existente, inscribe esa cuenta |
| `GET /visitantes?feriaId=` | Organizador | Con `feriaId`, solo los inscritos |
| `GET /visitantes/buscar?q=` | Organizador, empresa | Por código, contenido del QR o correo. A la empresa le da 403 si no está inscrito en su feria |
| `GET /visitantes/:id` | Organizador, o el propio visitante | Incluye `politicaAceptadaEn` y `politicaVersion` |
| `DELETE /visitantes/:id` | Organizador | Borra en cascada sus inscripciones, leads y vistas |
| `PATCH /visitantes/me` | El propio visitante | `{ nombre?, telefono?, empresa?, ciudad? }`; devuelve el visitante |
| `POST /visitantes/me/correo/enviar-codigo` | El propio visitante | `{ email }`: envía un código al correo nuevo (409 si ya existe o es el mismo); 204 |
| `POST /visitantes/me/correo` | El propio visitante | `{ email, codigo }`: cambia el correo y devuelve el visitante |
| `DELETE /visitantes/me` | El propio visitante | Borra su cuenta con sus inscripciones, leads y vistas; 204 |

### Leads y vistas de ficha

| Método y ruta | Quién | Notas |
| --- | --- | --- |
| `GET /leads?empresaId=&visitanteId=&feriaId=` | Con sesión | Con `visitante` y `empresa` embebidos, `estado` y `registradoPor`. La empresa solo ve los suyos y el visitante los propios |
| `PUT /leads` | Organizador, la propia empresa | `{ empresaId, visitanteId, calificacion, nota }`; crea o actualiza (uno por empresa + visitante). El visitante debe estar inscrito en la feria de la empresa |
| `GET /leads/:empresaId/:visitanteId` | Organizador, la propia empresa | 404 si no existe |
| `PATCH /leads/:id/estado` | Organizador, la propia empresa | `{ estado }`: `nuevo`, `contactado`, `cotizado` o `cerrado`; devuelve el lead |
| `GET /leads/exportar?feriaId=&empresaId=` | Con sesión | Los mismos leads que `GET /leads` (mismo alcance) en un .xlsx: fecha (hora local), empresa, stand, datos del visitante, calificación, estado, nota y registrado por. El nombre del archivo va en `Content-Disposition` (expuesto por CORS) |
| `POST /vistas` | Organizador, el propio visitante | `{ visitanteId, empresaId }`; si ya existía actualiza la fecha. 403 si no está inscrito en la feria de la empresa |
| `GET /vistas?visitanteId=&empresaId=&feriaId=` | Con sesión | Con `empresa` y `visitante` embebidos; mismo alcance que leads |

### Autenticación, textos legales y sistema

| Método y ruta | Quién | Notas |
| --- | --- | --- |
| `POST /auth/organizador` · `POST /auth/empresa` · `POST /auth/visitante` · `POST /auth/visitante/correo` | Público | Ver [Autenticación](#autenticación) |
| `POST /auth/enviar-codigo` | Público | Envía el código de 6 dígitos al correo (`registro` o `ingreso`) |
| `POST /auth/recuperar/enviar-codigo` · `POST /auth/recuperar/cambiar` | Público | Olvidé mi contraseña |
| `POST /auth/cambiar-password` · `POST /auth/cambiar-correo` | Organizador, empresa | Sobre la propia cuenta (o la del vendedor) |
| `GET /auth/me` | Con sesión | La sesión del token |
| `GET /politica` | Público | `{ version }` de la política de privacidad vigente |
| `GET /legal/:slug` | Público | `privacidad` o `tratamiento-datos`: `{ slug, titulo, resumen, version, actualizado, responsable: { nombre, ruc, direccion, email, telefono }, secciones: [{ titulo, parrafos, lista }] }`. El responsable sale de `RESPONSABLE_*`; 404 con los disponibles si el slug no existe |
| `POST /demo/reiniciar` | Organizador | Borra todo y recarga la demo. Solo con `DEMO_MODE=true` |
| `GET /health` | Público | `{ ok: true }` |

Errores: `{ "detail": "mensaje" }` con 400 (dato incorrecto, código vencido), 401 (sin sesión), 403 (sin
permiso o no inscrito), 404, 409 (correo repetido, feria cerrada o llena), 422 (validación), 429 (código pedido
hace menos de 60 s) o 502 (no se pudo enviar un código por correo). Las fechas se devuelven en UTC con formato
ISO (`2026-11-05T14:03:00.000Z`); las fechas de feria, como `YYYY-MM-DD`.

## Frontend

El frontend consume esta API desde `frontend/src/services/api.ts`. Con `VITE_API_URL=/api` (valor de
`frontend/.env.example`) las llamadas pasan por el proxy de Vite hacia `localhost:8000` y todo sale por un solo
puerto, que es lo que sirve para túneles como Cloudflare. Si en cambio se apunta directo a
`http://localhost:8000`, la dirección desde la que se abre el frontend tiene que estar en `CORS_ORIGINS`.

Pendiente para producción: migraciones con Alembic (hoy se usa `create_all` más `migraciones.py`) y guardar las
imágenes en un almacenamiento de archivos en lugar de data URLs en la base.
