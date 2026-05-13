const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  if (!process.env.IMGBB_API_KEY) {
    console.warn('AVISO: IMGBB_API_KEY no está configurada. Las subidas fallarán.');
  }
});
