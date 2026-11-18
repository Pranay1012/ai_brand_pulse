export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getDeterministicBars(
  seed: string | number,
  count: number = 10,
  min: number = 20,
  max: number = 100
): number[] {
  const numSeed = typeof seed === 'number' ? seed : hashString(String(seed || 'seed'));
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = Math.sin(numSeed * 0.23 + (i + 1) * 1.47) * 0.5 + 0.5;
    const height = Math.round(min + val * (max - min));
    bars.push(height);
  }
  return bars;
}

export function getHourlySpikeBars(seed: string | number, count: number = 18): number[] {
  const numSeed = typeof seed === 'number' ? seed : hashString(String(seed || 'hourly'));
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = 15 + Math.sin(numSeed * 0.13 + (i + 1) * 0.73) * 14;
    const recencyBoost = (i / count) * 45;
    const peak = (i >= count - 4) ? 25 : 0;
    const height = Math.min(100, Math.max(14, Math.round(base + recencyBoost + peak)));
    bars.push(height);
  }
  return bars;
}

export function getChannelBadges(seed: string | number): string[] {
  const hash = typeof seed === 'number' ? seed : hashString(String(seed || 'channel'));
  const pool = [
    ['HN', 'X', 'R'],
    ['IG', 'X', 'R'],
    ['HN', 'R', 'IG'],
    ['X', 'R', 'HN'],
    ['HN', 'X'],
    ['IG', 'X', 'R', 'HN'],
  ];
  return pool[hash % pool.length];
}

export function getPgVectorMatch(seed: string | number): string {
  const hash = typeof seed === 'number' ? seed : hashString(String(seed || 'match'));
  const score = 0.88 + ((hash % 11) / 100);
  return `${score.toFixed(2)} match`;
}
