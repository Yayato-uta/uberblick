# Draws the app icons. Kept in the repo so they can be regenerated without a
# design tool: paper-green ground, a ruled border, and the Ü in a mono face.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1

Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "..\public"
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

$paper = [System.Drawing.ColorTranslator]::FromHtml("#E8EDE7")
$ink   = [System.Drawing.ColorTranslator]::FromHtml("#16211D")
$rule  = [System.Drawing.ColorTranslator]::FromHtml("#C3CDC0")

function New-Icon {
    param(
        [int]$Size,
        [string]$Path,
        # maskable icons keep the glyph inside the safe circle and skip the frame
        [switch]$Maskable
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear($paper)

    $glyphScale = 0.58
    if ($Maskable) { $glyphScale = 0.42 }

    if (-not $Maskable) {
        # a double rule, like the box on a Zahlschein
        $inset = [int]($Size * 0.07)
        $penOuter = New-Object System.Drawing.Pen($ink, [float]([Math]::Max(2, $Size * 0.035)))
        $g.DrawRectangle($penOuter, $inset, $inset, $Size - 2 * $inset, $Size - 2 * $inset)
        $penInner = New-Object System.Drawing.Pen($rule, [float]([Math]::Max(1, $Size * 0.012)))
        $in2 = [int]($Size * 0.125)
        $g.DrawRectangle($penInner, $in2, $in2, $Size - 2 * $in2, $Size - 2 * $in2)
        $penOuter.Dispose(); $penInner.Dispose()
    }

    $family = "Consolas"
    try { $test = New-Object System.Drawing.FontFamily($family) ; $test.Dispose() }
    catch { $family = "Courier New" }

    $font = New-Object System.Drawing.Font($family, [float]($Size * $glyphScale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush($ink)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF(0, [float]($Size * 0.02), [float]$Size, [float]$Size)
    $g.DrawString([char]0x00DC, $font, $brush, $rect, $fmt)

    $g.Dispose()
    $full = Join-Path $out $Path
    $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "wrote $full"
}

New-Icon -Size 192 -Path "icon-192.png"
New-Icon -Size 512 -Path "icon-512.png"
New-Icon -Size 512 -Path "icon-maskable-512.png" -Maskable
New-Icon -Size 180 -Path "apple-touch-icon.png"
