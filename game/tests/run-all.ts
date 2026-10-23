// Runs every test-*.ts. Add new feature tests to this list.
import { summary } from './harness';
import './test-level';
import './test-movement';
import './test-enemy';
import './test-rules';
import './test-anim';
import './test-audio';
import './test-menu';
import './test-light';
import './test-input';
import './test-credit';
import './test-stuck';
import './test-patient';
import './test-caught';
import './test-wake';
import './test-hunt';
import './test-floors';
import './test-props';

process.exit(summary() > 0 ? 1 : 0);
