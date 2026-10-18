-- =============================================================================
-- 0009 — Reference seed: roles, permissions, categories, networks, settings
-- Idempotent: safe to run repeatedly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------
INSERT INTO roles (slug, name, description, rank, is_system) VALUES
  ('super_admin',      'Super administrator', 'Unrestricted access including roles, permissions and destructive operations.', 10,  true),
  ('admin',            'Administrator',       'Full operational access except role/permission administration.',              20,  true),
  ('editor',           'Editor',              'Creates and edits offers, merchants, categories and editorial pages.',        30,  true),
  ('reviewer',         'Reviewer',            'Reviews the moderation queue; cannot publish directly.',                      40,  true),
  ('analyst',          'Analyst',             'Read-only access to analytics, conversions and commission data.',             50,  true),
  ('support',          'Support',             'Handles user reports and newsletter questions; no configuration access.',     60,  true),
  ('registered_user',  'Registered user',     'Standard site account. No administrative access.',                            100, true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, rank = EXCLUDED.rank;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
INSERT INTO permissions (slug, resource, action, description) VALUES
  ('offers.read',        'offers',      'read',    'View offers including unpublished ones'),
  ('offers.create',      'offers',      'create',  'Create offers manually'),
  ('offers.update',      'offers',      'update',  'Edit offers'),
  ('offers.delete',      'offers',      'delete',  'Delete offers'),
  ('offers.publish',     'offers',      'publish', 'Approve / publish / schedule offers'),
  ('offers.review',      'offers',      'review',  'Resolve the moderation queue and user reports'),
  ('offers.export',      'offers',      'export',  'Export offers to CSV'),

  ('merchants.read',     'merchants',   'read',    'View merchants'),
  ('merchants.create',   'merchants',   'create',  'Create merchants'),
  ('merchants.update',   'merchants',   'update',  'Edit merchants'),
  ('merchants.delete',   'merchants',   'delete',  'Delete merchants'),

  ('categories.read',    'categories',  'read',    'View categories'),
  ('categories.update',  'categories',  'update',  'Edit categories and translations'),

  ('integrations.read',      'integrations', 'read',      'View connector status and health'),
  ('integrations.configure', 'integrations', 'configure', 'Enable / disable connectors and edit their settings'),
  ('integrations.sync',      'integrations', 'sync',      'Run a manual synchronisation'),
  ('connectors.read',        'connectors',   'read',      'View connector credentials status (masked)'),

  ('users.read',         'users',       'read',    'View user accounts'),
  ('users.update',       'users',       'update',  'Edit user accounts and roles'),
  ('users.delete',       'users',       'delete',  'Delete user accounts'),

  ('newsletters.read',   'newsletters', 'read',    'View subscribers and campaigns'),
  ('newsletters.update', 'newsletters', 'update',  'Edit subscribers and sendings'),
  ('newsletters.export', 'newsletters', 'export',  'Export subscriber lists'),

  ('analytics.read',     'analytics',   'read',    'View analytics, conversions and commissions'),

  ('settings.read',      'settings',    'read',    'View site settings'),
  ('settings.configure', 'settings',    'configure','Edit brand identity, thresholds and SEO settings'),

  ('audit_logs.read',    'audit_logs',  'read',    'View the audit trail'),

  ('pages.update',       'pages',       'update',  'Edit editorial and legal pages')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;

-- -----------------------------------------------------------------------------
-- Role → permission matrix
-- -----------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'admin' AND p.slug <> 'users.delete'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'editor' AND p.slug IN (
  'offers.read','offers.create','offers.update','offers.publish','offers.export',
  'merchants.read','merchants.create','merchants.update',
  'categories.read','categories.update',
  'integrations.read','connectors.read',
  'pages.update','settings.read'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'reviewer' AND p.slug IN (
  'offers.read','offers.update','offers.review',
  'merchants.read','categories.read','connectors.read','settings.read'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'analyst' AND p.slug IN (
  'offers.read','merchants.read','categories.read',
  'analytics.read','integrations.read','connectors.read',
  'newsletters.read','settings.read','offers.export'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'support' AND p.slug IN (
  'offers.read','offers.review','merchants.read','categories.read','settings.read'
)
ON CONFLICT DO NOTHING;

-- registered_user holds no administrative permissions by design.

-- -----------------------------------------------------------------------------
-- Categories
-- -----------------------------------------------------------------------------
INSERT INTO categories (slug, name, icon, description, display_order, vertical) VALUES
  ('electronique',        'Électronique',      'smartphone',  'Smartphones, ordinateurs, TV et accessoires.',       10, 'shopping'),
  ('mode',                'Mode',              'shirt',       'Vêtements, chaussures et accessoires.',              20, 'shopping'),
  ('beaute-sante',        'Beauté & Santé',    'sparkles',    'Parfums, soins, compléments et parapharmacie.',      30, 'shopping'),
  ('maison-jardin',       'Maison & Jardin',   'home',        'Mobilier, décoration, électroménager et jardin.',    40, 'shopping'),
  ('sport-plein-air',     'Sport & Plein air', 'dumbbell',    'Équipement sportif, camping et randonnée.',          50, 'shopping'),
  ('courses-alimentaires','Courses en ligne',  'shopping-basket','Supermarché en ligne, épicerie et livraison.',    60, 'shopping'),
  ('bebe-enfants',        'Bébé & Enfants',    'baby',        'Puériculture, jouets et vêtements enfants.',          70, 'shopping'),
  ('hotels',              'Hôtels',            'bed-double',  'Hôtels, resorts et hébergements.',                   10, 'travel'),
  ('vols',                'Vols',              'plane',       'Billets d’avion, compagnies et comparateurs.',       20, 'travel'),
  ('location-voiture',    'Location de voiture','car',        'Location de voiture courte et longue durée.',        30, 'travel'),
  ('activites',           'Activités & Visites','ticket',     'Musées, excursions, parcs et expériences.',          40, 'travel'),
  ('sejours',             'Séjours & Circuits', 'map',         'Packages, circuits et voyages organisés.',           50, 'travel'),
  ('formations',          'Formations en ligne','graduation-cap','Cours en ligne, certifications et e-learning.',   10, 'courses'),
  ('livres-numeriques',   'Livres numériques', 'book-open',   'Ebooks, audiobooks et bibliothèques numériques.',    20, 'courses'),
  ('logiciels-saas',      'Logiciels & SaaS',  'monitor',     'Abonnements logiciels et outils professionnels.',    10, 'software'),
  ('hebergement-vpn',     'Hébergement & VPN', 'server',      'Hébergement web, noms de domaine et VPN.',           20, 'software'),
  ('apps-mobile',         'Applications mobile','app-window', 'Applications et abonnements mobiles.',               30, 'software')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;

-- -----------------------------------------------------------------------------
-- Category translations (fr / en / ar)
-- -----------------------------------------------------------------------------
INSERT INTO category_translations (category_id, language_code, name, slug, description, seo_title, seo_description)
SELECT c.id, t.language_code, t.name, t.slug, t.description, t.seo_title, t.seo_description
FROM categories c
JOIN (VALUES
  ('electronique','fr','Électronique','electronique','Smartphones, ordinateurs, TV et accessoires.','Codes promo électronique','Les meilleures réductions high-tech vérifiées.'),
  ('electronique','en','Electronics','electronics','Smartphones, computers, TVs and accessories.','Electronics promo codes','Verified discounts on tech and gadgets.'),
  ('electronique','ar','إلكترونيات','electronics','هواتف ذكية وحواسيب وتلفزيونات وملحقات.','كود خصم إلكترونيات','أفضل الخصومات المؤكدة على الأجهزة التقنية.'),

  ('mode','fr','Mode','mode','Vêtements, chaussures et accessoires.','Codes promo mode','Réductions vérifiées sur la mode en ligne.'),
  ('mode','en','Fashion','fashion','Clothing, shoes and accessories.','Fashion promo codes','Verified online fashion discounts.'),
  ('mode','ar','أزياء','fashion','ملابس وأحذية وإكسسوارات.','كود خصم أزياء','خصومات مؤكدة على الأزياء عبر الإنترنت.'),

  ('beaute-sante','fr','Beauté & Santé','beaute-sante','Parfums, soins, compléments et parapharmacie.','Codes promo beauté et santé','Offres vérifiées beauté, soins et bien-être.'),
  ('beaute-sante','en','Beauty & Health','beauty-health','Fragrances, skincare, supplements and pharmacy.','Beauty & health promo codes','Verified beauty, skincare and wellness offers.'),
  ('beaute-sante','ar','جمال وصحة','beauty-health','عطور وعناية ومكملات وصيدلية.','كود خصم جمال وصحة','عروض مؤكدة للعناية والصحة والجمال.'),

  ('maison-jardin','fr','Maison & Jardin','maison-jardin','Mobilier, décoration, électroménager et jardin.','Codes promo maison','Réductions vérifiées pour la maison et le jardin.'),
  ('maison-jardin','en','Home & Garden','home-garden','Furniture, decor, appliances and garden.','Home & garden promo codes','Verified home and garden discounts.'),
  ('maison-jardin','ar','منزل وحديقة','home-garden','أثاث وديكور وأجهزة منزلية وحديقة.','كود خصم منزل وحديقة','خصومات مؤكدة للمنزل والحديقة.'),

  ('sport-plein-air','fr','Sport & Plein air','sport-plein-air','Équipement sportif, camping et randonnée.','Codes promo sport','Offres vérifiées sport et plein air.'),
  ('sport-plein-air','en','Sports & Outdoors','sports-outdoors','Sports gear, camping and hiking equipment.','Sports & outdoors promo codes','Verified sports and outdoor offers.'),
  ('sport-plein-air','ar','رياضة وخلاء','sports-outdoors','معدات رياضية وتخييم ومشي.','كود خصم رياضة','عروض مؤكدة للرياضة والأنشطة الخارجية.'),

  ('courses-alimentaires','fr','Courses en ligne','courses-alimentaires','Supermarché en ligne, épicerie et livraison.','Codes promo courses en ligne','Réductions vérifiées sur les courses en ligne.'),
  ('courses-alimentaires','en','Online Grocery','online-grocery','Online supermarket, grocery and delivery.','Online grocery promo codes','Verified grocery delivery discounts.'),
  ('courses-alimentaires','ar','بقالة إلكترونية','online-grocery','سوبرماركت إلكتروني وبقالة وتوصيل.','كود خصم بقالة','خصومات مؤكدة على البقالة عبر الإنترنت.'),

  ('bebe-enfants','fr','Bébé & Enfants','bebe-enfants','Puériculture, jouets et vêtements enfants.','Codes promo bébé et enfants','Offres vérifiées puériculture et jouets.'),
  ('bebe-enfants','en','Baby & Kids','baby-kids','Nursery, toys and children clothing.','Baby & kids promo codes','Verified nursery and toy offers.'),
  ('bebe-enfants','ar','أطفال ورضع','baby-kids','مستلزمات أطفال وألعاب وملابس.','كود خصم أطفال','عروض مؤكدة لمستلزمات الأطفال والألعاب.'),

  ('hotels','fr','Hôtels','hotels','Hôtels, resorts et hébergements.','Codes promo hôtels','Réductions hôtel vérifiées partout dans le monde.'),
  ('hotels','en','Hotels','hotels','Hotels, resorts and accommodation.','Hotel promo codes','Verified hotel discounts worldwide.'),
  ('hotels','ar','فنادق','hotels','فنادق ومنتجعات وإقامات.','كود خصم فنادق','خصومات فنادق مؤكدة حول العالم.'),

  ('vols','fr','Vols','vols','Billets d’avion, compagnies et comparateurs.','Codes promo vols','Réductions vérifiées sur les billets d’avion.'),
  ('vols','en','Flights','flights','Airline tickets, carriers and comparators.','Flight promo codes','Verified discounts on airline tickets.'),
  ('vols','ar','رحلات طيران','flights','تذاكر طيران وشركات ومواقع مقارنة.','كود خصم طيران','خصومات مؤكدة على تذاكر الطيران.'),

  ('location-voiture','fr','Location de voiture','location-voiture','Location de voiture courte et longue durée.','Codes promo location de voiture','Réductions vérifiées sur la location de voiture.'),
  ('location-voiture','en','Car rental','car-rental','Short and long term car hire.','Car rental promo codes','Verified car hire discounts.'),
  ('location-voiture','ar','تأجير سيارات','car-rental','تأجير سيارات قصير وطويل الأمد.','كود خصم تأجير سيارات','خصومات مؤكدة على تأجير السيارات.'),

  ('activites','fr','Activités & Visites','activites','Musées, excursions, parcs et expériences.','Codes promo activités','Réductions vérifiées sur les activités et visites.'),
  ('activites','en','Activities & Attractions','activities','Museums, excursions, parks and experiences.','Activities promo codes','Verified discounts on tours and attractions.'),
  ('activites','ar','أنشطة ومعالم','activities','متاحف ورحلات وحدائق وتجارب.','كود خصم أنشطة','خصومات مؤكدة على الأنشطة والمعالم.'),

  ('sejours','fr','Séjours & Circuits','sejours','Packages, circuits et voyages organisés.','Codes promo séjours','Offres vérifiées séjours et circuits.'),
  ('sejours','en','Packages & Tours','packages-tours','Holiday packages and guided tours.','Package tour promo codes','Verified holiday package offers.'),
  ('sejours','ar','باقات ورحلات','packages-tours','باقات عطل ورحلات منظمة.','كود خصم باقات','عروض مؤكدة على الباقات والرحلات.'),

  ('formations','fr','Formations en ligne','formations','Cours en ligne, certifications et e-learning.','Codes promo formations','Réductions vérifiées sur les formations en ligne.'),
  ('formations','en','Online courses','online-courses','Online courses, certifications and e-learning.','Online course promo codes','Verified e-learning discounts.'),
  ('formations','ar','دورات إلكترونية','online-courses','دورات وشهادات وتعليم إلكتروني.','كود خصم دورات','خصومات مؤكدة على الدورات الإلكترونية.'),

  ('livres-numeriques','fr','Livres numériques','livres-numeriques','Ebooks, audiobooks et bibliothèques numériques.','Codes promo livres numériques','Réductions vérifiées sur les ebooks.'),
  ('livres-numeriques','en','eBooks','ebooks','Ebooks, audiobooks and digital libraries.','eBook promo codes','Verified ebook discounts.'),
  ('livres-numeriques','ar','كتب إلكترونية','ebooks','كتب إلكترونية وكتب مسموعة ومكتبات رقمية.','كود خصم كتب','خصومات مؤكدة على الكتب الإلكترونية.'),

  ('logiciels-saas','fr','Logiciels & SaaS','logiciels-saas','Abonnements logiciels et outils professionnels.','Codes promo logiciels','Réductions vérifiées sur les logiciels et SaaS.'),
  ('logiciels-saas','en','Software & SaaS','software-saas','Software subscriptions and professional tools.','Software promo codes','Verified software and SaaS discounts.'),
  ('logiciels-saas','ar','برمجيات وساس','software-saas','اشتراكات برمجيات وأدوات مهنية.','كود خصم برمجيات','خصومات مؤكدة على البرمجيات.'),

  ('hebergement-vpn','fr','Hébergement & VPN','hebergement-vpn','Hébergement web, noms de domaine et VPN.','Codes promo hébergement et VPN','Réductions vérifiées hébergement web et VPN.'),
  ('hebergement-vpn','en','Hosting & VPN','hosting-vpn','Web hosting, domain names and VPN.','Hosting & VPN promo codes','Verified hosting and VPN discounts.'),
  ('hebergement-vpn','ar','استضافة وVPN','hosting-vpn','استضافة مواقع ونطاقات وشبكات VPN.','كود خصم استضافة','خصومات مؤكدة على الاستضافة وVPN.'),

  ('apps-mobile','fr','Applications mobile','apps-mobile','Applications et abonnements mobiles.','Codes promo applications','Réductions vérifiées sur les applications.'),
  ('apps-mobile','en','Mobile apps','mobile-apps','Mobile applications and subscriptions.','Mobile app promo codes','Verified app subscription discounts.'),
  ('apps-mobile','ar','تطبيقات الجوال','mobile-apps','تطبيقات واشتراكات للجوال.','كود خصم تطبيقات','خصومات مؤكدة على التطبيقات.')
) AS t(base_slug, language_code, name, slug, description, seo_title, seo_description)
  ON c.slug = t.base_slug
ON CONFLICT (category_id, language_code) DO UPDATE
  SET name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
      seo_title = EXCLUDED.seo_title, seo_description = EXCLUDED.seo_description;

-- -----------------------------------------------------------------------------
-- Affiliate networks — every one starts DISABLED except the demo connector.
-- Nothing here claims a partnership: `status` stays 'disabled' until you hold
-- an approved account and have put the credentials in the environment.
-- -----------------------------------------------------------------------------
INSERT INTO affiliate_networks
  (slug, name, integration_type, status, synchronization_frequency, required_env, compliance_notes, health_status, is_demo)
VALUES
  ('awin','Awin','api','disabled','every_6_hours',ARRAY['AWIN_PUBLISHER_ID','AWIN_API_TOKEN'],'Requires an approved Awin publisher account. Voucher codes must come from the approved promotion feed, not from merchant pages.','not_configured',false),
  ('impact','Impact.com','api','disabled','every_6_hours',ARRAY['IMPACT_ACCOUNT_ID','IMPACT_API_KEY','IMPACT_API_SECRET'],'Requires approved advertiser relationships inside Impact. Respect each advertiser promotion terms.','not_configured',false),
  ('cj','CJ Affiliate','api','disabled','every_6_hours',ARRAY['CJ_COMPANY_ID','CJ_API_TOKEN'],'Requires an approved CJ account and accepted advertiser programs.','not_configured',false),
  ('rakuten','Rakuten Advertising','api','disabled','every_12_hours',ARRAY['RAKUTEN_API_KEY'],'Approved publisher account required.','not_configured',false),
  ('travelpayouts','Travelpayouts','api','disabled','every_12_hours',ARRAY['TRAVELPAYOUTS_TOKEN','TRAVELPAYOUTS_MARKER'],'Provides travel deals and hotel/flight widgets under the Travelpayouts partner terms.','not_configured',false),
  ('feedico','Feedico','feed','disabled','daily',ARRAY['FEEDICO_API_KEY'],'Only usable with an approved Feedico account and API access.','not_configured',false),

  ('aliexpress','AliExpress Affiliate','api','disabled','every_6_hours',ARRAY['ALIEXPRESS_APP_KEY','ALIEXPRESS_APP_SECRET','ALIEXPRESS_TRACKING_ID'],'Official Portals API only. Product names and images must come from the API response.','not_configured',false),
  ('temu','Temu Affiliate','api','disabled','every_12_hours',ARRAY['TEMU_AFFILIATE_ID'],'Approved affiliate account required. Do not display prices not returned by the official feed.','not_configured',false),
  ('amazon','Amazon Associates','api','disabled','every_12_hours',ARRAY['AMAZON_ASSOCIATE_TAG','AMAZON_API_KEY','AMAZON_API_SECRET','AMAZON_MARKETPLACE'],'PA-API v5 access is approval-gated. Associates programme rules forbid displaying prices that are not freshly retrieved and cached within the allowed window.','not_configured',false),
  ('ebay','eBay Partner Network','api','disabled','every_12_hours',ARRAY['EBAY_CLIENT_ID','EBAY_CLIENT_SECRET','EBAY_CAMPAIGN_ID'],'Approved EPN account and EPID campaign required.','not_configured',false),
  ('walmart','Walmart Affiliate','api','disabled','every_12_hours',ARRAY['WALMART_AFFILIATE_ID','WALMART_CONSUMER_ID'],'Approved affiliate account required.','not_configured',false),
  ('shein','SHEIN Affiliate','api','disabled','every_12_hours',ARRAY['SHEIN_AFFILIATE_ID'],'Approved affiliate account required. Brand asset usage governed by the programme agreement.','not_configured',false),
  ('iherb','iHerb Affiliate','api','disabled','every_12_hours',ARRAY['IHERB_AFFILIATE_ID'],'Approved affiliate account required. Health claims must not be added to offers.','not_configured',false),
  ('udemy','Udemy Affiliate','api','disabled','daily',ARRAY['UDEMY_AFFILIATE_ID'],'Approved affiliate account required. Course prices are set by Udemy and must come from the official feed.','not_configured',false),
  ('clickbank','ClickBank','api','disabled','daily',ARRAY['CLICKBANK_ACCOUNT_ID','CLICKBANK_API_KEY'],'Approved account required. Vendor promotional claims must not be altered.','not_configured',false),

  ('trip','Trip.com Affiliate','api','disabled','daily',ARRAY['TRIP_COM_AFFILIATE_ID'],'Approved affiliate account required.','not_configured',false),
  ('expedia','Expedia Group Affiliate','api','disabled','daily',ARRAY['EXPEDIA_AFFILIATE_ID','EXPEDIA_API_KEY'],'Approved affiliate account required. Rates and availability must come from the official API.','not_configured',false),
  ('booking','Booking.com Affiliate','api','disabled','daily',ARRAY['BOOKING_COM_AFFILIATE_ID'],'Approved affiliate account required. Screenshots and brand assets governed by the partner agreement.','not_configured',false),
  ('agoda','Agoda Affiliate','api','disabled','daily',ARRAY['AGODA_AFFILIATE_ID'],'Approved affiliate account required.','not_configured',false),
  ('klook','Klook Affiliate','api','disabled','daily',ARRAY['KLOOK_AFFILIATE_ID'],'Approved affiliate account required.','not_configured',false),
  ('discovercars','DiscoverCars Affiliate','api','disabled','daily',ARRAY['DISCOVERCARS_AFFILIATE_ID'],'Approved affiliate account required.','not_configured',false),

  ('demo','DealPass demonstration connector','demo','enabled','manual','{}','Fictional data generated locally by the application. Contains NO real merchant, NO real code and NO real price. Safe for development and screenshots. Not a partnership.','healthy',true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  integration_type = EXCLUDED.integration_type,
  required_env = EXCLUDED.required_env,
  compliance_notes = EXCLUDED.compliance_notes,
  is_demo = EXCLUDED.is_demo;

-- The demo connector is the only one allowed to be enabled without credentials.
UPDATE affiliate_networks SET status = 'disabled' WHERE is_demo = false AND status = 'enabled';

-- -----------------------------------------------------------------------------
-- site_settings — brand identity, publication thresholds, localization
-- Never secrets. The schema-level trigger rejects credential-like keys.
-- -----------------------------------------------------------------------------
INSERT INTO site_settings (setting_key, environment, setting_value) VALUES
  ('brand','all', jsonb_build_object(
    'siteName',    'DealPass',
    'slogan',      'Shopping, travel, and digital-service deals—all in one place.',
    'domain',      'localhost:3000',
    'logoUrl',     '',
    'faviconUrl',  '',
    'fontSans',    'Inter',
    'fontDisplay', 'Inter',
    'radius',      '0.875rem',
    'colors', jsonb_build_object(
      'brand',  '15 118 110',
      'accent', '245 158 11',
      'ink',    '17 24 39',
      'surface','255 255 255',
      'line',   '226 232 240'
    ),
    'defaultTheme','light'
  )),
  ('localization','all', jsonb_build_object(
    'defaultLanguage','fr',
    'defaultCountry','DZ',
    'defaultCurrency','DZD',
    'supportedLanguages', ARRAY['fr','en','ar'],
    'supportedCountries', ARRAY['DZ','MA','TN','FR','ES','IT','DE','BE','CH','GB','CA','AE','SA','EG','QA','KW','TR','US'],
    'supportedCurrencies', ARRAY['DZD','MAD','TND','EUR','USD','GBP','CAD','AED','SAR','EGP','QAR','KWD','TRY','CHF'],
    'autoDetect', true
  )),
  ('publication','all', jsonb_build_object(
    'autoPublishThreshold', 90,
    'reviewThreshold',      70,
    'rejectBelow',          40,
    'requireTerms',         true,
    'requireCountry',       true,
    'requireExpiryOrOngoing', false,
    'maxDaysUntilExpiry',   180,
    'autoExpireEnabled',    true,
    'staleAfterDays',       30,
    'allowUnverifiedPublish', false
  )),
  ('features','all', jsonb_build_object(
    'demoConnectorEnabled', true,
    'darkMode',             true,
    'newsletterEnabled',    true,
    'favoritesEnabled',     true,
    'reportsEnabled',       true,
    'searchAnalytics',      true,
    'maintenanceMode',      false
  )),
  ('seo','all', jsonb_build_object(
    'indexPagination',      true,
    'indexInternalSearch',  false,
    'expiredOfferStrategy', 'keep_with_notice',
    'sitemapEnabled',       true,
    'organizationName',     'DealPass'
  )),
  ('affiliate_disclosure','all', jsonb_build_object(
    'fr','DealPass peut percevoir une commission lorsque vous passez par un lien partenaire. Cela ne change pas le prix que vous payez.',
    'en','DealPass may earn a commission when you use one of our partner links. This never changes the price you pay.',
    'ar','قد تحصل ديل باس على عمولة عند استخدام أحد روابط الشركاء. لن ي改变 ذلك السعر الذي تدفعه.'
  ))
ON CONFLICT (setting_key, environment) DO NOTHING;

-- Fix the garbled Arabic disclosure above (kept separate so the seed stays readable).
UPDATE site_settings
SET setting_value = jsonb_set(
  setting_value,
  '{ar}',
  to_jsonb('قد تحصل ديل باس على عمولة عند استخدام أحد روابط الشركاء. لن يؤثر ذلك على السعر الذي تدفعه.'::text)
)
WHERE setting_key = 'affiliate_disclosure';
