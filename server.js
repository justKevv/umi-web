// Minimal static server + API using only built-in Node modules and postgres.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    fullname text,
    email text UNIQUE,
    password_hash text,
    salt text
  )`;
}

function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('Not found');
      return;
    }
    res.writeHead(200, {'Content-Type': map[ext] || 'application/octet-stream'});
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const obj = JSON.parse(body || '{}');
        resolve(obj);
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function hashPassword(password, salt) {
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');
  return hash.toString('hex');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/register' && req.method === 'POST') {
      const body = await parseBody(req);
      const { fullname, email, password } = body;
      if (!email || !password) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: false, message: 'Email and password required' }));
        return;
      }
      // check exists
      const existing = await sql`SELECT id FROM users WHERE email=${email}`;
      if (existing.length) {
        res.writeHead(409, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: false, message: 'Email already registered' }));
        return;
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const password_hash = hashPassword(password, salt);
      await sql`INSERT INTO users (fullname, email, password_hash, salt) VALUES (${fullname}, ${email}, ${password_hash}, ${salt})`;
      res.writeHead(201, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ ok: true, message: 'Registered' }));
      return;
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const { email, password } = body;
      if (!email || !password) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: false, message: 'Email and password required' }));
        return;
      }
      const rows = await sql`SELECT id, fullname, email, password_hash, salt FROM users WHERE email=${email} LIMIT 1`;
      if (!rows || !rows.length) {
        res.writeHead(401, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: false, message: 'Invalid credentials' }));
        return;
      }
      const user = rows[0];
      const computed = hashPassword(password, user.salt);
      if (computed !== user.password_hash) {
        res.writeHead(401, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: false, message: 'Invalid credentials' }));
        return;
      }
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ ok: true, message: 'Logged in', user: { id: user.id, fullname: user.fullname, email: user.email } }));
      return;
    }

    // Serve static files from project root
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, filePath);
    // prevent path traversal
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveStatic(req, res, filePath);
      return;
    }
    // try index.html in folder
    if (fs.existsSync(filePath + '/index.html')) {
      serveStatic(req, res, filePath + '/index.html');
      return;
    }

    res.writeHead(404, {'Content-Type':'text/plain'});
    res.end('Not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ ok:false, message: 'Server error' }));
  }
});

ensureSchema().then(() => {
  server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to set up DB schema', err);
  process.exit(1);
});
