const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'sgc.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS materias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    codigo TEXT NOT NULL UNIQUE,
    creditos INTEGER NOT NULL,
    estado TEXT DEFAULT 'activo',
    fecha_registro TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS docentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cedula TEXT NOT NULL UNIQUE,
    correo TEXT NOT NULL,
    telefono TEXT DEFAULT '',
    estado TEXT DEFAULT 'activo',
    fecha_registro TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS periodos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    estado TEXT DEFAULT 'activo',
    fecha_registro TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS secciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_materia INTEGER NOT NULL,
    codigo_seccion TEXT NOT NULL,
    cupo INTEGER NOT NULL,
    horario TEXT NOT NULL,
    id_periodo INTEGER NOT NULL,
    id_docente INTEGER NOT NULL,
    estado TEXT DEFAULT 'activo',
    fecha_registro TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_materia) REFERENCES materias(id),
    FOREIGN KEY (id_periodo) REFERENCES periodos(id),
    FOREIGN KEY (id_docente) REFERENCES docentes(id)
  );

  CREATE TABLE IF NOT EXISTS estudiantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    matricula TEXT NOT NULL UNIQUE,
    id_seccion INTEGER,
    fecha_nacimiento TEXT DEFAULT '',
    correo TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    carrera TEXT DEFAULT '',
    estado TEXT DEFAULT 'activo',
    fecha_registro TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_seccion) REFERENCES secciones(id)
  );

  CREATE TABLE IF NOT EXISTS calificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_seccion INTEGER NOT NULL,
    id_estudiante INTEGER NOT NULL,
    nota REAL NOT NULL,
    estado TEXT NOT NULL,
    fecha_registro TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_seccion) REFERENCES secciones(id),
    FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id),
    UNIQUE(id_seccion, id_estudiante)
  );

  CREATE TABLE IF NOT EXISTS bitacora (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_calificacion INTEGER,
    id_usuario INTEGER,
    accion TEXT NOT NULL,
    nota_anterior REAL,
    nota_nueva REAL,
    fecha_cambio TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_calificacion) REFERENCES calificaciones(id)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    rol TEXT NOT NULL,
    estado TEXT DEFAULT 'activo',
    fecha_registro TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_estudiante INTEGER NOT NULL,
    id_seccion INTEGER NOT NULL,
    estado TEXT DEFAULT 'activa',
    fecha_registro TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id),
    FOREIGN KEY (id_seccion) REFERENCES secciones(id),
    UNIQUE(id_estudiante, id_seccion)
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT NOT NULL UNIQUE,
    valor TEXT NOT NULL,
    fecha_registro TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
