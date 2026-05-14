# 🌐 Deployment op Productie Server

De app is volledig statisch en werkt op elke webserver (Apache, Nginx, cPanel, Plesk, etc).

## 📤 Upload naar Server

### Optie 1: Via FTP/SFTP (Eenvoudigste)

1. **Download de files:**
   - Download `dist/` folder van je project

2. **Upload naar web root:**
   - Verbind via FTP/SFTP naar je server
   - Upload de inhoud van de `dist/` folder naar je website root:
     ```
     /public_html/        (cPanel)
     /home/username/      (Plesk)
     /var/www/html/       (VPS)
     ```

3. **Check het werkt:**
   - Open `https://jouwdomein.nl` in je browser
   - App laadt en fonts zien er goed uit ✓

### Optie 2: Via Git Deploy (Voor Developers)

Als je Git op je server hebt:

```bash
# SSH naar server
ssh user@jouwserver.nl

# Clone / pull de repo naar je web directory
cd /var/www/html
git clone <your-repo-url>
cd design
npm install
npm run build

# De dist/ folder is nu klaar
```

### Optie 3: Automatisch (GitHub Actions)

Voeg dit toe aan `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Server

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build
        run: |
          npm install
          npm run build
      
      - name: Deploy
        uses: burnett01/rsync-deployments@5.2
        with:
          switches: -avz --delete
          path: dist/
          remote_path: /var/www/html/
          remote_host: jouwserver.nl
          remote_user: ${{ secrets.DEPLOY_USER }}
          remote_key: ${{ secrets.DEPLOY_KEY }}
```

## ⚙️ Server Configuratie (Optional)

### Apache (.htaccess)

Voeg dit toe aan `.htaccess` in je web root (optioneel, voor SPA routing):

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Cache busting
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 1 minute"
  ExpiresByType application/javascript "access plus 30 days"
  ExpiresByType text/css "access plus 30 days"
  ExpiresByType font/opentype "access plus 30 days"
</IfModule>
```

### Nginx (server config)

```nginx
server {
    listen 80;
    server_name jouwdomein.nl;
    root /var/www/html;
    
    # Cache static assets
    location ~* \.(js|css|woff2|otf|png|jpg|svg)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # Always serve index.html for client routing
    location / {
        try_files $uri /index.html;
    }
}
```

## 🔒 SSL/HTTPS

De meeste moderne hosters bieden gratis SSL via Let's Encrypt. Zorg dat je:
- ✓ HTTPS inschakelt in je hosting panel
- ✓ HTTP redirect naar HTTPS ingesteld hebt

## ✅ Checklist na Upload

- [ ] App laadt op `https://jouwdomein.nl`
- [ ] Alle tabs werken (Tekst, Collage, Thumbnail)
- [ ] Fonts (FF DIN) zien er correct uit
- [ ] Foto's uploaden werkt
- [ ] PNG/JPG export werkt
- [ ] Geen rode errors in browser console (F12)

## 🐛 Problemen?

### Witte pagina / App laadt niet
- Check browser console (F12) op errors
- Verifieer dat alle files zijn geupload (js, css, fonts in dist/assets/fonts/)

### Fonts zien er raar uit
- Check dat `/dist/fonts/` folder volledig is geupload
- Controleer CORS headers (meestal automatisch op je own server)

### 404 Errors op refresh
- Dit is normaal voor SPAs. De `.htaccess` (Apache) of Nginx config hierboven lost dit op
- Of contact je hosting support om rewrite rules in te schakelen

---

**Dat's het!** 🎉 Je app draait nu live.
