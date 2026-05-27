# Re-encode raw/ sources into public/media/ for the static site.
# Requires ffmpeg on PATH (https://ffmpeg.org/download.html).
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\encode-media.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$Raw = Join-Path $Root "raw"
$Out = Join-Path $Root "public\media"

function Require-Ffmpeg {
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        throw "ffmpeg not found on PATH. Install it and try again."
    }
}

function Encode-Mp4 {
    param(
        [string]$Source,
        [string]$Output,
        [int]$Size,
        [int]$Crf = 28
    )

    & ffmpeg @(
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", $Source,
        "-an",
        "-vf", "scale=${Size}:${Size}:flags=lanczos",
        "-c:v", "libx264",
        "-crf", "$Crf",
        "-preset", "slow",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        $Output
    )
}

function Encode-Webm {
    param(
        [string]$Source,
        [string]$Output,
        [int]$Size,
        [int]$Crf = 35
    )

    & ffmpeg @(
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", $Source,
        "-an",
        "-vf", "scale=${Size}:${Size}:flags=lanczos",
        "-c:v", "libvpx-vp9",
        "-crf", "$Crf",
        "-b:v", "0",
        "-row-mt", "1",
        $Output
    )
}

function Encode-Poster {
    param(
        [string]$Source,
        [string]$Output,
        [int]$Size,
        [double]$AtSeconds = 1
    )

    & ffmpeg @(
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", "$AtSeconds",
        "-i", $Source,
        "-vf", "scale=${Size}:${Size}:flags=lanczos",
        "-frames:v", "1",
        "-q:v", "2",
        $Output
    )
}

function Encode-PhysicalPhoto {
    param(
        [string]$Source,
        [string]$Output,
        [int]$Size = 900
    )

    & ffmpeg @(
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", $Source,
        "-vf", "crop=min(iw\,ih):min(iw\,ih),scale=${Size}:${Size}:flags=lanczos",
        "-q:v", "3",
        $Output
    )
}

Require-Ffmpeg
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$jobs = @(
    @{
        Raw      = "FYP_static1.mp4"
        Mp4      = "fyp-static1-web.mp4"
        Webm     = "fyp-static1-web.webm"
        Poster   = "fyp-poster.jpg"
        Size     = 1280
        PosterAt = 1
    },
    @{
        Raw      = "FYP_1.mp4"
        Mp4      = "fyp-1-web.mp4"
        Poster   = "fyp-1-poster.jpg"
        Size     = 900
        PosterAt = 1
    },
    @{
        Raw      = "FYP_2.mp4"
        Mp4      = "fyp-2-web.mp4"
        Poster   = "fyp-2-poster.jpg"
        Size     = 900
        PosterAt = 0.5
    }
)

foreach ($job in $jobs) {
    $inputPath = Join-Path $Raw $job.Raw
    if (-not (Test-Path $inputPath)) {
        throw "Missing source file: $inputPath"
    }

    Write-Host "Encoding $($job.Raw) ..."

    $mp4Out = Join-Path $Out $job.Mp4
    Encode-Mp4 -Source $inputPath -Output $mp4Out -Size $job.Size

    if ($job.Webm) {
        $webmOut = Join-Path $Out $job.Webm
        Encode-Webm -Source $inputPath -Output $webmOut -Size $job.Size
    }

    $posterOut = Join-Path $Out $job.Poster
    Encode-Poster -Source $inputPath -Output $posterOut -Size $job.Size -AtSeconds $job.PosterAt
}

$photos = @(
    @{ Raw = "physical_card.jpg"; Out = "physical-card.jpg" },
    @{ Raw = "physical_close-up.jpg"; Out = "physical-close-up.jpg" },
    @{ Raw = "physical_card+backing.jpg"; Out = "physical-card-backing.jpg" }
)

foreach ($photo in $photos) {
    $inputPath = Join-Path $Raw $photo.Raw
    if (-not (Test-Path $inputPath)) {
        Write-Warning "Skipping missing photo: $inputPath"
        continue
    }

    Write-Host "Encoding $($photo.Raw) ..."
    $photoOut = Join-Path $Out $photo.Out
    Encode-PhysicalPhoto -Source $inputPath -Output $photoOut
}

Write-Host "Done. Outputs written to public/media/"
