# setup_env.R
# Script to install dependencies for the DVW parser

# Create and use local library to avoid Admin permission issues
local_lib <- file.path(getwd(), "r-parser", "libs")
if (!dir.exists(local_lib)) dir.create(local_lib, recursive = TRUE)
.libPaths(c(local_lib, .libPaths()))

message(paste("Using local library:", local_lib))

# Function to check and install packages
ensure_package <- function(pkg, source = "cran", github_repo = NULL) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    message(paste("Installing", pkg, "..."))
    if (source == "cran") {
      install.packages(pkg, repos = "https://cloud.r-project.org")
    } else if (source == "github" && !is.null(github_repo)) {
      if (!requireNamespace("remotes", quietly = TRUE)) {
        install.packages("remotes", repos = "https://cloud.r-project.org")
      }
      remotes::install_github(github_repo)
    }
  } else {
    message(paste(pkg, "already installed."))
  }
}

# Install jsonlite for JSON export
ensure_package("jsonlite")
ensure_package("dotenv")
ensure_package("aws.s3", source = "cran")

# Install datavolley from OpenVolley (GitHub)
ensure_package("datavolley", source = "github", github_repo = "openvolley/datavolley")

message("Setup complete! You can now run process_dvw.R")
