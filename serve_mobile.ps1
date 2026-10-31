# Ludo X BD - TcpListener HTTP Server (Requires NO Admin rights)
$port = 8080
$folder = "$PSScriptRoot\src"

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()

Write-Output "Ludo X BD Server successfully running on port $port!"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $line = $reader.ReadLine()
        
        if ($line) {
            $parts = $line.Split(" ")
            if ($parts.Length -ge 2) {
                $rawPath = $parts[1].Split("?")[0].TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
                if ([string]::IsNullOrEmpty($rawPath)) { $rawPath = "index.html" }
                
                $filePath = [System.IO.Path]::Combine($folder, $rawPath)
                if ([System.IO.File]::Exists($filePath)) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $contentType = $mimeTypes[$ext]
                    if (-not $contentType) { $contentType = "application/octet-stream" }
                    
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)
                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                } else {
                    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                    $header = "HTTP/1.1 404 Not Found`r`nContent-Length: $($msg.Length)`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($msg, 0, $msg.Length)
                }
            }
        }
        $stream.Flush()
        $client.Close()
    } catch {
        # ignore client disconnects
    }
}
