# plumber.R
library(plumber)
library(jsonlite)
library(datavolley)
library(aws.s3)
library(dplyr)
library(dotenv)

# Load environment variables if they exist
if (file.exists(".env")) {
  dotenv::load_dot_env(".env")
}

# Helper: Extract file from request (handle multipart and fallbacks)
get_file_from_req <- function(req) {
  message("--- Debug: get_file_from_req ---")
  message("Names in req$FILES: ", paste(names(req$FILES), collapse=", "))
  message("Names in req$args: ", paste(names(req$args), collapse=", "))

  # 1. Check if file is in req$FILES (standard plumber multipart)
  if (!is.null(req$FILES) && !is.null(req$FILES$file)) {
    return(req$FILES$file)
  }

  # 2. Check req$args (fallback for text/plain uploads)
  if (!is.null(req$args$file)) {
      message("Fallback: File found in req$args$file")
      
      message("Structure of args$file:")
      message(paste(capture.output(str(req$args$file)), collapse = "\n"))

      content <- req$args$file
      
      # Handle list wrapping (often happens with plumber and text/plain fallback)
      if (is.list(content)) {
          message("Debug: Content is a list. Extracting first element.")
          content <- content[[1]]
      }

      # Debug content type details (post-unwrap)
      message("Content Class (Unwrapped): ", class(content))
      message("Content Length (Unwrapped): ", length(content))
      if (is.character(content)) {
          message("First 100 chars: ", substr(content[1], 1, 100))
      }
      
      temp_f <- tempfile(fileext = ".dvw")
      
      tryCatch({
          if (is.raw(content)) {
              writeBin(content, temp_f)
          } else {
              # Force binary write to avoid Windows CRLF issues
              # NOTE: if content is a vector of lines, paste them first?
              # DVW files are usually one big string when via HTTP text/plain, but let's check.
              text_content <- as.character(content)
              if (length(text_content) > 1) {
                  message("Warning: Content is a vector of length ", length(text_content), ". Collapsing with newlines.")
                  text_content <- paste(text_content, collapse = "\n")
              }
              writeBin(charToRaw(text_content), temp_f)
          }
          
          # Debug: Read back first line of saved file
          first_line <- readLines(temp_f, n = 1, warn = FALSE)
          message("Saved File First Line: ", first_line)

          return(list(tempfile_name = temp_f, name = "uploaded_from_args.dvw"))
      }, error = function(e) {
          message(paste("Failed to save fallback content:", e$message))
          return(NULL)
      })
  }

  # 3. Manual Parse Fallback (Last Resort)
  message("Attempting manual parse with mime::parse_multipart...")
  tryCatch({
      parsed <- mime::parse_multipart(req)
      if (!is.null(parsed$file)) {
          temp_f <- tempfile(fileext = ".dvw")
          part <- parsed$file
          
          if (is.list(part)) {
              message("Manual parse: 'file' is a list. Skipping manual save.")
          } else {
              writeBin(part, temp_f)
              return(list(tempfile_name = temp_f, name = "uploaded_manual.dvw"))
          }
      }
  }, error = function(e) {
      message("Manual parse failed: ", e$message)
  })

  return(NULL)
}

extract_player_actions <- function(dv, target_team, target_number) {
    message("--- Debug: extract_player_actions ---")
    message("Target Team: ", target_team)
    message("Target Number: ", target_number)
    
    # Ensure number is numeric
    target_number <- as.numeric(target_number)
    
    # Use base R subsetting for robustness
    plays <- dv$plays
    
    # Filter
    subset_plays <- plays[which(plays$team == target_team & plays$player_number == target_number), ]
    
    # Sort (if rally_number exists, otherwise just by time or maintain order)
    if ("rally_number" %in% names(subset_plays)) {
        subset_plays <- subset_plays[order(subset_plays$set_number, subset_plays$rally_number), ]
    } else {
         subset_plays <- subset_plays[order(subset_plays$set_number), ]
    }
    
    return(subset_plays)
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
  message("--- Incoming Request (/parse) ---")
  message(paste("Content-Type:", req$HTTP_CONTENT_TYPE))
  
  file_info <- get_file_from_req(req)

  if (is.null(file_info)) {
    res$status <- 400
    return(list(error = "No file uploaded. Please upload a file with key 'file'.", debug_files = names(req$FILES), args_keys = names(req$args)))
  }
  
  # Get the temporary file path
  temp_file <- file_info$tempfile_name
  original_name <- file_info$name
  
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

#* Extract all raw plays from a DVW file (Base64 JSON)
#* @param req The request object
#* @post /raw-plays
#* @serializer json
function(req, res) {
  message("--- Incoming Request (/raw-plays) [JSON] ---")
  
  tryCatch({
      # Parse JSON body directly
      body_data <- jsonlite::fromJSON(req$postBody)
      
      file_content_b64 <- body_data$file_content
      filename <- body_data$filename
      
      if (is.null(file_content_b64)) {
          res$status <- 400
          return(list(error = "Missing required field: file_content"))
      }

      # Decode Base64 to temp file
      temp_f <- tempfile(fileext = ".dvw")
      raw_content <- jsonlite::base64_dec(file_content_b64)
      writeBin(raw_content, temp_f)
      
      message("Saved decoded file to: ", temp_f)

      # Process
      dvw_data <- dv_read(temp_f, encoding = "windows-1252", insert_technical_timeouts = FALSE)
      
      # Return all plays without filtering
      return(dvw_data$plays)

  }, error = function(e) {
      message("Error handling request: ", e$message)
      res$status <- 500
      return(list(error = paste("Processing failed:", e$message)))
  })
}

#* Extract meta data from a DVW file (Base64 JSON)
#* @param req The request object
#* @post /meta
#* @serializer json
function(req, res) {
  message("--- Incoming Request (/meta) [JSON] ---")
  
  tryCatch({
      body_data <- jsonlite::fromJSON(req$postBody)
      file_content_b64 <- body_data$file_content
      
      if (is.null(file_content_b64)) {
          res$status <- 400
          return(list(error = "Missing required field: file_content"))
      }

      temp_f <- tempfile(fileext = ".dvw")
      raw_content <- jsonlite::base64_dec(file_content_b64)
      writeBin(raw_content, temp_f)
      
      message("Saved decoded file to: ", temp_f)

      dvw_data <- dv_read(temp_f, encoding = "windows-1252", insert_technical_timeouts = FALSE)
      
      return(dvw_data$meta)

  }, error = function(e) {
      message("Error handling request: ", e$message)
      res$status <- 500
      return(list(error = paste("Processing failed:", e$message)))
  })
}

#* Extract filtered meta data from a DVW file (Base64 JSON)
#* Returns specific fields: match (date, season, league, phase), result, teams, teams, players_h, players_v
#* @param req The request object
#* @post /meta/filtered
#* @serializer json
function(req, res) {
  message("--- Incoming Request (/meta/filtered) [JSON] ---")
  
  tryCatch({
      body_data <- jsonlite::fromJSON(req$postBody)
      file_content_b64 <- body_data$file_content
      
      if (is.null(file_content_b64)) {
          res$status <- 400
          return(list(error = "Missing required field: file_content"))
      }

      temp_f <- tempfile(fileext = ".dvw")
      raw_content <- jsonlite::base64_dec(file_content_b64)
      writeBin(raw_content, temp_f)
      
      message("Saved decoded file to: ", temp_f)

      dvw_data <- dv_read(temp_f, encoding = "windows-1252", insert_technical_timeouts = FALSE)
      
      meta <- dvw_data$meta
      
      # Construct filtered response
      response <- list(
          match = list(
              date = meta$match$date,
              season = meta$match$season,
              league = meta$match$league,
              phase = meta$match$phase
          ),
          result = meta$result,
          teams = meta$teams,
          players_h = meta$players_h,
          players_v = meta$players_v
      )
      
      return(response)

  }, error = function(e) {
      message("Error handling request: ", e$message)
      res$status <- 500
      return(list(error = paste("Processing failed:", e$message)))
  })
}



#* Extract actions for a specific player (Base64 JSON)
#* @param req The request object
#* @post /player-actions
#* @serializer json
function(req, res) {
  message("--- Incoming Request (/player-actions) [JSON] ---")
  
  tryCatch({
      # Parse JSON body directly
      body_data <- jsonlite::fromJSON(req$postBody)
      
      file_content_b64 <- body_data$file_content
      filename <- body_data$filename
      team <- body_data$team
      number <- body_data$number
      
      if (is.null(file_content_b64) || is.null(team) || is.null(number)) {
          res$status <- 400
          return(list(error = "Missing required fields: file_content, team, or number"))
      }

      # Decode Base64 to temp file
      temp_f <- tempfile(fileext = ".dvw")
      # helper to decode base64 string to raw vector
      raw_content <- jsonlite::base64_dec(file_content_b64)
      writeBin(raw_content, temp_f)
      
      message("Saved decoded file to: ", temp_f)

      # Process
      dvw_data <- dv_read(temp_f, encoding = "windows-1252", insert_technical_timeouts = FALSE)
      actions <- extract_player_actions(dvw_data, team, number)
      
      return(actions)

  }, error = function(e) {
      message("Error handling request: ", e$message)
      res$status <- 500
      return(list(error = paste("Processing failed:", e$message)))
  })
}
