// MainForAdmin-E: where a tapped push alert for an Admin EAB post opens (Joe, 22 Oct 2026: the exact post).
//   Market News post  -> Market News, that post opened
//   Project           -> Projects, that project opened
//   Announcement      -> Home, the announcement shown (even if its banner was closed or pop-up answered before)
//   Not in the feed   -> Market News with a short message: "no longer available" when the feed was just read from the
//                        company (withdrawn or ended), or "connect to the internet" when it could not be read (offline),
//                        so an agent is never told a post is gone when the phone simply has not received it yet.
import type { Screen } from '../nav';
import type { FeedItem } from './feed';

export interface TapTarget { screen: Screen; announcementId?: string; message?: 'gone' | 'offline' }

export function feedTapTarget(items: FeedItem[], id: string, feedFresh: boolean): TapTarget {
  const i = items.find(x => x.id === id);
  if (!i) return { screen: { name: 'marketNews' }, message: feedFresh ? 'gone' : 'offline' };
  if (i.kind === 'project') return { screen: { name: 'projects', openId: id } };
  if (i.kind === 'announcement') return { screen: { name: 'home' }, announcementId: id };
  return { screen: { name: 'marketNews', openId: id } };
}
