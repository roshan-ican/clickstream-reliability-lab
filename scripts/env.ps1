$port = 9297
$emulatorDir = Join-Path $env:USERPROFILE ".aws\emulator\$port"

$env:AWS_ENDPOINT_URL = "https://127.0.0.1:$port"
$env:AWS_SHARED_CREDENTIALS_FILE = Join-Path $emulatorDir "emulator_credentials"
$env:AWS_CONFIG_FILE = Join-Path $emulatorDir "config"
$env:AWS_CA_BUNDLE = Join-Path $emulatorDir "ca.pem"
$env:AWS_EC2_METADATA_DISABLED = "true"
$env:AWS_DISABLE_HOST_PREFIX_INJECTION = "true"
$env:AWS_DEFAULT_REGION = "us-east-1"
$env:AWS_REGION = "us-east-1"
