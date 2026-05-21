import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { getMessages } from '@/lib/i18n';

const ACCENT = '#d9ff00';
const ACCENT_TEXT = '#07070a';
const BG = '#0a0a0c';
const SURFACE = '#15151b';
const MUTED = '#8a8a96';
const TEXT = '#fafafa';

const PRICE_LABEL = {
  budget: '€',
  midrange: '€€',
  premium: '€€€',
};

const styles = StyleSheet.create({
  page: { backgroundColor: BG, color: TEXT, padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  brand: { fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  brandDot: { color: ACCENT },
  meta: { fontSize: 8, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' },
  hero: { marginBottom: 28 },
  heroKicker: { fontSize: 8, color: ACCENT, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' },
  heroTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: TEXT, lineHeight: 1.1 },
  heroSub: { marginTop: 8, fontSize: 10, color: MUTED },
  day: { marginBottom: 22, break: false },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#26262e',
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginBottom: 10,
  },
  dayDate: { fontSize: 8, color: MUTED, letterSpacing: 1.4, textTransform: 'uppercase' },
  dayTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: TEXT, marginTop: 2 },
  nfcBadge: {
    backgroundColor: ACCENT,
    color: ACCENT_TEXT,
    fontSize: 7,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 8,
    letterSpacing: 1.5,
    fontFamily: 'Helvetica-Bold',
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  cardSlot: { fontSize: 7, color: MUTED, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 4 },
  cardTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: TEXT },
  cardMeta: { fontSize: 8, color: MUTED, marginTop: 3 },
  cardDesc: { fontSize: 9, color: TEXT, marginTop: 6, lineHeight: 1.4 },
  cardAddr: { fontSize: 8, color: MUTED, marginTop: 6 },
  backup: { marginTop: 8, paddingTop: 6, borderTopColor: '#2a2a32', borderTopWidth: 1 },
  backupLabel: { fontSize: 7, color: ACCENT, letterSpacing: 1.4, textTransform: 'uppercase' },
  backupName: { fontSize: 9, color: TEXT, marginTop: 2 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 7, color: MUTED, textAlign: 'center', letterSpacing: 1.4, textTransform: 'uppercase' },
});

function formatDate(iso, dateLocale) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(dateLocale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function ActivityCard({ block, msgs }) {
  const a = block?.activity;
  if (!a) return null;
  const slot = msgs.itinerary.slot[block.timeSlot] ?? block.timeSlot;
  const priceLabel = a.priceRange === 'free' ? msgs.exportDoc.free : PRICE_LABEL[a.priceRange];
  const meta = [a.neighbourhood, a.estimatedDuration, priceLabel].filter(Boolean).join(' · ');
  return React.createElement(View, { style: styles.card, wrap: false },
    React.createElement(Text, { style: styles.cardSlot }, slot),
    React.createElement(Text, { style: styles.cardTitle }, a.name),
    meta ? React.createElement(Text, { style: styles.cardMeta }, meta) : null,
    a.description ? React.createElement(Text, { style: styles.cardDesc }, a.description) : null,
    a.address ? React.createElement(Text, { style: styles.cardAddr }, a.address) : null,
    a.backup?.name
      ? React.createElement(View, { style: styles.backup },
          React.createElement(Text, { style: styles.backupLabel }, msgs.itinerary.backup),
          React.createElement(Text, { style: styles.backupName },
            `${a.backup.name}${a.backup.neighbourhood ? ` · ${a.backup.neighbourhood}` : ''}`,
          ),
        )
      : null,
  );
}

function DaySection({ day, msgs }) {
  return React.createElement(View, { style: styles.day, wrap: false },
    React.createElement(View, { style: styles.dayHeader },
      React.createElement(View, null,
        React.createElement(Text, { style: styles.dayDate }, formatDate(day.date, msgs.exportDoc.dateLocale)),
        React.createElement(Text, { style: styles.dayTitle }, day.dayLabel),
      ),
      day.nfcDay ? React.createElement(Text, { style: styles.nfcBadge }, msgs.exportDoc.nfcBadge) : null,
    ),
    ...(day.blocks ?? []).map((block, i) =>
      React.createElement(ActivityCard, { key: `${day.date}-${i}`, block, msgs }),
    ),
  );
}

function ItineraryDocument({ itinerary, msgs }) {
  const trip = itinerary?.trip;
  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: styles.page },
      React.createElement(View, { style: styles.header },
        React.createElement(Text, { style: styles.brand },
          'GEMEL',
          React.createElement(Text, { style: styles.brandDot }, '.'),
        ),
        React.createElement(Text, { style: styles.meta }, msgs.exportDoc.pdfHeaderMeta),
      ),
      React.createElement(View, { style: styles.hero },
        React.createElement(Text, { style: styles.heroKicker }, msgs.exportDoc.pdfKicker),
        React.createElement(Text, { style: styles.heroTitle }, msgs.exportDoc.pdfTitle),
        trip
          ? React.createElement(Text, { style: styles.heroSub },
              `${trip.arrivalDate} → ${trip.departureDate} · ${trip.durationDays} ${msgs.exportDoc.pdfDays} · v${itinerary.version ?? 1}`,
            )
          : null,
      ),
      ...(itinerary?.days ?? []).map((day) =>
        React.createElement(DaySection, { key: day.date, day, msgs }),
      ),
      React.createElement(Text, { style: styles.footer, fixed: true },
        msgs.exportDoc.pdfFooter,
      ),
    ),
  );
}

export async function buildPdf(itinerary, locale = 'en') {
  const msgs = getMessages(locale);
  return renderToBuffer(React.createElement(ItineraryDocument, { itinerary, msgs }));
}
