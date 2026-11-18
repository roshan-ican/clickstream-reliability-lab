$ErrorActionPreference = "Stop"

$port = 9297
$emulatorDir = Join-Path $env:USERPROFILE ".aws\emulator\$port"
$credentialsFile = Join-Path $emulatorDir "emulator_credentials"
$configFile = Join-Path $emulatorDir "config"
$caFile = Join-Path $emulatorDir "ca.pem"

foreach ($path in @($credentialsFile, $configFile, $caFile)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "AWS Emulator file not found: $path. Start the emulator and try again."
    }
}

$env:AWS_ENDPOINT_URL = "https://127.0.0.1:$port"
$env:AWS_SHARED_CREDENTIALS_FILE = $credentialsFile
$env:AWS_CONFIG_FILE = $configFile
$env:AWS_CA_BUNDLE = $caFile
$env:AWS_EC2_METADATA_DISABLED = "true"
$env:AWS_DISABLE_HOST_PREFIX_INJECTION = "true"
$env:AWS_DEFAULT_REGION = "us-east-1"
$env:AWS_REGION = "us-east-1"

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$streamName = "clickstream-smoke-$suffix"
$queueName = "clickstream-smoke-$suffix"
$queueUrl = $null
$streamCreated = $false

function Invoke-AwsJson {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $result = & aws @Arguments --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($result -join "`n")
    }
    return ($result -join "`n" | ConvertFrom-Json)
}

try {
    Write-Host "1/6 Create Kinesis stream"
    Invoke-AwsJson kinesis create-stream --stream-name $streamName --shard-count 1 | Out-Null
    $streamCreated = $true

    Write-Host "2/6 Wait for stream and write a click event"
    & aws kinesis wait stream-exists --stream-name $streamName
    if ($LASTEXITCODE -ne 0) { throw "Kinesis stream did not become available." }

    $event = @{
        eventId    = "evt-$suffix"
        eventType  = "button_click"
        page       = "/demo"
        target     = "signup-cta"
        sessionId  = "session-smoke-test"
        occurredAt = [DateTime]::UtcNow.ToString("o")
    } | ConvertTo-Json -Compress
    $eventData = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($event))
    Invoke-AwsJson kinesis put-record --stream-name $streamName --partition-key "session-smoke-test" --data $eventData | Out-Null

    Write-Host "3/6 Read the click event back from Kinesis"
    $shards = Invoke-AwsJson kinesis list-shards --stream-name $streamName
    $shardId = $shards.Shards[0].ShardId
    if (-not $shardId) { throw "Kinesis returned no shard for the new stream." }
    $iterator = Invoke-AwsJson kinesis get-shard-iterator --stream-name $streamName --shard-id $shardId --shard-iterator-type TRIM_HORIZON
    $found = $false
    $nextIterator = $iterator.ShardIterator
    for ($attempt = 0; $attempt -lt 10 -and -not $found; $attempt += 1) {
        $records = Invoke-AwsJson kinesis get-records --shard-iterator $nextIterator --limit 10
        $nextIterator = $records.NextShardIterator
        foreach ($record in $records.Records) {
            $decodedEvent = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($record.Data)) | ConvertFrom-Json
            if ($decodedEvent.eventId -eq "evt-$suffix") { $found = $true }
        }
        if (-not $found) { Start-Sleep -Milliseconds 300 }
    }
    if (-not $found) { throw "The event was not returned by Kinesis GetRecords." }

    Write-Host "4/6 Create SQS queue and send a processing task"
    $queue = Invoke-AwsJson sqs create-queue --queue-name $queueName
    $queueUrl = $queue.QueueUrl
    if (-not $queueUrl) { throw "SQS did not return a queue URL." }
    $task = @{ task = "aggregate-session"; eventId = "evt-$suffix" } | ConvertTo-Json -Compress
    Invoke-AwsJson sqs send-message --queue-url $queueUrl --message-body $task | Out-Null

    Write-Host "5/6 Receive and acknowledge the SQS task"
    $received = Invoke-AwsJson sqs receive-message --queue-url $queueUrl --wait-time-seconds 0
    $message = $received.Messages | Select-Object -First 1
    if (-not $message.ReceiptHandle) { throw "SQS did not return the processing task." }
    Invoke-AwsJson sqs delete-message --queue-url $queueUrl --receipt-handle $message.ReceiptHandle | Out-Null

    Write-Host "6/6 Passed: Kinesis write/read and SQS send/receive/delete all worked." -ForegroundColor Green
    Write-Host "Stream: $streamName"
    Write-Host "Queue:  $queueName"
    Write-Host "Event:  $event"
}
finally {
    if ($queueUrl) {
        & aws sqs delete-queue --queue-url $queueUrl --output json *> $null
    }
    if ($streamCreated) {
        & aws kinesis delete-stream --stream-name $streamName --enforce-consumer-deletion --output json *> $null
    }
}
