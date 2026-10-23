// Tiny test harness: ✅ / ❌ lines, failure count tracked globally.
let failures = 0;
let passes = 0;

export function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passes++;
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

export function section(name: string): void {
  console.log(`\n${name}`);
}

export function summary(): number {
  console.log(`\n${passes} passed, ${failures} failed`);
  return failures;
}
