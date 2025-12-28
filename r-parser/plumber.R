# plumber.R
library(plumber)
library(jsonlite)
library(datavolley)
library(aws.s3)
library(dotenv)

# Load environment variables if they exist
if (file.exists(".env")) {
  dotenv::load_dot_env(".env")
}

#* @apiTitle DVW Parser API
#* @apiDescription API to parse DataVolley (.dvw) files and convert them to JSON.

#* Parse a DVW file and return JSON
#* @param req The request object
#* @post /parse
#* @parser multi
#* @serializer json
function(req, res) {
  # Debug Logging
  message("--- Incoming Request ---")
  message(paste("Content-Type:", req$HTTP_CONTENT_TYPE))
  
  # Try to see if postBody has data
  if (!is.null(req$postBody)) {
     message(paste("postBody size:", nchar(req$postBody)))
  }

  if (!is.null(req$FILES)) {
      message("req$FILES found. Keys:")
      print(names(req$FILES))
  } else {
      message("req$FILES is NULL")
      # Fallback: check args
      if (!is.null(req$args)) {
          message("req$args keys:")
          print(names(req$args))
      }
  }

  if (is.null(req$FILES) || is.null(req$FILES$file)) {
    # Attempt to find file in args if parser put it there
    if (!is.null(req$args$file)) {
        message("File found in req$args!")
        # It might be in args if it wasn't treated as a file upload but as a form field
        # But for files, we need the path. 
        # If it's in args, it might be the content string?
        res$status <- 400
        return(list(
            error = "No file uploaded (checked FILES). Found something in args?", 
            args_keys = names(req$args)
        ))
    }
    
    res$status <- 400
    return(list(error = "No file uploaded. Please upload a file with key 'file'.", debug_files = names(req$FILES)))
  }
  
  # Get the temporary file path
  temp_file <- req$FILES$file$tempfile_name
  original_name <- req$FILES$file$name
  
  message(paste("Received file:", original_name))
  
  # Process the file
  tryCatch({
    # Read DVW file
    dvw_data <- dv_read(temp_file, encoding = "windows-1252", insert_technical_timeouts = FALSE)
    
    # Check if R2 credentials are set for upload
    if (Sys.getenv("R2_ACCESS_KEY_ID") != "" && Sys.getenv("R2_SECRET_ACCESS_KEY") != "") {
      bucket_name <- Sys.getenv("R2_BUCKET_NAME", "dvwfiles")
      endpoint <- Sys.getenv("R2_ENDPOINT")
      
      # Clean endpoint
      endpoint <- sub("/$", "", endpoint)
      endpoint <- sub("^https?://", "", endpoint)
      
      Sys.setenv(
        "AWS_ACCESS_KEY_ID" = Sys.getenv("R2_ACCESS_KEY_ID"),
        "AWS_SECRET_ACCESS_KEY" = Sys.getenv("R2_SECRET_ACCESS_KEY"),
        "AWS_S3_ENDPOINT" = endpoint,
        "AWS_DEFAULT_REGION" = ""
      )
      
      # Upload JSON to R2
      # Write to a temp file first to ensure safe upload
      json_output <- toJSON(dvw_data, auto_unbox = TRUE, null = "null", na = "null")
      temp_json <- tempfile(fileext = ".json")
      write(json_output, temp_json)
      
      object_name <- paste0("parsed/", original_name, ".json")
      
      tryCatch({
         aws.s3::put_object(
           file = temp_json, 
           object = object_name, 
           bucket = bucket_name,
           check_region = FALSE,
           headers = list(`Content-Type` = "application/json")
         )
         message(paste("Uploaded to R2:", object_name))
      }, error = function(e) {
        message(paste("R2 Upload failed:", e$message))
      }, finally = {
        if (file.exists(temp_json)) file.remove(temp_json)
      })
    }
    
    # Return the processed data
    return(dvw_data)
    
  }, error = function(e) {
    res$status <- 500
    return(list(error = paste("Failed to parse DVW file:", e$message)))
  })
}
