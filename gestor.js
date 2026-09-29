const API_URL = 'http://localhost:3000/api';
const _cache = {};
const INS_KEY = 'sgc_inscripciones_abiertas';
let _inscripcionesAbiertas = localStorage.getItem(INS_KEY) === '1';

function guardarInscripciones() {
  localStorage.setItem(INS_KEY, _inscripcionesAbiertas ? '1' : '0');
}

async function guardarConfiguracionInscripciones() {
  const valor = _inscripcionesAbiertas ? '1' : '0';
  const conf = DB.get('configuracion').find(c => c.clave === INS_KEY);
  if (conf) await DB.upd('configuracion', conf.id, { valor });
  else await DB.add('configuracion', { clave: INS_KEY, valor });
}

function leerConfiguracionInscripciones() {
  const conf = DB.get('configuracion').find(c => c.clave === INS_KEY);
  _inscripcionesAbiertas = conf ? conf.valor === '1' : false;
}

async function apiFetch(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.statusText); }
  return r.json();
}

async function loadCache() {
  const cols = ['materias','docentes','periodos','secciones','estudiantes','calificaciones','usuarios','inscripciones','bitacora','configuracion'];
  for (const c of cols) {
    try { const r = await fetch(`${API_URL}/${c}`); _cache[c] = await r.json(); }
    catch { _cache[c] = []; }
  }
}

const DB = {
  get(c) { return _cache[c] || []; },
  find(c, id) { return (this.get(c) || []).find(i => i.id === id); },
  where(c, fn) { return (this.get(c) || []).filter(fn); },
  nextId(c) { const a = this.get(c); return a.length ? Math.max(...a.map(i => i.id)) + 1 : 1; },

  async add(c, item) {
    const saved = await apiFetch(`${API_URL}/${c}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item)
    });
    if (!_cache[c]) _cache[c] = [];
    _cache[c].push(saved);
    return saved;
  },

  async upd(c, id, data) {
    const updated = await apiFetch(`${API_URL}/${c}/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (_cache[c]) {
      const idx = _cache[c].findIndex(x => x.id === id);
      if (idx !== -1) Object.assign(_cache[c][idx], updated);
    }
    return updated;
  },

  async del(c, id) {
    if (_cache[c]) _cache[c] = _cache[c].filter(i => i.id !== id);
    try { await apiFetch(`${API_URL}/${c}/${id}`, { method: 'DELETE' }); }
    catch { /* si falla, recargamos */ const r = await fetch(`${API_URL}/${c}`); _cache[c] = await r.json(); }
  }
};

async function registrarMateria(nombre, codigo, creditos) {
  if (DB.get('materias').find(m => m.codigo === codigo)) return null;
  return await DB.add('materias', { nombre, codigo, creditos: Number(creditos), estado: 'activo' });
}
function listarMaterias() { return DB.get('materias'); }
async function eliminarMateria(id) { await DB.del('materias', id); }

async function registrarDocente(nombre, cedula, correo, telefono) {
  if (DB.get('docentes').find(d => d.cedula === cedula)) return null;
  return await DB.add('docentes', { nombre, cedula, correo, telefono: telefono || '', estado: 'activo' });
}
function listarDocentes() { return DB.get('docentes'); }
async function eliminarDocente(id) { await DB.del('docentes', id); }

async function registrarPeriodo(nombre, fechaInicio, fechaFin) {
  return await DB.add('periodos', { nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin, estado: 'activo' });
}
function listarPeriodos() { return DB.get('periodos'); }

async function registrarSeccion(materiaId, codigoSeccion, cupo, horario, periodoId, docenteId) {
  return await DB.add('secciones', {
    id_materia: materiaId, codigo_seccion: codigoSeccion,
    cupo: Number(cupo), horario, id_periodo: periodoId,
    id_docente: docenteId, estado: 'activo'
  });
}
function listarSecciones() { return DB.get('secciones'); }
async function eliminarSeccion(id) { await DB.del('secciones', id); }

async function registrarEstudiante(nombre, matricula, seccionId, fechaNacimiento, correo, telefono, carrera) {
  if (DB.get('estudiantes').find(e => e.matricula === matricula)) return null;
  seccionId = seccionId || 0;
  const sec = seccionId ? DB.find('secciones', seccionId) : null;
  if (seccionId && !sec) return null;
  if (seccionId && sec) {
    const inscritos = DB.where('estudiantes', e => e.id_seccion === seccionId).length;
    if (inscritos >= sec.cupo) return { error: 'cupo_lleno' };
  }
  return await DB.add('estudiantes', {
    nombre, matricula, id_seccion: seccionId,
    fecha_nacimiento: fechaNacimiento || '', correo: correo || '',
    telefono: telefono || '', carrera: carrera || '', estado: 'activo'
  });
}
function listarEstudiantes() { return DB.get('estudiantes'); }
async function eliminarEstudiante(id) { await DB.del('estudiantes', id); }

function calcularEstado(nota) { return nota >= 70 ? 'Aprobado' : 'Reprobado'; }

function letraPorNota(nota) {
  if (nota >= 90) return 'A';
  if (nota >= 80) return 'B';
  if (nota >= 70) return 'C';
  if (nota >= 60) return 'D';
  return 'F';
}

function puntosPorNota(nota) {
  if (nota >= 90) return 4;
  if (nota >= 80) return 3;
  if (nota >= 70) return 2;
  if (nota >= 60) return 1;
  return 0;
}

function calcularIndice(items) {
  let puntos = 0, creditos = 0;
  (items || []).forEach(it => {
    const cred = Number(it.creditos) || 0;
    puntos += puntosPorNota(it.nota) * cred;
    creditos += cred;
  });
  if (!creditos) return 0;
  return Math.round((puntos / creditos) * 10) / 10;
}

async function registrarCalificacion(seccionId, estudianteId, nota) {
  nota = Math.round(Number(nota));
  if (nota < 0 || nota > 100) return null;
  if (DB.get('calificaciones').find(c => c.id_seccion === seccionId && c.id_estudiante === estudianteId)) return null;
  const cal = await DB.add('calificaciones', {
    id_seccion: seccionId, id_estudiante: estudianteId,
    nota, estado: calcularEstado(nota)
  });
  await DB.add('bitacora', {
    id_calificacion: cal.id, id_usuario: null,
    accion: 'CREACION', nota_anterior: null, nota_nueva: nota
  });
  return cal;
}

async function modificarCalificacion(calId, nuevaNota) {
  nuevaNota = Math.round(Number(nuevaNota));
  if (nuevaNota < 0 || nuevaNota > 100) return null;
  const cal = DB.find('calificaciones', calId);
  if (!cal) return null;
  const anterior = cal.nota;
  await DB.upd('calificaciones', calId, { nota: nuevaNota, estado: calcularEstado(nuevaNota) });
  await DB.add('bitacora', {
    id_calificacion: calId, id_usuario: null,
    accion: 'MODIFICACION', nota_anterior: anterior, nota_nueva: nuevaNota
  });
  return DB.find('calificaciones', calId);
}

async function eliminarCalificacion(id) { await DB.del('calificaciones', id); }
function listarCalificaciones() { return DB.get('calificaciones'); }

async function inscribirEstudiante(estudianteId, seccionId) {
  if (DB.get('inscripciones').find(i => i.id_estudiante === estudianteId && i.id_seccion === seccionId)) return null;
  const sec = DB.find('secciones', seccionId);
  if (!sec) return null;
  const inscritos = DB.where('inscripciones', i => i.id_seccion === seccionId).length;
  if (inscritos >= sec.cupo) return { error: 'cupo_lleno' };
  return await DB.add('inscripciones', { id_estudiante: estudianteId, id_seccion: seccionId, estado: 'activa' });
}

async function eliminarInscripcion(id) { await DB.del('inscripciones', id); }

function getInscripciones(estudianteId) {
  return DB.where('inscripciones', i => i.id_estudiante === estudianteId);
}

function getSeccionesEstudiante(estudianteId) {
  return DB.where('inscripciones', i => i.id_estudiante === estudianteId).map(i => {
    const sec = DB.find('secciones', i.id_seccion);
    const mat = sec ? DB.find('materias', sec.id_materia) : null;
    const per = sec ? DB.find('periodos', sec.id_periodo) : null;
    const doc = sec ? DB.find('docentes', sec.id_docente) : null;
    return { inscripcion: i, seccion: sec, materia: mat, periodo: per, docente: doc };
  });
}

function getSeccionesDisponibles(periodoId) {
  let secciones = periodoId
    ? DB.where('secciones', s => s.id_periodo === periodoId && s.estado === 'activo')
    : DB.where('secciones', s => s.estado === 'activo');
  return secciones.map(s => {
    const mat = DB.find('materias', s.id_materia);
    const per = DB.find('periodos', s.id_periodo);
    const doc = DB.find('docentes', s.id_docente);
    const inscritos = DB.where('inscripciones', i => i.id_seccion === s.id).length;
    return { seccion: s, materia: mat, periodo: per, docente: doc, inscritos, cupo: s.cupo };
  });
}

function getEstudiantesBySeccion(seccionId) {
  const directos = DB.where('estudiantes', e => e.id_seccion === seccionId && e.estado !== 'inactivo');
  const inscritos = DB.where('inscripciones', i => i.id_seccion === seccionId && i.estado === 'activa')
    .map(i => DB.find('estudiantes', i.id_estudiante))
    .filter(Boolean);
  const seen = new Set(directos.map(e => e.id));
  inscritos.forEach(e => { if (!seen.has(e.id)) { directos.push(e); seen.add(e.id); } });
  return directos;
}

function reporteListaEstudiantes(seccionId) {
  const sec = DB.find('secciones', seccionId);
  if (!sec) return null;
  const estudiantes = getEstudiantesBySeccion(seccionId);
  return {
    asignatura: DB.find('materias', sec.id_materia),
    codigo: sec.codigo_seccion,
    periodo: DB.find('periodos', sec.id_periodo),
    seccion: sec,
    docente: DB.find('docentes', sec.id_docente),
    estudiantes,
    total: estudiantes.length
  };
}

function reporteCalificaciones(seccionId) {
  const sec = DB.find('secciones', seccionId);
  if (!sec) return null;
  const estudiantes = getEstudiantesBySeccion(seccionId);
  const cals = DB.where('calificaciones', c => c.id_seccion === seccionId);
  const promedio = cals.length ? cals.reduce((s, c) => s + c.nota, 0) / cals.length : 0;
  const detalle = estudiantes.map(est => {
    const cal = cals.find(c => c.id_estudiante === est.id);
    return {
      matricula: est.matricula, nombre: est.nombre,
      calificacion: cal ? cal.nota : null,
      letra: cal ? letraPorNota(cal.nota) : null,
      estado: cal ? cal.estado : 'En Proceso'
    };
  });
  return {
    asignatura: DB.find('materias', sec.id_materia),
    codigo: sec.codigo_seccion,
    periodo: DB.find('periodos', sec.id_periodo),
    seccion: sec,
    docente: DB.find('docentes', sec.id_docente),
    detalle,
    promedio: Math.round(promedio * 100) / 100,
    aprobados: cals.filter(c => c.estado === 'Aprobado').length,
    reprobados: cals.filter(c => c.estado === 'Reprobado').length
  };
}

function boletinCalificaciones(estudianteId, periodoId) {
  const est = DB.find('estudiantes', estudianteId);
  if (!est) return null;
  const sec = est.id_seccion ? DB.find('secciones', est.id_seccion) : null;
  const cals = DB.where('calificaciones', c => c.id_estudiante === estudianteId);
  const inscripciones = getSeccionesEstudiante(estudianteId);
  const periodoPorDefecto = periodoId ? DB.find('periodos', periodoId) : null;
  const periodo = periodoPorDefecto || (sec ? DB.find('periodos', sec.id_periodo) : (inscripciones[0]?.periodo || null));
  let calsFiltradas = cals;
  if (periodoId) {
    calsFiltradas = DB.where('calificaciones', c => {
      if (c.id_estudiante !== estudianteId) return false;
      const cs = DB.find('secciones', c.id_seccion);
      return cs && cs.id_periodo === periodoId;
    });
  }

  if (!calsFiltradas.length) return null;

  const detalle = calsFiltradas.map(c => {
    const cs = DB.find('secciones', c.id_seccion);
    const mat = cs ? DB.find('materias', cs.id_materia) : null;
    const creditos = mat ? Number(mat.creditos) || 0 : 0;
    return {
      asignatura: mat ? mat.nombre : 'N/A',
      creditos,
      nota: c.nota,
      letra: letraPorNota(c.nota),
      puntos: puntosPorNota(c.nota),
      estado: c.estado
    };
  });

  const indice = calcularIndice(detalle);
  const creditosCursados = detalle.reduce((s, d) => s + d.creditos, 0);
  const totalPuntos = detalle.reduce((s, d) => s + d.puntos * d.creditos, 0);

  return {
    estudiante: est,
    matricula: est.matricula,
    periodo,
    seccion: sec,
    detalle,
    indice,
    creditos: creditosCursados,
    totalPuntos,
    aprobadas: calsFiltradas.filter(c => c.estado === 'Aprobado').length,
    reprobadas: calsFiltradas.filter(c => c.estado === 'Reprobado').length
  };
}

function historialAcademico(estudianteId) {
  const est = DB.find('estudiantes', estudianteId);
  if (!est) return null;
  const cals = DB.where('calificaciones', c => c.id_estudiante === estudianteId);
  if (!cals.length) return null;
  const detalle = cals.map(c => {
    const sec = DB.find('secciones', c.id_seccion);
    const mat = sec ? DB.find('materias', sec.id_materia) : null;
    const per = sec ? DB.find('periodos', sec.id_periodo) : null;
    const creditos = mat ? Number(mat.creditos) || 0 : 0;
    return {
      periodo: per ? per.nombre : 'N/A',
      asignatura: mat ? mat.nombre : 'N/A',
      creditos,
      nota: c.nota,
      letra: letraPorNota(c.nota),
      puntos: puntosPorNota(c.nota),
      estado: c.estado
    };
  });
  const indice = calcularIndice(detalle);
  return {
    estudiante: est,
    matricula: est.matricula,
    detalle,
    indice,
    creditos: detalle.reduce((s, d) => s + d.creditos, 0),
    totalPuntos: detalle.reduce((s, d) => s + d.puntos * d.creditos, 0)
  };
}

function reporteEstadistico(periodoId) {
  const cals = periodoId
    ? DB.where('calificaciones', c => {
        const sec = DB.find('secciones', c.id_seccion);
        return sec && sec.id_periodo === periodoId;
      })
    : DB.get('calificaciones');

  if (!cals.length) return null;
  const promedio = cals.reduce((s, c) => s + c.nota, 0) / cals.length;
  return {
    promedio_institucional: Math.round(promedio * 100) / 100,
    aprobados: cals.filter(c => c.estado === 'Aprobado').length,
    reprobados: cals.filter(c => c.estado === 'Reprobado').length,
    total: cals.length
  };
}

function reporteGeneralCuatrimestre(periodoId) {
  const secciones = periodoId
    ? DB.where('secciones', s => s.id_periodo === periodoId)
    : DB.get('secciones');
  if (!secciones.length) return null;

  const porMateria = {};
  secciones.forEach(s => {
    const mat = DB.find('materias', s.id_materia);
    if (!mat) return;
    if (!porMateria[mat.id]) porMateria[mat.id] = { materia: mat, secciones: [] };
    porMateria[mat.id].secciones.push(s);
  });

  const detalle = Object.values(porMateria).map(g => {
    const cals = DB.where('calificaciones', c => {
      const sec = DB.find('secciones', c.id_seccion);
      if (!sec) return false;
      if (periodoId && sec.id_periodo !== periodoId) return false;
      return sec.id_materia === g.materia.id;
    });
    const aprobados = cals.filter(c => calcularEstado(c.nota) === 'Aprobado').length;
    const reprobados = cals.filter(c => calcularEstado(c.nota) === 'Reprobado').length;
    return {
      materia: g.materia,
      secciones: g.secciones.length,
      total: cals.length,
      aprobados,
      reprobados,
      promedio: cals.length ? Math.round((cals.reduce((s, c) => s + c.nota, 0) / cals.length) * 100) / 100 : 0
    };
  }).sort((a, b) => a.materia.nombre.localeCompare(b.materia.nombre));

  return {
    periodo: periodoId ? DB.find('periodos', periodoId) : null,
    detalle,
    total: detalle.reduce((s, d) => s + d.total, 0),
    aprobados: detalle.reduce((s, d) => s + d.aprobados, 0),
    reprobados: detalle.reduce((s, d) => s + d.reprobados, 0)
  };
}

async function crearUsuario(nombre, email, password, rol) {
  if (DB.get('usuarios').find(u => u.email === email)) return null;
  return await DB.add('usuarios', { nombre, email, password, rol, estado: 'activo' });
}

async function autenticar(email, password) {
  try {
    return await apiFetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
    });
  } catch { return null; }
}

function getSesion() {
  const s = sessionStorage.getItem('sgc_sesion');
  return s ? JSON.parse(s) : null;
}

function guardarSesion(usuario) {
  sessionStorage.setItem('sgc_sesion', JSON.stringify(usuario));
}

function cerrarSesion() {
  sessionStorage.removeItem('sgc_sesion');
  usuarioActual = null;
  document.getElementById('app-wrapper').style.display = 'none';
  document.getElementById('user-bar').style.display = 'none';
  document.getElementById('header-subtitle').textContent = 'SGC — Académico';
  document.getElementById('header-subtitle').style.display = '';
  renderLogin();
}

async function seedDemoData() {
  try {
    await apiFetch(`${API_URL}/seed`, { method: 'POST' });
    await loadCache();
  } catch (e) {
    toast('Error al conectar con la base de datos: ' + e.message, 'error');
  }
}

function toast(msg, tipo) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (tipo || 'ok');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', 3000);
}

function sel(id) { return document.getElementById(id); }
function val(id) { return sel(id).value.trim(); }
function numVal(id) { return Number(val(id)); }
function clearForm(id) { sel(id).reset(); }

function imprimirReporte(btn) {
  const card = btn.closest('.report-card') || btn.closest('.table-card');
  if (!card) return;
  const prevId = card.getAttribute('id');
  card.setAttribute('id', 'print-area');
  window.print();
  if (prevId) card.setAttribute('id', prevId);
  else card.removeAttribute('id');
}

function optMaterias(selectId) {
  return '<option value="">Seleccionar...</option>' +
    listarMaterias().map(m => `<option value="${m.id}">${m.nombre} (${m.codigo})</option>`).join('');
}
function optDocentes(selectId) {
  return '<option value="">Seleccionar...</option>' +
    listarDocentes().map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
}
function optPeriodos(selectId) {
  return '<option value="">Seleccionar...</option>' +
    listarPeriodos().map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}
function optSecciones(selectId) {
  return '<option value="">Seleccionar...</option>' +
    listarSecciones().map(s => {
      const mat = DB.find('materias', s.id_materia);
      const per = DB.find('periodos', s.id_periodo);
      return `<option value="${s.id}">${s.codigo_seccion} — ${mat ? mat.nombre : 'N/A'} (${per ? per.nombre : ''})</option>`;
    }).join('');
}
function optEstudiantesSeccion(seccionId) {
  const arr = DB.where('estudiantes', e => e.id_seccion === seccionId);
  if (!arr.length) return '<option value="">No hay estudiantes</option>';
  return '<option value="">Seleccionar...</option>' +
    arr.map(e => `<option value="${e.id}">${e.nombre} — ${e.matricula}</option>`).join('');
}
function optTodosEstudiantes() {
  return '<option value="">Seleccionar...</option>' +
    listarEstudiantes().map(e => `<option value="${e.id}">${e.nombre} — ${e.matricula}</option>`).join('');
}

let currentSection = '';
let usuarioActual = null;

const NAV_ADMIN = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'registro-asignatura', label: 'Registro Asignatura' },
  { id: 'registro-seccion', label: 'Registro Sección' },
  { id: 'registro-docente', label: 'Registro Docente' },
  { id: 'registro-estudiante', label: 'Registro Estudiante' },
  { id: 'ingreso-calificaciones', label: 'Ingreso Calificaciones' },
  { id: 'boletin', label: 'Boletín' },
  { id: 'historial', label: 'Historial' },
  { id: 'lista-asignatura', label: 'Lista por Asignatura' },
  { id: 'reporte-asignatura', label: 'Reporte por Asignatura' },
  { id: 'reporte-estadistico', label: 'Reporte Estadístico' },
  { id: 'listado-cuatrimestre', label: 'Listado por Cuatrimestre' }
];

const NAV_DOCENTE = [
  { id: 'inicio-docente', label: 'Mi Panel' },
  { id: 'mis-secciones', label: 'Mis Secciones' },
  { id: 'ingreso-calificaciones', label: 'Ingreso Calificaciones' },
  { id: 'lista-asignatura', label: 'Lista por Asignatura' },
  { id: 'reporte-asignatura', label: 'Reporte por Asignatura' },
  { id: 'boletin-docente', label: 'Consultar Boletín' }
];

const NAV_ESTUDIANTE = [
  { id: 'inicio-estudiante', label: 'Mi Información' },
  { id: 'inscripcion-materias', label: 'Inscripción Materias' },
  { id: 'mis-calificaciones', label: 'Mis Calificaciones' },
  { id: 'boletin-estudiante', label: 'Mi Boletín' },
  { id: 'historial-estudiante', label: 'Mi Historial' }
];

function getNavItems() {
  if (!usuarioActual) return NAV_ADMIN;
  const rol = usuarioActual.rol;
  if (rol === 'Estudiante') return NAV_ESTUDIANTE;
  if (rol === 'Docente') return NAV_DOCENTE;
  return NAV_ADMIN;
}

async function initApp() {
  try {
    await loadCache();
    if (DB.get('materias').length === 0) await seedDemoData();
  } catch (e) {
    console.error('Error al cargar datos', e);
  }
  leerConfiguracionInscripciones();
  const sesion = getSesion();
  if (sesion) {
    mostrarApp(sesion);
  } else {
    renderLogin();
  }
}

function mostrarApp(usuario) {
  usuarioActual = usuario;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-wrapper').style.display = '';
  document.getElementById('user-bar').style.display = 'flex';
  document.getElementById('user-name-display').textContent = usuario.nombre;
  document.getElementById('user-role-display').textContent = usuario.rol;
  document.getElementById('header-subtitle').style.display = 'none';
  renderNav();
  const primerNav = getNavItems()[0];
  navigateTo(primerNav.id);
}

function renderLogin() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('app-wrapper').style.display = 'none';
  document.getElementById('user-bar').style.display = 'none';
  document.getElementById('header-subtitle').style.display = '';
  const el = sel('login-screen');
  el.innerHTML = `
    <div class="login-overlay">
      <div class="login-box">
        <div class="login-title">Sistema Gestor de Calificaciones</div>
        <div class="login-subtitle">Iniciar Sesión</div>
        <form onsubmit="intentarLogin(event)">
          <div class="form-group">
            <label>Correo Electrónico</label>
            <input type="email" id="login-email" required placeholder="xxxxxxxxxx@xxxxx.xxx" autocomplete="username">
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" id="login-pass" required placeholder="••••••••" autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary">Iniciar Sesión</button>
          <div class="login-error" id="login-error"></div>
        </form>
        <div class="login-footer">
          <strong>Credenciales de demo:</strong><br>
          Admin: admin@sgc.edu.do / admin123<br>
          Estudiante: ana.garcia@estudiante.edu.do / est123<br>
          Profesor: cmendez@sgc.edu.do / doc123 (o ltorres@sgc.edu.do / doc123)
        </div>
      </div>
    </div>
  `;
  sel('login-email').focus();
}

async function intentarLogin(e) {
  e.preventDefault();
  const email = val('login-email');
  const pass = val('login-pass');
  const errDiv = sel('login-error');
  const usuario = await autenticar(email, pass);
  if (usuario) {
    errDiv.textContent = '';
    guardarSesion(usuario);
    toast('Bienvenido, ' + usuario.nombre);
    mostrarApp(usuario);
  } else {
    errDiv.textContent = 'Correo electrónico o contraseña incorrectos';
  }
}

function renderNav() {
  const items = getNavItems();
  sel('main-nav').innerHTML = items.map(n =>
    `<button class="nav-btn" data-s="${n.id}" onclick="navigateTo('${n.id}')">${n.label}</button>`
  ).join('');
}

function navigateTo(s) {
  currentSection = s;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.s === s));
  const el = sel('main-content');
  const esDocente = usuarioActual && usuarioActual.rol === 'Docente';
  const fn = {
    'inicio': renderInicio,
    'registro-asignatura': renderRegistroAsignatura,
    'registro-seccion': renderRegistroSeccion,
    'registro-docente': renderRegistroDocente,
    'registro-estudiante': renderRegistroEstudiante,
    'ingreso-calificaciones': esDocente ? renderIngresoCalificacionesDocente : renderIngresoCalificaciones,
    'boletin': renderBoletin,
    'historial': renderHistorial,
    'lista-asignatura': esDocente ? renderListaAsignaturaDocente : renderListaAsignatura,
    'reporte-asignatura': esDocente ? renderReporteAsignaturaDocente : renderReporteAsignatura,
    'reporte-estadistico': renderReporteEstadistico,
    'listado-cuatrimestre': renderListadoCuatrimestre,
    'inicio-estudiante': renderInicioEstudiante,
    'inscripcion-materias': renderInscripcionMaterias,
    'mis-calificaciones': renderMisCalificaciones,
    'boletin-estudiante': renderBoletinEstudiante,
    'historial-estudiante': renderHistorialEstudiante,
    'inicio-docente': renderInicioDocente,
    'mis-secciones': renderMisSecciones,
    'boletin-docente': renderBoletinDocente
  };
  if (fn[s]) fn[s](el);
}

async function resetDemo() {
  await seedDemoData();
  sessionStorage.removeItem('sgc_sesion');
  const admin = DB.get('usuarios').find(u => u.email === 'admin@sgc.edu.do');
  if (admin) { guardarSesion(admin); mostrarApp(admin); }
  toast('Datos de demo recargados');
}

function renderInicio(el) {
  const stats = {
    materias: DB.get('materias').length,
    docentes: DB.get('docentes').length,
    secciones: DB.get('secciones').length,
    estudiantes: DB.get('estudiantes').length,
    calificaciones: DB.get('calificaciones').length
  };
  const toggleLabel = _inscripcionesAbiertas ? 'Desactivar Inscripción' : 'Activar Inscripción';
  const toggleClass = _inscripcionesAbiertas ? 'btn-danger' : 'btn-primary';
  el.innerHTML = `
    <div class="page-header">
      <h2>Panel Principal</h2>
      <p>Sistema Gestor de Calificaciones Académicas</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-n">${stats.materias}</div><div class="stat-l">Asignaturas</div></div>
      <div class="stat-card"><div class="stat-n">${stats.docentes}</div><div class="stat-l">Docentes</div></div>
      <div class="stat-card"><div class="stat-n">${stats.secciones}</div><div class="stat-l">Secciones</div></div>
      <div class="stat-card"><div class="stat-n">${stats.estudiantes}</div><div class="stat-l">Estudiantes</div></div>
      <div class="stat-card"><div class="stat-n">${stats.calificaciones}</div><div class="stat-l">Calificaciones</div></div>
    </div>
    <div class="table-card">
      <h3>Control de Inscripciones</h3>
      <p style="margin:8px 0;color:var(--text3);">Estado actual: <strong>${_inscripcionesAbiertas ? 'Inscripciones ABIERTAS' : 'Inscripciones CERRADAS'}</strong></p>
      <div class="form-actions">
        <button class="btn ${toggleClass}" onclick="toggleInscripciones()">${toggleLabel}</button>
      </div>
    </div>
    <div class="center-actions">
      <button class="btn btn-secondary" onclick="resetDemo()">Recargar Datos de Demo</button>
    </div>
  `;
}

async function toggleInscripciones() {
  _inscripcionesAbiertas = !_inscripcionesAbiertas;
  guardarInscripciones();
  try {
    await guardarConfiguracionInscripciones();
  } catch (e) {
    toast('No se pudo guardar en el servidor', 'error');
  }
  toast(_inscripcionesAbiertas ? 'Inscripciones abiertas para estudiantes' : 'Inscripciones cerradas');
  navigateTo('inicio');
}

function renderRegistroAsignatura(el) {
  const mat = listarMaterias();
  el.innerHTML = `
    <div class="page-header"><h2>Registro de Asignatura</h2></div>
    <div class="form-card">
      <form onsubmit="submitMateria(event)">
        <div class="form-row">
          <div class="form-group"><label>Nombre de la Asignatura</label><input type="text" id="mat-nom" required placeholder="Nombre completo"></div>
          <div class="form-group"><label>Código de Asignatura</label><input type="text" id="mat-cod" required placeholder="XXX-9999"></div>
          <div class="form-group"><label>Créditos</label><input type="number" id="mat-cred" required min="1" max="10" placeholder="99"></div>
        </div>
        <div class="form-note">Nota: registre la asignatura como catálogo. La sección con docente y período se crea en "Registro Sección".</div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Registrar Asignatura</button>
          <button type="button" class="btn btn-secondary" onclick="clearForm('form-materia')">Cancelar</button>
        </div>
      </form>
    </div>
    <div class="table-card">
      <h3>Asignaturas Registradas (${mat.length})</h3>
      ${mat.length ? `<table>
        <thead><tr><th>Nombre</th><th>Código</th><th>Créditos</th><th>Acciones</th></tr></thead>
        <tbody>${mat.map(m => `<tr><td>${m.nombre}</td><td>${m.codigo}</td><td>${m.creditos}</td>
          <td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){eliminarMateria(${m.id});toast('Eliminada');navigateTo('registro-asignatura')}">Eliminar</button></td></tr>`).join('')}</tbody>
      </table>` : '<p class="empty">No hay asignaturas registradas.</p>'}
    </div>
  `;
}

async function submitMateria(e) {
  e.preventDefault();
  if (await registrarMateria(val('mat-nom'), val('mat-cod'), numVal('mat-cred'))) {
    toast('Asignatura registrada correctamente');
    navigateTo('registro-asignatura');
  } else {
    toast('Ya existe una asignatura con ese código', 'error');
  }
}

function renderRegistroSeccion(el) {
  const secs = listarSecciones();
  el.innerHTML = `
    <div class="page-header"><h2>Registro de Sección</h2></div>
    <div class="form-card">
      <form onsubmit="submitSeccion(event)">
        <div class="form-row">
          <div class="form-group"><label>Asignatura</label><select id="sec-mat" required>${optMaterias()}</select></div>
          <div class="form-group"><label>Código de Sección</label><input type="text" id="sec-cod" required placeholder="ej. S1"></div>
          <div class="form-group"><label>Cupo</label><input type="number" id="sec-cupo" required min="1" max="100" placeholder="ej. 30"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Horario</label><input type="text" id="sec-hor" required placeholder="ej. Lunes 8:00-10:00"></div>
          <div class="form-group"><label>Período Académico</label><select id="sec-per" required>${optPeriodos()}</select></div>
          <div class="form-group"><label>Docente Responsable</label><select id="sec-doc" required>${optDocentes()}</select></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Registrar Sección</button>
          <button type="button" class="btn btn-secondary" onclick="clearForm('form-sec')">Cancelar</button>
        </div>
      </form>
    </div>
    <div class="table-card">
      <h3>Secciones Registradas (${secs.length})</h3>
      ${secs.length ? `<table>
        <thead><tr><th>Código</th><th>Asignatura</th><th>Docente</th><th>Período</th><th>Cupo</th><th>Horario</th><th>Acciones</th></tr></thead>
        <tbody>${secs.map(s => {
          const m = DB.find('materias', s.id_materia);
          const d = DB.find('docentes', s.id_docente);
          const p = DB.find('periodos', s.id_periodo);
          return `<tr><td>${s.codigo_seccion}</td><td>${m ? m.nombre : ''}</td><td>${d ? d.nombre : ''}</td>
            <td>${p ? p.nombre : ''}</td><td>${s.cupo}</td><td>${s.horario}</td>
            <td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){eliminarSeccion(${s.id});toast('Eliminada');navigateTo('registro-seccion')}">Eliminar</button></td></tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="empty">No hay secciones registradas.</p>'}
    </div>
  `;
}

async function submitSeccion(e) {
  e.preventDefault();
  await registrarSeccion(numVal('sec-mat'), val('sec-cod'), numVal('sec-cupo'), val('sec-hor'), numVal('sec-per'), numVal('sec-doc'));
  toast('Sección registrada correctamente');
  navigateTo('registro-seccion');
}

function renderRegistroDocente(el) {
  const docs = listarDocentes();
  el.innerHTML = `
    <div class="page-header"><h2>Registro de Docente</h2></div>
    <div class="form-card">
      <form onsubmit="submitDocente(event)">
        <div class="form-row">
          <div class="form-group"><label>Nombre Completo</label><input type="text" id="doc-nom" required placeholder="Nombre completo del docente"></div>
          <div class="form-group"><label>Cédula / ID</label><input type="text" id="doc-ced" required placeholder="999-9999999-9"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Teléfono</label><input type="text" id="doc-tel" placeholder="(xxx) xxx-xxxx"></div>
          <div class="form-group"><label>Correo Electrónico Institucional</label><input type="email" id="doc-cor" required placeholder="xxxxxxxxxx@xxxxx.xxx"></div>
        </div>
        <div class="form-note">Nota: el docente se asigna a una sección específica en "Registro Sección".</div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Registrar Docente</button>
          <button type="button" class="btn btn-secondary" onclick="clearForm('form-doc')">Cancelar</button>
        </div>
      </form>
    </div>
    <div class="table-card">
      <h3>Docentes Registrados (${docs.length})</h3>
      ${docs.length ? `<table>
        <thead><tr><th>Nombre</th><th>Cédula</th><th>Correo</th><th>Teléfono</th><th>Acciones</th></tr></thead>
        <tbody>${docs.map(d => `<tr><td>${d.nombre}</td><td>${d.cedula}</td><td>${d.correo}</td><td>${d.telefono || ''}</td>
          <td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){eliminarDocente(${d.id});toast('Eliminado');navigateTo('registro-docente')}">Eliminar</button></td></tr>`).join('')}</tbody>
      </table>` : '<p class="empty">No hay docentes registrados.</p>'}
    </div>
  `;
}

async function submitDocente(e) {
  e.preventDefault();
  if (await registrarDocente(val('doc-nom'), val('doc-ced'), val('doc-cor'), val('doc-tel'))) {
    toast('Docente registrado correctamente');
    navigateTo('registro-docente');
  } else {
    toast('Ya existe un docente con esa cédula', 'error');
  }
}

function renderRegistroEstudiante(el) {
  const ests = listarEstudiantes();
  el.innerHTML = `
    <div class="page-header"><h2>Registro de Estudiante</h2></div>
    <div class="form-card">
      <form onsubmit="submitEstudiante(event)">
        <div class="form-row">
          <div class="form-group"><label>Nombre Completo</label><input type="text" id="est-nom" required placeholder="Nombre completo del estudiante"></div>
          <div class="form-group"><label>Matrícula</label><input type="text" id="est-mat" required placeholder="99-9999"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Fecha de Nacimiento</label><input type="date" id="est-fecha"></div>
          <div class="form-group"><label>Correo Electrónico</label><input type="email" id="est-cor" placeholder="xxxxxxxxxx@xxxxx.xxx"></div>
          <div class="form-group"><label>Teléfono</label><input type="text" id="est-tel" placeholder="(xxx) xxx-xxxx"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Carrera Universitaria</label><input type="text" id="est-car" placeholder="Carrera universitaria"></div>
        </div>
        <div class="form-note">Nota: la matrícula es única por estudiante.</div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Registrar Estudiante</button>
          <button type="button" class="btn btn-secondary" onclick="clearForm('form-est')">Cancelar</button>
        </div>
      </form>
    </div>
    <div class="table-card">
      <h3>Estudiantes Registrados (${ests.length})</h3>
      ${ests.length ? `<table>
        <thead><tr><th>Matrícula</th><th>Nombre</th><th>Sección</th><th>Carrera</th><th>Acciones</th></tr></thead>
        <tbody>${ests.map(e => {
          const sec = DB.find('secciones', e.id_seccion);
          const mat = sec ? DB.find('materias', sec.id_materia) : null;
          return `<tr><td>${e.matricula}</td><td>${e.nombre}</td>
            <td>${sec ? sec.codigo_seccion + ' — ' + (mat ? mat.nombre : '') : 'N/A'}</td>
            <td>${e.carrera || ''}</td>
            <td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){eliminarEstudiante(${e.id});toast('Eliminado');navigateTo('registro-estudiante')}">Eliminar</button></td></tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="empty">No hay estudiantes registrados.</p>'}
    </div>
  `;
}

async function submitEstudiante(e) {
  e.preventDefault();
  const r = await registrarEstudiante(val('est-nom'), val('est-mat'), 0, val('est-fecha'), val('est-cor'), val('est-tel'), val('est-car'));
  if (r) { toast('Estudiante registrado correctamente'); navigateTo('registro-estudiante'); }
  else toast('Ya existe un estudiante con esa matrícula', 'error');
}

function renderIngresoCalificaciones(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Ingreso de Calificaciones</h2></div>
    <div class="form-card">
      <form id="form-cal-top" onsubmit="return false;">
        <div class="form-row">
          <div class="form-group"><label>Asignatura</label><select id="cal-asig" onchange="actualizarSeccionesCal()">${optMaterias()}</select></div>
          <div class="form-group"><label>Período Académico</label><select id="cal-per" onchange="actualizarSeccionesCal()">${optPeriodos()}</select></div>
          <div class="form-group"><label>Sección</label><select id="cal-sec" onchange="cargarTablaCal()"><option value="">Primero seleccione asignatura y período</option></select></div>
        </div>
      </form>
    </div>
    <div id="cal-table-container"></div>
  `;
}

function actualizarSeccionesCal() {
  const matId = numVal('cal-asig');
  const perId = numVal('cal-per');
  const selSec = sel('cal-sec');
  if (!matId || !perId) { selSec.innerHTML = '<option value="">Primero seleccione asignatura y período</option>'; return; }
  const secs = DB.where('secciones', s => s.id_materia === matId && s.id_periodo === perId);
  selSec.innerHTML = secs.length
    ? '<option value="">Seleccionar sección...</option>' + secs.map(s => `<option value="${s.id}">${s.codigo_seccion}</option>`).join('')
    : '<option value="">No hay secciones para esta asignatura/período</option>';
  sel('cal-table-container').innerHTML = '';
}

function cargarTablaCal() {
  const secId = numVal('cal-sec');
  const div = sel('cal-table-container');
  if (!secId) { div.innerHTML = ''; return; }
  const sec = DB.find('secciones', secId);
  const mat = sec ? DB.find('materias', sec.id_materia) : null;
  const per = sec ? DB.find('periodos', sec.id_periodo) : null;
  const ests = getEstudiantesBySeccion(secId);
  const cals = DB.where('calificaciones', c => c.id_seccion === secId);
  const promedio = cals.length ? (cals.reduce((s, c) => s + c.nota, 0) / cals.length).toFixed(1) : '0.0';
  const aprob = cals.filter(c => c.estado === 'Aprobado').length;
  const reprob = cals.filter(c => c.estado === 'Reprobado').length;

  div.innerHTML = `
    <div class="table-card">
      <table class="cal-table">
        <thead><tr><th>#</th><th>Matrícula</th><th>Nombre del Estudiante</th><th>Calificación</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${ests.map((e, i) => {
          const cal = cals.find(c => c.id_estudiante === e.id);
          const notaVal = cal ? cal.nota : '';
          const estado = cal ? cal.estado : '';
          const letra = cal ? letraPorNota(cal.nota) : '';
          return `<tr>
            <td>${i + 1}</td><td>${e.matricula}</td><td>${e.nombre}</td>
            <td><input type="number" min="0" max="100" step="0.5" class="cal-input ${cal ? (cal.estado === 'Aprobado' ? 'cal-aprob' : 'cal-reprob') : ''}"
              id="nota-${e.id}" value="${notaVal}" data-est="${e.id}" data-sec="${secId}" placeholder="--"></td>
            <td class="center"><strong>${letra}</strong></td>
            <td><span class="${cal ? (cal.estado === 'Aprobado' ? 'badge-ok' : 'badge-fail') : ''}">${estado}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div class="cal-summary">
        Promedio de la Asignatura: <strong>${promedio}</strong> &nbsp;|&nbsp;
        Aprobados: <strong>${aprob}</strong> &nbsp;|&nbsp;
        Reprobados: <strong>${reprob}</strong>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="guardarCalificaciones()">Guardar Calificaciones</button>
        <button class="btn btn-secondary" onclick="navigateTo('ingreso-calificaciones')">Cancelar</button>
      </div>
    </div>
  `;
}

async function guardarCalificaciones() {
  const inputs = document.querySelectorAll('.cal-input');
  let guardadas = 0, errores = 0;
  for (const inp of inputs) {
    const nota = inp.value;
    if (nota === '') continue;
    const n = Number(nota);
    if (n < 0 || n > 100) { inp.style.borderColor = 'red'; errores++; continue; }
    const estId = Number(inp.dataset.est);
    const secId = Number(inp.dataset.sec);
    if (usuarioActual && usuarioActual.rol === 'Docente' && !docenteAccedeSeccion(secId)) continue;
    const existente = DB.get('calificaciones').find(c => c.id_seccion === secId && c.id_estudiante === estId);
    if (existente) {
      await modificarCalificacion(existente.id, n);
      guardadas++;
    } else {
      await registrarCalificacion(secId, estId, n);
      guardadas++;
    }
  }
  if (errores) toast(`${errores} calificación(es) fuera de rango (0-100)`, 'error');
  if (guardadas) toast(`${guardadas} calificación(es) guardada(s)`);
  cargarTablaCal();
}

function renderBoletin(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Solicitar Boletín de Calificaciones</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Estudiante</label><select id="bol-est" onchange="mostrarInfoEst()">${optTodosEstudiantes()}</select></div>
        <div class="form-group"><label>Período Académico</label><select id="bol-per">${optPeriodos()}</select></div>
      </div>
      <div id="bol-info-est"></div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="generarBoletin()">Boletín PDF</button>
      </div>
    </div>
    <div id="bol-resultado"></div>
  `;
}

function mostrarInfoEst() {
  const est = DB.find('estudiantes', numVal('bol-est'));
  const div = sel('bol-info-est');
  if (!est) { div.innerHTML = ''; return; }
  div.innerHTML = `<p class="info-line">Estudiante: <strong>${est.nombre}</strong> &nbsp;·&nbsp; Matrícula: <strong>${est.matricula}</strong></p>`;
}

function generarBoletin() {
  const estId = numVal('bol-est');
  const perId = numVal('bol-per');
  const div = sel('bol-resultado');
  if (!estId) { div.innerHTML = '<p class="error">Seleccione un estudiante</p>'; return; }
  if (usuarioActual && usuarioActual.rol === 'Docente' && !estudianteEnSeccionesDocente(estId)) {
    div.innerHTML = '<p class="error">No tienes permiso para consultar este estudiante</p>'; return;
  }
  const b = boletinCalificaciones(estId, perId || undefined);
  if (!b) { div.innerHTML = '<p class="error">No hay calificaciones para este estudiante en el período seleccionado</p>'; return; }

  div.innerHTML = `
    <div class="report-card boletin-card">
      <div class="report-title">INSTITUCIÓN EDUCATIVA XXXXXXXX</div>
      <div class="report-subtitle">BOLETÍN DE CALIFICACIONES</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Período Académico:</span><span>${b.periodo ? b.periodo.nombre : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Sección:</span><span>${b.seccion ? b.seccion.codigo_seccion : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Estudiante:</span><span>${b.estudiante.nombre}</span></div>
        <div class="meta-row"><span class="meta-label">Matrícula:</span><span>${b.matricula}</span></div>
      </div>
      <table class="report-table">
        <thead><tr><th>Asignatura</th><th>Créditos</th><th>Nota Final</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${b.detalle.map(d => `<tr><td>${d.asignatura}</td><td class="center">${d.creditos}</td><td class="center">${d.nota}</td>
          <td class="center"><strong>${d.letra}</strong></td>
          <td class="center"><span class="${d.estado === 'Aprobado' ? 'badge-ok' : 'badge-fail'}">${d.estado}</span></td></tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Índice Académico del Período: <strong>${b.indice.toFixed(1)}</strong></p>
        <p>Créditos Cursados: <strong>${b.creditos}</strong> &nbsp;·&nbsp; Puntos Obtenidos: <strong>${b.totalPuntos}</strong></p>
        <p>Asignaturas Aprobadas: <strong>${b.aprobadas}</strong></p>
        <p>Asignaturas Reprobadas: <strong>${b.reprobadas}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
}

function renderHistorial(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Consultar Historial Académico</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Estudiante</label><select id="hist-est">${optTodosEstudiantes()}</select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="verHistorial()">Consultar Historial</button>
      </div>
    </div>
    <div id="hist-resultado"></div>
  `;
}

function verHistorial() {
  const estId = numVal('hist-est');
  const div = sel('hist-resultado');
  if (!estId) { div.innerHTML = '<p class="error">Seleccione un estudiante</p>'; return; }
  if (usuarioActual && usuarioActual.rol === 'Docente' && !estudianteEnSeccionesDocente(estId)) {
    div.innerHTML = '<p class="error">No tienes permiso para consultar este estudiante</p>'; return;
  }
  const h = historialAcademico(estId);
  if (!h) { div.innerHTML = '<p class="error">No hay calificaciones registradas para este estudiante</p>'; return; }

  div.innerHTML = `
    <div class="report-card">
      <div class="report-title">HISTORIAL ACADÉMICO</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Estudiante:</span><span>${h.estudiante.nombre}</span></div>
        <div class="meta-row"><span class="meta-label">Matrícula:</span><span>${h.matricula}</span></div>
      </div>
      <table class="report-table">
        <thead><tr><th>Período</th><th>Asignatura</th><th>Créditos</th><th>Nota</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${h.detalle.map(d => `<tr><td>${d.periodo}</td><td>${d.asignatura}</td><td class="center">${d.creditos}</td><td class="center">${d.nota}</td>
          <td class="center"><strong>${d.letra}</strong></td>
          <td class="center"><span class="${d.estado === 'Aprobado' ? 'badge-ok' : 'badge-fail'}">${d.estado}</span></td></tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Índice Académico Acumulado: <strong>${h.indice.toFixed(1)}</strong></p>
        <p>Créditos Acumulados: <strong>${h.creditos}</strong> &nbsp;·&nbsp; Puntos Obtenidos: <strong>${h.totalPuntos}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
}

function renderListaAsignatura(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Lista de Estudiantes por Asignatura</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Asignatura</label><select id="lis-asig" onchange="actualizarSeccionesLista()">${optMaterias()}</select></div>
        <div class="form-group"><label>Período</label><select id="lis-per" onchange="actualizarSeccionesLista()">${optPeriodos()}</select></div>
        <div class="form-group"><label>Sección</label><select id="lis-sec"><option value="">Seleccionar...</option></select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="consultarLista()">Consultar Lista</button>
      </div>
    </div>
    <div id="lis-resultado"></div>
  `;
}

function actualizarSeccionesLista() {
  const matId = numVal('lis-asig');
  const perId = numVal('lis-per');
  const s = sel('lis-sec');
  if (!matId || !perId) { s.innerHTML = '<option value="">Seleccionar...</option>'; return; }
  const secs = DB.where('secciones', x => x.id_materia === matId && x.id_periodo === perId);
  s.innerHTML = secs.length
    ? '<option value="">Seleccionar...</option>' + secs.map(x => `<option value="${x.id}">${x.codigo_seccion}</option>`).join('')
    : '<option value="">No hay secciones</option>';
}

function consultarLista() {
  const secId = numVal('lis-sec');
  const div = sel('lis-resultado');
  if (!secId) { div.innerHTML = '<p class="error">Seleccione una sección</p>'; return; }
  if (usuarioActual && usuarioActual.rol === 'Docente' && !docenteAccedeSeccion(secId)) {
    div.innerHTML = '<p class="error">No tienes permiso para ver esta sección</p>'; return;
  }
  const r = reporteListaEstudiantes(secId);
  if (!r) { div.innerHTML = '<p class="error">Sección no encontrada</p>'; return; }

  div.innerHTML = `
    <div class="report-card">
      <div class="report-title">LISTA DE ESTUDIANTES POR ASIGNATURA</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Asignatura:</span><span>${r.asignatura ? r.asignatura.nombre : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Código:</span><span>${r.asignatura ? r.asignatura.codigo : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Período:</span><span>${r.periodo ? r.periodo.nombre : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Sección:</span><span>${r.codigo}</span></div>
        <div class="meta-row"><span class="meta-label">Docente:</span><span>${r.docente ? r.docente.nombre : 'N/A'}</span></div>
      </div>
      <table class="report-table">
        <thead><tr><th>#</th><th>Matrícula</th><th>Nombre del Estudiante</th><th>Sección</th></tr></thead>
        <tbody>${r.estudiantes.map((e, i) => `<tr><td class="center">${i + 1}</td><td>${e.matricula}</td><td>${e.nombre}</td><td>${r.codigo}</td></tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Total de Estudiantes Matriculados: <strong>${r.total}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
}

function renderReporteAsignatura(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Reporte de Calificaciones por Asignatura</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Asignatura</label><select id="rap-asig" onchange="actualizarSeccionesRep()">${optMaterias()}</select></div>
        <div class="form-group"><label>Período</label><select id="rap-per" onchange="actualizarSeccionesRep()">${optPeriodos()}</select></div>
        <div class="form-group"><label>Sección</label><select id="rap-sec"><option value="">Seleccionar...</option></select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="generarReporteAsig()">Generar Reporte</button>
      </div>
    </div>
    <div id="rap-resultado"></div>
  `;
}

function actualizarSeccionesRep() {
  const matId = numVal('rap-asig');
  const perId = numVal('rap-per');
  const s = sel('rap-sec');
  if (!matId || !perId) { s.innerHTML = '<option value="">Seleccionar...</option>'; return; }
  const secs = DB.where('secciones', x => x.id_materia === matId && x.id_periodo === perId);
  s.innerHTML = secs.length
    ? '<option value="">Seleccionar...</option>' + secs.map(x => `<option value="${x.id}">${x.codigo_seccion}</option>`).join('')
    : '<option value="">No hay secciones</option>';
}

function generarReporteAsig() {
  const secId = numVal('rap-sec');
  const div = sel('rap-resultado');
  if (!secId) { div.innerHTML = '<p class="error">Seleccione una sección</p>'; return; }
  if (usuarioActual && usuarioActual.rol === 'Docente' && !docenteAccedeSeccion(secId)) {
    div.innerHTML = '<p class="error">No tienes permiso para ver esta sección</p>'; return;
  }
  const r = reporteCalificaciones(secId);
  if (!r) { div.innerHTML = '<p class="error">Sección no encontrada</p>'; return; }

  div.innerHTML = `
    <div class="report-card">
      <div class="report-title">REPORTE DE CALIFICACIONES POR ASIGNATURA</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Asignatura:</span><span>${r.asignatura ? r.asignatura.nombre : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Código:</span><span>${r.asignatura ? r.asignatura.codigo : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Período:</span><span>${r.periodo ? r.periodo.nombre : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Sección:</span><span>${r.codigo}</span></div>
        <div class="meta-row"><span class="meta-label">Docente:</span><span>${r.docente ? r.docente.nombre : 'N/A'}</span></div>
      </div>
      <table class="report-table">
        <thead><tr><th>#</th><th>Matrícula</th><th>Nombre del Estudiante</th><th>Calificación</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${r.detalle.map((d, i) => `<tr><td class="center">${i + 1}</td><td>${d.matricula}</td><td>${d.nombre}</td>
          <td class="center">${d.calificacion !== null ? d.calificacion : '—'}</td>
          <td class="center"><strong>${d.letra !== null ? d.letra : '—'}</strong></td>
          <td class="center"><span class="${d.estado === 'Aprobado' ? 'badge-ok' : d.estado === 'Reprobado' ? 'badge-fail' : 'badge-proc'}">${d.estado}</span></td></tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Promedio de la Asignatura: <strong>${r.promedio}</strong></p>
        <p>Estudiantes Aprobados: <strong>${r.aprobados}</strong></p>
        <p>Estudiantes Reprobados: <strong>${r.reprobados}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
}

function renderReporteEstadistico(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Generar Reporte Estadístico Institucional</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Período Académico</label><select id="est-per">${optPeriodos()}</select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="generarEstadistico()">Generar Reporte</button>
      </div>
    </div>
    <div id="est-resultado"></div>
  `;
}

function generarEstadistico() {
  const perId = numVal('est-per');
  const div = sel('est-resultado');
  const r = reporteEstadistico(perId || undefined);
  if (!r) { div.innerHTML = '<p class="error">No hay calificaciones registradas</p>'; return; }

  div.innerHTML = `
    <div class="report-card">
      <div class="report-title">REPORTE ESTADÍSTICO INSTITUCIONAL</div>
      <table class="report-table">
        <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td>Promedio Institucional</td><td class="center">${r.promedio_institucional}</td></tr>
          <tr><td>Estudiantes Aprobados</td><td class="center">${r.aprobados}</td></tr>
          <tr><td>Estudiantes Reprobados</td><td class="center">${r.reprobados}</td></tr>
        </tbody>
      </table>
      <div class="report-footer">
        <p>Total de Estudiantes Evaluados: <strong>${r.total}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
}

function renderListadoCuatrimestre(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Listado de Asignaturas por Cuatrimestre</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Período Académico</label><select id="lcu-per">
          <option value="">Todos los períodos</option>
          ${listarPeriodos().map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
        </select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="generarListadoCuatrimestre()">Generar Listado</button>
      </div>
    </div>
    <div id="lcu-resultado"></div>
  `;
}

function generarListadoCuatrimestre() {
  const perId = numVal('lcu-per');
  const div = sel('lcu-resultado');
  const r = reporteGeneralCuatrimestre(perId || undefined);
  if (!r || !r.detalle.length) { div.innerHTML = '<p class="error">No hay asignaturas con calificaciones en este período</p>'; return; }

  div.innerHTML = `
    <div class="report-card">
      <div class="report-title">LISTADO GENERAL DE ASIGNATURAS POR CUATRIMESTRE</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Período:</span><span>${r.periodo ? r.periodo.nombre : 'Todos los períodos'}</span></div>
      </div>
      <p class="info-line">Haga clic en el nombre de la asignatura para ver sus estudiantes.</p>
      <table class="report-table">
        <thead><tr><th>#</th><th>Asignatura</th><th>Código</th><th>Secciones</th><th>Total Estudiantes</th><th>Aprobados</th><th>Reprobados</th><th>Promedio</th></tr></thead>
        <tbody>${r.detalle.map((d, i) => `<tr>
          <td class="center">${i + 1}</td>
          <td><button class="btn-link" onclick="mostrarEstudiantesMateria(${d.materia.id}, ${perId})">${d.materia.nombre}</button></td>
          <td>${d.materia.codigo}</td>
          <td class="center">${d.secciones}</td>
          <td class="center">${d.total}</td>
          <td class="center"><span class="badge-ok">${d.aprobados}</span></td>
          <td class="center"><span class="badge-fail">${d.reprobados}</span></td>
          <td class="center">${d.promedio}</td>
        </tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Asignaturas: <strong>${r.detalle.length}</strong> &nbsp;|&nbsp;
        Estudiantes Evaluados: <strong>${r.total}</strong> &nbsp;|&nbsp;
        Aprobados: <strong>${r.aprobados}</strong> &nbsp;|&nbsp;
        Reprobados: <strong>${r.reprobados}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
    <div id="lcu-detalle"></div>
  `;
}

function mostrarEstudiantesMateria(matId, perId) {
  const mat = DB.find('materias', matId);
  const div = sel('lcu-detalle');
  if (!mat || !div) return;

  const cals = DB.where('calificaciones', c => {
    const sec = DB.find('secciones', c.id_seccion);
    if (!sec) return false;
    if (sec.id_materia !== matId) return false;
    if (perId && sec.id_periodo !== perId) return false;
    return true;
  });

  const rows = cals.map(c => {
    const est = DB.find('estudiantes', c.id_estudiante);
    const sec = DB.find('secciones', c.id_seccion);
    const nota = Number(c.nota);
    return {
      matricula: est ? est.matricula : '—',
      nombre: est ? est.nombre : 'Eliminado',
      seccion: sec ? sec.codigo_seccion : '—',
      nota: c.nota,
      letra: letraPorNota(nota),
      estado: calcularEstado(nota)
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const aprob = rows.filter(r => r.estado === 'Aprobado').length;
  const reprob = rows.filter(r => r.estado === 'Reprobado').length;

  div.innerHTML = `
    <div class="report-card">
      <div class="report-title">ESTUDIANTES DE ${mat.nombre.toUpperCase()}</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Código:</span><span>${mat.codigo}</span></div>
        <div class="meta-row"><span class="meta-label">Créditos:</span><span>${mat.creditos}</span></div>
      </div>
      ${rows.length ? `<table class="report-table">
        <thead><tr><th>Matrícula</th><th>Nombre del Estudiante</th><th>Sección</th><th>Nota</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${r.matricula}</td><td>${r.nombre}</td><td class="center">${r.seccion}</td>
          <td class="center">${r.nota}</td><td class="center"><strong>${r.letra}</strong></td>
          <td class="center"><span class="${r.estado === 'Aprobado' ? 'badge-ok' : 'badge-fail'}">${r.estado}</span></td>
        </tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Total Estudiantes: <strong>${rows.length}</strong> &nbsp;|&nbsp;
        Aprobados: <strong>${aprob}</strong> &nbsp;|&nbsp;
        Reprobados: <strong>${reprob}</strong></p>
      </div>` : '<p class="empty">No hay estudiantes con calificaciones en esta asignatura.</p>'}
      <div class="form-actions no-print">
        <button class="btn btn-secondary" onclick="cerrarDetalleCuatrimestre()">Cerrar</button>
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
  div.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cerrarDetalleCuatrimestre() {
  const div = sel('lcu-detalle');
  if (div) div.innerHTML = '';
}

function getDocenteActual() {
  if (!usuarioActual || usuarioActual.rol !== 'Docente') return null;
  return DB.get('docentes').find(d => d.correo === usuarioActual.email) || null;
}

function getSeccionesDocente() {
  const doc = getDocenteActual();
  if (!doc) return [];
  return DB.where('secciones', s => s.id_docente === doc.id && s.estado !== 'inactivo');
}

function docenteAccedeSeccion(secId) {
  const doc = getDocenteActual();
  if (!doc) return false;
  const sec = DB.find('secciones', secId);
  return sec && sec.id_docente === doc.id;
}

function getEstudiantesDocente() {
  const ids = new Set();
  const result = [];
  getSeccionesDocente().forEach(s => {
    getEstudiantesBySeccion(s.id).forEach(e => {
      if (!ids.has(e.id)) { ids.add(e.id); result.push(e); }
    });
  });
  return result;
}

function estudianteEnSeccionesDocente(estId) {
  return getSeccionesDocente().some(s => getEstudiantesBySeccion(s.id).some(e => e.id === estId));
}

function optSeccionesDocente() {
  const secs = getSeccionesDocente();
  if (!secs.length) return '<option value="">No tienes secciones asignadas</option>';
  return '<option value="">Seleccionar...</option>' + secs.map(s => {
    const mat = DB.find('materias', s.id_materia);
    const per = DB.find('periodos', s.id_periodo);
    return `<option value="${s.id}">${s.codigo_seccion} — ${mat ? mat.nombre : 'N/A'} (${per ? per.nombre : ''})</option>`;
  }).join('');
}

function optEstudiantesDocente() {
  const ests = getEstudiantesDocente();
  if (!ests.length) return '<option value="">No hay estudiantes en tus secciones</option>';
  return '<option value="">Seleccionar...</option>' + ests.map(e => `<option value="${e.id}">${e.nombre} — ${e.matricula}</option>`).join('');
}

function renderInicioDocente(el) {
  const doc = getDocenteActual();
  if (!doc) { el.innerHTML = '<p class="error">No se encontró tu perfil de docente. Contacta al administrador.</p>'; return; }
  const secs = getSeccionesDocente();
  const matIds = new Set(secs.map(s => s.id_materia));
  const estudiantes = getEstudiantesDocente();
  const calIds = new Set();
  secs.forEach(s => DB.where('calificaciones', c => c.id_seccion === s.id).forEach(c => calIds.add(c.id)));

  el.innerHTML = `
    <div class="page-header"><h2>Panel del Profesor</h2><p>Bienvenido(a), ${doc.nombre}</p></div>
    <div class="report-card">
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Nombre:</span><span>${doc.nombre}</span></div>
        <div class="meta-row"><span class="meta-label">Cédula / ID:</span><span>${doc.cedula}</span></div>
        <div class="meta-row"><span class="meta-label">Correo:</span><span>${doc.correo}</span></div>
        <div class="meta-row"><span class="meta-label">Teléfono:</span><span>${doc.telefono || 'N/A'}</span></div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-n">${matIds.size}</div><div class="stat-l">Asignaturas</div></div>
      <div class="stat-card"><div class="stat-n">${secs.length}</div><div class="stat-l">Secciones</div></div>
      <div class="stat-card"><div class="stat-n">${estudiantes.length}</div><div class="stat-l">Estudiantes</div></div>
      <div class="stat-card"><div class="stat-n">${calIds.size}</div><div class="stat-l">Calificaciones</div></div>
    </div>
    <div class="table-card">
      <h3>Mis Secciones</h3>
      ${secs.length ? `<table>
        <thead><tr><th>Asignatura</th><th>Código</th><th>Período</th><th>Horario</th><th>Cupo</th><th>Inscritos</th></tr></thead>
        <tbody>${secs.map(s => {
          const m = DB.find('materias', s.id_materia);
          const p = DB.find('periodos', s.id_periodo);
          const inscritos = getEstudiantesBySeccion(s.id).length;
          return `<tr><td>${m ? m.nombre : 'N/A'}</td><td>${s.codigo_seccion}</td><td>${p ? p.nombre : ''}</td><td>${s.horario}</td><td class="center">${s.cupo}</td><td class="center">${inscritos}</td></tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="empty">No tienes secciones asignadas.</p>'}
    </div>
    <div class="center-actions">
      <button class="btn btn-primary" onclick="navigateTo('ingreso-calificaciones')">Ingresar Calificaciones</button>
      <button class="btn btn-secondary" onclick="navigateTo('mis-secciones')">Ver Mis Secciones</button>
    </div>
  `;
}

function renderMisSecciones(el) {
  const doc = getDocenteActual();
  if (!doc) { el.innerHTML = '<p class="error">No se encontró tu perfil de docente</p>'; return; }
  const secs = getSeccionesDocente();
  el.innerHTML = `
    <div class="page-header"><h2>Mis Secciones</h2><p>Secciones de asignaturas que impartes este período</p></div>
    ${secs.length ? `<div class="table-card"><table>
      <thead><tr><th>Asignatura</th><th>Código</th><th>Período</th><th>Horario</th><th>Cupo</th><th>Inscritos</th><th>Acciones</th></tr></thead>
      <tbody>${secs.map(s => {
        const m = DB.find('materias', s.id_materia);
        const p = DB.find('periodos', s.id_periodo);
        const inscritos = getEstudiantesBySeccion(s.id).length;
        return `<tr>
          <td>${m ? m.nombre : 'N/A'}</td>
          <td>${s.codigo_seccion}</td>
          <td>${p ? p.nombre : ''}</td>
          <td>${s.horario}</td>
          <td class="center">${s.cupo}</td>
          <td class="center">${inscritos}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('ingreso-calificaciones')">Calificar</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('lista-asignatura')">Lista</button>
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<div class="table-card"><p class="empty">No tienes secciones asignadas.</p></div>'}
  `;
}

function renderIngresoCalificacionesDocente(el) {
  const secs = getSeccionesDocente();
  if (!secs.length) {
    el.innerHTML = '<div class="page-header"><h2>Ingreso de Calificaciones</h2></div><div class="table-card"><p class="empty">No tienes secciones asignadas para calificar.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="page-header"><h2>Ingreso de Calificaciones</h2></div>
    <div class="form-card">
      <form id="form-cal-top" onsubmit="return false;">
        <div class="form-row">
          <div class="form-group"><label>Sección (mis asignaturas)</label><select id="cal-sec" onchange="cargarTablaCal()">${optSeccionesDocente()}</select></div>
        </div>
      </form>
    </div>
    <div id="cal-table-container"></div>
  `;
}

function renderListaAsignaturaDocente(el) {
  const secs = getSeccionesDocente();
  if (!secs.length) {
    el.innerHTML = '<div class="page-header"><h2>Lista de Estudiantes por Asignatura</h2></div><div class="table-card"><p class="empty">No tienes secciones asignadas.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="page-header"><h2>Lista de Estudiantes por Asignatura</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Sección (mis asignaturas)</label><select id="lis-sec">${optSeccionesDocente()}</select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="consultarLista()">Consultar Lista</button>
      </div>
    </div>
    <div id="lis-resultado"></div>
  `;
}

function renderReporteAsignaturaDocente(el) {
  const secs = getSeccionesDocente();
  if (!secs.length) {
    el.innerHTML = '<div class="page-header"><h2>Reporte de Calificaciones por Asignatura</h2></div><div class="table-card"><p class="empty">No tienes secciones asignadas.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="page-header"><h2>Reporte de Calificaciones por Asignatura</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Sección (mis asignaturas)</label><select id="rap-sec">${optSeccionesDocente()}</select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="generarReporteAsig()">Generar Reporte</button>
      </div>
    </div>
    <div id="rap-resultado"></div>
  `;
}

function renderBoletinDocente(el) {
  el.innerHTML = `
    <div class="page-header"><h2>Solicitar Boletín de Calificaciones</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Estudiante (de mis secciones)</label><select id="bol-est" onchange="mostrarInfoEst()">${optEstudiantesDocente()}</select></div>
        <div class="form-group"><label>Período Académico</label><select id="bol-per">${optPeriodos()}</select></div>
      </div>
      <div id="bol-info-est"></div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="generarBoletin()">Boletín PDF</button>
      </div>
    </div>
    <div id="bol-resultado"></div>
  `;
}

function getEstudianteActual() {
  if (!usuarioActual || usuarioActual.rol !== 'Estudiante') return null;
  return DB.get('estudiantes').find(e => e.correo === usuarioActual.email);
}

function renderInicioEstudiante(el) {
  const est = getEstudianteActual();
  if (!est) { el.innerHTML = '<p class="error">No se encontró el estudiante</p>'; return; }
  const inscConDetalle = getSeccionesEstudiante(est.id);
  const cals = DB.where('calificaciones', c => c.id_estudiante === est.id);
  const indice = calcularIndice(cals.map(c => {
    const cs = DB.find('secciones', c.id_seccion);
    const mat = cs ? DB.find('materias', cs.id_materia) : null;
    return { nota: c.nota, creditos: mat ? mat.creditos : 0 };
  }));
  const creditos = cals.reduce((s, c) => {
    const cs = DB.find('secciones', c.id_seccion);
    const mat = cs ? DB.find('materias', cs.id_materia) : null;
    return s + (mat ? Number(mat.creditos) || 0 : 0);
  }, 0);
  const aprob = cals.filter(c => c.estado === 'Aprobado').length;

  el.innerHTML = `
    <div class="page-header"><h2>Mi Información</h2></div>
    <div class="report-card">
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Nombre:</span><span>${est.nombre}</span></div>
        <div class="meta-row"><span class="meta-label">Matrícula:</span><span>${est.matricula}</span></div>
        <div class="meta-row"><span class="meta-label">Carrera:</span><span>${est.carrera || 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Correo:</span><span>${est.correo || 'N/A'}</span></div>
      </div>
    </div>
    <div class="report-card">
      <div class="report-title">Mis Materias Inscritas (${inscConDetalle.length})</div>
      ${inscConDetalle.length ? `<table>
        <thead><tr><th>Asignatura</th><th>Sección</th><th>Período</th><th>Horario</th><th>Docente</th></tr></thead>
        <tbody>${inscConDetalle.map(d => `<tr>
          <td>${d.materia ? d.materia.nombre : 'N/A'}</td>
          <td>${d.seccion ? d.seccion.codigo_seccion : 'N/A'}</td>
          <td>${d.periodo ? d.periodo.nombre : 'N/A'}</td>
          <td>${d.seccion ? d.seccion.horario : 'N/A'}</td>
          <td>${d.docente ? d.docente.nombre : 'N/A'}</td>
        </tr>`).join('')}</tbody>
      </table>` : '<p class="empty">No estás inscrito en ninguna materia.</p>'}
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-n">${inscConDetalle.length}</div><div class="stat-l">Inscritas</div></div>
      <div class="stat-card"><div class="stat-n">${cals.length}</div><div class="stat-l">Evaluadas</div></div>
      <div class="stat-card"><div class="stat-n">${indice.toFixed(1)}</div><div class="stat-l">Índice Académico</div></div>
      <div class="stat-card"><div class="stat-n">${creditos}</div><div class="stat-l">Créditos</div></div>
      <div class="stat-card"><div class="stat-n">${aprob}</div><div class="stat-l">Aprobadas</div></div>
    </div>
  `;
}

function renderBoletinEstudiante(el) {
  const est = getEstudianteActual();
  if (!est) { el.innerHTML = '<p class="error">No se encontró el estudiante</p>'; return; }

  el.innerHTML = `
    <div class="page-header"><h2>Mi Boletín de Calificaciones</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Período Académico</label><select id="bol-est-per">${optPeriodos()}</select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="generarBoletinEstudiante()">Ver Boletín</button>
      </div>
    </div>
    <div id="bol-est-resultado"></div>
  `;
}

function generarBoletinEstudiante() {
  const est = getEstudianteActual();
  const perId = numVal('bol-est-per');
  const div = sel('bol-est-resultado');
  if (!est) return;
  const b = boletinCalificaciones(est.id, perId || undefined);
  if (!b) { div.innerHTML = '<p class="error">No hay calificaciones para este período</p>'; return; }

  div.innerHTML = `
    <div class="report-card boletin-card">
      <div class="report-title">INSTITUCIÓN EDUCATIVA XXXXXXXX</div>
      <div class="report-subtitle">BOLETÍN DE CALIFICACIONES</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Período Académico:</span><span>${b.periodo ? b.periodo.nombre : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Sección:</span><span>${b.seccion ? b.seccion.codigo_seccion : 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Estudiante:</span><span>${b.estudiante.nombre}</span></div>
        <div class="meta-row"><span class="meta-label">Matrícula:</span><span>${b.matricula}</span></div>
      </div>
      <table class="report-table">
        <thead><tr><th>Asignatura</th><th>Créditos</th><th>Nota Final</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${b.detalle.map(d => `<tr><td>${d.asignatura}</td><td class="center">${d.creditos}</td><td class="center">${d.nota}</td>
          <td class="center"><strong>${d.letra}</strong></td>
          <td class="center"><span class="${d.estado === 'Aprobado' ? 'badge-ok' : 'badge-fail'}">${d.estado}</span></td></tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Índice Académico del Período: <strong>${b.indice.toFixed(1)}</strong></p>
        <p>Créditos Cursados: <strong>${b.creditos}</strong> &nbsp;·&nbsp; Puntos Obtenidos: <strong>${b.totalPuntos}</strong></p>
        <p>Asignaturas Aprobadas: <strong>${b.aprobadas}</strong></p>
        <p>Asignaturas Reprobadas: <strong>${b.reprobadas}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
}

function renderHistorialEstudiante(el) {
  const est = getEstudianteActual();
  if (!est) { el.innerHTML = '<p class="error">No se encontró el estudiante</p>'; return; }

  el.innerHTML = `
    <div class="page-header"><h2>Mi Historial Académico</h2></div>
    <div id="hist-est-resultado"></div>
  `;

  const h = historialAcademico(est.id);
  const div = sel('hist-est-resultado');
  if (!h) { div.innerHTML = '<p class="error">No hay calificaciones registradas</p>'; return; }

  div.innerHTML = `
    <div class="report-card">
      <div class="report-title">HISTORIAL ACADÉMICO</div>
      <div class="report-meta">
        <div class="meta-row"><span class="meta-label">Estudiante:</span><span>${h.estudiante.nombre}</span></div>
        <div class="meta-row"><span class="meta-label">Matrícula:</span><span>${h.matricula}</span></div>
      </div>
      <table class="report-table">
        <thead><tr><th>Período</th><th>Asignatura</th><th>Créditos</th><th>Nota</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${h.detalle.map(d => `<tr><td>${d.periodo}</td><td>${d.asignatura}</td><td class="center">${d.creditos}</td><td class="center">${d.nota}</td>
          <td class="center"><strong>${d.letra}</strong></td>
          <td class="center"><span class="${d.estado === 'Aprobado' ? 'badge-ok' : 'badge-fail'}">${d.estado}</span></td></tr>`).join('')}</tbody>
      </table>
      <div class="report-footer">
        <p>Índice Académico Acumulado: <strong>${h.indice.toFixed(1)}</strong></p>
        <p>Créditos Acumulados: <strong>${h.creditos}</strong> &nbsp;·&nbsp; Puntos Obtenidos: <strong>${h.totalPuntos}</strong></p>
      </div>
      <div class="form-actions no-print">
        <button class="btn btn-primary" onclick="imprimirReporte(this)">Imprimir</button>
      </div>
    </div>
  `;
}

function renderInscripcionMaterias(el) {
  const est = getEstudianteActual();
  if (!est) { el.innerHTML = '<p class="error">No se encontró el estudiante</p>'; return; }

  if (!_inscripcionesAbiertas) {
    el.innerHTML = `
      <div class="page-header"><h2>Inscripción de Materias</h2></div>
      <div class="table-card">
        <div class="empty-state">
          <p style="text-align:center;padding:40px 0;color:var(--text3);font-size:16px;">
            <strong>No disponible por ahora</strong><br>
            <span style="font-size:13px;">Las inscripciones están actualmente cerradas. Intenta más tarde.</span>
          </p>
        </div>
      </div>
    `;
    return;
  }

  const inscripciones = getInscripciones(est.id);
  const perSelect = sel('ins-per');
  const perId = perSelect ? (Number(perSelect.value) || 0) : 0;

  el.innerHTML = `
    <div class="page-header"><h2>Inscripción de Materias</h2></div>
    <div class="form-card">
      <div class="form-row">
        <div class="form-group"><label>Período Académico</label><select id="ins-per" onchange="navigateTo('inscripcion-materias')">
          <option value="">Todos los períodos</option>
          ${listarPeriodos().map(p => `<option value="${p.id}" ${p.id === perId ? 'selected' : ''}>${p.nombre}</option>`).join('')}
        </select></div>
      </div>
      <p style="color:var(--text3);font-size:13px;">Aquí verás solo las asignaturas que aún no has tomado. Puedes filtrar por período.</p>
    </div>
    <div id="ins-secciones-disponibles"></div>
    <div class="table-card">
      <h3>Mis Materias Inscritas (${inscripciones.length})</h3>
      <div id="ins-mis-materias"></div>
    </div>
  `;

  // Materias que el estudiante ya ha tomado: inscrito en una sección
  // o ya aprobada. Las reprobadas sí pueden repetirse.
  const materiasTomadas = new Set();
  inscripciones.forEach(i => {
    const s = DB.find('secciones', i.id_seccion);
    if (s) materiasTomadas.add(s.id_materia);
  });
  DB.where('calificaciones', c => c.id_estudiante === est.id).forEach(c => {
    if (c.estado === 'Aprobado') {
      const s = DB.find('secciones', c.id_seccion);
      if (s) materiasTomadas.add(s.id_materia);
    }
  });

  // Secciones de materias que el estudiante NO ha tomado aún
  const disponibles = getSeccionesDisponibles(perId)
    .filter(d => d.seccion && !materiasTomadas.has(d.seccion.id_materia));

  const divSec = sel('ins-secciones-disponibles');
  if (!disponibles.length) {
    divSec.innerHTML = '<div class="table-card"><p class="empty">No hay materias disponibles. Ya has tomado todas las asignaturas de este período.</p></div>';
  } else {
    divSec.innerHTML = `<div class="table-card"><h3>Materias Disponibles (${disponibles.length})</h3>
      <table><thead><tr><th>Asignatura</th><th>Código</th><th>Docente</th><th>Horario</th><th>Cupo</th><th>Acción</th></tr></thead>
      <tbody>${disponibles.map(d => {
        const lleno = d.inscritos >= d.cupo;
        return `<tr>
          <td>${d.materia ? d.materia.nombre : 'N/A'}</td>
          <td>${d.seccion.codigo_seccion}</td>
          <td>${d.docente ? d.docente.nombre : 'N/A'}</td>
          <td>${d.seccion.horario}</td>
          <td>${d.inscritos}/${d.cupo}</td>
          <td><button class="btn btn-primary btn-sm" onclick="inscribirYRefrescar(${est.id},${d.seccion.id})" ${lleno ? 'disabled' : ''}>${lleno ? 'Lleno' : 'Inscribir'}</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // Cargar materias inscritas del estudiante
  const inscConDetalle = getSeccionesEstudiante(est.id);
  const divMis = sel('ins-mis-materias');
  if (!inscConDetalle.length) {
    divMis.innerHTML = '<p class="empty">No estás inscrito en ninguna materia.</p>';
  } else {
    divMis.innerHTML = `<table><thead><tr><th>Asignatura</th><th>Sección</th><th>Período</th><th>Horario</th><th>Docente</th><th>Acción</th></tr></thead>
      <tbody>${inscConDetalle.map(d => `<tr>
        <td>${d.materia ? d.materia.nombre : 'N/A'}</td>
        <td>${d.seccion ? d.seccion.codigo_seccion : 'N/A'}</td>
        <td>${d.periodo ? d.periodo.nombre : 'N/A'}</td>
        <td>${d.seccion ? d.seccion.horario : 'N/A'}</td>
        <td>${d.docente ? d.docente.nombre : 'N/A'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar inscripción?')){eliminarInscripcion(${d.inscripcion.id});toast('Inscripción eliminada');navigateTo('inscripcion-materias')}">Eliminar</button></td>
      </tr>`).join('')}</tbody></table>`;
  }
}

async function inscribirYRefrescar(estId, secId) {
  const r = await inscribirEstudiante(estId, secId);
  if (r && r.error === 'cupo_lleno') toast('La sección está llena', 'error');
  else if (r) toast('Inscripción exitosa');
  else toast('Ya estás inscrito en esta materia', 'error');
  navigateTo('inscripcion-materias');
}

function renderMisCalificaciones(el) {
  const est = getEstudianteActual();
  if (!est) { el.innerHTML = '<p class="error">No se encontró el estudiante</p>'; return; }

  const inscConDetalle = getSeccionesEstudiante(est.id);
  const cals = DB.where('calificaciones', c => c.id_estudiante === est.id);
  const indiceGeneral = calcularIndice(cals.map(c => {
    const cs = DB.find('secciones', c.id_seccion);
    const mat = cs ? DB.find('materias', cs.id_materia) : null;
    return { nota: c.nota, creditos: mat ? mat.creditos : 0 };
  }));

  el.innerHTML = `
    <div class="page-header"><h2>Mis Calificaciones</h2></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-n">${cals.length}</div><div class="stat-l">Materias Evaluadas</div></div>
      <div class="stat-card"><div class="stat-n">${indiceGeneral.toFixed(1)}</div><div class="stat-l">Índice Académico</div></div>
      <div class="stat-card"><div class="stat-n">${cals.filter(c => c.estado === 'Aprobado').length}</div><div class="stat-l">Aprobadas</div></div>
      <div class="stat-card"><div class="stat-n">${cals.filter(c => c.estado === 'Reprobado').length}</div><div class="stat-l">Reprobadas</div></div>
    </div>
    <div class="table-card">
      <h3>Detalle de Calificaciones</h3>
      <div id="cal-detalle-container"></div>
    </div>
  `;

  const divDet = sel('cal-detalle-container');
  if (!inscConDetalle.length && !cals.length) {
    divDet.innerHTML = '<p class="empty">No tienes materias inscritas ni calificaciones registradas.</p>';
    return;
  }

  // Agrupar por período
  const porPeriodo = {};
  inscConDetalle.forEach(d => {
    const perId = d.periodo ? d.periodo.id : 'sin-periodo';
    if (!porPeriodo[perId]) porPeriodo[perId] = { periodo: d.periodo, materias: [] };
    const cal = cals.find(c => c.id_seccion === (d.seccion ? d.seccion.id : null));
    porPeriodo[perId].materias.push({
      materia: d.materia,
      seccion: d.seccion,
      docente: d.docente,
      calificacion: cal ? cal.nota : null,
      estado: cal ? cal.estado : 'Inscrito'
    });
  });

  // Agregar calificaciones sueltas (sin inscripción)
  cals.forEach(c => {
    const sec = DB.find('secciones', c.id_seccion);
    const per = sec ? DB.find('periodos', sec.id_periodo) : null;
    const perId = per ? per.id : 'sin-periodo';
    const mat = sec ? DB.find('materias', sec.id_materia) : null;
    if (!porPeriodo[perId]) porPeriodo[perId] = { periodo: per, materias: [] };
    if (!porPeriodo[perId].materias.find(m => m.calificacion !== null && m.calificacion === c.nota && m.materia && mat && m.materia.id === mat.id)) {
      porPeriodo[perId].materias.push({
        materia: mat,
        seccion: sec,
        docente: sec ? DB.find('docentes', sec.id_docente) : null,
        calificacion: c.nota,
        estado: c.estado
      });
    }
  });

  divDet.innerHTML = Object.entries(porPeriodo).map(([perId, grupo]) => `
    <div class="report-card" style="margin-bottom:16px;">
      <div class="report-title" style="font-size:14px;text-align:left;">${grupo.periodo ? grupo.periodo.nombre : 'Sin período'}</div>
      <table class="report-table">
        <thead><tr><th>Asignatura</th><th>Sección</th><th>Docente</th><th>Calificación</th><th>Letra</th><th>Estado</th></tr></thead>
        <tbody>${grupo.materias.map(m => `<tr>
          <td>${m.materia ? m.materia.nombre : 'N/A'}</td>
          <td>${m.seccion ? m.seccion.codigo_seccion : 'N/A'}</td>
          <td>${m.docente ? m.docente.nombre : 'N/A'}</td>
          <td class="center" style="font-weight:700;">${m.calificacion !== null ? m.calificacion : '—'}</td>
          <td class="center"><strong>${m.calificacion !== null ? letraPorNota(m.calificacion) : '—'}</strong></td>
          <td class="center"><span class="${m.estado === 'Aprobado' ? 'badge-ok' : m.estado === 'Reprobado' ? 'badge-fail' : 'badge-proc'}">${m.estado}</span></td>
        </tr>`).join('')}</tbody>
      </table>
      ${grupo.materias.filter(m => m.calificacion !== null).length > 0 ? (() => {
        const calsGrupo = grupo.materias.filter(m => m.calificacion !== null);
        const indiceGrupo = calcularIndice(calsGrupo.map(m => ({ nota: m.calificacion, creditos: m.materia ? m.materia.creditos : 0 })));
        return `<div class="report-footer"><p>Índice Académico del período: <strong>${indiceGrupo.toFixed(1)}</strong></p></div>`;
      })() : ''}
    </div>
  `).join('');
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === INS_KEY) {
      _inscripcionesAbiertas = e.newValue === '1';
      if (currentSection === 'inscripcion-materias' || currentSection === 'inicio') {
        navigateTo(currentSection);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
