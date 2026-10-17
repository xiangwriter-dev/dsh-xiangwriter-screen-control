<#
.SYNOPSIS
  Screen Control engine for the dsh-screen-control plugin.

.DESCRIPTION
  A long-lived JSON-lines worker (or a one-shot request runner) that exposes
  Windows desktop capture, mouse/keyboard injection, window management and UI
  Automation snapshots to the DeepSeek Harness plugin.

  Wire protocol (one JSON object per line):
    request : {"id":"1","op":"info","args":{...}}
    response: {"id":"1","ok":true,"result":{...}}
              {"id":"1","ok":false,"error":{"code":"E_ARGS","message":"..."}}

  Modes:
    (default)        read requests from stdin until EOF or idle timeout
    -Once            run -RequestFile once, write -ResponseFile, exit
    -SelfTest        print one info + one small capture as JSON, exit
    -Validate        compile native bindings and print info, exit 0/1

  Requires Windows PowerShell 5.1 (no PowerShell 7 features are used).
#>
[CmdletBinding()]
param(
  [switch]$Once,
  [switch]$SelfTest,
  [switch]$Validate,
  [switch]$CompileOnly,
  [int]$IdleTimeoutSec = 1800,
  [string]$RequestFile,
  [string]$ResponseFile
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$script:OutLines = New-Object System.Collections.ArrayList
$script:Once = [bool]$Once
$script:FailsafeUntil = [DateTime]::MinValue
$script:LastRequestAt = [DateTime]::UtcNow

function Write-Line([string]$line) {
  if ($script:Once) { [void]$script:OutLines.Add($line); return }
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}

function Send-Result($id, $result) {
  $payload = @{ id = $id; ok = $true; result = $result }
  Write-Line ($payload | ConvertTo-Json -Depth 10 -Compress)
}

function Send-Error($id, [string]$code, [string]$message) {
  $payload = @{ id = $id; ok = $false; error = @{ code = $code; message = $message } }
  Write-Line ($payload | ConvertTo-Json -Depth 6 -Compress)
}

function New-CodedError([string]$code, [string]$message) {
  $e = New-Object System.Exception($message)
  $e.Data['code'] = $code
  return $e
}

# BEGIN NATIVE
$nativeSource = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class ScreenCtl
{
    public const int SM_XVIRTUALSCREEN = 76;
    public const int SM_YVIRTUALSCREEN = 77;
    public const int SM_CXVIRTUALSCREEN = 78;
    public const int SM_CYVIRTUALSCREEN = 79;
    public const int SM_CXSCREEN = 0;
    public const int SM_CYSCREEN = 1;

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const uint MOUSEEVENTF_HWHEEL = 0x01000;

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION u; }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("user32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr param);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);

    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int width, int height);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDest, int x, int y, int w, int h, IntPtr hdcSrc, int sx, int sy, int rop);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder exeName, ref int size);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr handle);

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    public static string ProcessNameOf(uint pid)
    {
        IntPtr handle = IntPtr.Zero;
        try
        {
            handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (handle == IntPtr.Zero) return "";
            StringBuilder buffer = new StringBuilder(1024);
            int size = buffer.Capacity;
            if (!QueryFullProcessImageNameW(handle, 0, buffer, ref size)) return "";
            string path = buffer.ToString(0, size);
            return System.IO.Path.GetFileNameWithoutExtension(path);
        }
        catch
        {
            return "";
        }
        finally
        {
            if (handle != IntPtr.Zero) CloseHandle(handle);
        }
    }

    public static void EnableDpiAwareness()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); return; } catch { }
        try { SetProcessDPIAware(); } catch { }
    }

    public static bool IsInteractiveDesktop()
    {
        IntPtr desk = OpenInputDesktop(0, false, 0x0001);
        if (desk == IntPtr.Zero) return false;
        CloseDesktop(desk);
        return true;
    }

    public static POINT Cursor()
    {
        POINT p;
        if (!GetCursorPos(out p)) throw new InvalidOperationException("GetCursorPos failed");
        return p;
    }

    public static void Move(int x, int y)
    {
        if (!SetCursorPos(x, y)) throw new InvalidOperationException("SetCursorPos failed");
    }

    public static int[] VirtualScreen()
    {
        return new int[] {
            GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN),
            GetSystemMetrics(SM_CXVIRTUALSCREEN), GetSystemMetrics(SM_CYVIRTUALSCREEN)
        };
    }

    public static WindowInfo DescribeWindow(IntPtr hwnd, IntPtr foreground)
    {
        WindowInfo info = new WindowInfo();
        info.Hwnd = hwnd.ToInt64();
        StringBuilder title = new StringBuilder(512);
        GetWindowTextW(hwnd, title, 512);
        info.Title = title.ToString();
        StringBuilder cls = new StringBuilder(256);
        GetClassNameW(hwnd, cls, 256);
        info.ClassName = cls.ToString();
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        info.Pid = pid;
        try { info.Process = ProcessNameOf(pid); } catch { info.Process = ""; }
        RECT r;
        if (GetWindowRect(hwnd, out r))
        {
            info.X = r.Left; info.Y = r.Top;
            info.Width = r.Right - r.Left; info.Height = r.Bottom - r.Top;
        }
        info.Visible = IsWindowVisible(hwnd);
        info.Minimized = IsIconic(hwnd);
        info.Foreground = hwnd == foreground;
        return info;
    }

    public static WindowInfo Foreground()
    {
        IntPtr fg = GetForegroundWindow();
        if (fg == IntPtr.Zero) return null;
        return DescribeWindow(fg, fg);
    }

    public static WindowInfo[] ListWindows()
    {
        List<WindowInfo> list = new List<WindowInfo>();
        IntPtr fg = GetForegroundWindow();
        EnumWindowsProc callback = delegate(IntPtr hwnd, IntPtr param)
        {
            WindowInfo info = DescribeWindow(hwnd, fg);
            if (info.Title.Length > 0 && info.Visible) list.Add(info);
            return true;
        };
        EnumWindows(callback, IntPtr.Zero);
        GC.KeepAlive(callback);
        return list.ToArray();
    }

    public static bool FocusWindow(IntPtr hwnd)
    {
        if (IsIconic(hwnd)) ShowWindow(hwnd, 9);
        IntPtr fg = GetForegroundWindow();
        uint fgThread = 0;
        if (fg != IntPtr.Zero) GetWindowThreadProcessId(fg, out fgThread);
        uint self = GetCurrentThreadId();
        bool attached = false;
        if (fgThread != 0) attached = AttachThreadInput(self, fgThread, true);
        bool ok = SetForegroundWindow(hwnd);
        if (attached) AttachThreadInput(self, fgThread, false);
        return ok;
    }

    public static Bitmap CaptureRect(int x, int y, int width, int height)
    {
        IntPtr screenDc = GetDC(IntPtr.Zero);
        if (screenDc == IntPtr.Zero) throw new InvalidOperationException("GetDC failed");
        IntPtr memDc = CreateCompatibleDC(screenDc);
        IntPtr hBmp = CreateCompatibleBitmap(screenDc, width, height);
        IntPtr old = SelectObject(memDc, hBmp);
        bool ok = BitBlt(memDc, 0, 0, width, height, screenDc, x, y, 0x00CC0020);
        SelectObject(memDc, old);
        DeleteDC(memDc);
        ReleaseDC(IntPtr.Zero, screenDc);
        if (!ok)
        {
            DeleteObject(hBmp);
            throw new InvalidOperationException("BitBlt failed");
        }
        Bitmap bmp = Image.FromHbitmap(hBmp);
        DeleteObject(hBmp);
        return bmp;
    }

    public static Bitmap CaptureWindow(IntPtr hwnd, bool preferPrintWindow)
    {
        RECT r;
        if (!GetWindowRect(hwnd, out r)) throw new InvalidOperationException("GetWindowRect failed");
        int w = r.Right - r.Left;
        int h = r.Bottom - r.Top;
        if (w <= 0 || h <= 0) throw new InvalidOperationException("window has an empty rectangle");

        if (preferPrintWindow)
        {
            IntPtr screenDc = GetDC(IntPtr.Zero);
            IntPtr memDc = CreateCompatibleDC(screenDc);
            IntPtr hBmp = CreateCompatibleBitmap(screenDc, w, h);
            IntPtr old = SelectObject(memDc, hBmp);
            bool ok = PrintWindow(hwnd, memDc, 2);
            SelectObject(memDc, old);
            DeleteDC(memDc);
            ReleaseDC(IntPtr.Zero, screenDc);
            if (ok)
            {
                Bitmap printed = Image.FromHbitmap(hBmp);
                DeleteObject(hBmp);
                return printed;
            }
            DeleteObject(hBmp);
        }
        return CaptureRect(r.Left, r.Top, w, h);
    }

    public static Bitmap Resize(Bitmap source, int maxWidth)
    {
        if (maxWidth <= 0 || source.Width <= maxWidth) return source;
        int width = maxWidth;
        int height = (int)Math.Round(source.Height * (double)maxWidth / source.Width);
        if (height < 1) height = 1;
        Bitmap target = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(target))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(source, 0, 0, width, height);
        }
        return target;
    }

    public static void DrawCursorMarker(Bitmap bitmap, int originX, int originY)
    {
        POINT p = Cursor();
        int cx = p.X - originX;
        int cy = p.Y - originY;
        if (cx < 0 || cy < 0 || cx >= bitmap.Width || cy >= bitmap.Height) return;
        using (Graphics g = Graphics.FromImage(bitmap))
        using (Pen dark = new Pen(Color.FromArgb(200, 0, 0, 0), 3))
        using (Pen light = new Pen(Color.FromArgb(235, 255, 255, 255), 1))
        {
            g.DrawLine(dark, cx - 10, cy, cx + 10, cy);
            g.DrawLine(dark, cx, cy - 10, cx, cy + 10);
            g.DrawLine(light, cx - 9, cy, cx + 9, cy);
            g.DrawLine(light, cx, cy - 9, cx, cy + 9);
        }
    }

    private static void Send(INPUT[] inputs)
    {
        if (inputs.Length == 0) return;
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != (uint)inputs.Length) throw new InvalidOperationException("SendInput rejected input (UIPI or secure desktop)");
    }

    private static INPUT MouseInput(uint flags, int data)
    {
        INPUT i = new INPUT();
        i.type = INPUT_MOUSE;
        i.u.mi.dwFlags = flags;
        i.u.mi.mouseData = (uint)data;
        return i;
    }

    public static void Click(int x, int y, string button, int count)
    {
        Move(x, y);
        Thread.Sleep(15);
        uint down, up;
        if (button == "right") { down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; }
        else if (button == "middle") { down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; }
        else { down = MOUSEEVENTF_LEFTDOWN; up = MOUSEEVENTF_LEFTUP; }
        for (int n = 0; n < Math.Max(1, count); n++)
        {
            Send(new INPUT[] { MouseInput(down, 0), MouseInput(up, 0) });
            if (n + 1 < count) Thread.Sleep(45);
        }
    }

    public static void Scroll(int x, int y, int amount, bool horizontal)
    {
        Move(x, y);
        Thread.Sleep(10);
        uint flag = horizontal ? 0x01000u : MOUSEEVENTF_WHEEL;
        Send(new INPUT[] { MouseInput(flag, amount) });
    }

    public static void DragStart(int x, int y, string button)
    {
        Move(x, y);
        Thread.Sleep(20);
        uint down = button == "right" ? MOUSEEVENTF_RIGHTDOWN : (button == "middle" ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN);
        Send(new INPUT[] { MouseInput(down, 0) });
    }

    public static void DragMove(int x, int y) { Move(x, y); }

    public static void DragEnd(string button)
    {
        uint up = button == "right" ? MOUSEEVENTF_RIGHTUP : (button == "middle" ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP);
        Send(new INPUT[] { MouseInput(up, 0) });
    }

    public static void SendVirtualKey(ushort vk, bool keyUp)
    {
        INPUT i = new INPUT();
        i.type = INPUT_KEYBOARD;
        i.u.ki.wVk = vk;
        i.u.ki.wScan = 0;
        i.u.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
        Send(new INPUT[] { i });
    }

    public static void SendUnicodeText(string text)
    {
        List<INPUT> buffer = new List<INPUT>();
        foreach (char c in text)
        {
            if (c == '\r') continue;
            if (c == '\n') { buffer.Add(KeyInput(0x0D, false)); buffer.Add(KeyInput(0x0D, true)); continue; }
            if (c == '\t') { buffer.Add(KeyInput(0x09, false)); buffer.Add(KeyInput(0x09, true)); continue; }
            INPUT down = new INPUT();
            down.type = INPUT_KEYBOARD;
            down.u.ki.wVk = 0;
            down.u.ki.wScan = c;
            down.u.ki.dwFlags = KEYEVENTF_UNICODE;
            buffer.Add(down);
            INPUT up = down;
            up.u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            buffer.Add(up);
        }
        Send(buffer.ToArray());
    }

    private static INPUT KeyInput(ushort vk, bool keyUp)
    {
        INPUT i = new INPUT();
        i.type = INPUT_KEYBOARD;
        i.u.ki.wVk = vk;
        i.u.ki.wScan = 0;
        i.u.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
        return i;
    }

    public class WindowInfo
    {
        public long Hwnd;
        public string Title;
        public string ClassName;
        public uint Pid;
        public string Process;
        public int X;
        public int Y;
        public int Width;
        public int Height;
        public bool Visible;
        public bool Minimized;
        public bool Foreground;
    }
}
'@

if (-not ('ScreenCtl' -as [type])) {
  Add-Type -TypeDefinition $nativeSource -ReferencedAssemblies 'System.Drawing' -Language CSharp
}
[ScreenCtl]::EnableDpiAwareness() | Out-Null

function Get-SaveFormat([string]$format) {
  if ($format -eq 'jpg' -or $format -eq 'jpeg') { return @{ Mime = 'image/jpeg'; Ext = 'jpg' } }
  return @{ Mime = 'image/png'; Ext = 'png' }
}

function Save-Bitmap($bitmap, [string]$path, [string]$format, [int]$quality) {
  $dir = [System.IO.Path]::GetDirectoryName($path)
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Path $dir -Force) }
  $fmt = Get-SaveFormat $format
  if ($fmt.Ext -eq 'jpg') {
    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
    $bitmap.Save($path, $encoder, $parameters)
  } else {
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  return $fmt.Mime
}

function Assert-InputAllowed {
  if ($script:FailsafeUntil -gt (Get-Date)) {
    $left = [int](($script:FailsafeUntil - (Get-Date)).TotalSeconds)
    throw (New-CodedError 'E_FAILSAFE' "input is paused for ${left}s after the emergency stop")
  }
  $ctrl = [ScreenCtl]::GetAsyncKeyState(0x11)
  $alt = [ScreenCtl]::GetAsyncKeyState(0x12)
  $esc = [ScreenCtl]::GetAsyncKeyState(0x1B)
  if (($ctrl -band 0x8000) -and ($alt -band 0x8000) -and ($esc -band 0x8000)) {
    $script:FailsafeUntil = (Get-Date).AddSeconds(30)
    throw (New-CodedError 'E_FAILSAFE' 'emergency stop (Ctrl+Alt+Esc) is held; input is paused for 30s')
  }
}

function Get-Info {
  $vs = [ScreenCtl]::VirtualScreen()
  $cursor = [ScreenCtl]::Cursor()
  $fg = [ScreenCtl]::Foreground()
  $monitors = @()
  foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
    $monitors += @{
      name = $screen.DeviceName
      primary = $screen.Primary
      x = $screen.Bounds.X
      y = $screen.Bounds.Y
      width = $screen.Bounds.Width
      height = $screen.Bounds.Height
    }
  }
  $foreground = $null
  if ($null -ne $fg) {
    $foreground = @{
      hwnd = $fg.Hwnd
      title = $fg.Title
      pid = $fg.Pid
      process = $fg.Process
    }
  }
  return @{
    interactive = [ScreenCtl]::IsInteractiveDesktop()
    sessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    dpi = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero).DpiX
    cursor = @{ x = $cursor.X; y = $cursor.Y }
    virtualScreen = @{ x = $vs[0]; y = $vs[1]; width = $vs[2]; height = $vs[3] }
    monitors = $monitors
    foreground = $foreground
    platform = 'windows'
    powershell = $PSVersionTable.PSVersion.ToString()
    failsafeUntil = $(if ($script:FailsafeUntil -gt (Get-Date)) { $script:FailsafeUntil.ToString('o') } else { $null })
  }
}

function Get-WindowByRef($params) {
  if ($params.hwnd) { return [IntPtr][long]$params.hwnd }
  if ($params.title) {
    $needle = [string]$params.title
    $wins = [ScreenCtl]::ListWindows()
    foreach ($w in $wins) {
      if ($w.Title.IndexOf($needle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return [IntPtr][long]$w.Hwnd }
    }
    throw (New-CodedError 'E_NOT_FOUND' "no visible window title contains '$needle'")
  }
  return [ScreenCtl]::GetForegroundWindow()
}

function Invoke-Capture($params) {
  $maxWidth = 1600
  if ($params.max_width) { $maxWidth = [int]$params.max_width }
  $format = 'png'
  if ($params.format) { $format = [string]$params.format }
  $quality = 82
  if ($params.quality) { $quality = [int]$params.quality }
  $includeCursor = $false
  if ($params.include_cursor -eq $true) { $includeCursor = $true }

  $bitmap = $null
  $originX = 0
  $originY = 0
  try {
    if ($params.window -or $params.hwnd) {
      $hwnd = Get-WindowByRef $params
      $bitmap = [ScreenCtl]::CaptureWindow($hwnd, $true)
      $rect = New-Object ScreenCtl+RECT
      [void][ScreenCtl]::GetWindowRect($hwnd, [ref]$rect)
      $originX = $rect.Left
      $originY = $rect.Top
    } elseif ($params.region) {
      $vs = [ScreenCtl]::VirtualScreen()
      $rx = [int]$params.region.x
      $ry = [int]$params.region.y
      $rw = [int]$params.region.width
      $rh = [int]$params.region.height
      if ($rw -le 0 -or $rh -le 0) { throw (New-CodedError 'E_ARGS' 'region.width and region.height must be positive') }
      if ($rx -lt $vs[0]) { $rx = $vs[0] }
      if ($ry -lt $vs[1]) { $ry = $vs[1] }
      if ($rx + $rw -gt $vs[0] + $vs[2]) { $rw = $vs[0] + $vs[2] - $rx }
      if ($ry + $rh -gt $vs[1] + $vs[3]) { $rh = $vs[1] + $vs[3] - $ry }
      $bitmap = [ScreenCtl]::CaptureRect($rx, $ry, $rw, $rh)
      $originX = $rx
      $originY = $ry
    } else {
      $vs = [ScreenCtl]::VirtualScreen()
      $bitmap = [ScreenCtl]::CaptureRect($vs[0], $vs[1], $vs[2], $vs[3])
      $originX = $vs[0]
      $originY = $vs[1]
    }

    $sourceWidth = $bitmap.Width
    $sourceHeight = $bitmap.Height
    if ($includeCursor) { [ScreenCtl]::DrawCursorMarker($bitmap, $originX, $originY) }
    $resized = [ScreenCtl]::Resize($bitmap, $maxWidth)
    if (-not [object]::ReferenceEquals($resized, $bitmap)) { $bitmap.Dispose() }
    $bitmap = $resized

    $path = [string]$params.path
    if (-not $path) {
      $dir = Join-Path ([System.IO.Path]::GetTempPath()) 'dsh-screen-control\shots'
      $path = Join-Path $dir ('shot-' + [Guid]::NewGuid().ToString('N') + '.' + (Get-SaveFormat $format).Ext)
    }
    $mime = Save-Bitmap $bitmap $path $format $quality
    $cursor = [ScreenCtl]::Cursor()
    return @{
      path = $path
      mediaType = $mime
      width = $bitmap.Width
      height = $bitmap.Height
      source = @{ x = $originX; y = $originY; width = $sourceWidth; height = $sourceHeight }
      scale = [Math]::Round(($bitmap.Width / $sourceWidth), 4)
      cursor = @{ x = $cursor.X; y = $cursor.Y }
    }
  } finally {
    if ($null -ne $bitmap) { $bitmap.Dispose() }
  }
}

function Invoke-Pointer($params) {
  Assert-InputAllowed
  $action = [string]$params.action
  $button = 'left'
  if ($params.button) { $button = [string]$params.button }
  $x = 0; $y = 0
  if ($null -ne $params.x) { $x = [int]$params.x }
  if ($null -ne $params.y) { $y = [int]$params.y }
  switch ($action) {
    'move' {
      [ScreenCtl]::Move($x, $y)
    }
    'click' {
      $count = 1
      if ($params.count) { $count = [int]$params.count }
      [ScreenCtl]::Click($x, $y, $button, $count)
    }
    'double_click' {
      [ScreenCtl]::Click($x, $y, $button, 2)
    }
    'right_click' {
      [ScreenCtl]::Click($x, $y, 'right', 1)
    }
    'middle_click' {
      [ScreenCtl]::Click($x, $y, 'middle', 1)
    }
    'scroll' {
      $amount = 120
      if ($params.amount) { $amount = [int]$params.amount }
      $horizontal = $false
      if ($params.horizontal -eq $true) { $horizontal = $true }
      [ScreenCtl]::Scroll($x, $y, $amount, $horizontal)
    }
    'drag' {
      $toX = [int]$params.to_x
      $toY = [int]$params.to_y
      $duration = 350
      if ($params.duration_ms) { $duration = [int]$params.duration_ms }
      [ScreenCtl]::DragStart($x, $y, $button)
      $steps = [Math]::Max(2, [Math]::Min(120, [int]($duration / 16)))
      for ($i = 1; $i -le $steps; $i++) {
        $px = [int]($x + (($toX - $x) * $i / $steps))
        $py = [int]($y + (($toY - $y) * $i / $steps))
        [ScreenCtl]::DragMove($px, $py)
        Start-Sleep -Milliseconds 16
      }
      [ScreenCtl]::DragEnd($button)
    }
    default { throw (New-CodedError 'E_ARGS' "unknown pointer action '$action'") }
  }
  $cursor = [ScreenCtl]::Cursor()
  return @{ action = $action; cursor = @{ x = $cursor.X; y = $cursor.Y } }
}

function Get-KeyCode([string]$name) {
  $map = @{
    'ctrl' = 0x11; 'control' = 0x11; 'alt' = 0x12; 'shift' = 0x10; 'win' = 0x5B; 'lwin' = 0x5B; 'rwin' = 0x5C
    'enter' = 0x0D; 'return' = 0x0D; 'tab' = 0x09; 'esc' = 0x1B; 'escape' = 0x1B; 'space' = 0x20
    'backspace' = 0x08; 'delete' = 0x2E; 'del' = 0x2E; 'insert' = 0x2D; 'ins' = 0x2D
    'home' = 0x24; 'end' = 0x23; 'pageup' = 0x21; 'pagedown' = 0x22
    'up' = 0x26; 'down' = 0x28; 'left' = 0x25; 'right' = 0x27
    'capslock' = 0x14; 'numlock' = 0x90; 'scrolllock' = 0x91; 'printscreen' = 0x2C
    'pause' = 0x13; 'apps' = 0x5D; 'clear' = 0x0C
    'f1' = 0x70; 'f2' = 0x71; 'f3' = 0x72; 'f4' = 0x73; 'f5' = 0x74; 'f6' = 0x75
    'f7' = 0x76; 'f8' = 0x77; 'f9' = 0x78; 'f10' = 0x79; 'f11' = 0x7A; 'f12' = 0x7B
    'f13' = 0x7C; 'f14' = 0x7D; 'f15' = 0x7E; 'f16' = 0x7F; 'f17' = 0x80; 'f18' = 0x81
    'f19' = 0x82; 'f20' = 0x83; 'f21' = 0x84; 'f22' = 0x85; 'f23' = 0x86; 'f24' = 0x87
    '0' = 0x30; '1' = 0x31; '2' = 0x32; '3' = 0x33; '4' = 0x34
    '5' = 0x35; '6' = 0x36; '7' = 0x37; '8' = 0x38; '9' = 0x39
    '`' = 0xC0; '-' = 0xBD; '=' = 0xBB; '[' = 0xDB; ']' = 0xDD; '\' = 0xDC; ';' = 0xBA; '''' = 0xDE; ',' = 0xBC; '.' = 0xBE; '/' = 0xBF
  }
  $key = $name.Trim().ToLowerInvariant()
  if ($map.ContainsKey($key)) { return [int]$map[$key] }
  if ($key.Length -eq 1) {
    $ch = $key.ToUpperInvariant()[0]
    if ($ch -ge 'A' -and $ch -le 'Z') { return [int]$ch }
  }
  throw (New-CodedError 'E_ARGS' "unknown key name '$name'")
}

function Invoke-KeyChord([string]$chord) {
  $parts = $chord.Split('+') | Where-Object { $_.Trim().Length -gt 0 }
  if ($parts.Count -eq 0) { throw (New-CodedError 'E_ARGS' 'empty key chord') }
  $codes = @()
  foreach ($part in $parts) { $codes += (Get-KeyCode $part) }
  for ($i = 0; $i -lt $codes.Count; $i++) { [ScreenCtl]::SendVirtualKey([int]$codes[$i], $false) }
  for ($i = $codes.Count - 1; $i -ge 0; $i--) { [ScreenCtl]::SendVirtualKey([int]$codes[$i], $true) }
  return $chord
}

function Invoke-Keyboard($params) {
  Assert-InputAllowed
  $action = [string]$params.action
  switch ($action) {
    'type' {
      $text = [string]$params.text
      if ($text.Length -eq 0) { throw (New-CodedError 'E_ARGS' 'text must be a non-empty string') }
      [ScreenCtl]::SendUnicodeText($text)
      return @{ action = 'type'; chars = $text.Length }
    }
    'key' {
      $keys = [string]$params.keys
      if ($keys.Length -eq 0) { throw (New-CodedError 'E_ARGS' 'keys must be a non-empty chord, e.g. ctrl+s') }
      $sent = Invoke-KeyChord $keys
      return @{ action = 'key'; keys = $sent }
    }
    'paste' {
      $text = [string]$params.text
      $previous = $null
      try { $previous = Get-Clipboard -Raw -ErrorAction Stop } catch { $previous = $null }
      Set-Clipboard -Value $text
      Start-Sleep -Milliseconds 60
      [void](Invoke-KeyChord 'ctrl+v')
      Start-Sleep -Milliseconds 160
      if ($null -ne $previous) { try { Set-Clipboard -Value $previous } catch { } }
      return @{ action = 'paste'; chars = $text.Length }
    }
    default { throw (New-CodedError 'E_ARGS' "unknown keyboard action '$action'") }
  }
}

function Invoke-Windows($params) {
  $action = 'list'
  if ($params.action) { $action = [string]$params.action }
  if ($action -eq 'list') {
    $limit = 60
    if ($params.limit) { $limit = [int]$params.limit }
    $filter = ''
    if ($params.title) { $filter = [string]$params.title }
    $wins = [ScreenCtl]::ListWindows()
    $rows = @()
    foreach ($w in $wins) {
      if ($filter -and $w.Title.IndexOf($filter, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
      $rows += @{
        hwnd = $w.Hwnd; title = $w.Title; process = $w.Process; pid = $w.Pid
        x = $w.X; y = $w.Y; width = $w.Width; height = $w.Height
        minimized = $w.Minimized; foreground = $w.Foreground
      }
      if ($rows.Count -ge $limit) { break }
    }
    return @{ action = 'list'; count = $rows.Count; windows = $rows }
  }
  if ($action -eq 'focus') {
    $hwnd = Get-WindowByRef $params
    $ok = [ScreenCtl]::FocusWindow($hwnd)
    Start-Sleep -Milliseconds 120
    $fg = [ScreenCtl]::Foreground()
    return @{
      action = 'focus'
      focused = $ok
      foreground = $(if ($null -ne $fg) { @{ hwnd = $fg.Hwnd; title = $fg.Title; pid = $fg.Pid; process = $fg.Process } } else { $null })
    }
  }
  throw (New-CodedError 'E_ARGS' "unknown windows action '$action'")
}

function Convert-ToUiNode($element, [int]$depth, [int]$maxDepth, $state, [bool]$includeValue) {
  if ($state.Count -ge $state.Max) { return $null }
  $state.Count++
  $name = ''
  $controlType = ''
  $automationId = ''
  $value = $null
  $frame = $null
  $offscreen = $false
  $enabled = $true
  try { $name = [string]$element.Current.Name } catch { }
  try { $controlType = [string]$element.Current.ControlType.ProgrammaticName -replace '^ControlType\.', '' } catch { }
  try { $automationId = [string]$element.Current.AutomationId } catch { }
  try { $offscreen = [bool]$element.Current.IsOffscreen } catch { }
  try { $enabled = [bool]$element.Current.IsEnabled } catch { }
  try {
    $r = $element.Current.BoundingRectangle
    if (-not $r.IsEmpty) {
      $frame = @{ x = [int]$r.X; y = [int]$r.Y; width = [int]$r.Width; height = [int]$r.Height }
    }
  } catch { }
  if ($includeValue) {
    try {
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      $value = [string]$pattern.Current.Value
    } catch { }
  }
  $node = @{
    type = $controlType
    name = $name
    automationId = $automationId
    enabled = $enabled
    offscreen = $offscreen
    rect = $frame
  }
  if ($null -ne $value) { $node.value = $value }
  if ($depth -lt $maxDepth) {
    $children = @()
    try {
      $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
      $child = $walker.GetFirstChild($element)
      while ($null -ne $child -and $state.Count -lt $state.Max) {
        $converted = Convert-ToUiNode $child ($depth + 1) $maxDepth $state $includeValue
        if ($null -ne $converted) { $children += $converted }
        $child = $walker.GetNextSibling($child)
      }
    } catch { }
    if ($children.Count -gt 0) { $node.children = $children }
  }
  return $node
}

function Invoke-Ui($params) {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $depth = 3
  if ($params.depth) { $depth = [int]$params.depth }
  $maxNodes = 300
  if ($params.max_nodes) { $maxNodes = [int]$params.max_nodes }
  $includeValue = $false
  if ($params.include_value -eq $true) { $includeValue = $true }

  $hwnd = Get-WindowByRef $params
  if ($hwnd -eq [IntPtr]::Zero) { throw (New-CodedError 'E_NO_WINDOW' 'no foreground window to inspect') }
  $root = $null
  try { $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd) } catch {
    throw (New-CodedError 'E_UIPI' ('cannot inspect this window (it may be elevated): ' + $_.Exception.Message))
  }
  if ($null -eq $root) { throw (New-CodedError 'E_NO_WINDOW' 'UIAutomation returned no element for the window') }
  $state = @{ Count = 0; Max = $maxNodes }
  $tree = Convert-ToUiNode $root 0 $depth $state $includeValue
  $desc = [ScreenCtl]::DescribeWindow($hwnd, [ScreenCtl]::GetForegroundWindow())
  return @{
    window = @{ hwnd = $hwnd.ToInt64(); title = $desc.Title; process = $desc.Process }
    nodeCount = $state.Count
    maxNodes = $maxNodes
    tree = $tree
  }
}

function Invoke-Wait($params) {
  $mode = 'ms'
  if ($params.for) { $mode = [string]$params.for }
  $timeoutMs = 5000
  if ($params.timeout_ms) { $timeoutMs = [int]$params.timeout_ms }
  $started = Get-Date
  if ($mode -eq 'ms') {
    $ms = 500
    if ($params.ms) { $ms = [int]$params.ms }
    if ($ms -gt $timeoutMs) { $ms = $timeoutMs }
    Start-Sleep -Milliseconds $ms
    return @{ for = 'ms'; waitedMs = ((Get-Date) - $started).TotalMilliseconds; matched = $true }
  }
  if ($mode -eq 'window') {
    $pattern = [string]$params.title
    if (-not $pattern) { throw (New-CodedError 'E_ARGS' 'wait for=window requires a title pattern') }
    $poll = 250
    if ($params.poll_ms) { $poll = [Math]::Max(50, [int]$params.poll_ms) }
    while (((Get-Date) - $started).TotalMilliseconds -lt $timeoutMs) {
      foreach ($w in [ScreenCtl]::ListWindows()) {
        if ($w.Title -match $pattern) {
          return @{ for = 'window'; matched = $true; waitedMs = [int]((Get-Date) - $started).TotalMilliseconds; window = @{ hwnd = $w.Hwnd; title = $w.Title; pid = $w.Pid; process = $w.Process } }
        }
      }
      Start-Sleep -Milliseconds $poll
    }
    return @{ for = 'window'; matched = $false; waitedMs = [int]((Get-Date) - $started).TotalMilliseconds }
  }
  throw (New-CodedError 'E_ARGS' "unknown wait mode '$mode' (use ms or window)")
}

function Invoke-Op([string]$op, $params) {
  if ($null -eq $params) { $params = @{} }
  switch ($op) {
    'info' { return Get-Info }
    'capture' { return Invoke-Capture $params }
    'pointer' { return Invoke-Pointer $params }
    'keyboard' { return Invoke-Keyboard $params }
    'windows' { return Invoke-Windows $params }
    'ui' { return Invoke-Ui $params }
    'wait' { return Invoke-Wait $params }
    default { throw (New-CodedError 'E_ARGS' "unknown op '$op'") }
  }
}

function Invoke-RequestLine([string]$line) {
  $request = $null
  try { $request = $line | ConvertFrom-Json } catch {
    Send-Error $null 'E_ARGS' 'request is not valid JSON'
    return
  }
  $id = $request.id
  try {
    $result = Invoke-Op ([string]$request.op) $request.args
    Send-Result $id $result
  } catch {
    $code = 'E_FAIL'
    if ($null -ne $_.Exception.Data -and $_.Exception.Data.Contains('code')) { $code = [string]$_.Exception.Data['code'] }
    Send-Error $id $code $_.Exception.Message
  }
}

# --- entry points -----------------------------------------------------------

if ($CompileOnly) {
  # CI/headless check: native bindings compile and the process can load them.
  [Console]::Out.WriteLine('{"ok":true,"compiled":true}')
  exit 0
}

if ($Validate) {
  $info = Get-Info
  [Console]::Out.WriteLine(($info | ConvertTo-Json -Depth 6 -Compress))
  exit 0
}

if ($SelfTest) {
  try {
    $info = Get-Info
    $shot = Invoke-Capture @{ max_width = 320; format = 'png' }
    $payload = @{ ok = $true; info = $info; capture = $shot }
    [Console]::Out.WriteLine(($payload | ConvertTo-Json -Depth 8 -Compress))
    exit 0
  } catch {
    $payload = @{ ok = $false; error = @{ code = $(if ($_.Exception.Data.Contains('code')) { [string]$_.Exception.Data['code'] } else { 'E_FAIL' }); message = $_.Exception.Message } }
    [Console]::Out.WriteLine(($payload | ConvertTo-Json -Depth 6 -Compress))
    exit 1
  }
}

if ($Once) {
  try {
    $line = [System.IO.File]::ReadAllText($RequestFile, [System.Text.Encoding]::UTF8)
    Invoke-RequestLine $line
    [System.IO.File]::WriteAllText($ResponseFile, ($script:OutLines -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
    exit 0
  } catch {
    $fallback = @{ id = $null; ok = $false; error = @{ code = 'E_FAIL'; message = $_.Exception.Message } } | ConvertTo-Json -Depth 4 -Compress
    [System.IO.File]::WriteAllText($ResponseFile, $fallback, (New-Object System.Text.UTF8Encoding($false)))
    exit 1
  }
}

# Persistent worker: JSON lines on stdin/stdout until EOF or idle timeout.
$reader = [Console]::In
while ($true) {
  $task = $reader.ReadLineAsync()
  $line = $null
  $got = $false
  while (-not $got) {
    if ($task.Wait(250)) { $line = $task.Result; $got = $true; break }
    if ($IdleTimeoutSec -gt 0) {
      $idle = ((Get-Date).ToUniversalTime() - $script:LastRequestAt).TotalSeconds
      if ($idle -gt $IdleTimeoutSec) { exit 0 }
    }
  }
  if ($null -eq $line) { exit 0 }
  if ($line.Trim().Length -eq 0) { continue }
  $script:LastRequestAt = (Get-Date).ToUniversalTime()
  Invoke-RequestLine $line
}
