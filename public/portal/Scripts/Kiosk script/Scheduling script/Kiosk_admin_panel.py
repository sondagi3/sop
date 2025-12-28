#!/usr/bin/env python3
import os
import json
import sqlite3
import hashlib
import secrets
from datetime import datetime
from flask import Flask, request, render_template, redirect, url_for, flash, session, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from functools import wraps

# Configuration
UPLOAD_FOLDER = '/home/kiosk/content'
DATABASE = '/home/kiosk/kiosk.db'
CONFIG_FILE = '/home/kiosk/kiosk_config.cfg'
SECRET_KEY = secrets.token_hex(16)
DEFAULT_USERNAME = 'admin'
DEFAULT_PASSWORD = 'admin'  # You should change this immediately after setup

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max upload
app.secret_key = SECRET_KEY

# Database setup
def init_db():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    
    # Users table
    c.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
    )
    ''')
    
    # Content table
    c.execute('''
    CREATE TABLE IF NOT EXISTS content (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        file_path TEXT,
        is_default INTEGER DEFAULT 0,
        is_offline INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Schedule table
    c.execute('''
    CREATE TABLE IF NOT EXISTS schedule (
        id INTEGER PRIMARY KEY,
        content_id INTEGER NOT NULL,
        day_of_week TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        priority INTEGER DEFAULT 1,
        FOREIGN KEY (content_id) REFERENCES content (id)
    )
    ''')
    
    # Check if default user exists
    c.execute("SELECT id FROM users WHERE username = ?", (DEFAULT_USERNAME,))
    if not c.fetchone():
        password_hash = hashlib.sha256(DEFAULT_PASSWORD.encode()).hexdigest()
        c.execute("INSERT INTO users (username, password) VALUES (?, ?)", 
                 (DEFAULT_USERNAME, password_hash))
    
    conn.commit()
    conn.close()

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access this page')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Helper functions
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def get_current_content():
    """Determine which content should be displayed based on schedule"""
    conn = get_db_connection()
    now = datetime.now()
    current_time = now.strftime("%H:%M")
    day_of_week = now.strftime("%A").lower()
    
    # Check for scheduled content
    cursor = conn.execute('''
        SELECT c.* FROM content c
        JOIN schedule s ON c.id = s.content_id
        WHERE (s.day_of_week = ? OR s.day_of_week = 'everyday')
        AND s.start_time <= ?
        AND s.end_time >= ?
        ORDER BY s.priority DESC
        LIMIT 1
    ''', (day_of_week, current_time, current_time))
    
    scheduled_content = cursor.fetchone()
    
    if scheduled_content:
        result = dict(scheduled_content)
    else:
        # Fall back to default content
        cursor = conn.execute('SELECT * FROM content WHERE is_default = 1 LIMIT 1')
        default_content = cursor.fetchone()
        
        if default_content:
            result = dict(default_content)
        else:
            # Last resort fallback
            result = {
                'url': 'file:///home/kiosk/content/fallback.html',
                'is_offline': 1
            }
    
    conn.close()
    return result

def update_config_file(main_url, offline_url):
    """Update the kiosk config file with new URLs"""
    with open(CONFIG_FILE, 'w') as f:
        f.write(f'main_page="{main_url}"\n')
        f.write(f'offline_video_page="{offline_url}"\n')

def get_config_urls():
    """Read current URLs from config file"""
    main_url = ""
    offline_url = ""
    
    try:
        with open(CONFIG_FILE, 'r') as f:
            for line in f:
                if line.startswith('main_page='):
                    main_url = line.strip().split('=', 1)[1].strip('"')
                elif line.startswith('offline_video_page='):
                    offline_url = line.strip().split('=', 1)[1].strip('"')
    except FileNotFoundError:
        pass
        
    return main_url, offline_url

# Routes
@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE username = ? AND password_hash = ?', 
                          (username, password_hash)).fetchone()
        conn.close()
        
        if user:
            session['user_id'] = user['id']
            session['username'] = user['username']
            return redirect(url_for('dashboard'))
        
        flash('Invalid username or password')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    conn = get_db_connection()
    content_list = conn.execute('SELECT * FROM content ORDER BY created_at DESC').fetchall()
    schedule_list = conn.execute('''
        SELECT s.*, c.name as content_name 
        FROM schedule s 
        JOIN content c ON s.content_id = c.id
        ORDER BY s.priority DESC
    ''').fetchall()
    
    main_url, offline_url = get_config_urls()
    current_content = get_current_content()
    
    conn.close()
    return render_template('dashboard.html', 
                           content_list=content_list, 
                           schedule_list=schedule_list,
                           main_url=main_url,
                           offline_url=offline_url,
                           current_content=current_content)

@app.route('/content/add', methods=['GET', 'POST'])
@login_required
def add_content():
    if request.method == 'POST':
        name = request.form['name']
        content_type = request.form['type']
        url = request.form['url']
        is_default = 1 if 'is_default' in request.form else 0
        is_offline = 1 if 'is_offline' in request.form else 0
        file_path = None
        
        # Handle file upload
        if 'file' in request.files and request.files['file'].filename:
            file = request.files['file']
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            
            # If it's a local file, update the URL to point to it
            if content_type == 'local':
                url = f"file://{file_path}"
        
        conn = get_db_connection()
        
        # If setting as default, clear other defaults
        if is_default:
            conn.execute('UPDATE content SET is_default = 0 WHERE is_default = 1')
        
        conn.execute('''
            INSERT INTO content (name, type, url, file_path, is_default, is_offline)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, content_type, url, file_path, is_default, is_offline))
        
        conn.commit()
        
        # If this is the default or offline content, update config
        if is_default or is_offline:
            main_url, offline_url = get_config_urls()
            
            if is_default:
                main_url = url
            if is_offline:
                offline_url = url
                
            update_config_file(main_url, offline_url)
        
        conn.close()
        flash('Content added successfully')
        return redirect(url_for('dashboard'))
    
    return render_template('add_content.html')

@app.route('/content/edit/<int:id>', methods=['GET', 'POST'])
@login_required
def edit_content(id):
    conn = get_db_connection()
    content = conn.execute('SELECT * FROM content WHERE id = ?', (id,)).fetchone()
    
    if not content:
        conn.close()
        flash('Content not found')
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        name = request.form['name']
        content_type = request.form['type']
        url = request.form['url']
        is_default = 1 if 'is_default' in request.form else 0
        is_offline = 1 if 'is_offline' in request.form else 0
        file_path = content['file_path']
        
        # Handle file upload
        if 'file' in request.files and request.files['file'].filename:
            file = request.files['file']
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            
            # If it's a local file, update the URL to point to it
            if content_type == 'local':
                url = f"file://{file_path}"
        
        # If setting as default, clear other defaults
        if is_default:
            conn.execute('UPDATE content SET is_default = 0 WHERE is_default = 1 AND id != ?', (id,))
        
        conn.execute('''
            UPDATE content 
            SET name = ?, type = ?, url = ?, file_path = ?, is_default = ?, is_offline = ?
            WHERE id = ?
        ''', (name, content_type, url, file_path, is_default, is_offline, id))
        
        conn.commit()
        
        # If this is the default or offline content, update config
        if is_default or is_offline:
            main_url, offline_url = get_config_urls()
            
            if is_default:
                main_url = url
            if is_offline:
                offline_url = url
                
            update_config_file(main_url, offline_url)
        
        conn.close()
        flash('Content updated successfully')
        return redirect(url_for('dashboard'))
    
    conn.close()
    return render_template('edit_content.html', content=content)

@app.route('/content/delete/<int:id>', methods=['POST'])
@login_required
def delete_content(id):
    conn = get_db_connection()
    
    # Get content info
    content = conn.execute('SELECT * FROM content WHERE id = ?', (id,)).fetchone()
    
    if not content:
        conn.close()
        flash('Content not found')
        return redirect(url_for('dashboard'))
    
    # Delete related schedules
    conn.execute('DELETE FROM schedule WHERE content_id = ?', (id,))
    
    # Delete the content
    conn.execute('DELETE FROM content WHERE id = ?', (id,))
    
    # If this was default or offline content, we need to update config
    if content['is_default'] or content['is_offline']:
        # Find new defaults
        new_default = conn.execute('SELECT url FROM content WHERE is_default = 1 LIMIT 1').fetchone()
        new_offline = conn.execute('SELECT url FROM content WHERE is_offline = 1 LIMIT 1').fetchone()
        
        main_url = new_default['url'] if new_default else ""
        offline_url = new_offline['url'] if new_offline else ""
        
        update_config_file(main_url, offline_url)
    
    conn.commit()
    conn.close()
    
    flash('Content deleted successfully')
    return redirect(url_for('dashboard'))

@app.route('/schedule/add', methods=['GET', 'POST'])
@login_required
def add_schedule():
    if request.method == 'POST':
        content_id = request.form['content_id']
        day_of_week = request.form['day_of_week']
        start_time = request.form['start_time']
        end_time = request.form['end_time']
        priority = request.form['priority']
        
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO schedule (content_id, day_of_week, start_time, end_time, priority)
            VALUES (?, ?, ?, ?, ?)
        ''', (content_id, day_of_week, start_time, end_time, priority))
        
        conn.commit()
        conn.close()
        
        flash('Schedule added successfully')
        return redirect(url_for('dashboard'))
    
    conn = get_db_connection()
    content_list = conn.execute('SELECT id, name FROM content').fetchall()
    conn.close()
    
    return render_template('add_schedule.html', content_list=content_list)

@app.route('/schedule/edit/<int:id>', methods=['GET', 'POST'])
@login_required
def edit_schedule(id):
    conn = get_db_connection()
    schedule = conn.execute('SELECT * FROM schedule WHERE id = ?', (id,)).fetchone()
    
    if not schedule:
        conn.close()
        flash('Schedule not found')
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        content_id = request.form['content_id']
        day_of_week = request.form['day_of_week']
        start_time = request.form['start_time']
        end_time = request.form['end_time']
        priority = request.form['priority']
        
        conn.execute('''
            UPDATE schedule 
            SET content_id = ?, day_of_week = ?, start_time = ?, end_time = ?, priority = ?
            WHERE id = ?
        ''', (content_id, day_of_week, start_time, end_time, priority, id))
        
        conn.commit()
        conn.close()
        
        flash('Schedule updated successfully')
        return redirect(url_for('dashboard'))
    
    content_list = conn.execute('SELECT id, name FROM content').fetchall()
    conn.close()
    
    return render_template('edit_schedule.html', schedule=schedule, content_list=content_list)

@app.route('/schedule/delete/<int:id>', methods=['POST'])
@login_required
def delete_schedule(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM schedule WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    
    flash('Schedule deleted successfully')
    return redirect(url_for('dashboard'))

@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'POST':
        current_password = request.form['current_password']
        new_password = request.form['new_password']
        confirm_password = request.form['confirm_password']
        
        if new_password != confirm_password:
            flash('New passwords do not match')
            return redirect(url_for('settings'))
        
        current_hash = hashlib.sha256(current_password.encode()).hexdigest()
        
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE id = ? AND password_hash = ?', 
                          (session['user_id'], current_hash)).fetchone()
        
        if not user:
            conn.close()
            flash('Current password is incorrect')
            return redirect(url_for('settings'))
        
        new_hash = hashlib.sha256(new_password.encode()).hexdigest()
        conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', 
                   (new_hash, session['user_id']))
        
        conn.commit()
        conn.close()
        
        flash('Password updated successfully')
        return redirect(url_for('settings'))
    
    return render_template('settings.html')

# API endpoints
@app.route('/api/current-content', methods=['GET'])
def api_current_content():
    """API endpoint to get current content based on schedule"""
    return jsonify(get_current_content())

@app.route('/content/<path:filename>')
def serve_content(filename):
    """Serve uploaded content files"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# Create templates directory and templates
def create_templates():
    templates_dir = os.path.join(os.path.dirname(__file__), 'templates')
    os.makedirs(templates_dir, exist_ok=True)
    
    # Create base template
    with open(os.path.join(templates_dir, 'base.html'), 'w') as f:
        f.write('''<!DOCTYPE html>
<html>
<head>
    <title>{% block title %}Kiosk Admin Panel{% endblock %}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css">
    <style>
        body { padding-top: 20px; }
        .flash-messages { margin-bottom: 20px; }
    </style>
    {% block head %}{% endblock %}
</head>
<body>
    <div class="container">
        {% if session.user_id %}
        <nav class="navbar navbar-expand-lg navbar-light bg-light mb-4">
            <div class="container-fluid">
                <a class="navbar-brand" href="{{ url_for('dashboard') }}">Kiosk Admin</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav">
                        <li class="nav-item">
                            <a class="nav-link" href="{{ url_for('dashboard') }}">Dashboard</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="{{ url_for('add_content') }}">Add Content</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="{{ url_for('add_schedule') }}">Add Schedule</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="{{ url_for('settings') }}">Settings</a>
                        </li>
                    </ul>
                    <ul class="navbar-nav ms-auto">
                        <li class="nav-item">
                            <span class="nav-link">Welcome, {{ session.username }}</span>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="{{ url_for('logout') }}">Logout</a>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
        {% endif %}
        
        <div class="flash-messages">
            {% for message in get_flashed_messages() %}
            <div class="alert alert-info">{{ message }}</div>
            {% endfor %}
        </div>
        
        {% block content %}{% endblock %}
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    {% block scripts %}{% endblock %}
</body>
</html>''')
    
    # Create login template
    with open(os.path.join(templates_dir, 'login.html'), 'w') as f:
        f.write('''{% extends "base.html" %}

{% block title %}Login - Kiosk Admin Panel{% endblock %}

{% block content %}
<div class="row justify-content-center">
    <div class="col-md-6">
        <div class="card">
            <div class="card-header">
                <h4>Login</h4>
            </div>
            <div class="card-body">
                <form method="post">
                    <div class="mb-3">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" class="form-control" id="username" name="username" required>
                    </div>
                    <div class="mb-3">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" class="form-control" id="password" name="password" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Login</button>
                </form>
            </div>
        </div>
    </div>
</div>
{% endblock %}''')
    
    # Create dashboard template
    with open(os.path.join(templates_dir, 'dashboard.html'), 'w') as f:
        f.write('''{% extends "base.html" %}

{% block title %}Dashboard - Kiosk Admin Panel{% endblock %}

{% block content %}
<h2>Dashboard</h2>

<div class="row mb-4">
    <div class="col-md-6">
        <div class="card">
            <div class="card-header">
                <h5>Current Status</h5>
            </div>
            <div class="card-body">
                <p><strong>Main URL:</strong> {{ main_url }}</p>
                <p><strong>Offline URL:</strong> {{ offline_url }}</p>
                <p><strong>Currently Showing:</strong> {{ current_content.name if current_content else 'Unknown' }}</p>
                <p><strong>URL:</strong> {{ current_content.url if current_content else 'Unknown' }}</p>
                <p><strong>Status:</strong> 
                    {% if current_content and current_content.is_offline %}
                        <span class="badge bg-warning">Offline Content</span>
                    {% else %}
                        <span class="badge bg-success">Online Content</span>
                    {% endif %}
                </p>
            </div>
        </div>
    </div>
    <div class="col-md-6">
        <div class="card">
            <div class="card-header">
                <h5>Quick Actions</h5>
            </div>
            <div class="card-body">
                <a href="{{ url_for('add_content') }}" class="btn btn-primary me-2">Add Content</a>
                <a href="{{ url_for('add_schedule') }}" class="btn btn-success me-2">Add Schedule</a>
                <a href="{{ url_for('settings') }}" class="btn btn-secondary">Settings</a>
            </div>
        </div>
    </div>
</div>

<div class="row">
    <div class="col-md-6">
        <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5>Content</h5>
                <a href="{{ url_for('add_content') }}" class="btn btn-sm btn-primary">Add New</a>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Default</th>
                                <th>Offline</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {% for content in content_list %}
                            <tr>
                                <td>{{ content.name }}</td>
                                <td>{{ content.type }}</td>
                                <td>{% if content.is_default %}<span class="badge bg-success">Yes</span>{% endif %}</td>
                                <td>{% if content.is_offline %}<span class="badge bg-warning">Yes</span>{% endif %}</td>
                                <td>
                                    <a href="{{ url_for('edit_content', id=content.id) }}" class="btn btn-sm btn-info">Edit</a>
                                    <form method="post" action="{{ url_for('delete_content', id=content.id) }}" class="d-inline">
                                        <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Are you sure?')">Delete</button>
                                    </form>
                                </td>
                            </tr>
                            {% else %}
                            <tr>
                                <td colspan="5" class="text-center">No content added yet</td>
                            </tr>
                            {% endfor %}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6">
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5>Schedule</h5>
                <a href="{{ url_for('add_schedule') }}" class="btn btn-sm btn-primary">Add New</a>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Content</th>
                                <th>Day</th>
                                <th>Time</th>
                                <th>Priority</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {% for schedule in schedule_list %}
                            <tr>
                                <td>{{ schedule.content_name }}</td>
                                <td>{{ schedule.day_of_week|capitalize }}</td>
                                <td>{{ schedule.start_time }} - {{ schedule.end_time }}</td>
                                <td>{{ schedule.priority }}</td>
                                <td>
                                    <a href="{{ url_for('edit_schedule', id=schedule.id) }}" class="btn btn-sm btn-info">Edit</a>
                                    <form method="post" action="{{ url_for('delete_schedule', id=schedule.id) }}" class="d-inline">
                                        <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Are you sure?')">Delete</button>
                                    </form>
                                </td>
                            </tr>
                            {% else %}
                            <tr>
                                <td colspan="5" class="text-center">No schedules added yet</td>
                            </tr>
                            {% endfor %}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
{% endblock %}''')
    
    # Create add content template
    with open(os.path.join(templates_dir, 'add_content.html'), 'w') as f:
        f.write('''{% extends "base.html" %}

{% block title %}Add Content - Kiosk Admin Panel{% endblock %}

{% block content %}
<h2>Add Content</h2>

<div class="card">
    <div class="card-body">
        <form method="post" enctype="multipart/form-data">
            <div class="mb-3">
                <label for="name" class="form-label">Name</label>
                <input type="text" class="form-control" id="name" name="name" required>
            </div>
            
            <div class="mb-3">
                <label for="type" class="form-label">Content Type</label>
                <select class="form-select" id="type" name="type" required>
                    <option value="url">External URL</option>
                    <option value="local">Local File</option>
                    <option value="html">HTML Content</option>
                </select>
            </div>
            
            <div class="mb-3">
                <label for="url" class="form-label">URL</label>
                <input type="text" class="form-control" id="url" name="url" 
                       placeholder="https://example.com or file:///path/to/file.html">
                <small class="form-text text-muted">For external content, provide full URL. For local content, this will be auto-filled when you upload a file.</small>
            </div>
            
            <div class="mb-3">
                <label for="file" class="form-label">Upload File</label>
                <input type="file" class="form-control" id="file" name="file">
                <small class="form-text text-muted">Upload HTML files, videos, or images for local content.</small>
            </div>
            
            <div class="mb-3 form-check">
                <input type="checkbox" class="form-check-input" id="is_default" name="is_default">
                <label class="form-check-label" for="is_default">Set as Default Online Content</label>
            </div>
            
            <div class="mb-3 form-check">
                <input type="checkbox" class="form-check-input" id="is_offline" name="is_offline">
                <label class="form-check-label" for="is_offline">Set as Default Offline Content</label>
            </div>
            
            <button type="submit" class="btn btn-primary">Add Content</button>
            <a href="{{ url_for('dashboard') }}" class="btn btn-secondary">Cancel</a>
        </form>
    </div>