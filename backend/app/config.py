from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "mysql+pymysql://root:@localhost:3306/feriabot?charset=utf8mb4"

    jwt_secret: str = "cambia-esta-clave"
    jwt_expire_minutes: int = 60 * 12

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    admin_email: str = "admin@feriabot.com"
    admin_password: str = "admin123"
    admin_nombre: str = "Organización"

    # Super Administrador inicial (FeriaBot Pro): se crea al arrancar si no hay ninguno.
    superadmin_email: str = "superadmin@feriabot.com"
    superadmin_password: str = "superadmin123"
    superadmin_nombre: str = "FeriaBot Pro"

    demo_mode: bool = True

    # «produccion» al publicar: no crea cuentas con contraseñas de ejemplo y exige claves fuertes. También cuenta como
    # producción tener FORZAR_HTTPS=true.
    entorno: str = "desarrollo"

    @property
    def es_produccion(self) -> bool:
        return self.entorno.strip().lower() in ("produccion", "producción", "production") or self.forzar_https

    # Correo saliente (Gmail: smtp.gmail.com, 587 y una contraseña de aplicación).
    # Si smtp_user está vacío no se envía nada y los códigos se muestran en la consola.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    mail_from_name: str = "FeriaBot Pro"
    codigo_minutos: int = 10
    # Diferencia con UTC de la hora local (Ecuador: -5, sin horario de verano). Las fechas se guardan en UTC;
    # las estadísticas agrupan por día y hora locales.
    zona_horaria_utc: int = -5

    # Producción: redirige http → https y envía HSTS (déjalo en false en desarrollo, que usa http).
    forzar_https: bool = False
    # Límite de intentos por IP en inicios de sesión, códigos por correo y registro (anti spam).
    limites_activos: bool = True

    # Clave AES-256-GCM (32 bytes en base64) para cifrar teléfonos, comprobantes e IP. Ver app/cifrado.py.
    clave_cifrado: str = ""
    # Redis para los límites de intentos (opcional). Vacío = contador en memoria (un solo proceso).
    redis_url: str = ""

    # PayPhone (pago con tarjeta). Sin token y store id, el pago con tarjeta queda desactivado.
    payphone_token: str = ""
    payphone_store_id: str = ""
    # Modo demostración (solo desarrollo): sin cuenta de PayPhone, una cajita de prueba simula el pago y el backend
    # simula la confirmación; el resto del flujo es el real. Nunca activarlo en producción.
    payphone_demo: bool = False
    # Confirmación de la Cajita de Pagos (solo se cambia para pruebas locales).
    payphone_confirm_url: str = "https://paymentbox.payphonetodoesposible.com/api/confirm"

    # Dirección del frontend, para los enlaces de los correos (botón "Entrar") y el sitemap.
    frontend_url: str = "http://localhost:5173"

    # Versión vigente de la política de privacidad y tratamiento de datos. Al cambiar el texto de la
    # política se sube la versión; cada visitante guarda la versión que aceptó y cuándo.
    politica_version: str = "2026-11"

    # Responsable del tratamiento que aparece en los textos legales (GET /legal/...).
    responsable_nombre: str = "FeriaBot Pro"
    responsable_ruc: str = ""
    responsable_direccion: str = "Quito, Ecuador"
    responsable_email: str = "privacidad@feriabot.com"
    responsable_telefono: str = ""


settings = Settings()

CLAVE_DE_EJEMPLO = "cambia-esta-clave"


def revisar_clave_jwt() -> str | None:
    """Con la clave de ejemplo (o una corta) cualquiera podría fabricar sesiones válidas, incluso de Super
    Administrador. En producción (FORZAR_HTTPS) el servidor no arranca; en desarrollo se avisa."""
    if settings.jwt_secret == CLAVE_DE_EJEMPLO or len(settings.jwt_secret) < 32:
        mensaje = (
            "JWT_SECRET es la clave de ejemplo o tiene menos de 32 caracteres. Genera una con:\n"
            '    py -c "import secrets; print(secrets.token_urlsafe(48))"\n'
            "y ponla en JWT_SECRET del archivo .env."
        )
        if settings.es_produccion:
            raise RuntimeError(mensaje)
        return mensaje
    return None
