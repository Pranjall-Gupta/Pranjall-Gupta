#!/usr/bin/env node
/**
 * Generates an SVG of the GitHub contribution grid with a decorative snake
 * that TRAVELS OVER the cells without ever changing their color.
 *
 * The grid is rendered once, statically. The snake is a separate layer of
 * small squares animated along an SVG <path> with <animateMotion>, so the
 * two never interact.
 */

import { writeFileSync, mkdirSync } from "node:fs";

const GITHUB_USER = process.env.GITHUB_USER_NAME || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_USER) throw new Error("Missing GITHUB_USER_NAME env var");
if (!TOKEN) throw new Error("Missing GITHUB_TOKEN env var");

const QUERY = `
query($userName: String!) {
  user(login: $userName) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            contributionCount
            contributionLevel
            date
            weekday
          }
        }
      }
    }
  }
}`;

async function fetchContributions(userName) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { userName } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

// ---------------- layout ----------------
const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const MARGIN = 12;

// brand palette — crimson / black / cream, matching the rest of the profile
const BG = "#0d1117";
const CELL_COLORS = {
  NONE: "#161b22",
  FIRST_QUARTILE: "#3a0d12",
  SECOND_QUARTILE: "#6e1620",
  THIRD_QUARTILE: "#a41f2b",
  FOURTH_QUARTILE: "#e63946",
};
const SNAKE_COLOR = "#f5e9dc"; // cream, so it reads clearly against crimson cells
const SNAKE_LENGTH = 8; // number of body segments
const DURATION = 24; // seconds for one full loop across the grid

// weekIndex -> [dayAtWeekday0, dayAtWeekday1, ... dayAtWeekday6] (null if no data, e.g. partial weeks)
function buildGrid(weeks) {
  return weeks.map((w) => {
    const col = new Array(7).fill(null);
    w.contributionDays.forEach((d) => {
      col[d.weekday] = {
        count: d.contributionCount,
        level: d.contributionLevel,
        date: d.date,
      };
    });
    return col;
  });
}

function cellCenter(weekIndex, weekday) {
  const x = MARGIN + weekIndex * STEP + CELL / 2;
  const y = MARGIN + weekday * STEP + CELL / 2;
  return [x, y];
}

// serpentine (boustrophedon) traversal: down one column, up the next, etc.
// this is ONLY used to move the snake — it never touches cell color.
function buildSnakePath(grid) {
  const points = [];
  grid.forEach((col, i) => {
    const rowOrder = i % 2 === 0 ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
    rowOrder.forEach((rowIdx) => {
      if (col[rowIdx]) points.push(cellCenter(i, rowIdx));
    });
  });
  return points;
}

function pointsToPathD(points) {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

function renderGridSVG(grid) {
  const cells = [];
  grid.forEach((col, i) => {
    col.forEach((day, j) => {
      if (!day) return;
      const x = MARGIN + i * STEP;
      const y = MARGIN + j * STEP;
      const color = CELL_COLORS[day.level] || CELL_COLORS.NONE;
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${color}"><title>${day.date}: ${day.count} contributions</title></rect>`
      );
    });
  });
  return cells.join("\n");
}

function renderSnakeSegments(pointCount) {
  // time to travel exactly one grid cell, so segments sit ~1 cell apart
  const cellTime = DURATION / pointCount;
  const segs = [];
  for (let s = 0; s < SNAKE_LENGTH; s++) {
    const beginOffset = (-(s * cellTime * 1.15)).toFixed(3);
    const opacity = Math.max(0.15, 1 - s / (SNAKE_LENGTH * 1.3)).toFixed(2);
    segs.push(`
    <rect x="-4" y="-4" width="8" height="8" rx="2" ry="2" fill="${SNAKE_COLOR}" opacity="${opacity}">
      <animateMotion dur="${DURATION}s" begin="${beginOffset}s" repeatCount="indefinite" rotate="auto">
        <mpath href="#snakePath" xlink:href="#snakePath"/>
      </animateMotion>
    </rect>`);
  }
  return segs.join("\n");
}

async function main() {
  const weeks = await fetchContributions(GITHUB_USER);
  const grid = buildGrid(weeks);

  const width = MARGIN * 2 + grid.length * STEP;
  const height = MARGIN * 2 + 7 * STEP;

  const pathPoints = buildSnakePath(grid);
  const pathD = pointsToPathD(pathPoints);

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${BG}" rx="6"/>
  <path id="snakePath" d="${pathD}" fill="none" stroke="none"/>
  <g id="grid">
${renderGridSVG(grid)}
  </g>
  <g id="snake">
${renderSnakeSegments(pathPoints.length)}
  </g>
</svg>`;

  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/github-contribution-grid-snake-dark.svg", svg);
  console.log(
    `Wrote dist/github-contribution-grid-snake-dark.svg — ${grid.length} weeks, ${pathPoints.length} cells in path`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
