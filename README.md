1) Pasang dependensi

```bash
npm install postgres
```

2) Buat database
Windows (PowerShell):

```powershell
# jalankan PowerShell sebagai user yang punya akses ke psql
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE moviedb;"
# opsional: buat user
psql -U postgres -h localhost -p 5432 -c "CREATE USER webuser WITH PASSWORD 'secret';"
psql -U postgres -h localhost -p 5432 -c "GRANT ALL PRIVILEGES ON DATABASE moviedb TO webuser;"
```

3) Jalankan server
Windows (PowerShell):

```powershell
$env:DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/moviedb'
$env:PORT = '3000'
node server.js
```

4) Buka browser

- http://localhost:3000/register.html
- http://localhost:3000/login.html

