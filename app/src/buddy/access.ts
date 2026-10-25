// AI Buddy POS Phase 1 is behind a feature switch: off by default. It is on when this phone's Settings switch is on, or
// when Admin EAB turned on the test feature beta.buddy-pos-ai for this agent (feed/flags.ts).
import type { Store } from '../data/store';
import { betaOn, myFlags } from '../feed/flags';
import { IS_POS } from '../native/native';

export const BUDDY_FLAG = 'buddy-pos-ai';
// The standalone AI Buddy POS app (IS_POS) always has it on.
export const buddyEnabled = (store: Store) => IS_POS || store.getState().settings.buddyPos === true || betaOn(myFlags(store), BUDDY_FLAG);
