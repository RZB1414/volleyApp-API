# generate_court.R
# Script to generate a static volleyball court SVG
# -----------------------------------------------------------------------------

fresh_lib <- normalizePath(file.path(Sys.getenv("USERPROFILE"), "R_Fresh_Lib"), mustWork = FALSE)
if (dir.exists(fresh_lib)) .libPaths(c(fresh_lib, .libPaths()))

suppressPackageStartupMessages({
    library(ggplot2)
    library(sportyR)
    library(svglite)
})

# Generate Court
court_plot <- geom_volleyball(
    league = "fivb",
    display_range = "full",
    court_units = "m",
    color_updates = list(
        court_apron = "#ffffff",
        court = "#f3f4f6",
        lines = "#cbd5e1"
    )
) + 
theme_void() +
coord_fixed(xlim = c(-10, 10), ylim = c(-5.5, 5.5))

# Save to file
output_file <- "court_background.svg"

ggsave(
    output_file, 
    plot = court_plot, 
    width = 6, 
    height = 10, 
    device = svglite, 
    bg = "transparent"
)

message(paste("Court generated:", output_file))
