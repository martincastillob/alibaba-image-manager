# Gestor de Imágenes para Catálogo Alibaba.com

Herramienta web pública para que clientes suban imágenes de producto, las organicen por grupos, y descarguen un Excel con URLs públicas listas para importar en Alibaba.com.

- **Subida**: ImgBB (gratis, ilimitado)
- **Backend**: Node.js + Express (compatible con Vercel serverless)
- **Frontend**: HTML + CSS + JavaScript (sin frameworks)
- **Despliegue**: Vercel (gratis para siempre)

---

## ¿Cómo funciona?

1. El cliente abre el link público — el servidor le asigna un **sessionId único**.
2. Sube sus imágenes, las organiza en **grupos de producto** (entre 3 y 6 imágenes por producto). Las que no asigne también se procesan como filas individuales.
3. Pulsa "Subir" — el servidor sube cada imagen a **ImgBB** con un nombre normalizado.
4. Descarga un **Excel** con el formato oficial de Alibaba:
   - Columna A: `* Product title`
   - Columnas B-G: `* Product image 1` ... `Product image 6`

Cada sesión es independiente. Refrescar la página inicia una nueva sesión.

---

## Estructura del proyecto

```
/
├── public/             # Frontend (HTML, CSS, JS) — Vercel lo sirve como static
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server/             # Lógica del backend
│   ├── app.js          # Express app (sin .listen)
│   ├── index.js        # Launcher para dev local
│   ├── uploader.js     # Subida a ImgBB
│   ├── excel.js        # Generación del Excel
│   └── session.js      # UUID v4 por sesión
├── api/
│   └── index.js        # Entry point para Vercel (apunta a server/app.js)
├── vercel.json         # Config de Vercel (rewrites + timeout)
├── package.json
├── .env / .env.example / .gitignore
└── README.md
```

---

## Correr en local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables
cp .env.example .env
# Edita .env y pon tu IMGBB_API_KEY

# 3. Arrancar
npm start
```

Abre http://localhost:3000

### Obtener la API key de ImgBB

1. Crea cuenta gratis en https://imgbb.com/
2. Ve a https://api.imgbb.com/ → "About the API" → "Get API key"
3. Copia la clave generada y ponla en `.env`

---

## Desplegar en Vercel (gratis)

### Paso 1: Subir el proyecto a GitHub

```bash
# desde la carpeta del proyecto
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/alibaba-image-manager.git
git push -u origin main
```

Verifica en GitHub que el archivo `.env` **no** se subió (debe estar excluido por `.gitignore`).

### Paso 2: Conectar el repo a Vercel

1. Entra a https://vercel.com/ y crea cuenta con GitHub.
2. Pulsa **"Add New..."** → **"Project"**.
3. Selecciona tu repo `alibaba-image-manager` y pulsa **"Import"**.
4. En la pantalla de configuración:
   - **Framework Preset**: deja "Other" (Vercel detecta automáticamente).
   - **Root Directory**: deja vacío.
   - **Build / Output**: no toques nada.

### Paso 3: Añadir la variable de entorno

Antes de pulsar "Deploy":

1. Despliega la sección **"Environment Variables"**.
2. Añade:
   - **Name**: `IMGBB_API_KEY`
   - **Value**: tu API key de ImgBB
3. Pulsa **"Deploy"**.

### Paso 4: ¡Listo!

Vercel construye el proyecto en ~30 segundos y te da una URL pública del estilo:
```
https://alibaba-image-manager-xxx.vercel.app
```

Compártela con tus clientes.

### Despliegues automáticos

A partir de aquí, cada `git push` a la rama `main` redesplegará el sitio automáticamente.

---

## Endpoints API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/session` | Devuelve `{ sessionId }` único. |
| `POST` | `/api/upload` | Sube una imagen a ImgBB. Body multipart: `image`, `sessionId`, `productName`, `index`. |
| `POST` | `/api/excel` | Devuelve el `.xlsx`. Body JSON: `{ groups, unassigned }`. |
| `GET` | `/api/health` | Devuelve `{ ok: true }`. |

---

## Validaciones

| Regla | Tipo | Dónde |
|---|---|---|
| Formato JPG o PNG | Error bloqueante | Cliente + servidor (magic bytes) |
| Peso máximo 4MB | Error bloqueante | Cliente + servidor (multer) |
| Resolución mínima 800×800px | Advertencia (no bloquea) | Cliente |
| Grupo con 3–6 imágenes | Advertencia (confirma para continuar) | Cliente |

> El tope de **4MB** está alineado con el límite de body de Vercel en plan gratis (4.5MB). En la práctica las fotos de producto comprimidas suelen ser de 200KB a 1.5MB.

---

## Notas de Vercel + serverless

- **Sin sleep**: a diferencia de Render, Vercel no apaga la función. Tiene cold start de ~1 segundo en peticiones tras inactividad, pero sigue siendo mucho mejor que los 30-50s de Render.
- **Rate limiting**: `express-rate-limit` usa memoria local. En serverless cada invocación puede ser una instancia nueva, así que el rate limit solo cubre invocaciones "warm". Es protección parcial — si necesitas algo más robusto, usa Upstash Redis (free tier).
- **Sin archivos temporales**: `multer` usa `memoryStorage`, los buffers se descartan al terminar la petición.

---

## Cambiar de proveedor de imágenes

La lógica de subida está aislada en `server/uploader.js` con una única función `uploadImage(buffer, filename)`. Para cambiar a Cloudinary, R2, B2, etc. solo hay que reescribir esa función.
