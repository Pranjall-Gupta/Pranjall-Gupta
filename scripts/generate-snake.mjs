import fs from 'fs';
import path from 'path';

// Target user from environment or fallback
const USERNAME = process.env.GITHUB_USER_NAME || 'Pranjall-Gupta';

// Color Palette for Dark Theme
const COLORS = {
  'NONE': '#161b22',
  'FIRST_QUARTILE': '#0e4429',
  'SECOND_QUARTILE': '#006d32',
  'THIRD_QUARTILE': '#26a641',
  'FOURTH_QUARTILE': '#39d353'
};

// SVG Grid Settings
const CELL_SIZE = 10;
const CELL_GAP = 2;
const PADDING_X = 20;
const PADDING_Y = 20;

// Generate mock data in case API fails or GITHUB_TOKEN is not provided
function generateMockData() {
  const weeks = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  
  // Align to Sunday
  const startDay = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDay);
  
  let currentDate = new Date(startDate);
  const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
  
  for (let w = 0; w < 53; w++) {
    const contributionDays = [];
    for (let d = 0; d < 7; d++) {
      const rand = Math.random();
      let level = 'NONE';
      if (rand > 0.85) level = 'FOURTH_QUARTILE';
      else if (rand > 0.7) level = 'THIRD_QUARTILE';
      else if (rand > 0.5) level = 'SECOND_QUARTILE';
      else if (rand > 0.35) level = 'FIRST_QUARTILE';
      
      contributionDays.push({
        contributionLevel: level,
        color: COLORS[level],
        date: currentDate.toISOString().split('T')[0],
        weekday: d
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push({ contributionDays });
  }
  
  return {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          weeks
        }
      }
    }
  };
}

async function fetchContributions() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GITHUB_TOKEN not found in environment. Falling back to mock data.');
    return generateMockData();
  }

  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionLevel
                color
                date
                weekday
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'node-fetch'
      },
      body: JSON.stringify({
        query,
        variables: { login: USERNAME }
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(`GraphQL Errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  } catch (error) {
    console.error('Failed to fetch from GitHub API:', error.message);
    console.warn('Falling back to mock data.');
    return generateMockData();
  }
}

function buildSvg(data) {
  const calendar = data.user.contributionsCollection.contributionCalendar;
  
  // Initialize 53x7 grid
  const grid = Array.from({ length: 53 }, () => 
    Array.from({ length: 7 }, () => ({
      color: COLORS.NONE,
      contributionLevel: 'NONE'
    }))
  );

  // Populate grid from calendar data
  calendar.weeks.forEach((week, w) => {
    if (w < 53) {
      week.contributionDays.forEach(day => {
        const r = day.weekday;
        if (r >= 0 && r < 7) {
          const level = day.contributionLevel || 'NONE';
          grid[w][r] = {
            color: COLORS[level] || day.color || COLORS.NONE,
            contributionLevel: level
          };
        }
      });
    }
  });

  // Calculate Serpentine Hamiltonian Path (with virtual off-screen padding)
  const pathPoints = [];
  
  // 6 virtual points before (off-screen)
  for (let r = -6; r < 0; r++) {
    pathPoints.push({ c: 0, r });
  }

  // Grid traversal
  for (let c = 0; c < 53; c++) {
    if (c % 2 === 0) {
      for (let r = 0; r < 7; r++) {
        pathPoints.push({ c, r });
      }
    } else {
      for (let r = 6; r >= 0; r--) {
        pathPoints.push({ c, r });
      }
    }
  }

  // 6 virtual points after (off-screen)
  for (let r = 7; r <= 12; r++) {
    pathPoints.push({ c: 52, r });
  }

  // Convert points to SVG Path
  const dParts = [];
  pathPoints.forEach((pt, i) => {
    const x = pt.c * 12 + 25;
    const y = pt.r * 12 + 25;
    if (i === 0) {
      dParts.push(`M ${x} ${y}`);
    } else {
      dParts.push(`L ${x} ${y}`);
    }
  });
  const pathD = dParts.join(' ');

  const totalSteps = pathPoints.length - 1;
  const pathLength = totalSteps * 12; // 4584px
  const snakeLength = 6 * 12; // 72px (6 cells long)

  // Draw Grid Rects
  let rectsStr = '';
  for (let c = 0; c < 53; c++) {
    for (let r = 0; r < 7; r++) {
      const cell = grid[c][r];
      rectsStr += `    <rect id="cell-${c}-${r}" x="${c * 12 + 20}" y="${r * 12 + 20}" width="10" height="10" rx="2" ry="2" fill="${cell.color}" />\n`;
    }
  }

  // Final SVG Output (Decorative Snake Overlay traversing without eating cells)
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 674 122" width="674" height="122">
  <defs>
    <linearGradient id="snake-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e63946" />
      <stop offset="100%" stop-color="#b91c1c" />
    </linearGradient>
    <style>
      svg {
        background-color: #0d1117;
        border-radius: 6px;
      }
      .snake-body {
        stroke-dasharray: ${snakeLength} ${pathLength};
        stroke-dashoffset: ${snakeLength};
        animation: slither 15s linear infinite;
      }
      @keyframes slither {
        to {
          stroke-dashoffset: -${pathLength - snakeLength};
        }
      }
    </style>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="#0d1117" rx="6" ry="6" />

  <!-- Contribution Grid (Static Colors) -->
  <g>
${rectsStr}  </g>

  <!-- Snake Path and Body -->
  <g>
    <path id="snake-path" d="${pathD}" fill="none" stroke="none" />
    <path class="snake-body" d="${pathD}" fill="none" stroke="url(#snake-grad)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <!-- Snake Head -->
  <g>
    <g>
      <animateMotion dur="15s" repeatCount="indefinite" rotate="auto" calcMode="linear" path="${pathD}" />
      <circle r="4.5" fill="#e63946" />
      <circle cx="1.5" cy="-1.5" r="0.9" fill="white" />
      <circle cx="1.5" cy="1.5" r="0.9" fill="white" />
      <circle cx="2.0" cy="-1.5" r="0.5" fill="black" />
      <circle cx="2.0" cy="1.5" r="0.5" fill="black" />
    </g>
  </g>
</svg>
`;
}

async function main() {
  console.log(`Generating contribution snake for user: ${USERNAME}`);
  const data = await fetchContributions();
  
  console.log('Building SVG animation...');
  const svg = buildSvg(data);
  
  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  const outputPath = path.join(distDir, 'github-contribution-grid-snake-dark.svg');
  fs.writeFileSync(outputPath, svg, 'utf-8');
  console.log(`Successfully generated contribution snake SVG at: ${outputPath}`);
}

main().catch(console.error);
