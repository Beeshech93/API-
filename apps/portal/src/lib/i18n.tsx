"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const LOCALES = ["en", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = "ayitipay_locale";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.docs": "Docs",
  "nav.dashboard": "Dashboard",
  "nav.signIn": "Sign in",

  "home.title": "One API for MonCash & NatCash",
  "home.body":
    "AyitiPay gives developers a single, unified way to accept mobile money payments in Haiti — connect your own MonCash and NatCash merchant accounts, get a sandbox in seconds, and go live when you're ready.",
  "home.cta1": "Get started free",
  "home.cta2": "Read the docs",
  "home.f1t": "Unified API",
  "home.f1b": "One request shape for both MonCash and NatCash — create a payment, check status, get notified.",
  "home.f2t": "Bring your own account",
  "home.f2b": "Connect your own MonCash and NatCash merchant credentials — funds settle directly to you.",
  "home.f3t": "Sandbox included",
  "home.f3b": "Every app gets a safe TEST mode that never touches real money, with a try-it console in the docs.",

  "auth.signupTitle": "Create your developer account",
  "auth.name": "Name",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.createAccount": "Create account",
  "auth.creating": "Creating account…",
  "auth.haveAccount": "Already have an account?",
  "auth.signInLink": "Sign in",
  "auth.signinTitle": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.noAccount": "No account yet?",
  "auth.createOne": "Create one",
  "auth.generic": "Something went wrong.",

  "dash.loading": "Loading…",
  "dash.welcome": "Welcome to AyitiPay",
  "dash.welcomeBody": "Select an application from the sidebar, or create a new one to get your first API keys.",
  "dash.noApps": "No applications yet.",
  "dash.newAppPlaceholder": "New application name",
  "dash.newApp": "+ New application",
  "dash.creating": "Creating…",
  "dash.signOut": "Sign out",

  "tab.keys": "API Keys",
  "tab.providers": "Providers",
  "tab.transactions": "Transactions",
  "tab.webhooks": "Webhooks",
  "tab.billing": "Billing",

  "keys.title": "API Keys",
  "keys.copyNow": "Copy this key now — you won't be able to see it again.",
  "keys.mode": "Mode",
  "keys.test": "Test",
  "keys.live": "Live",
  "keys.labelOpt": "Label (optional)",
  "keys.issue": "Issue key",
  "keys.issuing": "Issuing…",
  "keys.prefix": "Prefix",
  "keys.label": "Label",
  "keys.lastUsed": "Last used",
  "keys.status": "Status",
  "keys.never": "never",
  "keys.active": "Active",
  "keys.revoked": "Revoked",
  "keys.revoke": "Revoke",

  "prov.title": "Your MonCash & NatCash accounts",
  "prov.intro":
    "Connect your own merchant credentials for each provider. LIVE-mode API keys will only work for a provider once you've added credentials here — TEST keys always use the built-in safe sandbox.",
  "prov.none": "No providers connected yet.",
  "prov.disconnect": "Disconnect",
  "prov.active": "Active",
  "prov.inactive": "Inactive",
  "prov.addUpdate": "Add / update credentials",
  "prov.provider": "Provider",
  "prov.clientId": "Client ID",
  "prov.clientSecret": "Client secret",
  "prov.webhookSecret": "Webhook secret",
  "prov.baseUrl": "Base URL (optional override)",
  "prov.save": "Save credentials",
  "prov.saving": "Saving…",
  "prov.note":
    "Stored encrypted at rest. Real MonCash/NatCash API contracts are still being confirmed against each provider's official docs, so LIVE payments will return a clear \"not configured\" error until that integration is finished.",

  "tx.title": "Transactions",
  "tx.reference": "Reference",
  "tx.provider": "Provider",
  "tx.amount": "Amount",
  "tx.mode": "Mode",
  "tx.status": "Status",
  "tx.created": "Created",
  "tx.empty": "No transactions yet — create one via the API or the docs try-it console.",
  "tx.detail": "Transaction",
  "tx.providerPaymentId": "Provider payment id",
  "tx.history": "Event history",
  "tx.via": "via",
  "tx.loading": "Loading…",

  "wh.title": "Webhook endpoints",
  "wh.none": "No webhook endpoints yet.",
  "wh.remove": "Remove",
  "wh.secret": "Signing secret:",
  "wh.add": "Add",
  "wh.recent": "Recent deliveries",
  "wh.event": "Event",
  "wh.status": "Status",
  "wh.attempts": "Attempts",
  "wh.lastResponse": "Last response",
  "wh.redeliver": "Redeliver",
  "wh.noDeliveries": "No deliveries yet.",

  "bill.title": "Billing",
  "bill.intro":
    "AyitiPay charges a small platform fee per successful transaction. This is a running record of what's owed — v1 does not process this fee automatically.",
  "bill.thisMonth": "This month",
  "bill.reference": "Reference",
  "bill.provider": "Provider",
  "bill.fee": "Fee",
  "bill.rate": "Rate (bps)",
  "bill.date": "Date",
  "bill.empty": "No billable transactions yet.",

  "docs.gettingStarted": "Getting started",
  "docs.authentication": "Authentication",
  "docs.payments": "Payments",
  "docs.webhooks": "Webhooks",
  "docs.errors": "Errors",
  "docs.tryIt": "Try it",
  "docs.indexTitle": "AyitiPay docs",
  "docs.indexBody": "Start with Getting started, or jump straight to the try-it console with a test API key.",

  "con.title": "Try it",
  "con.intro":
    "Paste one of your application's TEST API keys — this calls the real API in sandbox mode, exactly like your own integration would.",
  "con.key": "Test API key",
  "con.provider": "Provider",
  "con.amount": "Amount (HTG)",
  "con.create": "Create payment",
  "con.success": "Simulate success",
  "con.failure": "Simulate failure",
  "con.refresh": "Refresh status",
  "con.failed": "Request failed.",

  "err.EMAIL_TAKEN": "An account with that email already exists.",
  "err.INVALID_CREDENTIALS": "Invalid email or password.",
  "err.VALIDATION_ERROR": "Some fields are invalid. Check your input.",
  "err.UNAUTHENTICATED": "Your session has expired. Please sign in again.",
  "err.INVALID_API_KEY": "Invalid API key.",
  "err.MODE_NOT_ALLOWED": "This endpoint is only available with a TEST API key.",
  "err.PROVIDER_NOT_CONFIGURED": "This provider isn't configured for live payments yet.",
  "err.RATE_LIMITED": "Too many requests. Try again in a moment.",
  "err.PAYMENT_NOT_FOUND": "Payment not found.",
  "err.ENCRYPTION_NOT_CONFIGURED": "Credential encryption isn't configured on the server.",
};

const es: Dict = {
  "nav.docs": "Documentación",
  "nav.dashboard": "Panel",
  "nav.signIn": "Iniciar sesión",

  "home.title": "Una sola API para MonCash y NatCash",
  "home.body":
    "AyitiPay ofrece a los desarrolladores una forma única y unificada de aceptar pagos de dinero móvil en Haití: conecta tus propias cuentas de comercio de MonCash y NatCash, obtén un sandbox en segundos y pasa a producción cuando estés listo.",
  "home.cta1": "Empieza gratis",
  "home.cta2": "Leer la documentación",
  "home.f1t": "API unificada",
  "home.f1b": "Un mismo formato de petición para MonCash y NatCash: crea un pago, consulta su estado y recibe notificaciones.",
  "home.f2t": "Trae tu propia cuenta",
  "home.f2b": "Conecta tus propias credenciales de comercio de MonCash y NatCash: los fondos se liquidan directamente a ti.",
  "home.f3t": "Sandbox incluido",
  "home.f3b": "Cada aplicación tiene un modo TEST seguro que nunca toca dinero real, con una consola de pruebas en la documentación.",

  "auth.signupTitle": "Crea tu cuenta de desarrollador",
  "auth.name": "Nombre",
  "auth.email": "Correo electrónico",
  "auth.password": "Contraseña",
  "auth.createAccount": "Crear cuenta",
  "auth.creating": "Creando cuenta…",
  "auth.haveAccount": "¿Ya tienes una cuenta?",
  "auth.signInLink": "Inicia sesión",
  "auth.signinTitle": "Iniciar sesión",
  "auth.signingIn": "Iniciando sesión…",
  "auth.noAccount": "¿Aún no tienes cuenta?",
  "auth.createOne": "Crea una",
  "auth.generic": "Algo salió mal.",

  "dash.loading": "Cargando…",
  "dash.welcome": "Bienvenido a AyitiPay",
  "dash.welcomeBody": "Selecciona una aplicación en la barra lateral, o crea una nueva para obtener tus primeras claves de API.",
  "dash.noApps": "Aún no hay aplicaciones.",
  "dash.newAppPlaceholder": "Nombre de la nueva aplicación",
  "dash.newApp": "+ Nueva aplicación",
  "dash.creating": "Creando…",
  "dash.signOut": "Cerrar sesión",

  "tab.keys": "Claves de API",
  "tab.providers": "Proveedores",
  "tab.transactions": "Transacciones",
  "tab.webhooks": "Webhooks",
  "tab.billing": "Facturación",

  "keys.title": "Claves de API",
  "keys.copyNow": "Copia esta clave ahora: no podrás verla de nuevo.",
  "keys.mode": "Modo",
  "keys.test": "Prueba",
  "keys.live": "Producción",
  "keys.labelOpt": "Etiqueta (opcional)",
  "keys.issue": "Generar clave",
  "keys.issuing": "Generando…",
  "keys.prefix": "Prefijo",
  "keys.label": "Etiqueta",
  "keys.lastUsed": "Último uso",
  "keys.status": "Estado",
  "keys.never": "nunca",
  "keys.active": "Activa",
  "keys.revoked": "Revocada",
  "keys.revoke": "Revocar",

  "prov.title": "Tus cuentas de MonCash y NatCash",
  "prov.intro":
    "Conecta tus propias credenciales de comercio para cada proveedor. Las claves de API en modo PRODUCCIÓN solo funcionarán con un proveedor una vez que agregues sus credenciales aquí; las claves de PRUEBA siempre usan el sandbox seguro integrado.",
  "prov.none": "Aún no hay proveedores conectados.",
  "prov.disconnect": "Desconectar",
  "prov.active": "Activo",
  "prov.inactive": "Inactivo",
  "prov.addUpdate": "Agregar / actualizar credenciales",
  "prov.provider": "Proveedor",
  "prov.clientId": "ID de cliente",
  "prov.clientSecret": "Secreto de cliente",
  "prov.webhookSecret": "Secreto del webhook",
  "prov.baseUrl": "URL base (opcional)",
  "prov.save": "Guardar credenciales",
  "prov.saving": "Guardando…",
  "prov.note":
    "Se almacenan cifradas. Los contratos reales de las APIs de MonCash/NatCash aún se están confirmando con la documentación oficial de cada proveedor, por lo que los pagos en PRODUCCIÓN devolverán un error claro de \"no configurado\" hasta que se termine esa integración.",

  "tx.title": "Transacciones",
  "tx.reference": "Referencia",
  "tx.provider": "Proveedor",
  "tx.amount": "Monto",
  "tx.mode": "Modo",
  "tx.status": "Estado",
  "tx.created": "Creada",
  "tx.empty": "Aún no hay transacciones: crea una desde la API o la consola de pruebas de la documentación.",
  "tx.detail": "Transacción",
  "tx.providerPaymentId": "ID de pago del proveedor",
  "tx.history": "Historial de eventos",
  "tx.via": "vía",
  "tx.loading": "Cargando…",

  "wh.title": "Endpoints de webhook",
  "wh.none": "Aún no hay endpoints de webhook.",
  "wh.remove": "Eliminar",
  "wh.secret": "Secreto de firma:",
  "wh.add": "Agregar",
  "wh.recent": "Entregas recientes",
  "wh.event": "Evento",
  "wh.status": "Estado",
  "wh.attempts": "Intentos",
  "wh.lastResponse": "Última respuesta",
  "wh.redeliver": "Reenviar",
  "wh.noDeliveries": "Aún no hay entregas.",

  "bill.title": "Facturación",
  "bill.intro":
    "AyitiPay cobra una pequeña comisión de plataforma por cada transacción exitosa. Este es un registro acumulado de lo adeudado: la v1 no procesa esta comisión automáticamente.",
  "bill.thisMonth": "Este mes",
  "bill.reference": "Referencia",
  "bill.provider": "Proveedor",
  "bill.fee": "Comisión",
  "bill.rate": "Tasa (bps)",
  "bill.date": "Fecha",
  "bill.empty": "Aún no hay transacciones facturables.",

  "docs.gettingStarted": "Primeros pasos",
  "docs.authentication": "Autenticación",
  "docs.payments": "Pagos",
  "docs.webhooks": "Webhooks",
  "docs.errors": "Errores",
  "docs.tryIt": "Probar",
  "docs.indexTitle": "Documentación de AyitiPay",
  "docs.indexBody": "Empieza con Primeros pasos, o ve directo a la consola de pruebas con una clave de API de prueba.",

  "con.title": "Probar",
  "con.intro":
    "Pega una de las claves de API de PRUEBA de tu aplicación: esto llama a la API real en modo sandbox, igual que lo haría tu propia integración.",
  "con.key": "Clave de API de prueba",
  "con.provider": "Proveedor",
  "con.amount": "Monto (HTG)",
  "con.create": "Crear pago",
  "con.success": "Simular éxito",
  "con.failure": "Simular fallo",
  "con.refresh": "Actualizar estado",
  "con.failed": "La solicitud falló.",

  "err.EMAIL_TAKEN": "Ya existe una cuenta con ese correo electrónico.",
  "err.INVALID_CREDENTIALS": "Correo o contraseña incorrectos.",
  "err.VALIDATION_ERROR": "Algunos campos no son válidos. Revisa los datos.",
  "err.UNAUTHENTICATED": "Tu sesión ha expirado. Inicia sesión de nuevo.",
  "err.INVALID_API_KEY": "Clave de API no válida.",
  "err.MODE_NOT_ALLOWED": "Este endpoint solo está disponible con una clave de API de PRUEBA.",
  "err.PROVIDER_NOT_CONFIGURED": "Este proveedor aún no está configurado para pagos en producción.",
  "err.RATE_LIMITED": "Demasiadas solicitudes. Inténtalo de nuevo en un momento.",
  "err.PAYMENT_NOT_FOUND": "Pago no encontrado.",
  "err.ENCRYPTION_NOT_CONFIGURED": "El cifrado de credenciales no está configurado en el servidor.",
};

const fr: Dict = {
  "nav.docs": "Documentation",
  "nav.dashboard": "Tableau de bord",
  "nav.signIn": "Se connecter",

  "home.title": "Une seule API pour MonCash et NatCash",
  "home.body":
    "AyitiPay offre aux développeurs un moyen unique et unifié d'accepter les paiements mobiles en Haïti : connectez vos propres comptes marchands MonCash et NatCash, obtenez un sandbox en quelques secondes et passez en production quand vous êtes prêt.",
  "home.cta1": "Commencer gratuitement",
  "home.cta2": "Lire la documentation",
  "home.f1t": "API unifiée",
  "home.f1b": "Un seul format de requête pour MonCash et NatCash : créez un paiement, consultez son statut et soyez notifié.",
  "home.f2t": "Apportez votre propre compte",
  "home.f2b": "Connectez vos propres identifiants marchands MonCash et NatCash : les fonds vous sont versés directement.",
  "home.f3t": "Sandbox inclus",
  "home.f3b": "Chaque application dispose d'un mode TEST sécurisé qui ne touche jamais à l'argent réel, avec une console d'essai dans la documentation.",

  "auth.signupTitle": "Créez votre compte développeur",
  "auth.name": "Nom",
  "auth.email": "E-mail",
  "auth.password": "Mot de passe",
  "auth.createAccount": "Créer le compte",
  "auth.creating": "Création du compte…",
  "auth.haveAccount": "Vous avez déjà un compte ?",
  "auth.signInLink": "Se connecter",
  "auth.signinTitle": "Se connecter",
  "auth.signingIn": "Connexion…",
  "auth.noAccount": "Pas encore de compte ?",
  "auth.createOne": "Créez-en un",
  "auth.generic": "Une erreur est survenue.",

  "dash.loading": "Chargement…",
  "dash.welcome": "Bienvenue sur AyitiPay",
  "dash.welcomeBody": "Sélectionnez une application dans la barre latérale, ou créez-en une pour obtenir vos premières clés d'API.",
  "dash.noApps": "Aucune application pour le moment.",
  "dash.newAppPlaceholder": "Nom de la nouvelle application",
  "dash.newApp": "+ Nouvelle application",
  "dash.creating": "Création…",
  "dash.signOut": "Se déconnecter",

  "tab.keys": "Clés d'API",
  "tab.providers": "Fournisseurs",
  "tab.transactions": "Transactions",
  "tab.webhooks": "Webhooks",
  "tab.billing": "Facturation",

  "keys.title": "Clés d'API",
  "keys.copyNow": "Copiez cette clé maintenant : vous ne pourrez plus la revoir.",
  "keys.mode": "Mode",
  "keys.test": "Test",
  "keys.live": "Production",
  "keys.labelOpt": "Libellé (facultatif)",
  "keys.issue": "Générer une clé",
  "keys.issuing": "Génération…",
  "keys.prefix": "Préfixe",
  "keys.label": "Libellé",
  "keys.lastUsed": "Dernière utilisation",
  "keys.status": "Statut",
  "keys.never": "jamais",
  "keys.active": "Active",
  "keys.revoked": "Révoquée",
  "keys.revoke": "Révoquer",

  "prov.title": "Vos comptes MonCash et NatCash",
  "prov.intro":
    "Connectez vos propres identifiants marchands pour chaque fournisseur. Les clés d'API en mode PRODUCTION ne fonctionneront pour un fournisseur qu'une fois ses identifiants ajoutés ici ; les clés TEST utilisent toujours le sandbox sécurisé intégré.",
  "prov.none": "Aucun fournisseur connecté pour le moment.",
  "prov.disconnect": "Déconnecter",
  "prov.active": "Actif",
  "prov.inactive": "Inactif",
  "prov.addUpdate": "Ajouter / mettre à jour les identifiants",
  "prov.provider": "Fournisseur",
  "prov.clientId": "ID client",
  "prov.clientSecret": "Secret client",
  "prov.webhookSecret": "Secret du webhook",
  "prov.baseUrl": "URL de base (facultatif)",
  "prov.save": "Enregistrer les identifiants",
  "prov.saving": "Enregistrement…",
  "prov.note":
    "Stockés chiffrés. Les contrats réels des API MonCash/NatCash sont encore en cours de confirmation avec la documentation officielle de chaque fournisseur ; les paiements en PRODUCTION renverront donc une erreur claire « non configuré » jusqu'à la fin de cette intégration.",

  "tx.title": "Transactions",
  "tx.reference": "Référence",
  "tx.provider": "Fournisseur",
  "tx.amount": "Montant",
  "tx.mode": "Mode",
  "tx.status": "Statut",
  "tx.created": "Créée",
  "tx.empty": "Aucune transaction pour le moment : créez-en une via l'API ou la console d'essai de la documentation.",
  "tx.detail": "Transaction",
  "tx.providerPaymentId": "ID de paiement du fournisseur",
  "tx.history": "Historique des événements",
  "tx.via": "via",
  "tx.loading": "Chargement…",

  "wh.title": "Endpoints de webhook",
  "wh.none": "Aucun endpoint de webhook pour le moment.",
  "wh.remove": "Supprimer",
  "wh.secret": "Secret de signature :",
  "wh.add": "Ajouter",
  "wh.recent": "Livraisons récentes",
  "wh.event": "Événement",
  "wh.status": "Statut",
  "wh.attempts": "Tentatives",
  "wh.lastResponse": "Dernière réponse",
  "wh.redeliver": "Renvoyer",
  "wh.noDeliveries": "Aucune livraison pour le moment.",

  "bill.title": "Facturation",
  "bill.intro":
    "AyitiPay prélève une petite commission de plateforme par transaction réussie. Il s'agit d'un relevé cumulé des montants dus : la v1 ne traite pas cette commission automatiquement.",
  "bill.thisMonth": "Ce mois-ci",
  "bill.reference": "Référence",
  "bill.provider": "Fournisseur",
  "bill.fee": "Commission",
  "bill.rate": "Taux (bps)",
  "bill.date": "Date",
  "bill.empty": "Aucune transaction facturable pour le moment.",

  "docs.gettingStarted": "Prise en main",
  "docs.authentication": "Authentification",
  "docs.payments": "Paiements",
  "docs.webhooks": "Webhooks",
  "docs.errors": "Erreurs",
  "docs.tryIt": "Essayer",
  "docs.indexTitle": "Documentation AyitiPay",
  "docs.indexBody": "Commencez par la Prise en main, ou passez directement à la console d'essai avec une clé d'API de test.",

  "con.title": "Essayer",
  "con.intro":
    "Collez l'une des clés d'API TEST de votre application : cela appelle la vraie API en mode sandbox, exactement comme le ferait votre propre intégration.",
  "con.key": "Clé d'API de test",
  "con.provider": "Fournisseur",
  "con.amount": "Montant (HTG)",
  "con.create": "Créer un paiement",
  "con.success": "Simuler un succès",
  "con.failure": "Simuler un échec",
  "con.refresh": "Actualiser le statut",
  "con.failed": "La requête a échoué.",

  "err.EMAIL_TAKEN": "Un compte existe déjà avec cet e-mail.",
  "err.INVALID_CREDENTIALS": "E-mail ou mot de passe incorrect.",
  "err.VALIDATION_ERROR": "Certains champs sont invalides. Vérifiez votre saisie.",
  "err.UNAUTHENTICATED": "Votre session a expiré. Veuillez vous reconnecter.",
  "err.INVALID_API_KEY": "Clé d'API invalide.",
  "err.MODE_NOT_ALLOWED": "Cet endpoint n'est disponible qu'avec une clé d'API TEST.",
  "err.PROVIDER_NOT_CONFIGURED": "Ce fournisseur n'est pas encore configuré pour les paiements en production.",
  "err.RATE_LIMITED": "Trop de requêtes. Réessayez dans un instant.",
  "err.PAYMENT_NOT_FOUND": "Paiement introuvable.",
  "err.ENCRYPTION_NOT_CONFIGURED": "Le chiffrement des identifiants n'est pas configuré sur le serveur.",
};

const DICTS: Record<Locale, Dict> = { en, es, fr };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {}
  const browser = navigator.language.slice(0, 2);
  return (LOCALES as readonly string[]).includes(browser) ? (browser as Locale) : "en";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = useCallback((key: string) => DICTS[locale][key] ?? DICTS.en[key] ?? key, [locale]);

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}

// Prefer a translated message keyed by the API's stable error `code`; fall back
// to the server's own (English) message for codes without a translation.
export function useErrorMessage() {
  const t = useT();
  return (err: unknown, fallbackKey = "auth.generic") => {
    const code = (err as { code?: string })?.code;
    const message = (err as { message?: string })?.message;
    if (code && t(`err.${code}`) !== `err.${code}`) return t(`err.${code}`);
    return message || t(fallbackKey);
  };
}
