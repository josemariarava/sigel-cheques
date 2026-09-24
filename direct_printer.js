const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const testFile = path.join(__dirname, `direct_printer.bin`);
const b = [];
b.push(0x1B, 0x40);       // ESC @ reset
b.push(...Buffer.from('DIRECT PRINTER TEST\n', 'latin1'));
b.push(0x0C);

fs.writeFileSync(testFile, Buffer.from(b));

// Try accessing printer by name directly (not through SMB)
const cmds = [
  `cmd.exe /c copy /b "${testFile}" "EPSON TM-H6000VI Slip"`,
  `cmd.exe /c type "${testFile}" > "EPSON TM-H6000VI Slip"`,
];

let i = 0;
function runNext() {
  if (i >= cmds.length) {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    console.log('All tests done');
    return;
  }
  console.log('Running:', cmds[i]);
  exec(cmds[i], (err) => {
    if (err) console.error('FAILED:', err.message);
    else console.log('OK');
    i++;
    setTimeout(runNext, 1000);
  });
}
runNext();
