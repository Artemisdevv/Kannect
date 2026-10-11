/** An Indian mobile number (10 digits starting 6-9, optionally written with +91, 91 or 0 first). */
export type PhoneResult = { phone: string; error?: undefined } | { phone?: undefined; error: string };

export function parsePhone(input: string): PhoneResult {
  let digits = input.replace(/[\s\-().]/g, '');
  if (/[^\d+]/.test(digits) || digits.indexOf('+') > 0) return { error: 'Use digits only, for example 98765 43210.' };
  digits = digits.replace(/^\+/, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) return { error: 'A mobile number has 10 digits.' };
  if (!/^[6-9]/.test(digits)) return { error: 'Mobile numbers start with 6, 7, 8 or 9.' };
  return { phone: `+91${digits}` };
}

export const tidy = (value: string) => value.split(/\s+/).filter(Boolean).join(' ');
