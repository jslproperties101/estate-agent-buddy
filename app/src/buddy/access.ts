// AI Buddy POS Phase 1 is behind a feature switch: off by default. It is on when this phone's Settings switch is on, or
// when Admin EAB turned on the test feature beta.buddy-pos-ai for this agent (feed/flags.ts).
import type { Store } from '../data/store';
import { betaOn, myFlags } from '../feed/flags';

export const BUDDY_FLAG = 'buddy-pos-ai';
export const buddyEnabled = (store: Store) => store.getState().settings.buddyPos === true || betaOn(myFlags(store), BUDDY_FLAG);
