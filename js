// server.js
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // sirve index1.html

const db = new sqlite3.Database('./gde_permisos.db');

// Inicializar DB con tu script (ejecutar una vez)
const fs = require('fs');
const sql = fs.readFileSync('./crear_tablas_permisos.sql','utf8');
db.exec(sql, (err) => {
  if (err) console.error('Error al ejecutar SQL inicial:', err);
  else console.log('Tablas creadas/aseguradas.');
});

// GET /getEmployees -> lista de usuarios de ejemplo
app.get('/getEmployees', (req, res) => {
  db.all('SELECT id, nombre || " " || apellido AS name, diasVacaciones FROM Usuarios', [], (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    // Mapear para frontend (ejemplo de "request" vacío)
    const empleados = rows.map(r => ({ id: r.id, name: r.name, diasDisponibles: r.diasVacaciones || 0, request: '-' }));
    res.json(empleados);
  });
});

// POST /requestPermission -> crea un permiso y, si es Vacaciones y auto-descuento, calcula
app.post('/requestPermission', (req, res) => {
  const { id: usuario_id, tipo, fechaInicio, fechaFin, diasSolicitados, valorDia } = req.body;

  if (!usuario_id || !tipo) return res.status(400).json({ message: 'Faltan datos' });

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    // Insertar permiso como Pendiente
    const ins = db.prepare(`INSERT INTO Permisos (usuario_id, tipo, fechaInicio, fechaFin, descripcion, estado)
                            VALUES (?,?,?,?,?, 'Pendiente')`);
    ins.run(usuario_id, fechaInicio || null, fechaFin || null, '', function(err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ message: 'Error al crear permiso', err: err.message });
      }
      const permisoId = this.lastID;

      // Si es Vacaciones: calcular descuento y (opcional) descontar al aprobar — acá mostramos cálculo
      if (tipo === 'Vacaciones') {
        // Leer dias disponibles actuales
        db.get('SELECT diasVacaciones FROM Usuarios WHERE id = ?', [usuario_id], (err, row) => {
          if (err) { db.run('ROLLBACK'); return res.status(500).json({ message: err.message }); }
          const diasDispon = row ? (row.diasVacaciones || 0) : 0;
          const valorDiaNum = Number(valorDia) || 0;
          const diasNum = Number(diasSolicitados) || 0;
          const descuento = valorDiaNum * diasNum;

          // no descontamos todavía hasta aprobación; solo respondemos con cálculo
          db.run('COMMIT');
          return res.json({
            message: 'Permiso creado. Pendiente de aprobación.',
            permisoId,
            diasDisponiblesAntes: diasDispon,
            diasSolicitados: diasNum,
            montoDescontadoEstimado: descuento
          });
        });
      } else {
        db.run('COMMIT');
        return res.json({ message: 'Permiso creado. Pendiente de aprobación.', permisoId });
      }
    });
  });
});

// POST /approvePermission -> aprobar y aplicar descuento de dias
app.post('/approvePermission', (req, res) => {
  const { permisoId } = req.body;
  if (!permisoId) return res.status(400).json({ message: 'permisoId requerido' });

  db.get('SELECT * FROM Permisos WHERE id = ?', [permisoId], (err, permiso) => {
    if (err || !permiso) return res.status(500).json({ message: 'Permiso no encontrado' });
    // calcular dias entre fechas si existen
    const dias = permiso.fechaInicio && permiso.fechaFin ? 
      ( (new Date(permiso.fechaFin) - new Date(permiso.fechaInicio)) / (1000*60*60*24) + 1 ) : 0;

    db.run('BEGIN TRANSACTION');
    db.run('UPDATE Permisos SET estado = "Aprobado" WHERE id = ?', [permisoId], function(err) {
      if (err) { db.run('ROLLBACK'); return res.status(500).json({ message: err.message }); }
      // Descontar dias de Usuarios.diasVacaciones
      db.run('UPDATE Usuarios SET diasVacaciones = diasVacaciones - ? WHERE id = ?', [dias, permiso.usuario_id], function(err) {
        if (err) { db.run('ROLLBACK'); return res.status(500).json({ message: err.message }); }
        db.run('COMMIT');
        res.json({ message: 'Permiso aprobado y dias descontados', diasDescontados: dias });
      });
    });
  });
});

const PORT = 3000;
app.listen(PORT, ()=> console.log(`Server en http://localhost:${PORT}`));
