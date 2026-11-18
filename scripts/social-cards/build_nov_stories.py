"""
Daily Facebook Story, 19 Nov - 1 Dec 2026, 12:00 Lagos: one card a day pointing
at a feature checked live on www.nowopenafrica.com (18 Nov 2026).

Facebook photo stories carry no clickable link, so every card prints its own
web address. Writes .superpowers/autopilot/nov-stories/{posts,cards}.json;
render with render_cards.py --story, load with load_nov_stories.mts.
"""
import json
import os
from datetime import date, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, '.superpowers', 'autopilot', 'nov-stories')
os.makedirs(OUT, exist_ok=True)

CARD_BASE = 'https://wvayqqfqqocwjripugnb.supabase.co/storage/v1/object/public/social-media/brand/cards/nov-stories'
START = date(2026, 11, 19)

# (kicker, head, accent, cta, theme, dest, pillar, audience)
STORIES = [
    ('Open now', 'Need it right now?', "See who's open this minute.", 'Open now', 'dark', '/open-now', 'discovery', 'consumers'),
    ('Get found', 'Your business deserves to be found.', 'Free to get started.', 'Add your business', 'light', '/add-business', 'community', 'owners'),
    ('Already on Instagram?', 'Find your business', 'from your handle.', 'Check your handle', 'dark', '/instagram', 'community', 'owners'),
    ('Nominate', 'Know a business that should be here?', 'Send us the name.', 'Nominate a business', 'light', '/nominate', 'discovery', 'consumers'),
    ('Owner tip', 'Three phone photos', 'every profile needs.', 'Update your photos', 'dark', '/add-business', 'education', 'owners'),
    ('Nearby', 'New to the area?', "See what's around you.", 'Use my location', 'light', '/nearby', 'discovery', 'consumers'),
    ('Claim it', 'Is your business already listed?', 'Claim it. Keep it right.', 'Claim your business', 'dark', '/add-business', 'community', 'owners'),
    ('Create', 'Running a promotion?', 'Post it as an offer.', 'Open an offer', 'light', '/create', 'community', 'owners'),
    ('Owner tip', 'Opening hours are a promise.', 'Make sure yours are right.', 'Check your hours', 'dark', '/add-business', 'education', 'owners'),
    ('This weekend', 'Planning the weekend?', 'Find who makes it happen.', 'Search NowOpen', 'light', '/discover', 'discovery', 'consumers'),
    ('NowOpen Studio', 'A business card that never runs out.', 'One link. A live QR.', 'Open Studio', 'dark', '/studio', 'community', 'owners'),
    ('December', 'December gets busy.', 'Post your festive offer early.', 'Open an offer', 'light', '/create', 'community', 'owners'),
    ('Install', 'NowOpen on your home screen.', 'One tap away.', 'Install the app', 'dark', '/install', 'discovery', 'consumers'),
]

SUB_DETAIL = {
    'Three phone photos': 'Shopfront in daylight. One product up close. You at work.',
}

posts, cards = [], []
for i, (kicker, head, accent, cta, theme, dest, pillar, aud) in enumerate(STORIES):
    d = (START + timedelta(days=i)).isoformat()
    cid = f'nov-story-{d}'
    site = 'nowopenafrica.com' + ('' if dest == '/' else dest)
    sub = (SUB_DETAIL[head] + ' ' if head in SUB_DETAIL else '') + site
    cards.append(dict(id=cid, kicker=kicker, head=head, accent=accent, cta=cta, theme=theme, sub=sub))
    hook = f'{head} {accent}'
    posts.append(dict(day=d, time='12:00', pillar=pillar, audience=aud, objective='awareness',
                      hook=f'Story: {hook}', caption=hook, cta=cta, dest=dest,
                      media=f'{CARD_BASE}/{cid}-story.jpg', variants={'facebook': hook}, formats={'facebook': 'story'}))

json.dump(posts, open(os.path.join(OUT, 'posts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(cards, open(os.path.join(OUT, 'cards.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'stories={len(posts)} {posts[0]["day"]} -> {posts[-1]["day"]}')
