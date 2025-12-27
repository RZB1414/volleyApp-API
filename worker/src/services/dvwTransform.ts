import { z } from 'zod';

// Define the target schema based on stats.ts
export interface PlayerStats {
    number: number;
    name: string;
    stats: Record<string, string | number>;
}

export interface TeamReport {
    team: string;
    players: PlayerStats[];
}

export interface MatchReport {
    generatedAt: string;
    setColumns: number;
    columnLabels: string[];
    matchDate?: string | null;
    matchTime?: string | null;
    teams: TeamReport[];
}

// Logic to transform Raw R output to MatchReport
export function transformDvwToMatchReport(raw: any): MatchReport {

    const matchDate = raw.match?.date || new Date().toISOString().split('T')[0];
    const matchTime = raw.match?.time || "00:00";

    // Helper to init player stats
    const createPlayerStats = (p: any): PlayerStats => ({
        number: typeof p.number === 'string' ? parseInt(p.number) : p.number,
        name: p.name || `Player ${p.number}`,
        stats: {
            'Points': 0,
            'Errors': 0,
            'Attacks': 0,
            'Kills': 0,
            'Blocks': 0,
            'Aces': 0
        }
    });

    const homeTeamName = raw.match?.team_home || "Home";
    const awayTeamName = raw.match?.team_away || "Away";

    // Handle meta.players structure
    const homePlayersRaw = raw.meta?.players_h || [];
    const awayPlayersRaw = raw.meta?.players_v || [];

    // Convert raw players to PlayerStats (ensure array)
    // Sometimes homePlayersRaw is a data frame (array of objects)
    const homePlayers: PlayerStats[] = Array.isArray(homePlayersRaw)
        ? homePlayersRaw.map(createPlayerStats)
        : [];

    const awayPlayers: PlayerStats[] = Array.isArray(awayPlayersRaw)
        ? awayPlayersRaw.map(createPlayerStats)
        : [];

    // Map to find stats easily
    // We'll search by number + team logic
    const homeMap = new Map<number, PlayerStats>();
    homePlayers.forEach(p => homeMap.set(p.number, p));

    const awayMap = new Map<number, PlayerStats>();
    awayPlayers.forEach(p => awayMap.set(p.number, p));


    // AGGREGATION
    // raw.plays has the events
    const plays = raw.plays || [];

    for (const play of plays) {
        if (play.player_number === undefined || play.player_number === null) continue;

        let pStats: PlayerStats | undefined;

        // Determine team context
        if (play.team === homeTeamName || play.home_team) {
            pStats = homeMap.get(play.player_number);
        } else if (play.team === awayTeamName || !play.home_team) {
            pStats = awayMap.get(play.player_number);
        }

        if (!pStats) continue;

        // Aggregate Stats
        const skill = play.skill;
        const code = play.evaluation_code;

        if (skill === 'Attack') {
            pStats.stats['Attacks'] = (pStats.stats['Attacks'] as number) + 1;
            if (code === '#') {
                pStats.stats['Kills'] = (pStats.stats['Kills'] as number) + 1;
                pStats.stats['Points'] = (pStats.stats['Points'] as number) + 1;
            } else if (code === '=') {
                pStats.stats['Errors'] = (pStats.stats['Errors'] as number) + 1;
            }
        } else if (skill === 'Serve') {
            if (code === '#') {
                pStats.stats['Aces'] = (pStats.stats['Aces'] as number) + 1;
                pStats.stats['Points'] = (pStats.stats['Points'] as number) + 1;
            } else if (code === '=') {
                pStats.stats['Errors'] = (pStats.stats['Errors'] as number) + 1;
            }
        } else if (skill === 'Block') {
            if (code === '#') {
                pStats.stats['Blocks'] = (pStats.stats['Blocks'] as number) + 1;
                pStats.stats['Points'] = (pStats.stats['Points'] as number) + 1;
            }
        }
    }

    const report: MatchReport = {
        generatedAt: new Date().toISOString(),
        setColumns: 6,
        columnLabels: ['Total', 'Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'],
        matchDate,
        matchTime,
        teams: [
            { team: homeTeamName, players: homePlayers },
            { team: awayTeamName, players: awayPlayers }
        ]
    };

    return report;
}
