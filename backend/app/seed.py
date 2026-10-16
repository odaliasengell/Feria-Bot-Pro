"""Usuario organizador inicial y datos de demostración.

Uso:
    py -m app.seed            # crea tablas y carga la demo si no hay empresas
    py -m app.seed --reset    # borra todo y vuelve a cargar la demo
"""

import sys
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine
from .migraciones import migrar
from .models import CodigoVerificacion, Empresa, Feria, Inscripcion, Lead, Organizador, Visitante, VistaFicha
from .security import hash_password
from .utils import ahora, uid

PASSWORD_DEMO_EMPRESAS = "empresa123"


def crear_organizador_inicial(db: Session) -> None:
    """Crea el organizador de ADMIN_EMAIL solo si todavía no hay ninguno.

    Así, si el organizador cambia su correo o contraseña desde la app, al reiniciar no reaparece la cuenta
    por defecto (admin@feriabot.com / admin123).
    """
    email = settings.admin_email.lower()
    if db.scalar(select(Organizador.id).limit(1)):
        return
    db.add(
        Organizador(
            id=uid("org-"),
            nombre=settings.admin_nombre,
            email=email,
            password_hash=hash_password(settings.admin_password),
        )
    )
    db.commit()


def cargar_demo(db: Session) -> None:
    t0 = ahora()

    def hace(minutos: int):
        return t0 - timedelta(minutes=minutos)

    hoy = date.today()
    db.add(Feria(
        id="feria-demo", nombre="Expo Negocios 2026", lugar="Centro de Convenciones, Quito",
        descripcion="Feria de negocios con empresas de alimentos, energía, textil, software y agroindustria.",
        fecha_inicio=hoy, fecha_fin=hoy + timedelta(days=2), inscripciones_abiertas=True,
        creado_en=hace(60 * 24 * 7),
    ))
    db.add(Feria(
        id="feria-emprende", nombre="Feria de Emprendimiento", lugar="Parque Bicentenario, Quito",
        descripcion="Emprendimientos locales: gastronomía, artesanía y tecnología.",
        fecha_inicio=hoy + timedelta(days=30), fecha_fin=hoy + timedelta(days=31), inscripciones_abiertas=True,
        creado_en=hace(60 * 24 * 2),
    ))
    db.flush()

    pw = hash_password(PASSWORD_DEMO_EMPRESAS)
    empresas = [
        ("emp-andina", "Café Andino", "Alimentos y bebidas",
         "Tostadores de café de especialidad de altura. Vendemos a cafeterías, hoteles y oficinas.",
         ["Café en grano", "Máquinas para oficina", "Capacitación de baristas"],
         "Lucía Mendoza", "ventas@cafeandino.com", "+593 99 123 4567", "https://cafeandino.com", "A-04", 30),
        ("emp-solarix", "Solarix Energía", "Energía renovable",
         "Diseñamos e instalamos sistemas solares para hogares, comercios e industria.",
         ["Paneles solares", "Baterías", "Auditoría energética"],
         "Andrés Paredes", "hola@solarix.ec", "+593 98 555 0101", None, "B-12", 29),
        ("emp-tejelab", "TejeLab", "Textil y diseño",
         "Uniformes corporativos y textiles personalizados con producción local.",
         ["Uniformes", "Bordado", "Merchandising"],
         "Sofía Rivas", "pedidos@tejelab.com", "+593 97 222 3344", None, "A-09", 28),
        ("emp-nubecontable", "Nube Contable", "Software y servicios",
         "Facturación electrónica y contabilidad en la nube para pymes.",
         ["Facturación electrónica", "Nómina", "Asesoría tributaria"],
         "Diego Salazar", "demo@nubecontable.app", "+593 96 410 7788", "https://nubecontable.app", "C-01", 27),
        ("emp-agroverde", "AgroVerde", "Agroindustria",
         "Insumos orgánicos y asesoría técnica para cultivos sostenibles.",
         ["Fertilizantes orgánicos", "Riego tecnificado", "Asesoría agronómica"],
         "Marcela Torres", "info@agroverde.com", "+593 95 300 9090", None, "B-03", 26),
    ]
    for id_, nombre, rubro, desc, servicios, contacto, email, tel, web, stand, horas in empresas:
        db.add(Empresa(
            id=id_, feria_id="feria-demo", nombre=nombre, rubro=rubro, descripcion=desc, servicios=servicios,
            contacto_nombre=contacto, email=email, telefono=tel, sitio_web=web, stand=stand,
            logo=None, fotos=[], password_hash=pw, creado_en=hace(60 * horas),
        ))

    visitantes = [
        ("María José Castro", "+593 99 876 5432", "mjcastro@gmail.com", "Hotel Plaza", "Quito", "FB-7K3PQX"),
        ("Carlos Andrade", "+593 98 765 4321", "candrade@outlook.com", "Constructora Andrade", "Guayaquil", "FB-M4R8TZ"),
        ("Valentina Ruiz", "+593 97 654 3210", "vruiz@empresa.com", "Restaurante Sabores", "Cuenca", "FB-H2N6WY"),
        ("Jorge Villacís", "+593 96 543 2109", "jvillacis@gmail.com", "Independiente", "Quito", "FB-Q9D5LC"),
        ("Daniela Ortiz", "+593 95 432 1098", "dortiz@colegio.edu.ec", "Colegio Los Andes", "Ambato", "FB-T3V7BE"),
        ("Pablo Herrera", "+593 94 321 0987", "pherrera@agro.ec", "Hacienda La Esperanza", "Ibarra", "FB-X8J2GA"),
        ("Camila Vega", "+593 93 210 9876", "cvega@startup.io", "Startup Lab", "Quito", "FB-C5P4RN"),
    ]
    for i, (nombre, tel, email, empresa, ciudad, codigo) in enumerate(visitantes):
        db.add(Visitante(
            id=f"vis-{i + 1}", codigo=codigo, nombre=nombre, telefono=tel, email=email,
            empresa=empresa, ciudad=ciudad, creado_en=hace(60 * 6 - i * 25),
            politica_aceptada_en=hace(60 * 6 - i * 25), politica_version=settings.politica_version,
        ))
        db.add(Inscripcion(
            id=f"ins-{i + 1}", feria_id="feria-demo", visitante_id=f"vis-{i + 1}", creado_en=hace(60 * 6 - i * 25),
        ))
    db.flush()

    leads = [
        (1, "emp-andina", 1, "interesado", "Busca proveedor para el desayuno del hotel.", 240),
        (2, "emp-andina", 3, "visita", "Visitar el restaurante la próxima semana.", 200),
        (3, "emp-solarix", 2, "correo", "Enviar cotización para obra en Samborondón.", 180),
        (4, "emp-solarix", 6, "interesado", "Riego con bombeo solar.", 150),
        (5, "emp-tejelab", 5, "visita", "Uniformes para 400 estudiantes.", 120),
        (6, "emp-nubecontable", 7, "interesado", "", 90),
        (7, "emp-nubecontable", 4, "no_interesado", "Ya tiene sistema.", 75),
        (8, "emp-agroverde", 6, "visita", "Agendar visita técnica a la hacienda.", 60),
        (9, "emp-andina", 7, "correo", "Catálogo de máquinas para oficina.", 30),
    ]
    for n, empresa_id, v, cal, nota, minutos in leads:
        db.add(Lead(
            id=f"lead-{n}", empresa_id=empresa_id, visitante_id=f"vis-{v}", calificacion=cal,
            nota=nota, creado_en=hace(minutos), actualizado_en=hace(minutos),
        ))

    vistas = [
        (1, 1, "emp-andina", 245),
        (2, 1, "emp-tejelab", 210),
        (3, 2, "emp-solarix", 185),
        (4, 6, "emp-agroverde", 65),
        (5, 7, "emp-nubecontable", 95),
    ]
    for n, v, empresa_id, minutos in vistas:
        db.add(VistaFicha(id=f"vf-{n}", visitante_id=f"vis-{v}", empresa_id=empresa_id, creado_en=hace(minutos)))

    db.commit()


def reiniciar_demo(db: Session) -> None:
    for modelo in (VistaFicha, Lead, CodigoVerificacion, Inscripcion, Visitante, Empresa, Feria):
        db.execute(delete(modelo))
    cargar_demo(db)


def main() -> None:
    Base.metadata.create_all(engine)
    migrar(engine)
    with SessionLocal() as db:
        crear_organizador_inicial(db)
        if "--reset" in sys.argv:
            reiniciar_demo(db)
            print("Datos de demostración recargados.")
        elif db.scalar(select(Feria.id).limit(1)) or db.scalar(select(Empresa.id).limit(1)):
            print("Ya hay datos; no se cargó la demo. Usa --reset para borrar y recargar.")
        else:
            cargar_demo(db)
            print("Datos de demostración cargados.")
    print(f"Organizador: {settings.admin_email} · Empresas demo: <email de la empresa> / {PASSWORD_DEMO_EMPRESAS}")


if __name__ == "__main__":
    main()
