from flask import Flask, render_template, request, redirect, session
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'clave_secreta'

# Conexión a la base de datos
def conectar_bd():
    return sqlite3.connect("app.db")

# Inicializar la base de datos
def init_db():
    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS solicitudes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            fecha TEXT NOT NULL,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    ''')
    # Crear un usuario por defecto (solo si no existe)
    cursor.execute("SELECT * FROM usuarios WHERE username = ?", ('admin',))
    if not cursor.fetchone():
        password_hash = generate_password_hash("admin123")
        cursor.execute("INSERT INTO usuarios (username, password) VALUES (?, ?)", ('admin', password_hash))
    
    conn.commit()
    conn.close()

# Ruta: Login
@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        conn = conectar_bd()
        cursor = conn.cursor()
        cursor.execute("SELECT id, password FROM usuarios WHERE username = ?", (username,))
        user = cursor.fetchone()
        conn.close()
        if user and check_password_hash(user[1], password):
            session['user_id'] = user[0]
            return redirect('/solicitar')
        else:
            return "Credenciales incorrectas"
    return render_template('login.html')

# Ruta: Logout
@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect('/')

# Ruta: Solicitar
@app.route('/solicitar', methods=['GET', 'POST'])
def solicitar():
    if 'user_id' not in session:
        return redirect('/')
    
    if request.method == 'POST':
        tipo = request.form['tipo']
        fecha = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn = conectar_bd()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO solicitudes (usuario_id, tipo, fecha) VALUES (?, ?, ?)",
                       (session['user_id'], tipo, fecha))
        conn.commit()
        conn.close()
        return redirect('/mis_solicitudes')

    return render_template('solicitar.html')

# Ruta: Ver solicitudes del usuario
@app.route('/mis_solicitudes')
def mis_solicitudes():
    if 'user_id' not in session:
        return redirect('/')

    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute("SELECT tipo, fecha FROM solicitudes WHERE usuario_id = ?", (session['user_id'],))
    solicitudes = cursor.fetchall()
    conn.close()
    return render_template('solicitudes.html', solicitudes=solicitudes)

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
