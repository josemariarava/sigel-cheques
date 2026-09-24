const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PRINTER_SHARE = "\\\\127.0.0.1\\EPSONPOS";
const testFile = path.join(__dirname, `test_receipt.bin`);
const b = [];
b.push(0x1B, 0x40);       // ESC @ reset
b.push(...Buffer.from('HELLO RECEIPTER\n', 'latin1'));
b.push(0x0C);
fs.writeFileSync(testFile, Buffer.from(b));

const cmd = `cmd.exe /c copy /b "${testFile}" "${PRINTER_SHARE}"`;
console.log('Sending to EPSONPOS...');
exec(cmd, (error) => {
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  if (error) console.error('ERROR:', error.message);
  else console.log('OK - Sent to EPSONPOS');
});
