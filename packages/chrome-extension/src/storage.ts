/**
 * Chrome storage helpers for settings and task history.
 */

export interface ModelSettings {
  typesafeApiKey: string;
  typesafeBaseUrl: string;
  typesafeModel: string;
  textModelApiKey: string;
  textModelBaseUrl: string;
  textModel: string;
  serverUrl: string;
}

export const DEFAULT_SETTINGS: ModelSettings = {
  typesafeApiKey: '',
  typesafeBaseUrl: 'https://api.typesafe.ai/v1/systemone',
  typesafeModel: 'jev-latest',
  textModelApiKey: '',
  textModelBaseUrl: 'https://api.deepseek.com/v1',
  textModel: 'deepseek-chat',
  serverUrl: 'http://localhost:5173',
};

export async function getStoredSettings(): Promise<ModelSettings> {
  const data = await chrome.storage.local.get('modelSettings');
  return {
    ...DEFAULT_SETTINGS,
    ...(data['modelSettings'] || {}),
    serverUrl: 'http://localhost:5173',
  };
}

export async function saveStoredSettings(settings: ModelSettings): Promise<void> {
  await chrome.storage.local.set({
    modelSettings: {
      ...settings,
      serverUrl: 'http://localhost:5173',
    },
  });
}

export async function getRecentGoals(): Promise<string[]> {
  const data = await chrome.storage.local.get('recentGoals');
  return Array.isArray(data['recentGoals']) ? data['recentGoals'] : [];
}

export async function saveRecentGoal(goal: string): Promise<void> {
  if (!goal.trim()) return;
  const current = await getRecentGoals();
  const filtered = current.filter((g) => g !== goal);
  const updated = [goal, ...filtered].slice(0, 5);
  await chrome.storage.local.set({ recentGoals: updated });
}
