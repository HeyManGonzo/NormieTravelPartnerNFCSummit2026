// Static UI strings. Norma's voice is translated at runtime by Claude based
// on session.language — this file only covers UI chrome.

const en = {
  app: {
    name: 'Norma',
    tagline: 'NFC Summit 2026 Visitor Concierge',
  },
  chat: {
    placeholder: 'Tell Norma about your trip…',
    send: 'Send',
    sending: 'Sending',
    thinking: 'Norma is thinking',
    greetingNew:
      "Hi — I'm Norma, your concierge for NFC Summit 2026. When are you arriving in Lisbon, and how many days are you staying?",
    greetingReturning: 'Welcome back. Want to keep planning where we left off?',
    profileComplete: 'Profile complete · ready to draft your itinerary',
    generating: 'Drafting your itinerary',
    errorGeneric: 'Something went wrong. Try again?',
    errorSend: 'Could not send. Retry?',
  },
  itinerary: {
    title: 'Your itinerary',
    empty: 'No itinerary yet. Finish the conversation with Norma to draft one.',
    version: 'Version',
    regenerate: 'Regenerate',
    share: 'Share',
    export: 'Export',
    nfcDay: 'NFC Summit',
    slot: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' },
    backup: 'Backup',
    close: 'Close',
    open: 'View itinerary',
  },
  status: {
    onboarding: 'Onboarding',
    planning: 'Planning',
    active: 'Active',
    completed: 'Completed',
  },
  languages: {
    en: 'English',
    pt: 'Português',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    tr: 'Türkçe',
  },
};

const pt = {
  ...en,
  chat: {
    ...en.chat,
    placeholder: 'Conte à Norma sobre a sua viagem…',
    send: 'Enviar',
    sending: 'A enviar',
    thinking: 'Norma está a pensar',
    greetingNew:
      'Olá — sou a Norma, a sua concierge para a NFC Summit 2026. Quando chega a Lisboa e quantos dias fica?',
    greetingReturning: 'Bem-vindo de volta. Continuamos onde parámos?',
    profileComplete: 'Perfil completo · pronto para preparar o itinerário',
    generating: 'A preparar o seu itinerário',
    errorGeneric: 'Algo correu mal. Tentar de novo?',
    errorSend: 'Não foi possível enviar. Repetir?',
  },
  itinerary: {
    ...en.itinerary,
    title: 'O seu itinerário',
    empty: 'Sem itinerário ainda. Termine a conversa com a Norma para criar um.',
    version: 'Versão',
    regenerate: 'Regenerar',
    share: 'Partilhar',
    export: 'Exportar',
    nfcDay: 'NFC Summit',
    slot: { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite' },
    backup: 'Alternativa',
    close: 'Fechar',
    open: 'Ver itinerário',
  },
};

const es = {
  ...en,
  chat: {
    ...en.chat,
    placeholder: 'Cuéntale a Norma sobre tu viaje…',
    send: 'Enviar',
    sending: 'Enviando',
    thinking: 'Norma está pensando',
    greetingNew:
      'Hola — soy Norma, tu concierge para NFC Summit 2026. ¿Cuándo llegas a Lisboa y cuántos días te quedas?',
    greetingReturning: 'Bienvenido de nuevo. ¿Seguimos donde lo dejamos?',
    profileComplete: 'Perfil completo · listo para preparar tu itinerario',
    generating: 'Preparando tu itinerario',
    errorGeneric: 'Algo salió mal. ¿Reintentar?',
    errorSend: 'No se pudo enviar. ¿Reintentar?',
  },
  itinerary: {
    ...en.itinerary,
    title: 'Tu itinerario',
    empty: 'Aún no hay itinerario. Termina la conversación con Norma para crearlo.',
    version: 'Versión',
    regenerate: 'Regenerar',
    share: 'Compartir',
    export: 'Exportar',
    slot: { morning: 'Mañana', afternoon: 'Tarde', evening: 'Noche' },
    backup: 'Alternativa',
    close: 'Cerrar',
    open: 'Ver itinerario',
  },
};

const fr = {
  ...en,
  chat: {
    ...en.chat,
    placeholder: 'Parlez à Norma de votre voyage…',
    send: 'Envoyer',
    sending: 'Envoi',
    thinking: 'Norma réfléchit',
    greetingNew:
      'Bonjour — je suis Norma, votre concierge pour NFC Summit 2026. Quand arrivez-vous à Lisbonne, et combien de jours restez-vous ?',
    greetingReturning: 'Re-bonjour. On reprend où on en était ?',
    profileComplete: 'Profil complet · prêt à composer votre itinéraire',
    generating: 'Composition de votre itinéraire',
    errorGeneric: "Une erreur s'est produite. Réessayer ?",
    errorSend: "Impossible d'envoyer. Réessayer ?",
  },
  itinerary: {
    ...en.itinerary,
    title: 'Votre itinéraire',
    empty: "Pas encore d'itinéraire. Terminez la conversation avec Norma pour en créer un.",
    version: 'Version',
    regenerate: 'Régénérer',
    share: 'Partager',
    export: 'Exporter',
    slot: { morning: 'Matin', afternoon: 'Après-midi', evening: 'Soir' },
    backup: 'Alternative',
    close: 'Fermer',
    open: "Voir l'itinéraire",
  },
};


const de = {
  ...en,
  chat: {
    ...en.chat,
    placeholder: 'Erzähl Norma von deiner Reise…',
    send: 'Senden',
    sending: 'Sende',
    thinking: 'Norma denkt nach',
    greetingNew:
      'Hi — ich bin Norma, deine Concierge für den NFC Summit 2026. Wann kommst du in Lissabon an und wie lange bleibst du?',
    greetingReturning: 'Willkommen zurück. Machen wir da weiter, wo wir aufgehört haben?',
    profileComplete: 'Profil vollständig · bereit für deinen Reiseplan',
    generating: 'Erstelle deinen Reiseplan',
    errorGeneric: 'Etwas ist schiefgelaufen. Erneut versuchen?',
    errorSend: 'Konnte nicht senden. Erneut versuchen?',
  },
  itinerary: {
    ...en.itinerary,
    title: 'Dein Reiseplan',
    empty: 'Noch kein Reiseplan. Beende das Gespräch mit Norma, um einen zu erstellen.',
    version: 'Version',
    regenerate: 'Neu erstellen',
    share: 'Teilen',
    export: 'Exportieren',
    slot: { morning: 'Vormittag', afternoon: 'Nachmittag', evening: 'Abend' },
    backup: 'Alternative',
    close: 'Schließen',
    open: 'Reiseplan ansehen',
  },
};

const tr = {
  ...en,
  chat: {
    ...en.chat,
    placeholder: "Norma'ya seyahatinden bahset…",
    send: 'Gönder',
    sending: 'Gönderiliyor',
    thinking: 'Norma düşünüyor',
    greetingNew:
      "Selam — ben Norma, NFC Summit 2026 konsiyerjin. Lizbon'a ne zaman geliyorsun ve ne kadar kalacaksın?",
    greetingReturning: 'Tekrar hoş geldin. Kaldığımız yerden devam edelim mi?',
    profileComplete: 'Profil tamam · planını çıkarmaya hazırız',
    generating: 'Programın hazırlanıyor',
    errorGeneric: 'Bir şeyler ters gitti. Tekrar denensin mi?',
    errorSend: 'Gönderilemedi. Tekrar denensin mi?',
  },
  itinerary: {
    ...en.itinerary,
    title: 'Programın',
    empty: "Henüz program yok. Bir tane oluşturmak için Norma'yla sohbeti tamamla.",
    version: 'Sürüm',
    regenerate: 'Yenile',
    share: 'Paylaş',
    export: 'Dışa aktar',
    slot: { morning: 'Sabah', afternoon: 'Öğleden sonra', evening: 'Akşam' },
    backup: 'Alternatif',
    close: 'Kapat',
    open: 'Programı gör',
  },
};

const MESSAGES = { en, pt, es, fr, de, tr };
export const SUPPORTED_LOCALES = Object.keys(MESSAGES);

export function getMessages(locale) {
  return MESSAGES[locale] ?? MESSAGES.en;
}

export function t(locale, path) {
  const parts = path.split('.');
  let cur = getMessages(locale);
  for (const p of parts) {
    if (cur == null) return path;
    cur = cur[p];
  }
  return cur ?? path;
}
