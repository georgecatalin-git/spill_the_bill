const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}

export function isBlank(value: string) {
  return value.trim().length === 0;
}
