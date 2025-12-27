# process_dvw.R
# Script to read a .dvw file and export it to JSON

# Use local library
local_lib <- file.path(getwd(), "r-parser", "libs")
if (dir.exists(local_lib)) .libPaths(c(local_lib, .libPaths()))

library(jsonlite)
library(datavolley)
library(dotenv)

# Get command line arguments
args <- commandArgs(trailingOnly = TRUE)

# Expected usage: Rscript process_dvw.R <input_file.dvw> <output_file.json>
if (length(args) < 2) {
  stop("Usage: Rscript process_dvw.R <input_file.dvw> <output_file.json>")
}

input_path <- args[1]
output_path <- args[2]

if (!file.exists(input_path)) {
  stop(paste("Input file not found:", input_path))
}

message(paste("Reading DVW file:", input_path))

tryCatch({
  # Read DVW file
  # handling encoding issues common in DVW files
  dvw_data <- dv_read(input_path, encoding = "windows-1252", insert_technical_timeouts = FALSE)
  
  # Convert to standard list/JSON structure
  # We serialize the entire object. 
  # You might want to filter specific fields later if too large, 
  # but for raw storage, keeping everything is safer.
  json_output <- toJSON(dvw_data, auto_unbox = TRUE, null = "null", na = "null")
  
  # Write to file
  write(json_output, file = output_path)
  
  message(paste("Successfully converted to:", output_path))
  
  # --- Upload to Cloudflare R2 ---
  
  # Try to load secrets from worker/.dev.vars if variables not set
  if (Sys.getenv("R2_ACCESS_KEY_ID") == "") {
      vars_path <- file.path(getwd(), "worker", ".dev.vars")
      if (file.exists(vars_path)) {
          message("Loading environment variables from worker/.dev.vars")
          dotenv::load_dot_env(vars_path)
      }
  }

  # Check if credentials exist
  if (Sys.getenv("R2_ACCESS_KEY_ID") != "" && Sys.getenv("R2_SECRET_ACCESS_KEY") != "") {
      message("R2 Credentials found.")
      
      bucket_name <- Sys.getenv("R2_BUCKET_NAME", "dvwfiles")
      endpoint <- Sys.getenv("R2_ENDPOINT")
      
      message(paste("Bucket:", bucket_name))
      message(paste("Endpoint (first 10 chars):", substr(endpoint, 1, 10)))
      
      # cleaning endpoint just in case (removing trailing slash and protocol)
      endpoint <- sub("/$", "", endpoint)
      endpoint <- sub("^https?://", "", endpoint)
      
      # aws.s3 configuration
      Sys.setenv(
          "AWS_ACCESS_KEY_ID" = Sys.getenv("R2_ACCESS_KEY_ID"),
          "AWS_SECRET_ACCESS_KEY" = Sys.getenv("R2_SECRET_ACCESS_KEY"),
          "AWS_S3_ENDPOINT" = endpoint,
          "AWS_DEFAULT_REGION" = ""
      )
      
      tryCatch({
          # Upload file
          aws.s3::put_object(
              file = output_path, 
              object = paste0("raw/", basename(output_path)), 
              bucket = bucket_name,
              check_region = FALSE,
              headers = list(`Content-Type` = "application/json")
          )
          message(paste("Successfully uploaded to R2 bucket:", bucket_name))
      }, error = function(e) {
          message("Upload failed:")
          message(e$message)
          # Don't fail the whole script if just upload fails, unless desired
      })
      
  } else {
      message("Skipping Upload: R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY not found.")
      message("Please add them to worker/.dev.vars")
  }

}, error = function(e) {
  message("Error processing file:")
  message(e$message)
  quit(status = 1)
})
