const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

(async () => {
  const pdf = await PDFDocument.create();

  for (let i = 1; i <= 3; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Test Page ${i}`, { x: 50, y: 780, size: 24 });
  }

  fs.writeFileSync(
    'scripts/test-3page.pdf',
    await pdf.save()
  );

  console.log('Created scripts/test-3page.pdf');
})();
