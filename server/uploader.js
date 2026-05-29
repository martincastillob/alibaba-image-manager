const cloudinary = require('cloudinary').v2;

let configured = false;

function ensureConfig() {
  if (configured) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Faltan credenciales de Cloudinary (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).'
    );
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

/**
 * Sube una imagen a Cloudinary y devuelve su URL pública permanente.
 *
 * Contrato intercambiable: para cambiar de proveedor (Aliyun OSS, R2, etc.)
 * solo hay que reescribir esta función manteniendo la misma firma y retorno.
 *
 * @param {Buffer} buffer - bytes de la imagen
 * @param {object} opts - { sessionId, productName, index, ext }
 * @returns {Promise<{ url: string, filename: string }>}
 */
function uploadImage(buffer, opts = {}) {
  ensureConfig();

  const {
    sessionId = 'sin-sesion',
    productName = 'producto',
    index = 1,
    ext = 'jpg',
  } = opts;

  const baseName = `${productName}-${index}`;
  // Mantiene el aislamiento por sesión y producto del spec original:
  // alibaba-catalogo/{sessionId}/{producto}/{producto}-N
  const folder = `alibaba-catalogo/${sessionId}/${productName}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: baseName,
        resource_type: 'image',
        overwrite: true,
        unique_filename: false,
        use_filename: false,
      },
      (err, result) => {
        if (err) {
          return reject(new Error(`Cloudinary rechazó la subida: ${err.message || 'error desconocido'}`));
        }
        if (!result || !result.secure_url) {
          return reject(new Error('Cloudinary no devolvió una URL.'));
        }
        resolve({ url: result.secure_url, filename: `${baseName}.${ext}` });
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadImage };
