// Update 0.5.1 — boot credit screen timing: 3 s hold, 1 s fade, a click cuts the fade to 0.5 s.
import { check, section } from './harness';
import { CREDIT_TIMING, createCreditIntro, creditDone, creditOpacity, skipCreditIntro, stepCreditIntro } from '../src/state/creditIntro';

const run = (s: ReturnType<typeof createCreditIntro>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s = stepCreditIntro(s, 1 / 60);
  return s;
};

section('Credit intro (0.5.1)');
{
  check('holds 3 s, fades 1 s, click fade 0.5 s', CREDIT_TIMING.hold === 3 && CREDIT_TIMING.fade === 1 && CREDIT_TIMING.skipFade === 0.5);
  let s = run(createCreditIntro(), 2.9);
  check('fully visible before 3 s', creditOpacity(s) === 1 && !creditDone(s));
  s = run(s, 0.6);
  check('fading after 3 s', creditOpacity(s) > 0 && creditOpacity(s) < 1);
  s = run(s, 0.6);
  check('gone after 4 s', creditOpacity(s) === 0 && creditDone(s));

  let c = skipCreditIntro(run(createCreditIntro(), 1));
  check('click during the hold starts the fade at once', creditOpacity(run(c, 0.1)) < 1);
  c = run(c, 0.52);
  check('click → gone within 0.5 s', creditDone(c));

  let m = run(createCreditIntro(), 3.2); // 20% into the normal fade
  const before = creditOpacity(m);
  m = skipCreditIntro(m);
  check('click mid-fade continues from the current opacity', Math.abs(creditOpacity(m) - before) < 1e-9);
  check('… and still finishes within 0.5 s', creditDone(run(m, 0.52)));
  const late = run(createCreditIntro(), 3.8); // 0.2 s left
  check('a click never makes it slower', skipCreditIntro(late) === late);
  check('negative frame time is ignored', stepCreditIntro(createCreditIntro(), -5).t === 0);
}
