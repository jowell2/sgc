# SGC — Sistema Gestor de Calificaciones

Sistema web completo de gestión de calificaciones universitarias: API REST en Node.js,
base de datos SQLite con 10 tablas, y una interfaz SPA con tres roles de usuario.

**2,571 líneas** · Node.js + Express + SQLite + JavaScript vanilla

## Qué hace

Los docentes registran notas, los estudiantes consultan su boletín y historial, y la
coordinación genera reportes estadísticos e índices de rendimiento.

- **3 roles con menús distintos:** administrador (12 secciones), docente (6) y estudiante (5)
- **Boletín e índice GPA** ponderado por créditos
- **~20 reportes:** por asignatura, estadístico institucional, listados por cuatrimestre
- **Bitácora de auditoría:** cada cambio de nota queda registrado con su valor anterior

## Arquitectura

El backend expone rutas genéricas tipo ORM: el nombre de la tabla se valida contra
`sqlite_master` y las columnas se descubren con `PRAGMA table_info`, así que cualquier
tabla existente funciona sin escribir una ruta por tabla.

```
├── server.js      API REST (Express, puerto 3000)
├── database.js    Esquema de 10 tablas con claves foráneas
├── package.json
├── sgc.html       Shell HTML + CSS embebido
└── gestor.js      Capa de caché, navegación y ~20 funciones de reporte
```

**Base de datos:** SQLite en modo WAL con `foreign_keys = ON`. Las 10 tablas son
`materias`, `docentes`, `periodos`, `secciones`, `estudiantes`, `calificaciones`,
`bitacora`, `usuarios`, `inscripciones` y `configuracion`.

**Frontend:** sin framework, sin bundler y sin build step. Toda la interfaz se genera
con `innerHTML` desde `gestor.js`. CSS con custom properties, Flexbox y Grid, más
estilos dedicados de impresión.

## Instalación

Requiere **Node.js 14 o superior**.

```bash
npm install
npm start
```

El servidor arranca en `http://localhost:3000` y expone **solo la API**. La base de
datos `sgc.db` se crea automáticamente con el esquema completo al iniciar.

### Abrir la interfaz

El frontend llama a la API por CORS, así que puedes abrirlo de cualquiera de estas dos
formas:

**Opción A — abrir el archivo directamente**

Abre `sgc.html` haciendo doble clic, con el servidor ya corriendo en otra terminal.

**Opción B — servir la carpeta en otro puerto**

```bash
npx serve .
```

Luego entra a la URL que te muestre y navega hasta `sgc.html`. Es la opción más
fiable, porque algunos navegadores restringen `fetch` cuando la página se abrió desde
el sistema de archivos.

## Uso

1. Abre `sgc.html` (ver opciones arriba)
2. La base de datos está vacía, así que el frontend inyecta los datos de demostración
   automáticamente la primera vez
3. Inicia sesión con cualquiera de las cuentas de prueba:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@sgc.edu.do` | `admin123` |
| Coordinador Académico | `coordinador@sgc.edu.do` | `coord123` |
| Docente | `cmendez@sgc.edu.do` | `doc123` |
| Docente | `ltorres@sgc.edu.do` | `doc123` |
| Estudiante | `ana.garcia@estudiante.edu.do` | `est123` |

Los datos de demostración son ficticios. El archivo `sgc.db` está en `.gitignore`, así
que cada clon arranca con una base limpia.

## API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/auth/login` | Autenticación por correo y contraseña |
| `POST` | `/api/seed` | Crea los datos de demostración (transaccional) |
| `GET` | `/api/:collection` | Lista todos los registros |
| `GET` | `/api/:collection/:id` | Obtiene un registro por id |
| `POST` | `/api/:collection` | Crea un registro |
| `PUT` | `/api/:collection/:id` | Actualiza un registro |
| `DELETE` | `/api/:collection/:id` | Elimina un registro |
| `PUT` | `/api/collections/:collection` | Sincronización masiva de una colección |

## Nota de seguridad

Las contraseñas de este proyecto se almacenan en texto plano, porque el objetivo del
proyecto es la lógica de negocio y no la autenticación. **No lo uses con datos reales.**
Para producción, las contraseñas deberían guardarse como hash con bcrypt o argon2, y
el login debería comparar contra el hash en lugar de hacer `SELECT` por contraseña.
