/**
 * Library entry point.
 *
 * Future features (persistent history, web dashboards, Discord bots,
 * alternative renderers) should import from here. Everything downstream
 * of the analyzer output is pure and reusable.
 */

export { parseDemoToJson } from './analyzer/run-analyzer.ts';
export { loadMatchFromJsonFolder, normalizeMatch } from './analyzer/load-match.ts';
export { computeScoreboard } from './scoreboard/compute.ts';
export { renderScoreboardPng, closeRenderer } from './scoreboard/render-html.ts';
export { postScoreboardToDiscord } from './discord/post-webhook.ts';
export { resolveReplaysFolder, findLatestDemo } from './latest/find-latest-demo.ts';
export { loadConfig } from './config.ts';
export { processDemo } from './pipeline.ts';

export type { Match, MatchPlayer, Team, Round, Kill, TeamSide } from './analyzer/types.ts';
export type { ScoreboardData, ScoreboardTeam, ScoreRow } from './scoreboard/compute.ts';
export type { AppConfig } from './config.ts';
export type { PipelineResult } from './pipeline.ts';
