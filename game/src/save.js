// Solmar Nights — saves. One localStorage slot holds money, mission
// progress, collected packages, the player's position and the clock.
// Autosaves after every mission and every 30 seconds of play.

const SAVE_KEY = 'solmar-nights-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      money: state.money,
      missionsCompleted: state.missionsCompleted,
      packages: [...state.packages],
      playerX: state.playerX,
      playerZ: state.playerZ,
      clockMinutes: state.clockMinutes,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // private mode or no storage: the game still plays
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}
