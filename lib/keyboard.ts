import { Platform } from 'react-native';

/**
 * How a screen gets out of the keyboard's way.
 *
 * One definition, because it was written out eight times and seven of them
 * were wrong in the same way: `undefined` on Android, which means the
 * `KeyboardAvoidingView` does nothing whatsoever. A keyboard simply covered
 * whatever was being typed into.
 *
 * Android usually resizes its own window — `softwareKeyboardLayoutMode`
 * defaults to `resize` — which is why leaving it undefined looks harmless. It
 * is not harmless here: this app runs edge to edge, and Expo's own
 * documentation says a translucent status bar "may cause unexpected keyboard
 * behavior on Android when using softwareKeyboardLayoutMode set to resize. In
 * this case you will have to use KeyboardAvoidingView". So it is used, on both.
 *
 * `height` rather than `padding` on Android: padding assumes something pinned
 * to the bottom edge to push upwards, which is true of a sheet and not of a
 * scrolling form.
 */
export const keyboardBehavior = Platform.OS === 'ios' ? ('padding' as const) : ('height' as const);
