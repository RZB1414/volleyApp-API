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
  
  # Infer coordinates from zones if they are missing
  # detailed coordinates (x,y) might be NA if not clicked, but zones usually exist.
  # We use dv_xy to populate them for 'lower' court (standard view) if missing.
  
  if (all(is.na(dvw_data$plays$start_coordinate_x)) || all(is.null(dvw_data$plays$start_coordinate_x))) {
      message("Coordinates missing. Inferring start coordinates from zones...")
      start_coords <- dv_xy(dvw_data$plays$start_zone, end = "lower")
      dvw_data$plays$start_coordinate_x <- start_coords$x
      dvw_data$plays$start_coordinate_y <- start_coords$y
  } else {
      # Patch individual NAs if some are present but others missing? 
      # For now, let's just patch NAs.
      missing_start <- is.na(dvw_data$plays$start_coordinate_x) & !is.na(dvw_data$plays$start_zone)
      if (any(missing_start)) {
          patched_start <- dv_xy(dvw_data$plays$start_zone[missing_start], end = "lower")
          dvw_data$plays$start_coordinate_x[missing_start] <- patched_start$x
          dvw_data$plays$start_coordinate_y[missing_start] <- patched_start$y
      }
  }

  if (all(is.na(dvw_data$plays$end_coordinate_x)) || all(is.null(dvw_data$plays$end_coordinate_x))) {
       message("End coordinates missing. Inferring from zones...")
       end_coords <- dv_xy(dvw_data$plays$end_zone, end = "lower")
       dvw_data$plays$end_coordinate_x <- end_coords$x
       dvw_data$plays$end_coordinate_y <- end_coords$y
  } else {
      missing_end <- is.na(dvw_data$plays$end_coordinate_x) & !is.na(dvw_data$plays$end_zone)
      if (any(missing_end)) {
          patched_end <- dv_xy(dvw_data$plays$end_zone[missing_end], end = "lower")
          dvw_data$plays$end_coordinate_x[missing_end] <- patched_end$x
          dvw_data$plays$end_coordinate_y[missing_end] <- patched_end$y
      }
  }

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
  if (Sys.getenv("R2_ACCESS_KEY_ID") == "" && Sys.getenv("SKIP_UPLOAD") == "") {
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
