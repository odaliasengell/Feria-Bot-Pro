"""Textos legales estáticos: Política de privacidad, Tratamiento de datos personales, Aviso legal y Política de cookies.

Redactados conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP, Registro Oficial
Suplemento 459 del 26 de mayo de 2021) y su Reglamento. Si cambia el contenido de cualquiera de los dos textos,
sube `POLITICA_VERSION` en el .env: cada visitante guarda la versión que aceptó y cuándo.

Los datos del responsable (nombre, RUC, dirección, correo y teléfono) salen de la configuración.
"""

from .config import settings

ACTUALIZADO = "2026-11-12"


def _responsable() -> dict:
    return {
        "nombre": settings.responsable_nombre,
        "ruc": settings.responsable_ruc,
        "direccion": settings.responsable_direccion,
        "email": settings.responsable_email,
        "telefono": settings.responsable_telefono,
    }


def _identificacion() -> str:
    partes = [settings.responsable_nombre]
    if settings.responsable_ruc:
        partes.append(f"RUC {settings.responsable_ruc}")
    if settings.responsable_direccion:
        partes.append(f"con domicilio en {settings.responsable_direccion}")
    return ", ".join(partes)


def _contacto() -> str:
    texto = f"el correo {settings.responsable_email}"
    if settings.responsable_telefono:
        texto += f" o el teléfono {settings.responsable_telefono}"
    return texto


def _privacidad() -> dict:
    r = settings.responsable_nombre
    return {
        "titulo": "Política de privacidad",
        "resumen": (
            f"Cómo {r} recoge, usa, comparte y protege tus datos personales cuando usas la plataforma "
            "para registrarte en una feria, recibir tu credencial con QR y conectar con las empresas participantes."
        ),
        "secciones": [
            {
                "titulo": "1. Quién es el responsable",
                "parrafos": [
                    f"El responsable del tratamiento de tus datos personales es {_identificacion()}. "
                    f"Para cualquier consulta sobre privacidad puedes escribir a {_contacto()}.",
                    "Cada feria es organizada por una entidad que usa la plataforma para gestionar a sus visitantes y "
                    "empresas participantes. Las empresas que escanean tu QR reciben tus datos de contacto y, desde ese "
                    "momento, son responsables del uso que hagan de ellos.",
                ],
            },
            {
                "titulo": "2. Qué datos recogemos",
                "lista": [
                    "Visitantes: nombre completo, teléfono, correo electrónico, ciudad y, de forma opcional, la empresa donde trabajas.",
                    "Credencial: el código único de tu tarjeta y su QR, y las ferias en las que te inscribiste.",
                    "Actividad en la feria: qué empresas escanearon tu QR, la calificación de interés y las notas que registraron, "
                    "y qué fichas de empresas abriste.",
                    "Empresas participantes: nombre comercial, rubro, datos de contacto del negocio, logo, fotos y la contraseña de "
                    "acceso al portal (guardada cifrada, nunca en texto legible).",
                    "Datos técnicos mínimos: códigos de verificación enviados al correo y la fecha y versión de la política que aceptaste.",
                ],
                "parrafos": [
                    "No recogemos datos sensibles (salud, origen étnico, creencias, datos biométricos ni similares) ni datos de "
                    "pago. Tampoco usamos cookies de publicidad ni de seguimiento.",
                ],
            },
            {
                "titulo": "3. Para qué usamos tus datos",
                "lista": [
                    "Crear tu cuenta, inscribirte en la feria y emitir tu credencial con QR.",
                    "Verificar que el correo te pertenece mediante un código de un solo uso.",
                    "Permitir que las empresas que tú eliges (al presentarles tu QR) registren tu visita y te contacten después.",
                    "Mostrarte tu historial: qué empresas registraron tu visita y qué fichas consultaste.",
                    "Dar al organizador de la feria la información necesaria para administrar el evento y sus estadísticas.",
                ],
                "parrafos": [
                    "No vendemos tus datos ni los usamos para tomar decisiones automatizadas que te afecten.",
                ],
            },
            {
                "titulo": "4. Con quién los compartimos",
                "lista": [
                    "Con el organizador de la feria en la que te inscribiste.",
                    "Con cada empresa participante que escanea tu QR: solo esa empresa recibe tu nombre, teléfono, correo, "
                    "empresa y ciudad. Si no presentas tu QR, la empresa no recibe tus datos.",
                    "Con proveedores que nos prestan servicios técnicos (alojamiento del servidor y envío de correos), "
                    "que actúan como encargados del tratamiento y solo pueden usar los datos según nuestras instrucciones.",
                    "Con autoridades, cuando una ley u orden judicial lo exija.",
                ],
            },
            {
                "titulo": "5. Cuánto tiempo los conservamos",
                "parrafos": [
                    "Conservamos los datos de tu cuenta mientras esté activa o mientras sean necesarios para las finalidades "
                    "descritas. Si el organizador elimina una feria, se borran también sus empresas, leads e inscripciones. "
                    "Los códigos de verificación caducan a los pocos minutos.",
                    "Puedes pedir la eliminación de tu cuenta en cualquier momento; la atenderemos salvo que una obligación "
                    "legal nos exija conservar algún dato por más tiempo.",
                ],
            },
            {
                "titulo": "6. Cómo los protegemos",
                "parrafos": [
                    "Aplicamos medidas técnicas y organizativas razonables: contraseñas cifradas, acceso por roles (organizador, "
                    "empresa y visitante solo ven lo que les corresponde), sesiones con token de duración limitada y "
                    "verificación del correo. Si ocurre una vulneración de seguridad que afecte tus datos, la notificaremos a la "
                    "Superintendencia de Protección de Datos Personales y a ti en los plazos que fija la LOPDP.",
                ],
            },
            {
                "titulo": "7. Tus derechos",
                "parrafos": [
                    "Puedes ejercer tus derechos de acceso, rectificación y actualización, eliminación, oposición, portabilidad "
                    "y suspensión del tratamiento, así como revocar tu consentimiento. El detalle de cómo hacerlo está en el "
                    "documento «Tratamiento de datos personales».",
                ],
            },
            {
                "titulo": "8. Menores de edad",
                "parrafos": [
                    "La plataforma está dirigida a personas adultas. Si eres menor de 15 años, necesitas el consentimiento de tu "
                    "madre, padre o representante legal para registrarte.",
                ],
            },
            {
                "titulo": "9. Cambios en esta política",
                "parrafos": [
                    "Si modificamos esta política publicaremos la nueva versión en esta página con su fecha de actualización. "
                    "Cuando el cambio sea relevante te pediremos aceptarla nuevamente.",
                ],
            },
        ],
    }


def _tratamiento() -> dict:
    r = settings.responsable_nombre
    return {
        "titulo": "Tratamiento de datos personales",
        "resumen": (
            "Autorización para el tratamiento de tus datos personales y procedimiento para ejercer tus derechos, "
            "conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP)."
        ),
        "secciones": [
            {
                "titulo": "1. Marco legal",
                "parrafos": [
                    "Este documento se rige por la Ley Orgánica de Protección de Datos Personales (LOPDP), publicada en el "
                    "Registro Oficial Suplemento 459 del 26 de mayo de 2021, su Reglamento y las disposiciones de la "
                    "Superintendencia de Protección de Datos Personales.",
                ],
            },
            {
                "titulo": "2. Responsable del tratamiento",
                "parrafos": [
                    f"{_identificacion()}. Contacto para protección de datos: {_contacto()}.",
                ],
            },
            {
                "titulo": "3. Base legal: tu consentimiento",
                "parrafos": [
                    "Tratamos tus datos sobre la base de tu consentimiento libre, específico, informado e inequívoco, que "
                    "otorgas al marcar la casilla de aceptación en el formulario de registro. Sin esa aceptación no es posible "
                    "emitir la credencial con QR, porque compartir tus datos con las empresas que escanean tu código es la "
                    "función principal del servicio.",
                    "Guardamos la fecha y la versión del texto que aceptaste como prueba del consentimiento. Si el registro lo "
                    "realiza el personal de la feria en la entrada, lo hace después de informarte y con tu autorización verbal.",
                ],
            },
            {
                "titulo": "4. Finalidades autorizadas",
                "lista": [
                    "Registro e inscripción en la feria y emisión de la credencial con QR.",
                    "Comunicación de tus datos de contacto a las empresas participantes que escanean tu QR, para que puedan "
                    "contactarte con información comercial relacionada con lo que viste en su stand.",
                    "Gestión del evento por parte del organizador y elaboración de estadísticas agregadas.",
                    "Envío de correos operativos (códigos de verificación y avisos sobre tu cuenta).",
                ],
                "parrafos": [
                    "Cualquier finalidad distinta requerirá un nuevo consentimiento.",
                ],
            },
            {
                "titulo": "5. Principios que aplicamos",
                "parrafos": [
                    "Juridicidad, lealtad, transparencia, finalidad, pertinencia y minimización, proporcionalidad, "
                    "confidencialidad, calidad y exactitud, conservación limitada, seguridad, responsabilidad proactiva y "
                    "demostrada, y aplicación favorable al titular.",
                ],
            },
            {
                "titulo": "6. Tus derechos como titular",
                "lista": [
                    "Información: conocer quién trata tus datos, para qué y con quién se comparten.",
                    "Acceso: obtener una copia de los datos que tenemos sobre ti.",
                    "Rectificación y actualización: corregir datos inexactos o incompletos.",
                    "Eliminación: pedir que borremos tus datos cuando ya no sean necesarios o retires tu consentimiento.",
                    "Oposición: negarte a un tratamiento determinado.",
                    "Portabilidad: recibir tus datos en un formato estructurado y de uso común.",
                    "Suspensión del tratamiento: pedir que dejemos de tratarlos temporalmente en los casos previstos por la ley.",
                    "No ser objeto de decisiones basadas únicamente en tratamientos automatizados.",
                    "Revocar tu consentimiento en cualquier momento, sin efectos retroactivos.",
                ],
            },
            {
                "titulo": "7. Cómo ejercer tus derechos",
                "parrafos": [
                    f"Envía tu solicitud a {settings.responsable_email} indicando tu nombre, el código de tu credencial o el "
                    "correo con el que te registraste, el derecho que deseas ejercer y, si corresponde, los datos a corregir. "
                    "Podemos pedirte información adicional para verificar tu identidad.",
                    "Responderemos en un plazo máximo de quince (15) días. El trámite es gratuito. Si no estás conforme con la "
                    "respuesta, puedes presentar un reclamo ante la Superintendencia de Protección de Datos Personales.",
                    "Ten en cuenta que las empresas que ya escanearon tu QR recibieron tus datos de contacto: para que dejen de "
                    "usarlos también puedes dirigirte directamente a ellas.",
                ],
            },
            {
                "titulo": "8. Transferencias internacionales",
                "parrafos": [
                    "Algunos proveedores técnicos (por ejemplo, el servicio de correo electrónico) pueden alojar datos fuera del "
                    "Ecuador. En esos casos exigimos garantías adecuadas de protección conforme a la LOPDP.",
                ],
            },
            {
                "titulo": "9. Aceptación",
                "parrafos": [
                    f"Al marcar la casilla de aceptación declaras que leíste la Política de privacidad y este documento, y "
                    f"autorizas a {r} a tratar tus datos personales para las finalidades indicadas.",
                ],
            },
        ],
    }


def _aviso_legal() -> dict:
    r = settings.responsable_nombre
    return {
        "titulo": "Aviso legal",
        "resumen": (
            f"Quién es el titular de {r}, en qué condiciones puedes usar la plataforma y qué responsabilidades asume "
            "cada parte: organizadores, empresas participantes y visitantes."
        ),
        "secciones": [
            {
                "titulo": "1. Titular de la plataforma",
                "parrafos": [
                    f"Esta plataforma es operada por {_identificacion()}. Puedes contactarnos a través de {_contacto()}.",
                ],
            },
            {
                "titulo": "2. Objeto",
                "parrafos": [
                    f"{r} es una herramienta para gestionar ferias: el organizador publica ferias y registra empresas "
                    "participantes, los visitantes se inscriben y reciben una credencial con QR, y las empresas registran "
                    "los contactos que conocen en su stand.",
                ],
            },
            {
                "titulo": "3. Condiciones de uso",
                "lista": [
                    "Debes dar datos verdaderos y mantenerlos actualizados.",
                    "Tu código de visitante y las contraseñas de las cuentas son personales: no los compartas.",
                    "No está permitido usar la plataforma para enviar publicidad no solicitada, suplantar a otras personas, "
                    "intentar acceder a cuentas ajenas ni afectar su funcionamiento.",
                    "Podemos suspender cuentas que incumplan estas condiciones.",
                ],
            },
            {
                "titulo": "4. Contenido de las empresas y de los organizadores",
                "parrafos": [
                    "La información de cada feria la publica su organizador, y la ficha de cada stand (descripción, servicios, "
                    "fotos y datos de contacto) la publica la propia empresa. Cada uno es responsable de que ese contenido "
                    "sea veraz y de contar con los derechos sobre las imágenes que sube.",
                    "Los contactos que una empresa obtiene al escanear un QR pasan a estar bajo su responsabilidad, según la "
                    "Política de privacidad.",
                ],
            },
            {
                "titulo": "5. Propiedad intelectual",
                "parrafos": [
                    f"El diseño, el código y la marca {r} pertenecen a su titular. No se permite copiarlos ni distribuirlos sin "
                    "autorización. Los logotipos, fotos y textos de cada empresa pertenecen a sus respectivos titulares.",
                ],
            },
            {
                "titulo": "6. Responsabilidad",
                "parrafos": [
                    "Trabajamos para que la plataforma esté disponible y funcione bien, pero puede haber interrupciones por "
                    "mantenimiento o causas ajenas. No respondemos por los acuerdos comerciales entre visitantes y empresas "
                    "ni por cambios de fecha, lugar o cancelaciones de una feria decididos por su organizador.",
                ],
            },
            {
                "titulo": "7. Enlaces a otros sitios",
                "parrafos": [
                    "Algunas páginas enlazan a servicios de terceros, como Google Maps, WhatsApp o el sitio web de una empresa. "
                    "Esos sitios tienen sus propias condiciones y políticas.",
                ],
            },
            {
                "titulo": "8. Ley aplicable",
                "parrafos": [
                    "Estas condiciones se rigen por las leyes de la República del Ecuador. Cualquier controversia se someterá a "
                    "los jueces competentes del domicilio del titular.",
                ],
            },
        ],
    }


def _cookies() -> dict:
    r = settings.responsable_nombre
    return {
        "titulo": "Política de cookies",
        "resumen": (
            f"{r} no usa cookies de publicidad ni de seguimiento. Aquí te contamos qué guardamos en tu navegador, "
            "para qué sirve y cómo borrarlo."
        ),
        "secciones": [
            {
                "titulo": "1. Qué guardamos en tu navegador",
                "parrafos": [
                    "En lugar de cookies usamos el almacenamiento local del navegador, solo para que la plataforma funcione:",
                ],
                "lista": [
                    "Tu sesión: para que no tengas que ingresar en cada página. Se borra al cerrar sesión.",
                    "Preferencias: por ejemplo, la feria que el organizador está administrando o que ya viste el aviso de cookies.",
                    "Tu tarjeta sin conexión: la app guarda una copia de tu credencial y tus datos de la feria para mostrarla "
                    "aunque no tengas internet en el recinto. Se borra al cerrar sesión.",
                ],
            },
            {
                "titulo": "2. Estadísticas de uso",
                "parrafos": [
                    "Para saber qué páginas se visitan y mejorar la plataforma usamos un servicio de analítica que no instala "
                    "cookies ni guarda datos personales: solo cuenta visitas de forma agregada y anónima. No se usa para "
                    "publicidad ni se comparte con terceros para otros fines.",
                ],
            },
            {
                "titulo": "3. Servicios de terceros",
                "parrafos": [
                    "Las tipografías de la página se cargan desde Google Fonts, por lo que tu navegador se conecta a servidores "
                    "de Google. Si abres el mapa de un lugar o escribes a una empresa por WhatsApp, pasas a sitios de terceros "
                    "con sus propias políticas.",
                ],
            },
            {
                "titulo": "4. Cómo borrar estos datos",
                "parrafos": [
                    "Puedes borrar el almacenamiento del sitio desde la configuración de tu navegador (en Chrome: Configuración "
                    "› Privacidad y seguridad › Datos de sitios). Si lo haces, se cerrará tu sesión y tendrás que volver a ingresar.",
                ],
            },
            {
                "titulo": "5. Más información",
                "parrafos": [
                    f"Para saber cómo tratamos tus datos personales revisa la Política de privacidad. Si tienes dudas, escribe a {_contacto()}.",
                ],
            },
        ],
    }


_DOCUMENTOS = {
    "privacidad": _privacidad,
    "tratamiento-datos": _tratamiento,
    "aviso-legal": _aviso_legal,
    "cookies": _cookies,
}


def slugs() -> list[str]:
    return list(_DOCUMENTOS)


def documento(slug: str) -> dict | None:
    crear = _DOCUMENTOS.get(slug)
    if not crear:
        return None
    return {
        "slug": slug,
        "version": settings.politica_version,
        "actualizado": ACTUALIZADO,
        "responsable": _responsable(),
        **crear(),
    }
