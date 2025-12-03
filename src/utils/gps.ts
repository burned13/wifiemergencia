import * as Location from 'expo-location';
import { LocationCoordinates } from '../types';

let cachedLocation: LocationCoordinates | null = null;

export const GPSService = {
  requestLocationPermission: async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  },

  requestBackgroundLocationPermission: async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Background permission error:', error);
      return false;
    }
  },

  getCurrentLocation: async (): Promise<LocationCoordinates | null> => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        maximumAge: 0,
        timeout: 30000,
      });

      const coords: LocationCoordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        altitude: location.coords.altitude || undefined,
        heading: location.coords.heading || undefined,
        speed: location.coords.speed || undefined,
      };

      cachedLocation = coords;
      return coords;
    } catch (error) {
      console.error('Get location error:', error);
      return cachedLocation;
    }
  },


  startLocationTracking: async (
    callback: (location: LocationCoordinates) => void,
    intervalMs: number = 5000
  ): Promise<Location.LocationSubscription | null> => {
    try {
      const perm = await GPSService.requestLocationPermission();
      if (!perm) return null;
      return await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: intervalMs,
          distanceInterval: 0,
        },
        (location) => {
          try {
            if (!location || !location.coords) return;
            const coords: LocationCoordinates = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy || 0,
              altitude: location.coords.altitude || undefined,
              heading: location.coords.heading || undefined,
              speed: location.coords.speed || undefined,
            };
            cachedLocation = coords;
            callback(coords);
          } catch {}
        }
      );
    } catch (error) {
      console.error('Location tracking error:', error);
      return null;
    }
  },

  waitForAccurateLocation: async (
    minAccuracyMeters: number = 5
  ): Promise<LocationCoordinates | null> => {
    try {
      const ok = await GPSService.requestLocationPermission();
      if (!ok) return null;
      try {
        const providers = await Location.getProviderStatusAsync();
        if (!providers.locationServicesEnabled || !providers.gpsAvailable) {
          await Location.watchPositionAsync({
            accuracy: Location.Accuracy.Highest,
            timeInterval: 2000,
            distanceInterval: 1,
            mayShowUserSettingsDialog: true,
          }, () => {});
        }
      } catch {}
      let best: LocationCoordinates | null = null;
      return await new Promise<LocationCoordinates | null>(async (resolve) => {
        try {
          const sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Highest,
              timeInterval: 2000,
              distanceInterval: 1,
              mayShowUserSettingsDialog: true,
            },
            (loc) => {
              if (!loc || !loc.coords) return;
              const coords: LocationCoordinates = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy || 0,
                altitude: loc.coords.altitude || undefined,
                heading: loc.coords.heading || undefined,
                speed: loc.coords.speed || undefined,
              };
              cachedLocation = coords;
              if (!best || (coords.accuracy && coords.accuracy < (best.accuracy || Infinity))) best = coords;
              if (coords.accuracy && coords.accuracy <= minAccuracyMeters) {
                try { sub.remove(); } catch {}
                resolve(coords);
              }
            }
          );
        } catch {
          resolve(best);
        }
      });
    } catch {
      return cachedLocation;
    }
  },

  getApproximateLocationByIP: async (): Promise<LocationCoordinates | null> => {
    try {
      const resp = await fetch('https://ipapi.co/json/');
      if (resp.ok) {
        const json: any = await resp.json();
        if (json && json.latitude && json.longitude) {
          const coords: LocationCoordinates = {
            latitude: Number(json.latitude),
            longitude: Number(json.longitude),
            accuracy: 1000,
          };
          cachedLocation = coords;
          return coords;
        }
      }
      const resp2 = await fetch('https://ipinfo.io/json');
      if (resp2.ok) {
        const json2: any = await resp2.json();
        if (json2 && json2.loc) {
          const parts = String(json2.loc).split(',');
          const coords: LocationCoordinates = {
            latitude: Number(parts[0]),
            longitude: Number(parts[1]),
            accuracy: 5000,
          };
          cachedLocation = coords;
          return coords;
        }
      }
      return cachedLocation;
    } catch {
      return cachedLocation;
    }
  },

  calculateDistance: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  findNearbyNetworks: (
    networks: any[],
    currentLocation: LocationCoordinates,
    radiusKm: number = 0.5
  ): any[] => {
    return networks
      .map((network) => ({
        ...network,
        distance: GPSService.calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          network.latitude,
          network.longitude
        ),
      }))
      .filter((network) => network.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  },

  getCachedLocation: (): LocationCoordinates | null => {
    return cachedLocation;
  },
};
