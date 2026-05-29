require('dotenv').config();

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { newSessionId } = require('./session');
const { uploadImage } = require('./uploader');
const { generateExcel } = require('./excel');

// 4MB para mantenerse bajo el tope de 4.5MB de Vercel en plan gratis.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '4MB';

const app = express();

// Necesario para que express-rate-limit lea la IP real detrás del proxy (Vercel/Render/Railway).
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));

// Nota: en serverless (Vercel) cada invocación es independiente, así que estos limitadores
// solo dan cobertura durante invocaciones "warm". Las validaciones de MIME y tamaño siguen
// activas siempre.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Espera un momento.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas subidas en poco tiempo. Espera un momento.' },
});

app.use(generalLimiter);

// En local servimos los estáticos directamente desde Express.
// En Vercel, los archivos de /public se sirven automáticamente como estáticos
// y esta línea queda sin uso (no estorba).
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

function sanitizeProductName(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function detectImageType(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  return null;
}

app.get('/api/session', (req, res) => {
  res.json({ sessionId: newSessionId() });
});

app.post('/api/upload', uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    }

    const { sessionId, productName, index } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId inválido.' });
    }
    if (!productName || typeof productName !== 'string') {
      return res.status(400).json({ error: 'Nombre de producto requerido.' });
    }
    const indexNum = parseInt(index, 10);
    if (Number.isNaN(indexNum) || indexNum < 1) {
      return res.status(400).json({ error: 'Índice de imagen inválido.' });
    }

    const type = detectImageType(req.file.buffer);
    if (!type) {
      return res
        .status(400)
        .json({ error: 'Formato inválido. Solo se aceptan JPG o PNG.' });
    }

    const safeName = sanitizeProductName(productName);
    if (!safeName) {
      return res
        .status(400)
        .json({ error: 'El nombre del producto no contiene caracteres válidos.' });
    }

    const result = await uploadImage(req.file.buffer, {
      sessionId,
      productName: safeName,
      index: indexNum,
      ext: type.ext,
      mime: type.mime,
    });

    return res.json({
      success: true,
      url: result.url,
      filename: result.filename,
    });
  } catch (err) {
    console.error('[upload] error:', err.message);
    return res
      .status(500)
      .json({ error: err.message || 'Error al subir la imagen.' });
  }
});

app.post('/api/excel', async (req, res) => {
  try {
    const { groups, unassigned } = req.body;

    const cleanGroups = Array.isArray(groups)
      ? groups
          .map((g) => ({
            name: typeof g.name === 'string' ? g.name.trim() : '',
            images: Array.isArray(g.images)
              ? g.images.filter(
                  (i) => i && typeof i.filename === 'string' && typeof i.url === 'string'
                )
              : [],
          }))
          .filter((g) => g.images.length > 0)
      : [];

    const cleanUnassigned = Array.isArray(unassigned)
      ? unassigned.filter(
          (i) => i && typeof i.filename === 'string' && typeof i.url === 'string'
        )
      : [];

    if (cleanGroups.length === 0 && cleanUnassigned.length === 0) {
      return res.status(400).json({ error: 'No hay imágenes válidas para exportar.' });
    }

    const buffer = await generateExcel({
      groups: cleanGroups,
      unassigned: cleanUnassigned,
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `alibaba-imagenes-${dateStr}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[excel] error:', err.message);
    return res.status(500).json({ error: 'Error al generar el Excel.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(400)
        .json({ error: `La imagen supera el límite de ${MAX_FILE_SIZE_LABEL}.` });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
