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

section('Credit cards (0.6.2)');
{
  const { CREDIT_CARDS, createCreditSequence, creditCard, creditSequenceDone, stepCreditSequence, skipCreditSequence } = await import('../src/state/creditIntro');
  type Seq = ReturnType<typeof createCreditSequence>;
  const runSeq = (s: Seq, seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) s = stepCreditSequence(s, 1 / 60);
    return s;
  };
  check('studio title first, then the tips', CREDIT_CARDS.map((c) => c.id).join(',') === 'studio,tips');
  check('the studio card outlasts the GIF typing (1.6 s) and its whole run (2.56 s)', CREDIT_CARDS[0].hold >= 2.56);
  let s = createCreditSequence();
  check('starts on the studio card', creditCard(s) === 'studio');
  s = runSeq(s, CREDIT_CARDS[0].hold + CREDIT_CARDS[0].fade + 0.05);
  check('then the tips', creditCard(s) === 'tips' && !creditSequenceDone(s));
  s = runSeq(s, CREDIT_CARDS[1].hold + CREDIT_CARDS[1].fade + 0.05);
  check('then the menu', creditSequenceDone(s));
  const total = CREDIT_CARDS.reduce((a, c) => a + c.hold + c.fade, 0);
  check('about 8 s in all without clicking', total >= 7 && total <= 9, `${total} s`);
  // Clicking: each click fades the current card within 0.5 s.
  let c = runSeq(createCreditSequence(), 1);
  c = skipCreditSequence(c);
  c = runSeq(c, 0.55);
  check('click on the studio card → tips within 0.5 s', creditCard(c) === 'tips');
  c = skipCreditSequence(runSeq(c, 0.3));
  c = runSeq(c, 0.55);
  check('click on the tips → menu within 0.5 s', creditSequenceDone(c));
}
