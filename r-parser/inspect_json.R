# inspect_json.R

# Setup local lib
local_lib <- file.path(getwd(), "r-parser", "libs")
if (dir.exists(local_lib)) .libPaths(c(local_lib, .libPaths()))

library(jsonlite)

# Read the file
data <- fromJSON("sample.json")

# Print top level names
print("Top Level Keys:")
print(names(data))

# Print match info structure
print("Match Object Keys:")
print(names(data$match))

# Print meta info structure
if (!is.null(data$meta)) {
    print("Meta Object Keys:")
    print(names(data$meta))
    
    if (!is.null(data$meta$teams)) {
        print("Meta Teams Structure:")
        str(data$meta$teams)
    }
    
    if (!is.null(data$meta$players_h)) {
        print("Home Players Structure (first row):")
        str(data$meta$players_h[1,])
    }
} else {
    print("No 'meta' key found.")
}
