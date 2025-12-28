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
  
  # Try to see if postBody has data (careful with binary data logging)
  if (!is.null(req$postBody)) {
     message("postBody is present (binary data hidden)")
  }

  # Fallback: Check if Plumber put the file content in args (common for text/plain parts)
  if ((is.null(req$FILES) || is.null(req$FILES$file)) && !is.null(req$args$file)) {
      message("Fallback: File found in req$args$file")
      content <- req$args$file
      temp_f <- tempfile(fileext = ".dvw")
      
      tryCatch({
          if (is.raw(content)) {
              writeBin(content, temp_f)
          } else {
              # Assume character - dvw is text
              writeLines(as.character(content), temp_f)
          }
          message(paste("Saved fallback content to:", temp_f))
          # Mock req$FILES so the downstream logic works
          req$FILES <- list(file = list(tempfile_name = temp_f, name = "uploaded_from_args.dvw"))
      }, error = function(e) {
          message(paste("Failed to save fallback content:", e$message))
      })
  }
  
  # Manual Parse Fallback (Last Resort)
  if (is.null(req$FILES) || is.null(req$FILES$file)) {
      message("Attempting manual parse with mime::parse_multipart...")
      tryCatch({
          parsed <- mime::parse_multipart(req)
          if (!is.null(parsed$file)) {
              temp_f <- tempfile(fileext = ".dvw")
              # mime::parse_multipart might return a list or raw/char. 
              # If it's a list, look for 'content' or assume the list *is* the part info?
              # Debugging show that parsed$file caused writeBin error (vector expected).
              # It implies parsed$file is a list.
              part <- parsed$file
              
              # If part is a list, try to find content
              content_to_write <- part
              if (is.list(part)) {
                  # Only try to extract if we see a 'content' slot or similar, otherwise rely on args.
                  # For now, let's just serialize it to text if we can't find raw.
                  message("Manual parse: 'file' is a list. Keys: ", paste(names(part), collapse=", "))
                  # Usually 'dat' or 'content' is the binary.
                  # If we can't find it easily, forego this path since args likely worked.
              } else {
                  writeBin(part, temp_f)
                  req$FILES <- list(file = list(tempfile_name = temp_f, name = "uploaded_manual.dvw"))
              }
          }
      }, error = function(e) {
          message("Manual parse failed: ", e$message)
      })
  }

  if (is.null(req$FILES) || is.null(req$FILES$file)) {
    res$status <- 400
    return(list(error = "No file uploaded. Please upload a file with key 'file'.", debug_files = names(req$FILES), args_keys = names(req$args)))
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
