"""
Builds the 29 Dec 2026 - 31 Jan 2027 brand calendar: 3 feed posts a day plus a
daily Facebook Story, from jan_tips / jan_features / jan_community.

Writes: .superpowers/autopilot/jan/posts.json and card specs (feed + story).
Nothing is sent anywhere; load_jan.mts validates and loads.
"""
import json
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from jan_tips import TIPS            # noqa: E402
from jan_features import FEATURES    # noqa: E402
from jan_community import COMMUNITY  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, '.superpowers', 'autopilot', 'jan')
os.makedirs(OUT, exist_ok=True)

START = date(2026, 12, 29)
DAYS = min(len(TIPS), len(FEATURES), len(COMMUNITY), 34)
CARD_BASE = 'https://wvayqqfqqocwjripugnb.supabase.co/storage/v1/object/public/social-media/brand/cards/jan'
TAGS_X = ' #NowOpenAfrica'
TAGS_IG = '\n\n#NowOpenAfrica #AfricaIsNowOpen #SmallBusiness #ShopLocal'
DISCOVERY_DESTS = {'/discover', '/open-now', '/nearby', '/offers'}

posts, cards = [], []
for i in range(DAYS):
    d = (START + timedelta(days=i)).isoformat()
    t, f, c = TIPS[i], FEATURES[i], COMMUNITY[i]

    posts.append(dict(day=d, time='08:30', pillar='education', audience='owners', objective='website_visits',
                      hook=t['hook'], caption=t['fb'], cta=t['cta'], dest=t['dest'], media=None,
                      variants={'facebook': t['fb'] + '\n\n#NowOpenAfrica', 'linkedin_company': t['li'] + '\n\n#SmallBusiness #NowOpenAfrica',
                                'x': t['x'] + TAGS_X, 'threads': t['th']}, formats={}))

    cid = f"jan-{d}"
    kicker, head, accent, ccta, theme = f['card']
    cards.append(dict(id=cid, kicker=kicker, head=head, accent=accent, cta=ccta, theme=theme))
    feed_url, story_url = f"{CARD_BASE}/{cid}.jpg", f"{CARD_BASE}/{cid}-story.jpg"
    aud = 'consumers' if f['dest'] in DISCOVERY_DESTS else 'owners'
    obj = 'website_visits' if aud == 'consumers' else 'registrations'
    ig = f['fb'].replace('nowopenafrica.com/instagram', 'the link in our bio').replace('nowopenafrica.com/add-business', 'the link in our bio')
    posts.append(dict(day=d, time='13:00', pillar=f['pillar'], audience=aud, objective=obj,
                      hook=f['hook'], caption=f['fb'], cta=f['cta'], dest=f['dest'], media=feed_url,
                      variants={'facebook': f['fb'] + '\n\n#NowOpenAfrica', 'instagram': ig + '\n\nLink in bio.' + TAGS_IG,
                                'linkedin_company': f['li'] + '\n\n#NowOpenAfrica', 'x': f['x'] + TAGS_X, 'threads': f['th']}, formats={}))

    # The same card as a Facebook Story at noon: not a feed post, so it does not
    # count against the daily ceiling, and it shows to people who skip the feed.
    posts.append(dict(day=d, time='12:00', pillar=f['pillar'], audience=aud, objective='awareness',
                      hook=f"Story: {f['hook']}", caption=f['hook'], cta=f['cta'], dest=f['dest'], media=story_url,
                      variants={'facebook': f['hook']}, formats={'facebook': 'story'}))

    posts.append(dict(day=d, time='19:00', pillar='community', audience='consumers', objective='engagement',
                      hook=c['hook'], caption=c['fb'], cta='Tell us in the comments', dest=None, media=None,
                      variants={'facebook': c['fb'] + '\n\n#NowOpenAfrica', 'linkedin_company': c['li'] + '\n\n#NowOpenAfrica',
                                'x': c['x'] + TAGS_X, 'threads': c['th']}, formats={}))

json.dump(posts, open(os.path.join(OUT, 'posts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(cards, open(os.path.join(OUT, 'cards.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'days={DAYS} posts={len(posts)} cards={len(cards)} tips={len(TIPS)} features={len(FEATURES)} community={len(COMMUNITY)}')
