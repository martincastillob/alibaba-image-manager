const ExcelJS = require('exceljs');

const MAX_IMAGES_PER_PRODUCT = 6;

const HEADERS = [
  '* Product title',
  '* Product image 1',
  'Product image 2',
  'Product image 3',
  'Product image 4',
  'Product image 5',
  'Product image 6',
];

async function generateExcel({ groups = [], unassigned = [] }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alibaba Image Manager';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Imagenes');

  sheet.columns = HEADERS.map((h, i) => ({
    header: h,
    key: `c${i}`,
    width: i === 0 ? 38 : 55,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 24;

  let rowIndex = 2;

  // Una fila por grupo (producto), con hasta 6 URLs en columnas B-G
  for (const group of groups) {
    if (!Array.isArray(group.images) || group.images.length === 0) continue;
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = group.name;

    group.images.slice(0, MAX_IMAGES_PER_PRODUCT).forEach((img, i) => {
      const cell = row.getCell(2 + i);
      cell.value = { text: img.url, hyperlink: img.url };
      cell.font = { color: { argb: 'FF2563EB' }, underline: true };
    });

    rowIndex++;
  }

  // Una fila por imagen sin asignar, usando el filename como identificador
  for (const img of unassigned) {
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = img.filename;
    const cell = row.getCell(2);
    cell.value = { text: img.url, hyperlink: img.url };
    cell.font = { color: { argb: 'FF2563EB' }, underline: true };
    rowIndex++;
  }

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcel };
