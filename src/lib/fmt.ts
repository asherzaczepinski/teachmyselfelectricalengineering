// Plain-words number formatting shared by the board and the inspector.

export function fmtAmps(i: number): string {
  const a = Math.abs(i);
  if (a < 0.0005) return "0 amps";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} milliamps`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} amps`;
}
export function fmtVolts(v: number): string {
  const a = Math.abs(v);
  if (a < 0.0005) return "0 volts";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} millivolts`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} volts`;
}
export function shortA(i: number): string {
  const a = Math.abs(i);
  if (a < 0.0005) return "0 A";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} mA`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} A`;
}
export function shortV(v: number): string {
  const a = Math.abs(v);
  if (a < 0.0005) return "0 V";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} mV`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} V`;
}
