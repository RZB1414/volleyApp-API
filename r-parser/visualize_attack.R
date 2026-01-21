# visualize_attack.R
# Immediate local visualization of volleyball attacks (DataVolley → sportyR)
# -----------------------------------------------------------------------------

# === 0. SAFE LIBRARY PATH (Windows permission fix) =============================
fresh_lib <- normalizePath(
    file.path(Sys.getenv("USERPROFILE"), "R_Fresh_Lib"),
    mustWork = FALSE
)
if (dir.exists(fresh_lib)) .libPaths(c(fresh_lib, .libPaths()))
message("Using Library Paths:\n", paste(.libPaths(), collapse = "\n"))

# === 1. LOAD LIBRARIES =========================================================
suppressPackageStartupMessages({
    library(ggplot2)
    library(sportyR)
    library(dplyr)
    library(tibble)
    library(httr)
    library(jsonlite)
})

# === 2. AUTO-START SERVER LOGIC ================================================
check_api_status <- function(url = "http://127.0.0.1:8000/") {
    tryCatch({
        httr::HEAD(url, timeout(1))
        return(TRUE)
    }, error = function(e) return(FALSE))
}

if (!check_api_status()) {
    message("⚠️  Local R API (Port 8000) not detected.")
    message("🚀 Attempting to auto-start 'run_api.R' in background...")
    
    # Locate API script
    # Strategy: Check CWD, subfolder, then absolute path
    possible_paths <- c(
        "run_api.R",
        "r-parser/run_api.R",
        "c:/Users/rzbui/OneDrive/Documentos/Portfolio/Volley +/volleyPlusAPI/r-parser/run_api.R"
    )

    api_script <- NULL
    for (p in possible_paths) {
        if (file.exists(p)) {
            api_script <- p
            break
        }
    }

    if (!is.null(api_script)) {
        message("found server script at: ", api_script)
        # Construct command to run invisible on Windows
        rscript_path <- file.path(R.home("bin"), "Rscript.exe")
        cmd <- paste0('"', rscript_path, '" "', api_script, '"')
        
        # Launch in background (wait=FALSE)
        system(cmd, wait = FALSE, invisible = FALSE)
        
        # Wait for spin-up (polling)
        message("⏳ Waiting for server to start...")
        for (i in 1:10) {
            Sys.sleep(1)
            if (check_api_status()) {
                message("✅ Server is UP!")
                break
            }
            if (i == 10) warning("⚠️  Server taking long to respond. The script might fail if not ready.")
        }
    } else {
        warning("❌ Could not find 'run_api.R'. Please start the server manually.")
    }
} else {
    message("✅ Local R API is already running.")
}

# === 3. FETCH DATA =============================================================
message("Fetching data from API...")

attack_data <- tryCatch(
    {
        res <- POST(
            url = "http://localhost:3000/dvw/player-actions-by-skill",
            body = list(
                team = "Vero Volley Monza",
                number = 11, # Bartlomiej Lemanski
                fileKey = "raw/_2026-01-04_717986_Monza-CV_VM_.dvw"
            ),
            add_headers("x-local-dev-key" = "super-secret-dev-key"),
            encode = "json",
            timeout(30)
        )

        if (status_code(res) != 200) {
            stop("API Error: ", status_code(res))
        }

        api_data <- fromJSON(content(res, "text", encoding = "UTF-8"))

        if (is.null(api_data$Attack)) {
            stop("No 'Attack' data found in API response.")
        }

        as_tibble(api_data$Attack) %>%
            select(
                match_id,
                player_name,
                start_zone,
                end_zone,
                evaluation_code,
                start_coordinate_x,
                start_coordinate_y,
                end_coordinate_x,
                end_coordinate_y
            )
    },
    error = function(e) {
        stop(
            "⚠️ API Request Failed: ",
            e$message,
            "\nMake sure the local API is running."
        )
    }
)

message(
    "Data loaded: ",
    nrow(attack_data),
    " attacks for ",
    attack_data$player_name[1]
)

# === 3. COORDINATE TRANSFORMATION =============================================
# DataVolley court (logical units):
#   X: 0.5 → 3.5  (width, center = 2.0)
#   Y: 0.5 → 6.5  (length, center = 3.5)
#
# sportyR FIVB court (meters):
#   X: -4.5 → +4.5
#   Y: -9   → +9
#
# We want attacks LEFT → RIGHT on screen.
# Correct solution: rotate DV coordinates into sportyR space (NO coord_flip)

attack_plot_data <- attack_data %>%
    mutate(
        x_start_plot = (start_coordinate_y - 3.5) * 3,
        y_start_plot = -(start_coordinate_x - 2.0) * 3,
        x_end_plot   = (end_coordinate_y   - 3.5) * 3,
        y_end_plot   = -(end_coordinate_x   - 2.0) * 3
    )

message("Transformed coordinates (DataVolley → sportyR meters):")
print(
    attack_plot_data %>%
        select(
            start_zone,
            start_coordinate_x,
            start_coordinate_y,
            x_start_plot,
            y_start_plot
        )
)

# === 4. VISUALIZATION ==========================================================
court_plot <- geom_volleyball(
    league = "fivb",
    display_range = "full",
    court_units = "m",
    color_updates = list(
        court_apron = "#F0F0F0",
        court = "#FFFFFF"
    )
) +
    geom_segment(
        data = attack_plot_data,
        aes(
            x = x_start_plot,
            y = y_start_plot,
            xend = x_end_plot,
            yend = y_end_plot,
            color = evaluation_code
        ),
        arrow = arrow(length = unit(0.03, "npc"), type = "closed"),
        linewidth = 1.2
    ) +
    geom_point(
        data = attack_plot_data,
        aes(
            x = x_start_plot, 
            y = y_start_plot,
            color = evaluation_code
        ),
        size = 3
    ) +
    scale_color_manual(
        values = c(
            "#" = "green",    # Point
            "+" = "blue",     # Positive
            "!" = "orange",   # Continuation
            "-" = "orange",   # Poor
            "/" = "purple",   # Blocked
            "=" = "red"       # Error
        ),
        na.value = "grey50",
        name = "Attack Outcome"
    ) +
    labs(
        title = paste("Attack Visualization:", attack_data$player_name[1]),
        subtitle = paste("Total Attacks Plotted:", nrow(attack_data)),
        caption = "Colors: # (Pt), = (Err), / (Blk), +/-/! (Cont)"
    ) +
    theme_minimal()

# === 5. RENDER =================================================================
print(court_plot)

message("Plot rendered successfully.")
