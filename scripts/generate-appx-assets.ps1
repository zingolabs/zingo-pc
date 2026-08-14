# Generates the AppX/MSIX tile assets required for Microsoft Store certification
# from resources/icon.png, into public/appx/ (build.directories.buildResources).
#
#   powershell -ExecutionPolicy Bypass -File scripts/generate-appx-assets.ps1
#
# Without these, electron-builder falls back to its own placeholder images, which
# pass a local build but fail Store certification. Re-run whenever the icon changes.
#
# Square assets are a straight resize. Non-square ones (wide tile, splash screen)
# centre the icon on build.appx.backgroundColor so they don't come out stretched.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "resources\icon.png"
$outDir = Join-Path $root "public\appx"

if (-not (Test-Path $source)) { throw "Source icon not found: $source" }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Must match build.appx.backgroundColor in package.json
$bg = [System.Drawing.ColorTranslator]::FromHtml("#06172d")

$assets = @(
  @{ Name = "StoreLogo.png";           W = 50;  H = 50  },
  @{ Name = "Square44x44Logo.png";     W = 44;  H = 44  },
  @{ Name = "Square71x71Logo.png";     W = 71;  H = 71  },
  @{ Name = "SmallTile.png";           W = 71;  H = 71  },
  @{ Name = "Square150x150Logo.png";   W = 150; H = 150 },
  @{ Name = "Square310x310Logo.png";   W = 310; H = 310 },
  @{ Name = "LargeTile.png";           W = 310; H = 310 },
  @{ Name = "Wide310x150Logo.png";     W = 310; H = 150 },
  @{ Name = "SplashScreen.png";        W = 620; H = 300 },
  @{ Name = "BadgeLogo.png";           W = 24;  H = 24  }
)

$src = [System.Drawing.Image]::FromFile($source)
try {
  foreach ($a in $assets) {
    $bmp = New-Object System.Drawing.Bitmap($a.W, $a.H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      if ($a.W -eq $a.H) {
        # Square: transparent background, icon fills the tile.
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($src, 0, 0, $a.W, $a.H)
      } else {
        # Non-square: solid background, icon centred at 80% of the short side.
        $g.Clear($bg)
        $side = [int]([Math]::Min($a.W, $a.H) * 0.8)
        $x = [int](($a.W - $side) / 2)
        $y = [int](($a.H - $side) / 2)
        $g.DrawImage($src, $x, $y, $side, $side)
      }

      $bmp.Save((Join-Path $outDir $a.Name), [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Host ("  {0,-24} {1}x{2}" -f $a.Name, $a.W, $a.H)
    } finally {
      $g.Dispose(); $bmp.Dispose()
    }
  }
} finally {
  $src.Dispose()
}

Write-Host "`nWrote $($assets.Count) assets to public\appx" -ForegroundColor Green
