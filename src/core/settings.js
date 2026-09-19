// Settings persisted to localStorage.
const KEY = 'tac_fps_settings_v1';

export const DEFAULT_SETTINGS = {
  volume: 0.7,
  quality: 'medium', // low | medium | high
  sensitivity: 1.0,
  fov: 75,
};

export function loadSettings(storage = localStorage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = localStorage) {
  storage.setItem(KEY, JSON.stringify(settings));
}
