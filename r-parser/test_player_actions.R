# test_player_actions.R

# Load plumber logic
source("r-parser/plumber.R")

message("Testing extract_player_actions logic...")

# Mock Datavolley object
mock_meta <- list(
    teams = list(
        home = "Team Home",
        visiting = "Team Visiting"
    )
)

mock_plays <- data.frame(
    team = c("Team Home", "Team Home", "Team Visiting", "Team Home"),
    player_number = c(7, 10, 5, 7),
    set_number = c(1, 1, 1, 2),
    rally_number = c(1, 2, 3, 1),
    time = c(100, 101, 102, 200),
    skill = c("Serve", "Attack", "Dig", "Attack"),
    stringsAsFactors = FALSE
)

mock_dv <- list(
    meta = mock_meta,
    plays = mock_plays
)

# Test 1: Extract Home Player 7
message("\n--- Test 1: Extract 'home' Player 7 ---")
result1 <- extract_player_actions(mock_dv, "home", 7)
print(result1)

if (nrow(result1) == 2 && all(result1$player_number == 7) && all(result1$team == "Team Home")) {
    message("PASS: Found 2 actions for Home Player 7")
} else {
    message("FAIL: Test 1")
}

# Test 2: Extract Visiting Player 5
message("\n--- Test 2: Extract 'visiting' Player 5 ---")
result2 <- extract_player_actions(mock_dv, "visiting", 5)
print(result2)

if (nrow(result2) == 1 && result2$team[1] == "Team Visiting") {
    message("PASS: Found 1 action for Visiting Player 5")
} else {
    message("FAIL: Test 2")
}

# Test 3: Extract with String Number (API simulation)
message("\n--- Test 3: Extract with string number '7' ---")
result3 <- extract_player_actions(mock_dv, "home", "7")
print(result3)

if (nrow(result3) == 2) {
    message("PASS: Handled string conversion")
} else {
    message("FAIL: Test 3")
}
