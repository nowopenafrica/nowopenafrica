// The copy bank: what a concept says when the customer has not said it.
//
// WHY THIS EXISTS. Decision D2 put a model here. It was built, deployed and
// tried on the five benchmark briefs (2026-11-16), and it was not good enough:
// the copy was generic, and it invented things no rule can catch, a "serum"
// with "botanical actives", a development called "Lago vista". Until a writer
// that can be trusted is paid for, the words come from here.
//
// Every line was written by hand to the model's own rules and passes the same
// gate (ideas.ts): no numbers, dates, names, places, prices, awards, claims or
// features nobody told us about. Each says only what is true of any honest
// business of its kind. That makes them modest. They are meant to be: a
// customer's own words always replace them, and the screen invites that.
//
// A trade with its own lines uses them for the headline and supporting line;
// the label above and the call to action come from the goal. A trade without
// uses the goal's lines throughout. Health trades are left to the goal lines
// on purpose: their claims are regulated and nothing clever belongs there.
//
// Known limit: three lines per trade means two restaurants see the same three
// headlines. That is a reason to write more, and to keep asking for the
// customer's own.

import type { CreativeBrief, Objective } from '../brief';

export interface BankLine { eyebrow: string; headline: string; support: string; cta: string }
type TradeLine = [headline: string, support: string, cta: string];

const line = (eyebrow: string, headline: string, support: string, cta: string): BankLine => ({ eyebrow, headline, support, cta });

export const BY_GOAL: Record<Objective, [BankLine, BankLine, BankLine]> = {
  launch: [
    line('New', 'Here at last.', 'Something we have been working on, ready for you.', 'See it'),
    line('Just arrived', 'Made to be used.', 'New from us, and made with care. Come and see it for yourself.', 'Take a look'),
    line('Introducing', 'Meet the new arrival.', 'We made something new. We think you will like it.', 'Find out more'),
  ],
  opening: [
    line('Opening', 'The doors are open.', 'We are ready for you. Come in and look around.', 'Visit us'),
    line('Come in', 'Come and say hello.', 'A new place in the neighbourhood, and you are invited.', 'Find us'),
    line('You are invited', 'We saved you a place.', 'Opening our doors and hoping to see you there.', 'Join us'),
  ],
  sale: [
    line('On offer', 'Now is a good time.', 'Selected favourites on offer for a short while.', 'Shop the offer'),
    line('Limited time', 'Worth the trip.', 'Offers across the shop while they last. Ask us for details.', 'See the offers'),
    line('On offer now', 'Treat yourself.', 'Some of what you love, on offer now.', 'Shop now'),
  ],
  event: [
    line('You are invited', 'Be in the room.', 'Join us for a gathering worth making time for.', 'Register'),
    line('Save the date', 'Come and be part of it.', 'Good company and a programme worth your time.', 'Get your place'),
    line('Join us', 'Not the same without you.', 'The details are below. Bring someone along.', 'Join us'),
  ],
  identity: [
    line('Who we are', 'Made with intent.', 'A name, a look and a way of doing things that belong together.', 'Meet us'),
    line('Our mark', 'Simple. Sure. Ours.', 'Everything we make carries the same care.', 'See our work'),
    line('Our story', 'Built to be recognised.', 'A clear look, wherever you find us.', 'Find out more'),
  ],
  awareness: [
    line('Hello', 'Come and see.', 'We would like to show you what we do.', 'Visit us'),
    line('Nearby', 'Closer than you think.', 'Good work, done properly, right where you are.', 'Find us'),
    line('For you', 'We are here when you are ready.', 'Ask us anything. We are glad to help.', 'Get in touch'),
  ],
  inform: [
    line('Please note', 'What you need to know.', 'The details are below. Ask us if anything is unclear.', 'Read more'),
    line('Notice', 'A short update.', 'Here is what is changing and what it means for you.', 'See details'),
    line('For your information', 'Good to know.', 'Keep this handy. It answers the questions we are asked most.', 'Learn more'),
  ],
  recruit: [
    line('We are hiring', 'Come and work with us.', 'We are looking for good people who care about good work.', 'Apply'),
    line('Join the team', 'There is a place for you.', 'Tell us what you do well. We would like to hear it.', 'Apply now'),
    line('Careers', 'Do work you are proud of.', 'A team that looks after its people and its customers.', 'Get in touch'),
  ],
};

/** INDUSTRIES key to three voices. */
export const BY_TRADE: Record<string, [TradeLine, TradeLine, TradeLine]> = {
  'restaurant-dining': [
    ['Pull up a chair.', 'A kitchen that cooks the way it would for family. Come hungry.', 'Book a table'],
    ['The table is set.', 'Good food, an easy room, and no hurry to leave.', 'Reserve'],
    ['Stay for another course.', 'Dinner worth lingering over, with people worth lingering with.', 'Book a table'],
  ],
  'quick-service-food': [
    ['Hot, fast and done right.', 'Good food for busy days. Order, eat, carry on.', 'Order now'],
    ['Hungry now.', 'We cook it when you ask for it. It will not take long.', 'Order now'],
    ['Lunch, sorted.', 'Real food, made quickly, for people with places to be.', 'Order'],
  ],
  'cafe-bakery': [
    ['Come for the coffee.', 'Stay for whatever just came out of the oven.', 'Visit us'],
    ['Slow mornings start here.', 'Coffee, something sweet, and a seat for as long as you like.', 'Come in'],
    ['Take a moment.', 'Good coffee and good bread, made by people who care about both.', 'Find us'],
  ],
  'hotel-hospitality': [
    ['Arrive. Exhale.', 'A room that is ready, and people who are glad you came.', 'Book a stay'],
    ['Rest is the point.', 'Quiet rooms and unhurried service, for as long as you need.', 'Reserve'],
    ['Stay a little longer.', 'Somewhere easy to come back to.', 'Book now'],
  ],
  'skincare-beauty': [
    ['Skin, kept simple.', 'Care for your skin without the fuss. The essentials, and nothing it does not need.', 'See the range'],
    ['Good skin takes its time.', 'Made slowly, for the skin you live in every day.', 'Find out more'],
    ['Glow is a birthright.', 'Skincare made for every shade of us.', 'Shop now'],
  ],
  'salon-barber': [
    ['Sit down. Leave sharper.', 'A proper cut and a quiet chair. Walk in when you are ready.', 'Book a chair'],
    ['Your hair, handled.', 'Skilled hands and time taken, whatever the style.', 'Book now'],
    ['Leave looking like yourself.', 'A fresh cut, a clean finish, and a chair that is ready for you.', 'Book a visit'],
  ],
  'fashion-apparel': [
    ['Cut slow. Worn long.', 'Clothes made with care, to be kept.', 'See the collection'],
    ['Made to be noticed twice.', 'Pieces with a memory of where they come from.', 'View the collection'],
    ['Cloth with a memory.', 'Design rooted here, cut for anywhere.', 'Shop the collection'],
  ],
  'tailoring-bridal': [
    ['Made to your measure.', 'Fitted to you, finished with care, and ready when it matters.', 'Book a fitting'],
    ['The fit is everything.', 'Bring us the occasion. We will make the outfit.', 'Book a fitting'],
    ['Yours, and no one else’s.', 'Clothes cut for one person at a time.', 'Get measured'],
  ],
  'real-estate': [
    ['Find your address.', 'Homes and spaces worth seeing in person.', 'Book a viewing'],
    ['Room to live well.', 'Space, light and quiet. Come and walk through it.', 'Arrange a viewing'],
    ['Come home to this.', 'Ask us what is available. We will show you around.', 'Enquire'],
  ],
  'events-conferences': [
    ['Be in the room.', 'The people, the talks and the conversations in between.', 'Register'],
    ['Tomorrow has a guest list.', 'Come for the ideas. Stay for the people you meet.', 'Get your pass'],
    ['Everyone building, together.', 'A gathering for people who make things.', 'Register now'],
  ],
  'fitness-gym': [
    ['Show up. The rest follows.', 'A place to train, and people who will notice when you do.', 'Join now'],
    ['Stronger starts here.', 'Train at your own pace, with help when you want it.', 'Start training'],
    ['Your hour.', 'Put the day down and pick something heavy up.', 'Join us'],
  ],
  'retail-supermarket': [
    ['Everything on your list.', 'What you came for, and a few things you will be glad you saw.', 'Shop with us'],
    ['Good things, close to home.', 'Stocked for everyday life, and open when you need us.', 'Visit us'],
    ['Come and look around.', 'Shelves worth browsing and people glad to help.', 'Find us'],
  ],
  'school-education': [
    ['Learning that stays with you.', 'Patient teaching, and room to ask every question.', 'Enrol'],
    ['Ready for what comes next.', 'Skills worth having, taught by people who care that you get them.', 'Apply now'],
    ['Start here.', 'Ask us about classes and how to join.', 'Get in touch'],
  ],
  'faith-organisations': [
    ['You are welcome here.', 'Come as you are. There is a seat for you.', 'Join us'],
    ['Come and worship with us.', 'Everyone is welcome, and no one sits alone.', 'Join us'],
    ['A place to belong.', 'Join us, and bring someone with you.', 'Find us'],
  ],
  'software-tech': [
    ['Less busywork. More work.', 'Tools that get out of the way so you can get on.', 'See how'],
    ['Built for the way you work.', 'Simple to start and easy to keep using.', 'Try it'],
    ['Make the hard part easy.', 'Software that respects your time.', 'Get started'],
  ],
};

/**
 * The words for concept `n` (0, 1 or 2) of this brief. Three calls give three
 * different headlines. Never the customer's facts: those are theirs to give.
 */
export function bankLine(brief: CreativeBrief, n: number): BankLine {
  /*
   * A goal we only assumed does not get to label the piece: "Please note" over a barber's headline, because
   * flyers usually inform, read as a mistake in review. An assumed goal speaks in the neutral voice.
   */
  const stated = brief.objective && brief.objective.source !== 'default' ? brief.objective.value : 'awareness';
  const goal = BY_GOAL[stated][n % 3];
  const trade = brief.industry ? BY_TRADE[brief.industry.value]?.[n % 3] : undefined;
  if (!trade) return goal;
  /* An opening or a launch keeps the goal's call to action ("Visit us"); otherwise the trade's is more exact. */
  return { eyebrow: goal.eyebrow, headline: trade[0], support: trade[1], cta: trade[2] };
}
