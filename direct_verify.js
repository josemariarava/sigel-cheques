const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Test 1: Simple text via copy /b
const PRINTER = "\\\\127.0.0.1\\EPSONSLIP";
const testBin = path.join(__dirname, `simple.bin`);
fs.writeFileSync(testBin, Buffer.from('HELLO DIRECT\n'));

const cmd1 = `cmd.exe /c copy /b "${testBin}" "${PRINTER}"`;
exec(cmd1, (err) => {
  if (fs.existsSync(testBin)) fs.unlinkSync(testBin);
  if (err) console.error('Test 1 FAILED:', err.message);
  else console.log('Test 1 OK');
  
  // Test 2: Simple text via print command
  const testTxt = path.join(__dirname, `simple.txt`);
  fs.writeFileSync(testTxt, 'HELLO PRINT CMD\n');
  const cmd2 = `cmd.exe /c type "${testTxt}" > "${PRINTER}"`;
  setTimeout(() => {
    exec(cmd2, (err) => {
      if (fs.existsSync(testTxt)) fs.unlinkSync(testTxt);
      if (err) console.error('Test 2 FAILED:', err.message);
      else console.log('Test 2 OK');
    });
  }, 1000);
});
