# run_vis.R
# Script to launch the Visualization API server locally on a separate port
# This avoids the deadlock where Vis API (8001) -> Worker -> Parser API (8000)

# === 0. SAFE LIBRARY PATH ======================================================
fresh_lib <- normalizePath(file.path(Sys.getenv("USERPROFILE"), "R_Fresh_Lib"), mustWork = FALSE)
if (dir.exists(fresh_lib)) .libPaths(c(fresh_lib, .libPaths()))
message("Using Library Paths: ", paste(.libPaths(), collapse = "\n"))

library(plumber)

# 1. Force Working Directory
script_dir <- "c:/Users/rzbui/OneDrive/Documentos/Portfolio/Volley +/volleyPlusAPI/r-parser"
if (dir.exists(script_dir)) {
    setwd(script_dir)
    message("Set working directory to: ", script_dir)
}

# Auto-launch API server in a separate window (Windows only)
message("--- Auto-launching API Server (run_api.R) in new window ---")

# Find Rscript dynamically
r_bin <- file.path(R.home("bin"), "Rscript.exe")
if (!file.exists(r_bin)) r_bin <- "Rscript" # fallback

# Use 'start' with a dummy title ("API_Window") to handle quotes correctly
cmd <- paste("start", "\"API_8000\"", shQuote(r_bin), "run_api.R")
message("Executing: ", cmd)
shell(cmd)

Sys.sleep(3) # Wait a moment for it to initialize

# 2. Find file
vis_file <- "visualize_attack.R"

message("Found file at: ", normalizePath(vis_file))
message("--- Starting local Visualization API on PORT 8001 ---")

pr <- pr(vis_file)
pr_run(pr, port = 8001)
