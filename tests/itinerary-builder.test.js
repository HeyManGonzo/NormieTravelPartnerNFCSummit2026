// Unit tests for lib/itinerary-builder.js
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItinerary } from '../lib/itinerary-builder.js';

// --- Fixtures ---------------------------------------------------------------

const RESTAURANTS = [
  { id: 'belcanto', type: 'restaurant', name: 'Belcanto', neighbourhood: 'Chiado',
    priceRange: 'premium', tags: ['fine-dining', 'tasting-menu', 'portuguese'], nfcRelevant: false },
  { id: 'time-out', type: 'restaurant', name: 'Time Out Market', neighbourhood: 'Cais do Sodré',
    priceRange: 'budget', tags: ['food-hall', 'casual', 'groups'], nfcRelevant: true },
  { id: 'food-temple', type: 'restaurant', name: 'The Food Temple', neighbourhood: 'Mouraria',
    priceRange: 'budget', tags: ['vegetarian', 'vegan-friendly', 'intimate'], nfcRelevant: true },
  { id: 'prado', type: 'restaurant', name: 'Prado', neighbourhood: 'Alfama',
    priceRange: 'midrange', tags: ['vegetarian-friendly', 'seasonal'], nfcRelevant: true },
  { id: 'ramiro', type: 'restaurant', name: 'Cervejaria Ramiro', neighbourhood: 'Intendente',
    priceRange: 'midrange', tags: ['seafood', 'casual', 'iconic'], nfcRelevant: true },
  { id: 'cevicheria', type: 'restaurant', name: 'A Cevicheria', neighbourhood: 'Príncipe Real',
    priceRange: 'midrange', tags: ['ceviche', 'casual', 'no-reservations'], nfcRelevant: true },
];
const GALLERIES = [
  { id: 'maat', type: 'gallery', name: 'MAAT', neighbourhood: 'Belém',
    priceRange: 'midrange', tags: ['art', 'contemporary'], nfcRelevant: true },
  { id: 'culturgest', type: 'gallery', name: 'Culturgest', neighbourhood: 'Campo Pequeno',
    priceRange: 'budget', tags: ['contemporary', 'gallery'], nfcRelevant: false },
];
const LANDMARKS = [
  { id: 'alfama', type: 'landmark', name: 'Alfama walk', neighbourhood: 'Alfama',
    priceRange: 'free', tags: ['walking', 'historic'], nfcRelevant: false },
  { id: 'belem', type: 'landmark', name: 'Belém Tower', neighbourhood: 'Belém',
    priceRange: 'budget', tags: ['monument', 'historic'], nfcRelevant: false },
  { id: 'sjorge', type: 'landmark', name: 'Castelo de São Jorge', neighbourhood: 'Alfama',
    priceRange: 'budget', tags: ['historic', 'monument', 'view'], nfcRelevant: false },
  { id: 'graca', type: 'landmark', name: 'Miradouro da Graça', neighbourhood: 'Graça',
    priceRange: 'free', tags: ['viewpoint', 'walking'], nfcRelevant: false },
];
const BARS = [
  { id: 'park-bar', type: 'bar', name: 'Park', neighbourhood: 'Bairro Alto',
    priceRange: 'midrange', tags: ['nightlife', 'cocktails', 'view'], nfcRelevant: true },
];
const ALL = [...RESTAURANTS, ...GALLERIES, ...LANDMARKS, ...BARS];

const PROGRAMME = {
  event: { id: 'nfc-summit-2026', name: 'NFC Summit', neighbourhood: 'Parque das Nações' },
  days: [{ date: '2026-06-04', label: 'Day 1', doorsOpen: '09:00', doorsClose: '23:00' }],
};

function tripProfile(overrides = {}) {
  return {
    arrivalDate: '2026-06-03',
    departureDate: '2026-06-05',
    groupType: 'solo',
    budgetLevel: 'midrange',
    interests: ['art', 'food'],
    nfcDays: [],
    pace: 'balanced',
    dietaryNeeds: '',
    ...overrides,
  };
}

function blockAt(day, slot) {
  return day.blocks.find((b) => b.timeSlot === slot);
}

// --- Tests ------------------------------------------------------------------

test('balanced pace: each day has morning, afternoon (cultural), evening (restaurant)', () => {
  const it = buildItinerary({ tripProfile: tripProfile(), candidates: ALL, nfcProgramme: PROGRAMME });
  assert.equal(it.days.length, 3);
  for (const day of it.days) {
    assert.ok(blockAt(day, 'morning'), `morning missing on ${day.date}`);
    const afternoon = blockAt(day, 'afternoon');
    assert.ok(afternoon, `afternoon missing on ${day.date}`);
    assert.notEqual(afternoon.activity.type, 'restaurant',
      'balanced pace should not put restaurant in afternoon');
    const evening = blockAt(day, 'evening');
    assert.ok(evening, `evening missing on ${day.date}`);
    assert.equal(evening.activity.type, 'restaurant');
  }
});

test('relaxed pace: afternoon becomes a lunch restaurant', () => {
  const it = buildItinerary({
    tripProfile: tripProfile({ pace: 'relaxed' }),
    candidates: ALL,
    nfcProgramme: PROGRAMME,
  });
  for (const day of it.days) {
    if (day.nfcDay) continue;
    const afternoon = blockAt(day, 'afternoon');
    assert.ok(afternoon, `afternoon missing on ${day.date}`);
    assert.equal(afternoon.activity.type, 'restaurant',
      `relaxed pace should schedule lunch in afternoon on ${day.date}`);
  }
});

test('vegetarian + relaxed: lunch and dinner pick vegetarian-tagged restaurants', () => {
  const it = buildItinerary({
    tripProfile: tripProfile({ pace: 'relaxed', dietaryNeeds: 'vegetarian' }),
    candidates: ALL,
    nfcProgramme: PROGRAMME,
  });
  const picked = new Set();
  for (const day of it.days) {
    for (const block of day.blocks) {
      if (block.activity.type === 'restaurant') picked.add(block.activity.id);
    }
  }
  // The vegetarian-tagged restaurants should both be picked before Belcanto.
  assert.ok(picked.has('food-temple'), 'expected Food Temple to be picked');
  assert.ok(picked.has('prado'), 'expected Prado to be picked');
  assert.ok(!picked.has('belcanto') || picked.size > 2,
    'Belcanto should rank below vegetarian-tagged spots');
});

test('NFC day: Summit fills morning and afternoon, restaurant fills evening', () => {
  const it = buildItinerary({
    tripProfile: tripProfile({ nfcDays: ['2026-06-04'] }),
    candidates: ALL,
    nfcProgramme: PROGRAMME,
  });
  const nfcDay = it.days.find((d) => d.date === '2026-06-04');
  assert.ok(nfcDay.nfcDay);
  assert.equal(blockAt(nfcDay, 'morning').activity.type, 'event');
  assert.equal(blockAt(nfcDay, 'afternoon').activity.type, 'event');
  assert.equal(blockAt(nfcDay, 'evening').activity.type, 'restaurant');
});

test('empty restaurant pool: evening slot omitted and a warning is logged', () => {
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const it = buildItinerary({
      tripProfile: tripProfile(),
      candidates: [...GALLERIES, ...LANDMARKS, ...BARS],
      nfcProgramme: PROGRAMME,
    });
    for (const day of it.days) {
      assert.equal(blockAt(day, 'evening'), undefined);
    }
    assert.ok(warnings.some((m) => m.includes('no restaurant available')),
      'expected a warning about missing restaurants');
  } finally {
    console.warn = orig;
  }
});

test('dietary "none" is treated as no restrictions', () => {
  const it = buildItinerary({
    tripProfile: tripProfile({ dietaryNeeds: 'none' }),
    candidates: ALL,
    nfcProgramme: PROGRAMME,
  });
  const firstDinner = blockAt(it.days[0], 'evening');
  assert.ok(firstDinner);
});
