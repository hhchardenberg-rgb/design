# HHC Social Media Image Generator - Deployment Guide

## 📦 Wat zit in deze package?

Complete web application voor het genereren van:
- ✅ Tekst Templates (Quote, Breaking News, Announcement, Carousel)
- ✅ HHC Collage Templates (2/3/4-panel collabes)
- ✅ HHC Eyecons Video Thumbnails (1920×1080)

## 🚀 Quick Start

### Optie 1: Staticfile Server (Voorkeur)

```bash
# Unzip het bestand
unzip social-media-image-generator.zip
cd social-media-image-generator

# Start een eenvoudige webserver
# Met Python:
python3 -m http.server 8000 --directory dist

# Of met Node.js:
npx http-server dist -p 8000

# Of met Live Server (VS Code extension)
# Open dist/index.html

# Bezoek: http://localhost:8000
```

### Optie 2: Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/social-media-generator/dist;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Optie 3: Apache

```apache
<Directory /var/www/social-media-generator/dist>
    Options -MultiViews
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^ index.html [QSA,L]
</Directory>
```

### Optie 4: Docker

```dockerfile
FROM nginx:latest

COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -t smig .
docker run -p 80:80 smig
```

## 📂 Structuur

```
social-media-image-generator/
├── dist/                    # Build output (klaar voor deployment)
│   ├── index.html
│   ├── assets/
│   │   ├── index-*.js       # JavaScript bundles
│   │   └── index-*.css      # Stylesheets
│   └── fonts/               # HHC fonts (FF DIN)
├── public/                  # Static assets
│   └── fonts/               # HHC fonts in src
├── src/                     # Source code (niet nodig op server)
└── package.json             # Project info
```

## 🔧 Vereisten

- Moderne webbrowser (Chrome, Firefox, Safari, Edge)
- Geen backend nodig - alles werkt in de browser
- JavaScript moet ingeschakeld zijn
- Minimaal 100MB vrije ruimte

## ✨ Features

### Tekst Templates
- Real-time tekst preview
- Automatische font sizing
- PSD file import
- PNG/JPG export
- Achtergrond foto uploaden & positioneren

### Collage Templates
- 6 verschillende layouts
- Meerdere foto's uploaden
- Per foto: verplaatsen & inzoomen
- Oranje HHC scheidingslijnen
- PNG export

### Thumbnails
- 1920×1080 video thumbnails
- Achtergrondfoto upload
- Naam & quote input
- Slagschaduw tekst
- Oranje HHC zijbalken

## 🌐 Server Requirements

- **Webserver**: Any (Apache, Nginx, IIS, Node.js, Python, etc.)
- **HTTPS**: Aanbevolen (voor file uploads)
- **CORS**: Niet nodig (app werkt volledig client-side)
- **Database**: Niet nodig
- **Runtime**: Browsers with ES2020 support

## 📦 Fonts Included

- FF_DIN_Medium.otf
- FF_DIN_Bold.otf
- FF_DIN_Black.otf
- FF_DIN_Medium_Italic.otf

Fonts zijn ingebouwd in de CSS (`@font-face`).

## 🔒 Privacy & Security

- ✅ Alle verwerking gebeurt in de browser
- ✅ Geen data naar server gestuurd
- ✅ Geen cookies of tracking
- ✅ Offline werking ondersteund
- ✅ Afbeeldingen worden niet opgeslagen

## 🐛 Troubleshooting

### "Cannot find fonts"
- Controleer of `public/fonts/` met fonts meegeleverd is
- Fonts worden via @font-face geladen

### "Images not loading"
- Check browser console (F12) voor CORS errors
- Zorg dat imageUrl van dezelfde server komt of CORS-headers heeft

### "Export knop werkt niet"
- Controleer browser console voor errors
- Canvas rendering kan falen bij bepaalde browsers
- Probeer ander format (PNG vs JPG)

### "Preview niet live updating"
- Refresh de pagina
- Check browser developer tools (F12)
- Zorg dat JavaScript enabled is

## 📞 Support

Voor vragen over de app:
1. Check browser console (F12) voor errors
2. Zorg dat alle fonts gedownload zijn
3. Probeer in incognito/private mode
4. Update naar latest browser

## 📄 Licentie

HHC Branding & Fonts: Eigendom van HHC Hardenberg

---

**Version**: 1.0
**Last Updated**: 2026-05-14
**Built with**: React, TypeScript, Tailwind CSS, Vite
