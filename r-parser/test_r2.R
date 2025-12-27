# test_r2.R
# Diagnostic script to test Cloudflare R2 connection

local_lib <- file.path(getwd(), "r-parser", "libs")
if (dir.exists(local_lib)) .libPaths(c(local_lib, .libPaths()))

library(dotenv)
library(aws.s3)

message("--- Starting R2 Connectivity Test ---")

# Load secrets
vars_path <- file.path(getwd(), "worker", ".dev.vars")
if (file.exists(vars_path)) {
  message("Loading worker/.dev.vars")
  load_dot_env(vars_path)
}

# Get Vars
key <- Sys.getenv("R2_ACCESS_KEY_ID")
secret <- Sys.getenv("R2_SECRET_ACCESS_KEY")
endpoint <- Sys.getenv("R2_ENDPOINT")
bucket <- Sys.getenv("R2_BUCKET_NAME", "dvwfiles")

message(paste("Access Key found:", ifelse(key != "", "YES", "NO")))
message(paste("Secret found:", ifelse(secret != "", "YES", "NO")))
message(paste("Bucket:", bucket))

# Clean endpoint
endpoint <- sub("/$", "", endpoint)
endpoint <- sub("^https?://", "", endpoint)
message(paste("Cleaned Endpoint:", endpoint))

# Configure AWS S3
Sys.setenv(
  "AWS_ACCESS_KEY_ID" = key,
  "AWS_SECRET_ACCESS_KEY" = secret,
  "AWS_S3_ENDPOINT" = endpoint,
  "AWS_DEFAULT_REGION" = "us-east-1"
)

# Attempt Listing Buckets
message("\nAttempting to list buckets...")
tryCatch({
  bl <- bucketlist(check_region = FALSE)
  print(bl)
  message("SUCCESS: Bucket list retrieved.")
}, error = function(e) {
  message("LIST FAIL (Expected if token is scoped):")
  # print(e) # Reduce noise
})

# Attempt Create Bucket (Idempotent if exists and we have access)
message(paste("\nAttempting to ensure bucket '", bucket, "' exists...", sep=""))
tryCatch({
  put_bucket(bucket, check_region = FALSE)
  message("SUCCESS: Bucket created/verified.")
}, error = function(e) {
  message("CREATE BUCKET FAIL:")
  message(e$message)
})

# Attempt Upload
message("\nAttempting upload of 'test.txt'...")
tryCatch({
  result <- put_object(
    file = charToRaw("Hello R2 from R"), 
    object = "test.txt", 
    bucket = bucket,
    check_region = FALSE,
    headers = list(`Content-Type` = "text/plain")
  )
  
  if (isTRUE(result)) {
      message("SUCCESS: Upload returned TRUE")
  } else {
      message("RESULT:")
      print(result)
  }
  
}, error = function(e) {
  message("CRITICAL FAILURE:")
  message(e$message)
})
