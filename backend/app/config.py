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

    demo_mode: bool = True

    # Correo saliente (Gmail: smtp.gmail.com, 587 y una contraseña de aplicación).
    # Si smtp_user está vacío no se envía nada y los códigos se muestran en la consola.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    mail_from_name: str = "FeriaBot Pro"
    codigo_minutos: int = 10

    # Versión vigente de la política de privacidad y tratamiento de datos. Al cambiar el texto de la
    # política se sube la versión; cada visitante guarda la versión que aceptó y cuándo.
    politica_version: str = "2026-10"

    # Responsable del tratamiento que aparece en los textos legales (GET /legal/...).
    responsable_nombre: str = "FeriaBot Pro"
    responsable_ruc: str = ""
    responsable_direccion: str = "Quito, Ecuador"
    responsable_email: str = "privacidad@feriabot.com"
    responsable_telefono: str = ""


settings = Settings()
