import { loadMatchFromJsonFolder } from '../src/analyzer/load-match.ts';
import { computeScoreboard } from '../src/scoreboard/compute.ts';

const folder = process.argv[2] ?? 'probe/match730_003810902276759879878_1126889551_389';
const match = await loadMatchFromJsonFolder(folder);

console.log('=== Match ===');
console.log('map:', match.mapName);
console.log('duration (sec):', match.duration);
console.log('date:', match.date);
console.log('tickrate/frameRate:', match.tickrate, match.frameRate);
console.log('winnerName:', match.winnerName, 'winnerSide:', match.winnerSide);
console.log('teams:', `${match.teamA.name} ${match.teamA.score} vs ${match.teamB.score} ${match.teamB.name}`);
console.log('players:', match.players.length);
for (const p of match.players.slice(0, 3)) {
  console.log(`  ${p.name} [${p.teamName}] K/D/A=${p.killCount}/${p.deathCount}/${p.assistCount} ADR=${p.averageDamagePerRound} HS%=${p.headshotPercentage} Rating=${p.hltvRating2 ?? p.hltvRating} MVP=${p.mvpCount} steamId=${p.steamId}`);
}
console.log('rounds:', match.rounds?.length ?? 0, 'kills:', match.kills?.length ?? 0);

console.log('\n=== Scoreboard ===');
const sb = computeScoreboard(match);
console.log(`${sb.teamA.name} (${sb.teamA.side}) ${sb.teamA.score} | ${sb.teamA.players.length} players`);
console.log(`${sb.teamB.name} (${sb.teamB.side}) ${sb.teamB.score} | ${sb.teamB.players.length} players`);
console.log('Winner:', sb.winner);
