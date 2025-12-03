declare module 'expo-notifications' {
  export const requestPermissionsAsync: (options?: any) => Promise<any>;
  export const setNotificationHandler: (handler: any) => void;
  export const scheduleNotificationAsync: (config: any) => Promise<string>;
  const _default: any;
  export default _default;
}
