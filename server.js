const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// AUTENTICACIÓN
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND password = ?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
  res.json(user);
});

// SEED DATA
app.post('/api/seed', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM materias').get().c;
  if (count > 0) {
    const admin = db.prepare("SELECT * FROM usuarios WHERE email = 'admin@sgc.edu.do'").get();
    if (!admin) {
      db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Administrador General', 'admin@sgc.edu.do', 'admin123', 'Administrador')").run();
    }
    return res.json({ ok: true, message: 'Datos ya existen' });
  }

  const txn = db.transaction(() => {
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Administrador General', 'admin@sgc.edu.do', 'admin123', 'Administrador')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Coordinador Académico', 'coordinador@sgc.edu.do', 'coord123', 'Coordinador Académico')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Dr. Carlos Méndez', 'cmendez@sgc.edu.do', 'doc123', 'Docente')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Ing. Laura Torres', 'ltorres@sgc.edu.do', 'doc123', 'Docente')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Ana García', 'ana.garcia@estudiante.edu.do', 'est123', 'Estudiante')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Luis Pérez', 'luis.perez@estudiante.edu.do', 'est123', 'Estudiante')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('María López', 'maria.lopez@estudiante.edu.do', 'est123', 'Estudiante')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Pedro Sánchez', 'pedro.sanchez@estudiante.edu.do', 'est123', 'Estudiante')").run();
    db.prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES ('Carmen Ruiz', 'carmen.ruiz@estudiante.edu.do', 'est123', 'Estudiante')").run();
    db.prepare("INSERT INTO periodos (nombre, fecha_inicio, fecha_fin) VALUES ('2026-I', '2026-01-15', '2026-06-30')").run();
    db.prepare("INSERT INTO periodos (nombre, fecha_inicio, fecha_fin) VALUES ('2026-II', '2026-07-01', '2026-12-15')").run();
    db.prepare("INSERT INTO materias (nombre, codigo, creditos) VALUES ('Ingeniería de Software', 'ISW-301', 4)").run();
    db.prepare("INSERT INTO materias (nombre, codigo, creditos) VALUES ('Base de Datos', 'BD-302', 3)").run();
    db.prepare("INSERT INTO materias (nombre, codigo, creditos) VALUES ('Redes de Computadoras', 'RC-201', 3)").run();
    db.prepare("INSERT INTO docentes (nombre, cedula, correo, telefono) VALUES ('Dr. Carlos Méndez', '12345678', 'cmendez@sgc.edu.do', '809-555-1234')").run();
    db.prepare("INSERT INTO docentes (nombre, cedula, correo, telefono) VALUES ('Ing. Laura Torres', '87654321', 'ltorres@sgc.edu.do', '809-555-5678')").run();
    db.prepare("INSERT INTO secciones (id_materia, codigo_seccion, cupo, horario, id_periodo, id_docente) VALUES (1, 'S1', 30, 'Lunes 8:00-10:00', 1, 1)").run();
    db.prepare("INSERT INTO secciones (id_materia, codigo_seccion, cupo, horario, id_periodo, id_docente) VALUES (2, 'S1', 25, 'Martes 10:00-12:00', 1, 2)").run();
    db.prepare("INSERT INTO secciones (id_materia, codigo_seccion, cupo, horario, id_periodo, id_docente) VALUES (1, 'S2', 30, 'Miércoles 14:00-16:00', 1, 2)").run();
    db.prepare("INSERT INTO estudiantes (nombre, matricula, id_seccion, fecha_nacimiento, correo, telefono, carrera) VALUES ('Ana García', '2026-0001', 1, '2002-03-15', 'ana.garcia@estudiante.edu.do', '809-111-1111', 'Ingeniería en Sistemas')").run();
    db.prepare("INSERT INTO estudiantes (nombre, matricula, id_seccion, fecha_nacimiento, correo, telefono, carrera) VALUES ('Luis Pérez', '2026-0002', 1, '2001-07-22', 'luis.perez@estudiante.edu.do', '809-222-2222', 'Ingeniería en Sistemas')").run();
    db.prepare("INSERT INTO estudiantes (nombre, matricula, id_seccion, fecha_nacimiento, correo, telefono, carrera) VALUES ('María López', '2026-0003', 1, '2003-01-10', 'maria.lopez@estudiante.edu.do', '809-333-3333', 'Ingeniería en Sistemas')").run();
    db.prepare("INSERT INTO estudiantes (nombre, matricula, id_seccion, fecha_nacimiento, correo, telefono, carrera) VALUES ('Pedro Sánchez', '2026-0004', 2, '2002-05-30', 'pedro.sanchez@estudiante.edu.do', '809-444-4444', 'Ingeniería en Sistemas')").run();
    db.prepare("INSERT INTO estudiantes (nombre, matricula, id_seccion, fecha_nacimiento, correo, telefono, carrera) VALUES ('Carmen Ruiz', '2026-0005', 2, '2001-11-18', 'carmen.ruiz@estudiante.edu.do', '809-555-5555', 'Ingeniería en Sistemas')").run();
    db.prepare("INSERT INTO calificaciones (id_seccion, id_estudiante, nota, estado) VALUES (1, 1, 18, 'Aprobado')").run();
    db.prepare("INSERT INTO calificaciones (id_seccion, id_estudiante, nota, estado) VALUES (1, 2, 14, 'Aprobado')").run();
    db.prepare("INSERT INTO calificaciones (id_seccion, id_estudiante, nota, estado) VALUES (1, 3, 9, 'Reprobado')").run();
    db.prepare("INSERT INTO calificaciones (id_seccion, id_estudiante, nota, estado) VALUES (2, 4, 16, 'Aprobado')").run();
    db.prepare("INSERT INTO calificaciones (id_seccion, id_estudiante, nota, estado) VALUES (2, 5, 11, 'Aprobado')").run();
    db.prepare("INSERT INTO inscripciones (id_estudiante, id_seccion) VALUES (1, 1)").run();
    db.prepare("INSERT INTO inscripciones (id_estudiante, id_seccion) VALUES (2, 1)").run();
    db.prepare("INSERT INTO inscripciones (id_estudiante, id_seccion) VALUES (3, 1)").run();
    db.prepare("INSERT INTO inscripciones (id_estudiante, id_seccion) VALUES (4, 2)").run();
    db.prepare("INSERT INTO inscripciones (id_estudiante, id_seccion) VALUES (5, 2)").run();
    db.prepare("INSERT INTO inscripciones (id_estudiante, id_seccion) VALUES (1, 3)").run();
    db.prepare("INSERT INTO inscripciones (id_estudiante, id_seccion) VALUES (2, 2)").run();
  });

  try { txn(); res.json({ ok: true, message: 'Datos de demo creados' }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// BULK SYNC — reemplaza toda la colección
app.put('/api/collections/:collection', (req, res) => {
  const { collection } = req.params;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").all(collection);
  if (!tables.length) return res.status(400).json({ error: 'Invalid collection' });
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: 'Expected array' });

  const txn = db.transaction(() => {
    db.prepare(`DELETE FROM ${collection}`).run();
    if (data.length === 0) return;
    const cols = db.prepare(`PRAGMA table_info(${collection})`).all().map(c => c.name);
    const placeholders = cols.map(() => '?').join(', ');
    const insert = db.prepare(`INSERT INTO ${collection} (${cols.join(', ')}) VALUES (${placeholders})`);
    for (const item of data) {
      insert.run(cols.map(c => item[c] !== undefined ? item[c] : null));
    }
  });
  try { txn(); res.json({ ok: true, count: data.length }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

function collectionExists(name) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").all(name);
  return tables.length > 0;
}

app.get('/api/:collection', (req, res) => {
  const { collection } = req.params;
  if (!collectionExists(collection)) return res.json([]);
  const data = db.prepare(`SELECT * FROM ${collection} ORDER BY id`).all();
  res.json(data);
});

app.get('/api/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!collectionExists(collection)) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(Number(id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.post('/api/:collection', (req, res) => {
  const { collection } = req.params;
  if (!collectionExists(collection)) return res.status(400).json({ error: 'Invalid collection' });
  const data = req.body;
  const cols = db.prepare(`PRAGMA table_info(${collection})`).all()
    .filter(c => c.name !== 'id' && c.name !== 'fecha_registro')
    .map(c => c.name);
  const values = cols.map(c => data[c] !== undefined ? data[c] : null);
  const placeholders = cols.map(() => '?').join(', ');

  try {
    const result = db.prepare(`INSERT INTO ${collection} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
    const created = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!collectionExists(collection)) return res.status(404).json({ error: 'Not found' });
  const data = req.body;
  const numId = Number(id);
  const cols = db.prepare(`PRAGMA table_info(${collection})`).all()
    .filter(c => c.name !== 'id' && c.name !== 'fecha_registro')
    .map(c => c.name);
  const sets = cols.filter(c => data[c] !== undefined).map(c => `${c} = ?`);
  const values = cols.filter(c => data[c] !== undefined).map(c => data[c]);
  if (!sets.length) return res.status(400).json({ error: 'No data to update' });

  try {
    db.prepare(`UPDATE ${collection} SET ${sets.join(', ')} WHERE id = ?`).run(...values, numId);
    const updated = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(numId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!collectionExists(collection)) return res.status(404).json({ error: 'Not found' });
  db.prepare(`DELETE FROM ${collection} WHERE id = ?`).run(Number(id));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`SGC Backend corriendo en http://localhost:${PORT}`);
  console.log('Base de datos: SQLite (backend/sgc.db)');
});
