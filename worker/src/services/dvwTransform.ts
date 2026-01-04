import { z } from 'zod';
import type { Team, Player, Action, Coordinate } from './matchReport.service';

export interface MatchAnalysis {
    generatedAt: string;
    matchDate?: string | null;
    matchTime?: string | null;
    competition?: string;
    venue?: string;
    sets?: number;
    teams: {
        home: Team;
        away: Team;
    };
}

// Logic to transform Raw R output to MatchAnalysis
export function transformDvwToMatchReport(raw: any): MatchAnalysis {

    const matchDate = raw.match?.date || new Date().toISOString().split('T')[0];
    const matchTime = raw.match?.time || "00:00";
    const competition = raw.match?.league || raw.match?.season || "";
    const venue = raw.match?.arena || "";
    // Calculate total sets if not explicitly available, usually derived from scores
    // raw.result is array of sets.
    const sets = Array.isArray(raw.result) ? raw.result.filter((r: any) => r.played).length : 0;

    const homeTeamName = raw.match?.team_home || "Home";
    const awayTeamName = raw.match?.team_away || "Away";

    // --- Helper to initialize players ---
    const createPlayer = (p: any): Player => ({
        player_id: p.player_id || `P${p.number}`,
        name: p.name || `Player ${p.number}`,
        number: typeof p.number === 'string' ? parseInt(p.number) : p.number,
        position: p.role || "unknown",
        actions: []
    });

    // --- Handle players ---
    const homePlayersRaw = raw.meta?.players_h || [];
    const awayPlayersRaw = raw.meta?.players_v || [];

    const homePlayers: Player[] = Array.isArray(homePlayersRaw) ? homePlayersRaw.map(createPlayer) : [];
    const awayPlayers: Player[] = Array.isArray(awayPlayersRaw) ? awayPlayersRaw.map(createPlayer) : [];

    // Map for quick access
    const homeMap = new Map<number, Player>();
    homePlayers.forEach(p => homeMap.set(p.number, p));

    const awayMap = new Map<number, Player>();
    awayPlayers.forEach(p => awayMap.set(p.number, p));

    // --- Process Actions ---
    const plays = raw.plays || [];
    let actionIndex = 0;

    for (const play of plays) {
        // Filter redundant or metadata-only rows if necessary
        // Usually we want row where 'skill' is defined
        if (!play.skill) continue;

        // Find the player
        const pNum = play.player_number;
        let targetPlayer: Player | undefined;

        // Detect team
        // play.team usually contains the team Name
        const isHome = play.home_team; // boolean often provided by datavolley R package

        if (isHome) {
            targetPlayer = homeMap.get(pNum);
        } else {
            targetPlayer = awayMap.get(pNum);
        }

        if (!targetPlayer) {
            // Fallback or skip
            // console.warn(`Player ${pNum} not found for team ${play.team}`);
            continue;
        }

        // Map Coordinates
        // R parser might return start_coordinate_x/y
        const startCoord: Coordinate = {
            x: play.start_coordinate_x ?? null,
            y: play.start_coordinate_y ?? null
        };

        const endCoord: Coordinate = {
            x: play.end_coordinate_x ?? null,
            y: play.end_coordinate_y ?? null
        };

        // Map Result
        // evaluation_code: # = point, = = error, / = blocked/poor, - = negative, + = positive, ! = perfect
        let result = "continuation"; // default
        if (play.evaluation_code === '#') result = "point";
        else if (play.evaluation_code === '=') result = "error";
        // Specific logic overrides
        // If attack is blocked (/), it's often a point for other team, but purely from action result perspective it's 'blocked' or 'continuation' (rally continues? no). 
        // For simplicity usually: # point, = error. 
        // Refined logic:
        if (play.skill === 'Attack' && play.evaluation_code === '/') result = "blocked"; // or Error? blocked is error for attacker usually

        // Determine fundamental name
        const fundamental = play.skill.toLowerCase(); // attack, serve, set...

        const action: Action = {
            action_id: `act_${actionIndex++}`,
            set: play.set_number || 0,
            rally: play.point_id || actionIndex, // fallback
            timestamp: play.time || "",
            video_file_number: play.video_file_number,
            video_time: play.video_time,
            fundamental: fundamental,
            subtype: play.skill_type || play.attack_description || "", // R often puts description here or in skill_subtype
            start_zone: play.start_zone ? parseInt(String(play.start_zone)) : null,
            start_coordinates: startCoord,
            end_zone: play.end_zone ? parseInt(String(play.end_zone)) : null,
            end_coordinates: endCoord,
            trajectory: null, // Hard to infer without more logic or specific field
            block_touches: play.num_players_numeric ?? null, // e.g. number of blockers
            block_contact: null,
            quality: play.evaluation || play.evaluation_code,
            result: result,
            score_home_at_action: play.home_team_score,
            score_visiting_at_action: play.visiting_team_score,
            notes: play.custom_code || ""
        };

        targetPlayer.actions.push(action);
    }

    const report: MatchAnalysis = {
        generatedAt: new Date().toISOString(),
        matchDate,
        matchTime,
        competition,
        venue,
        sets,
        teams: {
            home: {
                team_name: homeTeamName,
                players: homePlayers
            },
            away: {
                team_name: awayTeamName,
                players: awayPlayers
            }
        }
    };

    return report;
}
