# foreground-watch.ps1 —— 桌面活跃度采集（只读、只在内存里用，不落盘、不截图）
#
# 每 IntervalMs 毫秒向 stdout 打一行 JSON：
#   {"ts":<epoch ms>,"idleMs":<系统空闲毫秒>,"app":"<进程名>","title":"<窗口标题>"}
#
# 两个数据源，都是 Win32 只读 API：
#   - GetForegroundWindow + GetWindowThreadProcessId + GetWindowTextW → 前台应用/标题
#   - GetLastInputInfo                                                → 键盘+鼠标空闲时长
#
# 隐私约定（与宿主侧 privacy.ts 对齐）：
#   - 标题只在内存里传给宿主做"敏感判定"，宿主不落盘、不外发；
#   - 提权窗口 / 读不到标题时输出空字符串，宿主按"未知应用"默认拒绝采集。
#
# 失败即退出：宿主看到进程退出就不再发建议，宠物行为降级，绝不阻塞。

param(
  [int]$IntervalMs = 5000
)

$ErrorActionPreference = 'Stop'
if ($IntervalMs -lt 1000) { $IntervalMs = 1000 }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DshPetForeground {
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [DllImport("kernel32.dll")] public static extern uint GetTickCount();

    public static string ForegroundTitle(out uint pid) {
        pid = 0;
        IntPtr h = GetForegroundWindow();
        if (h == IntPtr.Zero) return "";
        GetWindowThreadProcessId(h, out pid);
        var sb = new StringBuilder(1024);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    public static uint IdleMilliseconds() {
        LASTINPUTINFO info = new LASTINPUTINFO();
        info.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        if (!GetLastInputInfo(ref info)) return 0;
        return GetTickCount() - info.dwTime;
    }
}
"@

$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$stdout = [Console]::OpenStandardOutput()

while ($true) {
  try {
    $pid_ = 0
    $title = [DshPetForeground]::ForegroundTitle([ref]$pid_)
    $app = ''
    if ($pid_ -gt 0) {
      try { $app = (Get-Process -Id $pid_ -ErrorAction Stop).ProcessName } catch { $app = '' }
    }
    $payload = [ordered]@{
      ts     = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      idleMs = [int][DshPetForeground]::IdleMilliseconds()
      app    = $app
      title  = $title
    } | ConvertTo-Json -Compress
    $bytes = $utf8.GetBytes($payload + "`n")
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
  } catch {
    # 单次采样失败不退出：可能只是窗口刚好关闭/进程刚好结束
  }
  Start-Sleep -Milliseconds $IntervalMs
}
