// Creative Media (home card 4, Change 011; owner 16 Oct 2026: a hub). The existing Marketing Studio and Photo Studio
// work on one property at a time, so this screen asks for the property first (the photo-row property picker) and then
// opens that property's own Marketing Studio or Photo Studio. Nothing new is made here.
import { useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { Go } from '../nav';
import { c11Strings } from '../ui/c011Strings';
import { PropertyPicker } from '../ui/PropertyPicker';
import { Empty } from '../ui/common';
import { cardTitle, orderedPhotos } from '../listing/model';
import { visible } from '../team/access';

export function CreativeMediaScreen({ lang, go, propertyId }: { lang: Lang; go: Go; propertyId?: string }) {
  const { state } = useApp();
  const t = c11Strings[lang].creative;
  const list = visible(state, 'properties', state.properties).filter(p => !p.archived).sort((a, b) => (cardTitle(a) || '').localeCompare(cardTitle(b) || ''));
  const [id, setId] = useState<string | undefined>(propertyId && list.some(p => p.id === propertyId) ? propertyId : undefined);
  const p = list.find(x => x.id === id);
  const hasPhotos = !!p && orderedPhotos(p).length > 0;
  return (
    <section className="stack" data-testid="creative-media">
      <p className="notice">{t.intro}</p>
      {list.length === 0 ? <Empty>{t.none}</Empty> : <>
        <PropertyPicker lang={lang} list={list} value={id} onChange={setId} label={t.choose} allowNone={false} testId="creativeProperty" />
        <div className="card stack-sm">
          <strong>{t.marketing}</strong><small className="muted">{t.marketingHint}</small>
          <div className="btn-row"><button className="btn primary" disabled={!p} onClick={() => p && go({ name: 'marketingStudio', propertyId: p.id })} data-testid="cm-marketing">🎨 {t.marketing}</button></div>
        </div>
        <div className="card stack-sm">
          <strong>{t.photo}</strong><small className="muted">{t.photoHint}</small>
          {p && !hasPhotos && <small className="warn-text" data-testid="cm-no-photos">{t.photoNone}</small>}
          <div className="btn-row"><button className="btn secondary" disabled={!hasPhotos} onClick={() => p && go({ name: 'photoStudio', propertyId: p.id })} data-testid="cm-photo">🖼️ {t.photo}</button></div>
        </div>
      </>}
    </section>
  );
}
