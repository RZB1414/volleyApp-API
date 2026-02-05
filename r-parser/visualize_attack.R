# visualize_attack.R
# Otimizado para Frontend: Retorna SVG via API
# -----------------------------------------------------------------------------

# === 0. SAFE LIBRARY PATH ======================================================
fresh_lib <- normalizePath(file.path(Sys.getenv("USERPROFILE"), "R_Fresh_Lib"), mustWork = FALSE)
if (dir.exists(fresh_lib)) .libPaths(c(fresh_lib, .libPaths()))

# === 1. LOAD LIBRARIES =========================================================
suppressPackageStartupMessages({
    library(ggplot2)
    library(sportyR)
    library(dplyr)
    library(tibble)
    library(httr)
    library(jsonlite)
    library(svglite)
})

# === 2. BACKGROUND CACHE (GLOBAL) ==============================================
# Background gerado uma vez no startup
plot_background <- geom_volleyball(
    league = "fivb",
    display_range = "full",
    court_units = "m",
    color_updates = list(
        court_apron = "#ffffff",
        court = "#f3f4f6",
        lines = "#cbd5e1"
    )
) + theme_void()

# Paleta
paleta_ataque <- c(
    "#" = "#10b981",    # Point (Emerald)
    "=" = "#ef4444",    # Error (Red)
    "/" = "#6366f1",    # Blocked (Indigo)
    "-" = "#f59e0b",    # Negative (Amber)
    "!" = "#f59e0b",    # Continuation
    "+" = "#3b82f6"     # Positive (Blue)
)

# === 3. PLUMBER ENDPOINT =======================================================

#* @filter cors
function(res) {
    res$setHeader("Access-Control-Allow-Origin", "*")
    res$setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
    res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-local-dev-key")
    plumber::forward()
}

#* @options /attack-svg
function(res) {
    # Headers are already set by the @filter 'cors' above
    # We just need to return 200 OK to satisfy the preflight
    res$status <- 200
    return(list())
}

#* Generate Attack Visualization SVG
#* @param req The request object (expects JSON body with team, number, fileKey)
#* @post /attack-svg
#* @serializer contentType list(type="image/svg+xml")
function(req, res) {
    message("--- Incoming Request (/vis/attack-svg) ---")
    
    # 1. Parse Body
    tryCatch({
        params <- jsonlite::fromJSON(req$postBody)
        team <- params$team
        number <- params$number
        fileKey <- params$fileKey
        
        if (is.null(team) || is.null(number) || is.null(fileKey)) {
            res$status <- 400
            return(list(error = "Missing required params: team, number, fileKey"))
        }

        # 2. Fetch Data from Worker (or Local API)
        # Note: In production, URL might be env var. Here hardcoded to localhost:3000
        worker_url <- "http://localhost:3000/dvw/player-actions-by-skill"
        
        message("Fetching data for: ", team, " #", number)
        
        api_res <- POST(
            url = worker_url,
            body = list(
                team = team,
                number = number,
                fileKey = fileKey
            ),
            add_headers("x-local-dev-key" = "super-secret-dev-key"),
            encode = "json",
            timeout(30)
        )
        
        if (status_code(api_res) != 200) {
            stop("Worker API Error: ", status_code(api_res))
        }
        
        api_data <- fromJSON(content(api_res, "text", encoding = "UTF-8"))
        
        if (is.null(api_data$Attack) || length(api_data$Attack) == 0) {
            # Return empty transparent SVG if no data? Or error?
            # Lets return error for now to be explicit
            res$status <- 404
            return(list(error = "No attacks found for this player."))
        }
        
        # 3. Process Data
        attack_data <- as_tibble(api_data$Attack) 
        
        # Transform Coords
        attack_plot_data <- attack_data %>%
            mutate(
                x_start_plot = (start_coordinate_y - 3.5) * 3,
                y_start_plot = -(start_coordinate_x - 2.0) * 3,
                x_end_plot   = (end_coordinate_y   - 3.5) * 3,
                y_end_plot   = -(end_coordinate_x   - 2.0) * 3
            )
            
        # 4. Generate Layer Plot
        plot_layer <- ggplot() +

        geom_segment(
            data = attack_plot_data,
            aes(
                x = x_start_plot, y = y_start_plot,
                xend = x_end_plot, yend = y_end_plot,
                color = evaluation_code
            ),
            arrow = arrow(length = unit(0.02, "npc"), type = "closed"),
            linewidth = 1,
            alpha = 0.8
        ) +
        geom_point(
            data = attack_plot_data,
            aes(
                x = x_start_plot, y = y_start_plot,
                color = evaluation_code
            ),
            size = 2.5
        ) +
        scale_color_manual(values = paleta_ataque) +
        theme_void() +
        theme(
            legend.position = "none",
            plot.margin = margin(0, 0, 0, 0, "cm"),
            panel.background = element_rect(fill = "transparent", colour = NA),
            plot.background = element_rect(fill = "transparent", colour = NA)
        ) +
        # Crop to court dimensions + 1m buffer
        # Court is 18m long (-9 to 9) and 9m wide (-4.5 to 4.5)
        coord_fixed(xlim = c(-10, 10), ylim = c(-5.5, 5.5))

        # 5. Render to SVG String
        # Create temp file for svg
        tmp_svg <- tempfile(fileext = ".svg")
        
        # Use svglite to save to temp file
        ggsave(
            tmp_svg, 
            plot = plot_layer, 
            width = 6, 
            height = 10, 
            device = svglite, 
            bg = "transparent"
        )
        
        # Read content
        svg_content <- readChar(tmp_svg, file.info(tmp_svg)$size)
        file.remove(tmp_svg)
        
        return(svg_content)
        
    }, error = function(e) {
        message("Error generating SVG: ", e$message)
        res$status <- 500
        return(list(error = e$message))
    })
}
