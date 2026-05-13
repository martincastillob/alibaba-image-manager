// Entry point para Vercel (serverless function).
// Toda petición que coincida con el rewrite de vercel.json llega aquí
// y se delega al Express app, que decide la ruta interna.
module.exports = require('../server/app');
