const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PRINTER_SHARE = "\\\\127.0.0.1\\EPSONPOS";
const testFile = path.join(__dirname, `test_receipt2.txt`);
fs.writeFileSync(testFile, 'HOLA DESDE RECEIPTER\n');

const cmd = `cmd.exe /c copy /b "${testFile}" "${PRINTER_SHARE}"`;
console.log('Sending simple text to EPSONPOS...');
exec(cmd, (error, stdout, stderr) => {
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  if (error) { console.error('ERROR:', error.message); return; }
  console.log('OK - check the receipt roll');
  console.log('STDOUT:', stdout);
  console.log('STDERR:', stderr);
});
