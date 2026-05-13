const axios = require('axios');
const FormData = require('form-data');

const IMGBB_URL = 'https://api.imgbb.com/1/upload';

async function uploadImage(buffer, filename) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error('IMGBB_API_KEY no está configurada en el entorno');
  }

  const form = new FormData();
  form.append('key', apiKey);
  form.append('image', buffer.toString('base64'));
  form.append('name', filename);

  let response;
  try {
    response = await axios.post(IMGBB_URL, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000,
    });
  } catch (err) {
    const apiMsg = err.response?.data?.error?.message || err.message;
    throw new Error(`ImgBB rechazó la subida: ${apiMsg}`);
  }

  const data = response.data?.data;
  if (!data?.url) {
    throw new Error('Respuesta inesperada de ImgBB (sin URL)');
  }

  return {
    url: data.url,
    displayUrl: data.display_url || data.url,
    deleteUrl: data.delete_url || null,
  };
}

module.exports = { uploadImage };
