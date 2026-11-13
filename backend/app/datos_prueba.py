"""Carga masiva de datos de prueba: ferias, empresas, vendedores, visitantes, inscripciones, leads y vistas.

No toca los datos existentes: todo lo que crea lleva ids con el prefijo `pr-` y correos @example.com
(dominio reservado para ejemplos: nadie los recibe). Las ferias quedan con el recordatorio marcado como
enviado para que app.recordatorios no escriba a estos visitantes.

Uso:
    py -m app.datos_prueba             # carga los datos de prueba (si ya están, no hace nada)
    py -m app.datos_prueba --reset     # borra los datos de prueba y los vuelve a cargar
    py -m app.datos_prueba --borrar    # solo borra los datos de prueba
    py -m app.datos_prueba --visitantes 500   # cuántos visitantes crear (por defecto 300)
"""

import random
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine
from .migraciones import migrar
from .models import Empresa, Feria, Inscripcion, Lead, UsuarioEmpresa, Visitante, VistaFicha
from .security import hash_password
from .seed import crear_organizador_inicial
from .utils import ruc_persona_natural
from .utils import ahora as ahora_utc

PREFIJO = "pr-"
DOMINIO = "example.com"
PASSWORD_EMPRESAS = "empresa123"
PASSWORD_VENDEDORES = "vendedor123"
ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

NOMBRES = [
    "María", "José", "Ana", "Luis", "Carmen", "Jorge", "Lucía", "Carlos", "Gabriela", "Andrés", "Daniela", "Diego",
    "Valeria", "Fernando", "Paola", "Ricardo", "Sofía", "Javier", "Camila", "Miguel", "Isabel", "Pablo", "Andrea",
    "Santiago", "Verónica", "Esteban", "Natalia", "Mateo", "Fernanda", "Sebastián", "Karla", "Emilio", "Mónica",
    "Tomás", "Patricia", "Gustavo", "Elena", "Raúl", "Cristina", "Iván",
]
APELLIDOS = [
    "Castro", "Andrade", "Ruiz", "Villacís", "Ortiz", "Herrera", "Vega", "Mendoza", "Paredes", "Rivas", "Salazar",
    "Torres", "Guerrero", "Morales", "Zambrano", "Cedeño", "Benítez", "Chávez", "Espinoza", "Jaramillo", "López",
    "Naranjo", "Peñaherrera", "Quintero", "Rosero", "Suárez", "Tapia", "Vásconez", "Yépez", "Aguirre", "Bravo",
    "Cárdenas", "Delgado", "Erazo", "Flores", "Granda", "Hidalgo", "Intriago", "Loor", "Montalvo",
]
CIUDADES = ["Quito", "Guayaquil", "Cuenca", "Ambato", "Ibarra", "Loja", "Manta", "Riobamba", "Machala", "Portoviejo",
            "Latacunga", "Esmeraldas", "Santo Domingo", "Milagro"]
ORGANIZACIONES = ["Independiente", "Hotel Plaza", "Constructora Andina", "Restaurante Sabores", "Colegio Los Andes",
                  "Hacienda La Esperanza", "Startup Lab", "Universidad Central", "Ferretería El Tornillo",
                  "Clínica San José", "Distribuidora Norte", "Panadería La Espiga", "Municipio", "Agencia Creativa",
                  "Transportes del Sur", "Farmacia Vida", "Importadora Pacífico", "Consultora Andes", ""]

FERIAS = [
    # (clave, nombre, lugar, descripción, inicio relativo a hoy (días), duración (días), abierta, aforo)
    ("tec-25", "Expo Tecnología 2025", "Centro de Convenciones Simón Bolívar, Guayaquil",
     "Software, hardware, telecomunicaciones y startups tecnológicas del país.", -60, 3, False, None),
    ("agro-25", "Feria Agroproductiva", "Recinto Ferial, Ambato",
     "Productores agrícolas, maquinaria, insumos orgánicos y asesoría técnica.", -25, 2, False, None),
    ("gastro", "Festival Gastronómico Sabores del Ecuador", "Parque La Carolina, Quito",
     "Restaurantes, productores artesanales y proveedores para la industria de alimentos.", -1, 3, True, None),
    ("constru", "Expo Construcción y Vivienda", "Centro de Exposiciones Quito",
     "Materiales, acabados, inmobiliarias y financiamiento para vivienda.", 0, 2, True, 400),
    ("salud", "Feria de Salud y Bienestar", "Mall del Sol, Guayaquil",
     "Clínicas, laboratorios, farmacias, nutrición y deporte.", 12, 2, True, None),
    ("moda", "Semana de la Moda y el Diseño", "Centro Cultural Metropolitano, Quito",
     "Diseñadores, textiles, calzado y accesorios hechos en Ecuador.", 25, 3, True, 30),
    ("turismo", "Feria Internacional de Turismo", "Centro de Convenciones, Cuenca",
     "Agencias, hoteles, aerolíneas y destinos turísticos nacionales.", 45, 3, False, None),
    ("educa", "Expo Educación Superior", "Universidad Central, Quito",
     "Universidades, institutos, becas y programas de posgrado.", 70, 2, True, 800),
]

EMPRESAS = {
    "tec-25": [("Nube Andina", "Software y servicios"), ("RedFibra", "Telecomunicaciones"),
               ("CódigoSur", "Desarrollo de software"), ("DataQ", "Analítica de datos"),
               ("SegurIT", "Ciberseguridad"), ("Robótica EC", "Hardware y robótica"),
               ("AppFactory", "Desarrollo de aplicaciones"), ("CloudPyme", "Software y servicios")],
    "agro-25": [("AgroVerde Sierra", "Agroindustria"), ("Riego Tec", "Riego tecnificado"),
                ("Semillas del Valle", "Semillas"), ("Tractores Andes", "Maquinaria agrícola"),
                ("BioAbono", "Insumos orgánicos"), ("Lácteos La Pradera", "Lácteos")],
    "gastro": [("Cacao Real", "Chocolates"), ("Café de Loja", "Café de especialidad"),
               ("Panadería La Espiga", "Panadería"), ("Cervecería Volcán", "Bebidas artesanales"),
               ("Mariscos del Pacífico", "Mariscos"), ("Quesos El Ángel", "Lácteos"),
               ("Frutas del Trópico", "Frutas y pulpas"), ("Equipos Chef", "Equipamiento de cocina"),
               ("Especias Andinas", "Condimentos"), ("Empaques Verdes", "Empaques biodegradables")],
    "constru": [("Cementos Cotopaxi", "Materiales de construcción"), ("Cerámica Azuay", "Acabados"),
                ("Inmobiliaria Horizonte", "Inmobiliaria"), ("Vidrios y Aluminio Norte", "Ventanería"),
                ("Pinturas Color Vivo", "Pinturas"), ("Banco Vivienda", "Financiamiento"),
                ("Maderas Finas", "Carpintería"), ("Eléctricos Ruiz", "Material eléctrico"),
                ("Domótica Hogar", "Automatización")],
    "salud": [("Clínica Vida Plena", "Clínica"), ("Laboratorio Biomed", "Laboratorio clínico"),
              ("Farmacia Bienestar", "Farmacia"), ("NutriFit", "Nutrición"), ("Óptica Visión Clara", "Óptica"),
              ("Gimnasio Fuerza", "Deporte"), ("Dental Sonrisa", "Odontología")],
    "moda": [("TejeLab", "Textil y diseño"), ("Calzado Cuero Fino", "Calzado"), ("Joyas Plata Andina", "Joyería"),
             ("Paja Toquilla Montecristi", "Sombreros"), ("Moda Urbana EC", "Ropa"), ("Bolsos Kuna", "Accesorios")],
    "turismo": [("Galápagos Tours", "Agencia de viajes"), ("Hostería Valle Sagrado", "Hotelería"),
                ("Aerolínea Cóndor", "Aerolínea"), ("Amazonía Lodge", "Ecoturismo"),
                ("Tren de los Andes", "Turismo"), ("Surf Montañita", "Turismo de aventura")],
    "educa": [("Universidad del Pacífico", "Universidad"), ("Instituto Tecnológico Sierra", "Instituto"),
              ("Becas Futuro", "Becas"), ("Idiomas Global", "Idiomas"), ("Escuela de Negocios Andes", "Posgrados")],
}
SERVICIOS = ["Venta al por mayor", "Venta al por menor", "Asesoría", "Distribución nacional", "Cotizaciones",
             "Capacitación", "Instalación", "Soporte técnico", "Envíos a domicilio", "Planes empresariales"]
NOTAS = ["", "", "Pidió catálogo por correo.", "Interesado en precios por volumen.", "Llamar la próxima semana.",
         "Quiere una demostración.", "Visitar su local.", "Enviar cotización.", "Ya trabaja con la competencia.",
         "Volverá el último día de la feria."]


def _slug(texto: str) -> str:
    reemplazos = str.maketrans("áéíóúñÁÉÍÓÚÑ", "aeiounAEIOUN")
    return "".join(c for c in texto.translate(reemplazos).lower() if c.isalnum())


def _codigo(rnd: random.Random, usados: set[str]) -> str:
    while True:
        c = "FB-" + "".join(rnd.choice(ALFABETO_CODIGO) for _ in range(6))
        if c not in usados:
            usados.add(c)
            return c


def _momento(rnd: random.Random, dia: date) -> datetime:
    """Hora al azar entre las 9:00 y las 18:00 de ese día (aprox. UTC-5 → se guarda +5 h)."""
    return datetime.combine(dia, time(14, 0)) + timedelta(minutes=rnd.randint(0, 540))


def borrar(db: Session) -> None:
    for modelo in (VistaFicha, Lead, Inscripcion, UsuarioEmpresa, Visitante, Empresa, Feria):
        db.execute(delete(modelo).where(modelo.id.like(f"{PREFIJO}%")))
    db.commit()


def cargar(db: Session, n_visitantes: int = 300) -> dict[str, int]:
    rnd = random.Random(2026)
    hoy = date.today()
    ahora = ahora_utc()
    pw_empresa = hash_password(PASSWORD_EMPRESAS)
    pw_vendedor = hash_password(PASSWORD_VENDEDORES)
    codigos_usados = set(db.scalars(select(Visitante.codigo)))
    total = dict(ferias=0, empresas=0, vendedores=0, visitantes=0, inscripciones=0, asistencias=0, leads=0, vistas=0)

    # --- Ferias
    ferias: dict[str, Feria] = {}
    for clave, nombre, lugar, desc, inicio, dias, abierta, aforo in FERIAS:
        f = Feria(
            id=f"{PREFIJO}feria-{clave}", nombre=nombre, lugar=lugar, descripcion=desc,
            fecha_inicio=hoy + timedelta(days=inicio), fecha_fin=hoy + timedelta(days=inicio + dias - 1),
            inscripciones_abiertas=abierta, aforo=aforo, portada_alt="",
            # Marcado como enviado: así el recordatorio automático no manda correos a los visitantes de prueba.
            recordatorio_enviado_en=ahora,
            creado_en=ahora - timedelta(days=max(10, 40 - inicio)),
        )
        db.add(f)
        ferias[clave] = f
        total["ferias"] += 1
    db.flush()

    # --- Empresas y vendedores
    empresas_de: dict[str, list[Empresa]] = {}
    vendedores_de: dict[str, list[str]] = {}
    for clave, lista in EMPRESAS.items():
        f = ferias[clave]
        empresas_de[clave] = []
        for i, (nombre, rubro) in enumerate(lista):
            slug = _slug(nombre)
            contacto = f"{rnd.choice(NOMBRES)} {rnd.choice(APELLIDOS)}"
            e = Empresa(
                id=f"{PREFIJO}emp-{clave}-{i + 1}", feria_id=f.id, nombre=nombre, rubro=rubro,
                ruc=ruc_persona_natural(f"{rnd.randint(1, 24):02d}{rnd.randint(0, 5)}{rnd.randint(0, 999999):06d}"),
                descripcion=f"{nombre}: {rubro.lower()} con atención a empresas y clientes de todo el país.",
                servicios=rnd.sample(SERVICIOS, 3), contacto_nombre=contacto,
                email=f"{slug}.{clave}@{DOMINIO}", telefono=f"+593 9{rnd.randint(2, 9)} {rnd.randint(100, 999)} {rnd.randint(1000, 9999)}",
                sitio_web=f"https://{slug}.ec" if rnd.random() < 0.5 else None,
                stand=f"{'ABCD'[i % 4]}-{i // 4 + 1:02d}", logo=None, fotos=[], password_hash=pw_empresa,
                creado_en=f.creado_en + timedelta(days=rnd.randint(1, 5)),
            )
            db.add(e)
            empresas_de[clave].append(e)
            total["empresas"] += 1
            # Una de cada tres empresas tiene 1 o 2 vendedores.
            vendedores_de[e.id] = []
            if i % 3 == 0:
                for k in range(rnd.randint(1, 2)):
                    nom = f"{rnd.choice(NOMBRES)} {rnd.choice(APELLIDOS)}"
                    db.add(UsuarioEmpresa(
                        id=f"{PREFIJO}usr-{clave}-{i + 1}-{k + 1}", empresa_id=e.id, nombre=nom,
                        email=f"vendedor{k + 1}.{slug}.{clave}@{DOMINIO}", password_hash=pw_vendedor,
                        creado_en=e.creado_en + timedelta(hours=2),
                    ))
                    vendedores_de[e.id].append(nom)
                    total["vendedores"] += 1
    db.flush()

    # --- Visitantes, inscripciones, asistencia, leads y vistas
    claves = list(ferias)
    peso = {"tec-25": 5, "agro-25": 3, "gastro": 5, "constru": 4, "salud": 3, "moda": 2, "turismo": 1, "educa": 3}
    inscritos: dict[str, int] = {c: 0 for c in claves}
    n_lead = n_vista = 0
    for v in range(1, n_visitantes + 1):
        nombre = f"{rnd.choice(NOMBRES)} {rnd.choice(APELLIDOS)} {rnd.choice(APELLIDOS)}"
        partes = nombre.split()
        creado = ahora - timedelta(days=rnd.randint(1, 90), minutes=rnd.randint(0, 1440))
        vis = Visitante(
            id=f"{PREFIJO}vis-{v}", codigo=_codigo(rnd, codigos_usados), nombre=nombre,
            telefono=f"+593 9{rnd.randint(2, 9)} {rnd.randint(100, 999)} {rnd.randint(1000, 9999)}",
            email=f"{_slug(partes[0])}.{_slug(partes[1])}{v}@{DOMINIO}" if rnd.random() < 0.9 else None,
            empresa=rnd.choice(ORGANIZACIONES), ciudad=rnd.choice(CIUDADES),
            politica_aceptada_en=creado, politica_version=settings.politica_version, creado_en=creado,
        )
        db.add(vis)
        total["visitantes"] += 1

        # 1 a 3 ferias por visitante; las del pasado tienen más gente para que haya historial.
        elegidas: set[str] = set()
        for _ in range(rnd.choices([1, 2, 3], weights=[5, 3, 2])[0]):
            elegidas.add(rnd.choices(claves, weights=[peso[c] for c in claves])[0])
        for clave in elegidas:
            f = ferias[clave]
            if f.aforo and inscritos[clave] >= f.aforo:
                continue
            inscritos[clave] += 1
            ins_creado = datetime.combine(f.fecha_inicio, time(14)) - timedelta(days=rnd.randint(1, 30), minutes=rnd.randint(0, 600))
            dias_pasados = [f.fecha_inicio + timedelta(days=d) for d in range((f.fecha_fin - f.fecha_inicio).days + 1)
                            if f.fecha_inicio + timedelta(days=d) <= hoy]
            asistio = None
            if dias_pasados and rnd.random() < 0.75:
                asistio = _momento(rnd, rnd.choice(dias_pasados))
                if asistio > ahora:
                    asistio = ahora - timedelta(minutes=rnd.randint(5, 120))
                total["asistencias"] += 1
            db.add(Inscripcion(id=f"{PREFIJO}ins-{v}-{clave}", feria_id=f.id, visitante_id=vis.id,
                               creado_en=min(ins_creado, ahora), asistio_en=asistio))
            total["inscripciones"] += 1
            if not asistio:
                continue
            # En la feria: lo escanean de 0 a 5 empresas y visita de 0 a 4 fichas.
            for e in rnd.sample(empresas_de[clave], min(len(empresas_de[clave]), rnd.randint(0, 5))):
                n_lead += 1
                t = min(asistio + timedelta(minutes=rnd.randint(5, 300)), ahora)
                pasada = f.fecha_fin < hoy
                vendedores = vendedores_de[e.id]
                db.add(Lead(
                    id=f"{PREFIJO}lead-{n_lead}", empresa_id=e.id, visitante_id=vis.id,
                    calificacion=rnd.choices(["interesado", "visita", "correo", "no_interesado"], weights=[5, 2, 3, 1])[0],
                    estado=rnd.choices(["nuevo", "contactado", "cotizado", "cerrado"],
                                       weights=[2, 4, 3, 2] if pasada else [8, 2, 1, 0])[0],
                    nota=rnd.choice(NOTAS),
                    registrado_por=rnd.choice(vendedores) if vendedores and rnd.random() < 0.6 else e.nombre,
                    creado_en=t, actualizado_en=t + timedelta(days=rnd.randint(1, 10)) if pasada else t,
                ))
            for e in rnd.sample(empresas_de[clave], min(len(empresas_de[clave]), rnd.randint(0, 4))):
                n_vista += 1
                db.add(VistaFicha(id=f"{PREFIJO}vf-{n_vista}", visitante_id=vis.id, empresa_id=e.id,
                                  creado_en=min(asistio + timedelta(minutes=rnd.randint(1, 300)), ahora)))
        if v % 100 == 0:
            db.flush()
    total["leads"], total["vistas"] = n_lead, n_vista
    db.commit()
    return total


def main() -> None:
    Base.metadata.create_all(engine)
    migrar(engine)
    n = 300
    if "--visitantes" in sys.argv:
        n = int(sys.argv[sys.argv.index("--visitantes") + 1])
    with SessionLocal() as db:
        crear_organizador_inicial(db)
        hay = db.scalar(select(Feria.id).where(Feria.id.like(f"{PREFIJO}%")).limit(1))
        if "--borrar" in sys.argv or "--reset" in sys.argv:
            borrar(db)
            print("Datos de prueba borrados.")
            if "--borrar" in sys.argv:
                return
        elif hay:
            print("Los datos de prueba ya están cargados. Usa --reset para recargarlos o --borrar para quitarlos.")
            return
        total = cargar(db, n)
        print("Datos de prueba cargados:", ", ".join(f"{v} {k}" for k, v in total.items()))
        ejemplo = db.scalar(
            select(Visitante).join(Inscripcion, Inscripcion.visitante_id == Visitante.id)
            .where(Visitante.id.like(f"{PREFIJO}%"), Inscripcion.feria_id.in_([f"{PREFIJO}feria-tec-25", f"{PREFIJO}feria-agro-25"]))
            .limit(1)
        )
        print(f"Empresas: <correo>@{DOMINIO} / {PASSWORD_EMPRESAS} (p. ej. nubeandina.tec-25@{DOMINIO})")
        print(f"Vendedores: vendedor1.<empresa>.<feria>@{DOMINIO} / {PASSWORD_VENDEDORES}")
        if ejemplo:
            print(f"Visitante con historial: código {ejemplo.codigo} ({ejemplo.nombre})")


if __name__ == "__main__":
    main()
