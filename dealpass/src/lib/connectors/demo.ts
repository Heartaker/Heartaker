import type { AffiliateConnector, ConnectionTestResult, FetchOptions, MerchantResult, OfferResult, TrackingMetadata } from './types';
import { slugify } from '../normalize';
import type { NormalizedMerchant, NormalizedOffer, NormalizedTransaction, OfferType, Vertical } from '../types';

/**
 * ============================================================================
 * DEMONSTRATION CONNECTOR — FICTIONAL DATA ONLY
 * ============================================================================
 *
 * Everything produced by this connector is invented for development and
 * demonstration. Specifically:
 *
 *   • Merchant names are invented brands. None of them is a real company.
 *   • Every domain uses the `.example` TLD, which RFC 2606 reserves for
 *     documentation and guarantees can never resolve to a real site.
 *   • Coupon codes are random strings. They do not work anywhere.
 *   • Prices, discounts and dates are synthetic.
 *   • No logos, trademarks or product images of real companies are used.
 *
 * The connector is the ONLY one enabled on a fresh install, so the platform
 * is fully explorable before any affiliate programme has approved you. Every
 * record it creates is tagged `source_type = 'demo'`, is filterable, and can
 * be switched off instantly with ENABLE_DEMO_CONNECTOR=false.
 *
 * Output is deterministic (seeded PRNG): running the import twice produces
 * byte-identical records, which is what makes the idempotency guarantee
 * testable.
 */

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

// ---------------------------------------------------------------------------
// Fictional merchants
// ---------------------------------------------------------------------------
interface DemoMerchantSeed {
  name: string;
  vertical: Vertical;
  domain: string;
  countries: string[];
  currency: string;
  blurbFr: string;
}

const MERCHANT_SEEDS: DemoMerchantSeed[] = [
  { name: 'Novalys',      vertical: 'shopping', domain: 'novalys.example',      countries: ['FR','DZ','MA','TN','BE','DE','ES','IT'], currency: 'EUR', blurbFr: 'Marque fictive d’électronique grand public créée pour la démonstration.' },
  { name: 'Kairova',      vertical: 'shopping', domain: 'kairova.example',      countries: ['FR','DZ','MA','TN','ES','IT'],            currency: 'EUR', blurbFr: 'Enseigne fictive de mode et d’accessoires.' },
  { name: 'Lumavia',      vertical: 'shopping', domain: 'lumavia.example',      countries: ['FR','BE','CH','MA','AE'],                 currency: 'EUR', blurbFr: 'Marque fictive de beauté et de soins.' },
  { name: 'Orvantis',     vertical: 'shopping', domain: 'orvantis.example',     countries: ['FR','BE','DE','ES'],                      currency: 'EUR', blurbFr: 'Enseigne fictive de mobilier et de jardin.' },
  { name: 'Pulsario',     vertical: 'shopping', domain: 'pulsario.example',     countries: ['FR','DZ','MA','TN','SA','AE'],            currency: 'EUR', blurbFr: 'Boutique fictive de sport et de plein air.' },
  { name: 'Marjoline',    vertical: 'shopping', domain: 'marjoline.example',    countries: ['FR','BE'],                                currency: 'EUR', blurbFr: 'Supermarché fictif en ligne.' },
  { name: 'PetitSonge',   vertical: 'shopping', domain: 'petitsonge.example',   countries: ['FR','BE','CH','MA'],                      currency: 'EUR', blurbFr: 'Enseigne fictive de puériculture et de jouets.' },
  { name: 'Azurway',      vertical: 'travel',   domain: 'azurway.example',      countries: ['FR','DZ','MA','TN','ES','IT','GB','AE'],  currency: 'EUR', blurbFr: 'Compagnie fictive de vols et de billetterie.' },
  { name: 'Nomadia',      vertical: 'travel',   domain: 'nomadia.example',      countries: ['FR','DZ','MA','TN','ES','IT','AE','SA','EG','QA','TR','US','GB','DE'], currency: 'EUR', blurbFr: 'Chaîne hôtelière fictive.' },
  { name: 'Routex',       vertical: 'travel',   domain: 'routex.example',       countries: ['FR','ES','IT','MA','TN','AE','TR'],       currency: 'EUR', blurbFr: 'Loueur fictif de véhicules.' },
  { name: 'Visitia',      vertical: 'travel',   domain: 'visitia.example',      countries: ['FR','ES','IT','MA','EG','AE','TR'],       currency: 'EUR', blurbFr: 'Plateforme fictive d’activités et de visites.' },
  { name: 'Saphir Tours', vertical: 'travel',   domain: 'saphirtours.example',  countries: ['FR','DZ','MA','TN','EG','TR'],            currency: 'EUR', blurbFr: 'Voyagiste fictif spécialisé dans les séjours.' },
  { name: 'Skilloria',    vertical: 'courses',  domain: 'skilloria.example',    countries: ['FR','DZ','MA','TN','BE','CH','CA','AE','SA','EG','QA','KW','US','GB'], currency: 'EUR', blurbFr: 'Plateforme fictive de formations en ligne.' },
  { name: 'Libralis',     vertical: 'courses',  domain: 'libralis.example',     countries: ['FR','BE','CH','CA','MA','AE'],            currency: 'EUR', blurbFr: 'Librairie fictive de livres numériques.' },
  { name: 'Cloudivia',    vertical: 'software', domain: 'cloudivia.example',    countries: ['FR','DZ','MA','TN','BE','CH','CA','AE','SA','EG','QA','KW','US','GB','DE'], currency: 'EUR', blurbFr: 'Éditeur fictif de logiciels professionnels.' },
  { name: 'Hostelia',     vertical: 'software', domain: 'hostelia.example',     countries: ['FR','DZ','MA','TN','BE','CH','CA','AE','SA','EG','QA','KW','US','GB','DE'], currency: 'EUR', blurbFr: 'Hébergeur fictif et fournisseur de services réseau.' },
  { name: 'Appvantage',   vertical: 'software', domain: 'appvantage.example',   countries: ['FR','DZ','MA','TN','BE','CH','CA','AE','SA','EG','QA','KW','US','GB','DE'], currency: 'EUR', blurbFr: 'Éditeur fictif d’applications mobiles.' },
];

// ---------------------------------------------------------------------------
// Fictional offer templates
// ---------------------------------------------------------------------------
interface OfferTemplate {
  offerType: OfferType;
  titleFr: string;
  titleEn: string;
  titleAr: string;
  discountValue: number;
  kind: 'percentage' | 'fixed_amount' | 'none';
  hasCode: boolean;
  termsFr: string;
}

const TEMPLATES: OfferTemplate[] = [
  { offerType: 'coupon_code',        titleFr: '{pct}% de réduction sur tout le site',        titleEn: '{pct}% off sitewide',                    titleAr: 'خصم {pct}% على كل الموقع',            discountValue: 15, kind: 'percentage',   hasCode: true,  termsFr: 'Valable une seule fois par client. Non cumulable avec les soldes en cours. Voir conditions sur le site du marchand.' },
  { offerType: 'coupon_code',        titleFr: '{pct}% dès 60 € d’achat',                     titleEn: '{pct}% off orders over €60',             titleAr: 'خصم {pct}% للطلبات فوق 60 €',          discountValue: 10, kind: 'percentage',   hasCode: true,  termsFr: 'Montant minimum de commande requis, hors frais de port. Non cumulable avec une autre offre.' },
  { offerType: 'free_shipping',      titleFr: 'Livraison offerte sans minimum d’achat',      titleEn: 'Free shipping, no minimum spend',        titleAr: 'شحن مجاني بدون حد أدنى',             discountValue: 0,  kind: 'none',         hasCode: false, termsFr: 'Livraison standard offerte. Zones éloignées et livraison express exclues.' },
  { offerType: 'new_customer_offer', titleFr: '{pct}% pour votre première commande',         titleEn: '{pct}% off your first order',            titleAr: 'خصم {pct}% على أول طلب',             discountValue: 20, kind: 'percentage',   hasCode: true,  termsFr: 'Réservé aux nouveaux clients. Une utilisation par foyer. Vérification d’éligibilité au paiement.' },
  { offerType: 'flash_sale',         titleFr: 'Ventes flash : jusqu’à {pct}% sur une sélection', titleEn: 'Flash sale: up to {pct}% off select items', titleAr: 'تخفيضات سريعة: حتى {pct}%',      discountValue: 40, kind: 'percentage',   hasCode: false, termsFr: 'Offre valable pendant la durée annoncée et dans la limite des stocks disponibles.' },
  { offerType: 'automatic_discount', titleFr: '{amt} € de remise automatique dès 80 €',      titleEn: '€{amt} off automatically over €80',      titleAr: 'خصم {amt} € تلقائياً فوق 80 €',       discountValue: 12, kind: 'fixed_amount', hasCode: false, termsFr: 'Remise appliquée automatiquement au panier. Conditions de seuil vérifiées avant paiement.' },
  { offerType: 'cashback',           titleFr: '{pct}% de cashback sur vos achats',           titleEn: '{pct}% cashback on your purchases',      titleAr: 'استرداد نقدي {pct}%',               discountValue: 5,  kind: 'percentage',   hasCode: false, termsFr: 'Le cashback est crédité après validation de la commande par le marchand. Délai de traitement variable.' },
  { offerType: 'exclusive_offer',    titleFr: 'Offre exclusive DealPass : {pct}% + livraison offerte', titleEn: 'DealPass exclusive: {pct}% off + free shipping', titleAr: 'عرض حصري: {pct}% + شحن مجاني', discountValue: 25, kind: 'percentage', hasCode: true, termsFr: 'Offre réservée aux visiteurs DealPass. Code utilisable une fois par compte client.' },
  { offerType: 'seasonal_sale',      titleFr: 'Soldes de saison : jusqu’à {pct}%',           titleEn: 'Seasonal sale: up to {pct}% off',        titleAr: 'تخفيضات موسمية: حتى {pct}%',         discountValue: 50, kind: 'percentage',   hasCode: false, termsFr: 'Remises appliquées sur les articles marqués en promotion. Les prix affichés peuvent varier.' },
  { offerType: 'price_drop',         titleFr: 'Baisse de prix : {pct}% sur une sélection',   titleEn: 'Price drop: {pct}% off select lines',    titleAr: 'انخفاض أسعار: {pct}%',               discountValue: 30, kind: 'percentage',   hasCode: false, termsFr: 'Prix susceptibles d’évoluer. Vérifiez le prix final sur le site du marchand avant achat.' },
  { offerType: 'travel_deal',        titleFr: '{pct}% sur les forfaits voyage',              titleEn: '{pct}% off travel packages',             titleAr: 'خصم {pct}% على باقات السفر',         discountValue: 18, kind: 'percentage',   hasCode: true,  termsFr: 'Selon disponibilités et périodes de voyage. Frais de dossier et taxes non inclus.' },
  { offerType: 'hotel_deal',         titleFr: '{pct}% sur votre séjour',                     titleEn: '{pct}% off your stay',                   titleAr: 'خصم {pct}% على الإقامة',             discountValue: 22, kind: 'percentage',   hasCode: true,  termsFr: 'Sélection d’hôtels participants. Annulation selon les conditions de chaque établissement.' },
  { offerType: 'flight_deal',        titleFr: 'Jusqu’à {pct}% sur une sélection de vols',    titleEn: 'Up to {pct}% off selected flights',      titleAr: 'حتى {pct}% على رحلات مختارة',        discountValue: 35, kind: 'percentage',   hasCode: false, termsFr: 'Tarifs soumis à disponibilité au moment de la réservation. Bagages et options en supplément.' },
  { offerType: 'car_rental_deal',    titleFr: '{pct}% sur la location de voiture',           titleEn: '{pct}% off car hire',                    titleAr: 'خصم {pct}% على تأجير السيارات',       discountValue: 15, kind: 'percentage',   hasCode: true,  termsFr: 'Âge minimum et permis requis selon le pays. Assurance et franchise non incluses.' },
  { offerType: 'activity_deal',      titleFr: '{pct}% sur les activités et visites',         titleEn: '{pct}% off activities & attractions',    titleAr: 'خصم {pct}% على الأنشطة',             discountValue: 20, kind: 'percentage',   hasCode: false, termsFr: 'Réservation préalable requise. Créneaux soumis à disponibilité.' },
  { offerType: 'course_deal',        titleFr: '{pct}% sur les formations en ligne',          titleEn: '{pct}% off online courses',              titleAr: 'خصم {pct}% على الدورات',             discountValue: 60, kind: 'percentage',   hasCode: true,  termsFr: 'Accès à vie selon la formule choisie. Offre réservée aux nouveaux inscrits.' },
  { offerType: 'software_deal',      titleFr: '{pct}% sur l’abonnement annuel',              titleEn: '{pct}% off the annual plan',             titleAr: 'خصم {pct}% على الاشتراك السنوي',      discountValue: 30, kind: 'percentage',   hasCode: true,  termsFr: 'Remise applicable à la première année d’abonnement. Renouvellement au tarif en vigueur.' },
];

const TRAVEL_TYPES: OfferType[] = ['travel_deal','hotel_deal','flight_deal','car_rental_deal','activity_deal'];
const COURSE_TYPES: OfferType[] = ['course_deal'];
const SOFTWARE_TYPES: OfferType[] = ['software_deal'];

// ---------------------------------------------------------------------------
// The connector
// ---------------------------------------------------------------------------
export class DemoConnector implements AffiliateConnector {
  readonly providerId = 'demo';
  readonly providerSlug = 'demo';
  readonly providerName = 'DealPass demonstration connector';
  readonly authMethod = 'none' as const;
  readonly integrationType = 'demo' as const;
  readonly requiredEnv: readonly string[] = [];
  readonly mappingVerified = true;

  private readonly seed: number;

  constructor(seed = 20240501) {
    this.seed = seed;
  }

  async isEnabled(): Promise<boolean> {
    return process.env.ENABLE_DEMO_CONNECTOR !== 'false';
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const enabled = await this.isEnabled();
    return {
      ok: enabled,
      status: enabled ? 'healthy' : 'not_configured',
      message: enabled
        ? 'Demonstration connector is enabled and generates fictional data locally. It contacts no external service.'
        : 'Demonstration connector is disabled via ENABLE_DEMO_CONNECTOR=false.',
      latencyMs: 0,
      credentials: [],
      checkedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Merchants
  // -------------------------------------------------------------------------
  async fetchMerchants(): Promise<MerchantResult> {
    if (!(await this.isEnabled())) return { items: [], hasMore: false };
    return { items: MERCHANT_SEEDS.map((m) => this.normalizeMerchant(m)), hasMore: false };
  }

  normalizeMerchant(raw: unknown): NormalizedMerchant {
    const m = raw as DemoMerchantSeed;
    return {
      externalId: `demo-${slugify(m.name)}`,
      name: m.name,
      slug: slugify(m.name),
      logoUrl: null, // Deliberately empty: we never ship real brand assets.
      shortDescription: m.blurbFr,
      fullDescription: `${m.blurbFr} Cette fiche est générée par le connecteur de démonstration DealPass et ne décrit aucune entreprise réelle.`,
      officialWebsiteUrl: `https://www.${m.domain}`,
      affiliateProgramUrl: null,
      countryCodes: m.countries,
      supportedLanguages: ['fr', 'en', 'ar'],
      defaultCurrency: m.currency,
      vertical: m.vertical,
    };
  }

  // -------------------------------------------------------------------------
  // Offers
  // -------------------------------------------------------------------------
  async fetchOffers(_options: FetchOptions = {}): Promise<OfferResult> {
    if (!(await this.isEnabled())) return { items: [], hasMore: false };

    const rand = mulberry32(this.seed);
    const now = new Date();
    const offers: NormalizedOffer[] = [];

    for (const merchant of MERCHANT_SEEDS) {
      const pool = TEMPLATES.filter((t) => {
        if (merchant.vertical === 'travel') return TRAVEL_TYPES.includes(t.offerType);
        if (merchant.vertical === 'courses') return COURSE_TYPES.includes(t.offerType);
        if (merchant.vertical === 'software') return SOFTWARE_TYPES.includes(t.offerType);
        return !TRAVEL_TYPES.includes(t.offerType) && !COURSE_TYPES.includes(t.offerType) && !SOFTWARE_TYPES.includes(t.offerType);
      });

      const count = 2 + Math.floor(rand() * 2); // 2–3 offers per merchant
      const used = new Set<number>();

      for (let i = 0; i < count; i += 1) {
        let index = Math.floor(rand() * pool.length);
        // Avoid repeating the same template for one merchant.
        for (let guard = 0; guard < pool.length && used.has(index); guard += 1) {
          index = (index + 1) % pool.length;
        }
        used.add(index);
        const template = pool[index]!;

        const pct = template.kind === 'percentage' ? template.discountValue + Math.floor(rand() * 5) : template.discountValue;
        const amt = template.kind === 'fixed_amount' ? template.discountValue + Math.floor(rand() * 8) : template.discountValue;

        // Expiry distribution: mostly live, a few ending very soon, a few
        // already expired so the expiration workflow has something to do.
        const roll = rand();
        let expiresAt: Date;
        if (roll < 0.08) {
          expiresAt = new Date(now.getTime() - (1 + Math.floor(rand() * 20)) * 86_400_000); // expired
        } else if (roll < 0.28) {
          expiresAt = new Date(now.getTime() + (1 + Math.floor(rand() * 6)) * 86_400_000);  // ending soon
        } else {
          expiresAt = new Date(now.getTime() + (8 + Math.floor(rand() * 75)) * 86_400_000); // live
        }

        // The offers table enforces expires_at > start_at, so a start date is
        // always placed before the expiry — including for the back-dated
        // records that simulate "this offer lapsed a while ago".
        const startAt = new Date(
          Math.min(now.getTime() - 3 * 86_400_000, expiresAt.getTime() - 30 * 86_400_000),
        );

        const codePrefix = merchant.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
        const code = template.hasCode
          ? `${codePrefix}${String(Math.floor(rand() * 9000) + 1000)}`
          : null;

        const title = template.titleFr
          .replace('{pct}', String(pct))
          .replace('{amt}', String(amt));

        const countries = merchant.countries.slice(0, 3 + Math.floor(rand() * (merchant.countries.length - 2)));

        offers.push({
          externalId: `demo-${slugify(merchant.name)}-${i + 1}`,
          merchantExternalId: `demo-${slugify(merchant.name)}`,
          title,
          shortDescription: `${title}. Offre de démonstration générée localement par DealPass.`,
          fullDescription:
            `${title}. Cette offre est fictive : elle est produite par le connecteur de démonstration ` +
            `DealPass pour illustrer le fonctionnement de la plateforme. Elle ne correspond à aucune ` +
            `promotion réelle et le code associé n’est utilisable nulle part.`,
          couponCode: code,
          offerType: template.offerType,
          discountType: template.kind === 'percentage' ? 'percentage' : template.kind === 'fixed_amount' ? 'fixed_amount' : 'none',
          discountValue: template.kind === 'percentage' ? pct : template.kind === 'fixed_amount' ? amt : null,
          currency: merchant.currency,
          originalPrice: null,
          finalPrice: null,
          destinationUrl: `https://www.${merchant.domain}/offres/${slugify(template.offerType)}`,
          affiliateUrl: `https://www.${merchant.domain}/offres/${slugify(template.offerType)}?utm_source=dealpass&utm_medium=affiliate`,
          imageUrl: null,
          startAt,
          expiresAt,
          countryCodes: countries,
          languageCodes: ['fr', 'en', 'ar'],
          termsAndConditions: template.termsFr,
          eligibilityRules: 'Offre de démonstration. Aucune condition commerciale réelle.',
          sourceType: 'demo',
          sourceReference: `demo:${slugify(merchant.name)}:${i + 1}`,
          isExclusive: template.offerType === 'exclusive_offer',
          isFeatured: rand() < 0.25,
        });
      }
    }

    // A handful of deliberately problematic records so the review queue and
    // the rejection path are populated on a fresh install.
    offers.push(...this.buildEdgeCases(now));

    return { items: offers, hasMore: false };
  }

  /**
   * Records that exercise the validation engine:
   *   • one missing terms            → lands in the human review queue
   *   • one off-domain destination   → rejected automatically
   *   • one coupon_code with no code → rejected automatically
   */
  private buildEdgeCases(now: Date): NormalizedOffer[] {
    return [
      {
        externalId: 'demo-novalys-edge-missing-terms',
        merchantExternalId: 'demo-novalys',
        title: 'Remise à vérifier sur les accessoires',
        shortDescription: 'Offre importée sans conditions détaillées — doit passer en revue humaine.',
        fullDescription: 'Enregistrement de test : les conditions sont absentes, le score de confiance sera donc insuffisant pour une publication automatique.',
        couponCode: 'NOVA7781',
        offerType: 'coupon_code',
        discountType: 'percentage',
        discountValue: 12,
        currency: 'EUR',
        originalPrice: null,
        finalPrice: null,
        destinationUrl: 'https://www.novalys.example/accessoires',
        affiliateUrl: 'https://www.novalys.example/accessoires?utm_source=dealpass',
        imageUrl: null,
        startAt: new Date(now.getTime() - 86_400_000),
        expiresAt: new Date(now.getTime() + 21 * 86_400_000),
        countryCodes: ['FR', 'BE'],
        languageCodes: ['fr', 'en', 'ar'],
        termsAndConditions: null, // ← deliberate: forces human review
        eligibilityRules: null,
        sourceType: 'demo',
        sourceReference: 'demo:novalys:edge-terms',
        isExclusive: false,
        isFeatured: false,
      },
      {
        externalId: 'demo-kairova-edge-unauthorized-domain',
        merchantExternalId: 'demo-kairova',
        title: 'Offre avec domaine de destination non autorisé',
        shortDescription: 'Enregistrement de test : le domaine ne correspond pas au marchand.',
        fullDescription: 'Enregistrement de test destiné à être rejeté automatiquement par le contrôle de domaine.',
        couponCode: 'KAIROVA99',
        offerType: 'coupon_code',
        discountType: 'percentage',
        discountValue: 30,
        currency: 'EUR',
        originalPrice: null,
        finalPrice: null,
        destinationUrl: 'https://www.unrelated-shop.example/deal', // ← off-domain
        affiliateUrl: null,
        imageUrl: null,
        startAt: new Date(now.getTime() - 86_400_000),
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
        countryCodes: ['FR'],
        languageCodes: ['fr', 'en', 'ar'],
        termsAndConditions: 'Conditions de test suffisamment longues pour passer les autres contrôles.',
        eligibilityRules: null,
        sourceType: 'demo',
        sourceReference: 'demo:kairova:edge-domain',
        isExclusive: false,
        isFeatured: false,
      },
      {
        externalId: 'demo-lumavia-edge-missing-code',
        merchantExternalId: 'demo-lumavia',
        title: 'Code promo annoncé mais absent',
        shortDescription: 'Enregistrement de test : offre typée code sans code renseigné.',
        fullDescription: 'Enregistrement de test destiné à être rejeté automatiquement : un code est annoncé mais aucun code n’est fourni.',
        couponCode: null, // ← deliberate: coupon_code type with no code
        offerType: 'coupon_code',
        discountType: 'percentage',
        discountValue: 20,
        currency: 'EUR',
        originalPrice: null,
        finalPrice: null,
        destinationUrl: 'https://www.lumavia.example/promo',
        affiliateUrl: 'https://www.lumavia.example/promo?utm_source=dealpass',
        imageUrl: null,
        startAt: new Date(now.getTime() - 86_400_000),
        expiresAt: new Date(now.getTime() + 14 * 86_400_000),
        countryCodes: ['FR', 'BE'],
        languageCodes: ['fr', 'en', 'ar'],
        termsAndConditions: 'Conditions de test suffisamment longues pour passer les autres contrôles.',
        eligibilityRules: null,
        sourceType: 'demo',
        sourceReference: 'demo:lumavia:edge-code',
        isExclusive: false,
        isFeatured: false,
      },
    ];
  }

  async fetchTransactions(): Promise<{ items: NormalizedTransaction[]; hasMore: boolean }> {
    // The demonstration connector produces no transactions: inventing revenue
    // would be misleading. Real networks supply these.
    return { items: [], hasMore: false };
  }

  async generateAffiliateLink(url: string, metadata: TrackingMetadata = {}): Promise<string> {
    const target = new URL(url);
    target.searchParams.set('utm_source', 'dealpass');
    target.searchParams.set('utm_medium', 'affiliate');
    if (metadata.subId) target.searchParams.set('subid', metadata.subId);
    if (metadata.offerId) target.searchParams.set('utm_content', metadata.offerId);
    return target.toString();
  }

  normalizeOffer(raw: unknown): NormalizedOffer {
    return raw as NormalizedOffer;
  }

  normalizeTransaction(raw: unknown): NormalizedTransaction {
    return raw as NormalizedTransaction;
  }
}
