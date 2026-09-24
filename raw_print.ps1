param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$src = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFO di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
}
"@

try { Add-Type -TypeDefinition $src -ErrorAction Stop }
catch { Write-Output ("ADDTYPE_FAIL: " + $_.Exception.Message); exit 10 }

$h = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Write-Output ("OPEN_FAIL: " + $err)
  exit 2
}

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$di = New-Object RawPrinter+DOCINFO
$di.pDocName = "cheque"
$di.pOutputFile = $null
$di.pDataType = "RAW"

if (-not [RawPrinter]::StartDocPrinter($h, 1, $di)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [RawPrinter]::ClosePrinter($h) | Out-Null
  Write-Output ("STARTDOC_FAIL: " + $err)
  exit 3
}

[RawPrinter]::StartPagePrinter($h) | Out-Null
$written = 0
$ok = [RawPrinter]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)
$err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
[RawPrinter]::EndPagePrinter($h) | Out-Null
[RawPrinter]::EndDocPrinter($h) | Out-Null
[RawPrinter]::ClosePrinter($h) | Out-Null

if (-not $ok) {
  Write-Output ("WRITE_FAIL: " + $err)
  exit 4
}
if ($written -ne $bytes.Length) {
  Write-Output ("PARTIAL: $written/$($bytes.Length)")
  exit 5
}

Write-Output ("OK: $written bytes")
exit 0
