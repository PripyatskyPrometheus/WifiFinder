import NetInfo from '@react-native-community/netinfo';

const API_KEY = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';

export const checkInternetConnection = async (): Promise<boolean> => {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  } catch (e) {
    return false;
  }
};

export const pingServer = async (serverUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${serverUrl}/api/data`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'x-api-key': API_KEY },
    });

    if (!response.ok) return false;
    try {
      await response.json();
    } catch (e) {}

    return true;
  } catch (error) {
    return false;
  }
};

export const startPeriodicCheck = (
  serverUrl: string,
  callback: (status: boolean) => void
) => {
  let stopped = false;

  const runCheck = async () => {
    try {
      const isConnected = await checkInternetConnection();
      const isServerOnline = isConnected ? await pingServer(serverUrl) : false;
      if (!stopped) callback(isServerOnline);
    } catch (e) {
      if (!stopped) callback(false);
    }
  };

  runCheck();

  const interval = setInterval(runCheck, 30000);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
};
