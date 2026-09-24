const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PRINTER_SHARE = "\\\\127.0.0.1\\EPSONSLIP";
const testFile = path.join(__dirname, `direct_test.bin`);

const b = [];
b.push(0x1B, 0x40);       // ESC @ reset
b.push(0x1B, 0x63, 0x30, 0x04); // ranura frontal
b.push(0x1D, 0x50, 160, 160);   // GS P 160 160
b.push(0x1B, 0x4D, 0x00);       // ESC M fuente A
b.push(0x1B, 0x4C);               // ESC L Page Mode ON
const across = Math.round(70 * 160 / 25.4);
const deep = Math.round(170 * 160 / 25.4);
b.push(0x1B, 0x57, 0x00, 0x00, 0x00, 0x00,
  across & 0xFF, (across >> 8) & 0xFF,
  deep & 0xFF, (deep >> 8) & 0xFF);
b.push(0x1B, 0x54, 0x01);        // ESC T 1 90 CW
b.push(0x1B, 0x24, 0x00, 0x00);  // ESC $ posicion
b.push(...Buffer.from('DIRECT TEST OK!\n', 'latin1'));
b.push(0x0C);                      // FF feed

fs.writeFileSync(testFile, Buffer.from(b));
const cmd = `cmd.exe /c copy /b "${testFile}" "${PRINTER_SHARE}"`;
exec(cmd, (error) => {
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  if (error) console.error('ERROR:', error.message);
  else console.log('Sent!');
});
