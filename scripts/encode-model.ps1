# Compress raw\FYP_TRIPTYCH.glb into a web-ready public\models\fyp-triptych.glb.
# Uses @gltf-transform/cli (run via npx — no install needed; Node.js required).
#
# Pipeline: resize the two 5021x5021 art textures -> 2048, then re-encode WebP.
# Textures are ~99% of the weight (6 MB -> ~750 KB from the resize alone).
#
# We deliberately do NOT geometry-compress (meshopt / quantize / optimize):
# those steps re-center each mesh and bake a compensating node transform, which
# moves the wing node origins OFF their hinges and breaks the fold (the page
# folds the wings by rotating the LEFTCARD / RIGHTCARD nodes, whose origins must
# stay on the hinges). Texture resize keeps the geometry + node origins intact.
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\encode-model.ps1
#
# Behind a TLS-intercepting proxy (which breaks npx's download), this script
# auto-trusts your Windows certificate store so the fetch succeeds. It does this
# only if NODE_EXTRA_CA_CERTS isn't already set, and only adds roots Windows
# already trusts. The first run downloads the tool (~slow); later runs are cached.

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$Src  = Join-Path $Root "raw\FYP_TRIPTYCH.glb"
$Out  = Join-Path $Root "public\models\fyp-triptych.glb"
$Tex     = 2048
$Quality = 95   # art textures are high-contrast line work; low q washes blacks

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npx (Node.js) not found on PATH. Install Node.js and try again."
}
if (-not (Test-Path $Src)) { throw "Missing $Src" }

# --- make npx's HTTPS work behind a TLS-intercepting corporate proxy ---
# Export the trusted Windows CA roots to a PEM and point Node at it. Harmless
# off-proxy (just extra already-trusted roots); skipped if you've set your own.
if (-not $env:NODE_EXTRA_CA_CERTS) {
    $caPem = Join-Path $env:TEMP "fyp-node-ca-bundle.pem"
    if (-not (Test-Path $caPem) -or ((Get-Item $caPem).LastWriteTime -lt (Get-Date).AddDays(-7))) {
        $certs = Get-ChildItem -Path Cert:\LocalMachine\Root, Cert:\CurrentUser\Root, Cert:\LocalMachine\CA, Cert:\CurrentUser\CA -ErrorAction SilentlyContinue
        $sb = New-Object System.Text.StringBuilder
        foreach ($c in $certs) {
            try {
                [void]$sb.AppendLine("-----BEGIN CERTIFICATE-----")
                [void]$sb.AppendLine([System.Convert]::ToBase64String($c.RawData, 'InsertLineBreaks'))
                [void]$sb.AppendLine("-----END CERTIFICATE-----")
            } catch {}
        }
        Set-Content -Path $caPem -Value $sb.ToString() -Encoding ascii
    }
    $env:NODE_EXTRA_CA_CERTS = $caPem
}

$OutDir = Split-Path $Out -Parent
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

$Tmp = Join-Path $env:TEMP ("fyp-glb-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
$R = Join-Path $Tmp "r.glb"

try {
    Write-Host "1/2  resize textures -> $Tex px ..."
    & npx --yes @gltf-transform/cli resize $Src $R --width $Tex --height $Tex

    Write-Host "2/2  re-encode textures -> WebP q$Quality ..."
    & npx --yes @gltf-transform/cli webp $R $Out --quality $Quality

    $kb = [math]::Round((Get-Item $Out).Length / 1KB)
    Write-Host "Done. $Src -> $Out ($kb KB)"

    # sanity: the fold depends on these node names surviving
    Write-Host "Checking node names (LEFTCARD / RIGHTCARD must be present) ..."
    & node "$PSScriptRoot\check-model.mjs" $Out
}
finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
