# run_api.R
# Script to launch the Plumber API server locally
# Use this in a separate R terminal/session

# !!! CRITICAL FIX: Use the fresh library we just created !!!
fresh_lib <- normalizePath(file.path(Sys.getenv("USERPROFILE"), "R_Fresh_Lib"), mustWork = FALSE)
if (dir.exists(fresh_lib)) .libPaths(c(fresh_lib, .libPaths()))
message("Using Library Paths: ", paste(.libPaths(), collapse = "\n"))

library(plumber)

# 1. Force Working Directory to the folder where this script is
# This handles the "Volley +" space issue by avoiding relative path confusion from random start points
script_dir <- "c:/Users/rzbui/OneDrive/Documentos/Portfolio/Volley +/volleyPlusAPI/r-parser"

if (dir.exists(script_dir)) {
    setwd(script_dir)
    message("Set working directory to: ", script_dir)
} else {
    warning("Could not set working directory to: ", script_dir)
}

# 2. Find plumber.R
plumber_file <- "plumber.R"

if (!file.exists(plumber_file)) {
    # Fallback checking
    if (file.exists("r-parser/plumber.R")) {
        plumber_file <- "r-parser/plumber.R"
    } else {
        stop("FATAL: Could not find 'plumber.R' in ", getwd())
    }
}

message("Found plumber file at: ", normalizePath(plumber_file))
message("--- Starting local R API on port 8000 ---")

pr <- pr(plumber_file)
pr_run(pr, port = 8000)
