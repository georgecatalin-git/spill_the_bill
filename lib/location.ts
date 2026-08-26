import * as Location from 'expo-location';

/** Where the device says it is. */
export type Position = { latitude: number; longitude: number };

export class LocationError extends Error {}

/**
 * The device's current position, for opening a table.
 *
 * A table may only be opened at the restaurant it names, and this is how the
 * app answers "where are you". Worth being clear about what that is worth:
 * the number travels from here to Postgres through the client, so it is
 * evidence rather than proof — the trigger's own comment says the same. It
 * stops somebody picking the wrong restaurant, not somebody determined to.
 *
 * Throws rather than returning null. Every failure here has a different thing
 * for the person to do — grant the permission, turn the service on, go
 * outside — and a null would flatten all three into "could not create the
 * table".
 */
export async function getCurrentPosition(): Promise<Position> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== Location.PermissionStatus.GRANTED) {
    throw new LocationError(
      'Split needs your location to confirm you are at the restaurant. Allow it in Settings, then try again.'
    );
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationError('Location is turned off on this device. Turn it on and try again.');
  }

  try {
    // Balanced rather than the highest tier: this asks "which building", not
    // "which table", and the highest accuracy costs seconds of waiting inside
    // a restaurant, which is where it is least likely to pay off.
    const reading = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: reading.coords.latitude,
      longitude: reading.coords.longitude,
    };
  } catch {
    throw new LocationError(
      'Could not get a location fix. Move nearer a window or outside, then try again.'
    );
  }
}
