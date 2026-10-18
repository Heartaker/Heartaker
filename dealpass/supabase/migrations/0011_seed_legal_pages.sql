-- =============================================================================
-- 0011 — Seed editorial & legal pages (fr / en / ar)
--
-- These live in the database, not in code, because the specification requires
-- administrators to manage editorial pages from the dashboard. Edit them there
-- and the change is live immediately.
-- =============================================================================

CREATE OR REPLACE FUNCTION seed_page(
  p_slug text,
  p_type text,
  p_show_in_footer boolean,
  p_fr_title text, p_fr_body text,
  p_en_title text, p_en_body text,
  p_ar_title text, p_ar_body text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_page_id uuid;
BEGIN
  INSERT INTO pages (slug, page_type, status, show_in_footer)
  VALUES (p_slug, p_type, 'published', p_show_in_footer)
  ON CONFLICT (slug) DO UPDATE SET status = 'published', show_in_footer = EXCLUDED.show_in_footer
  RETURNING id INTO v_page_id;

  IF v_page_id IS NULL THEN
    SELECT id INTO v_page_id FROM pages WHERE slug = p_slug;
  END IF;

  INSERT INTO page_translations (page_id, language_code, title, body, seo_title, seo_description)
  VALUES
    (v_page_id, 'fr', p_fr_title, p_fr_body, p_fr_title, left(p_fr_body, 155)),
    (v_page_id, 'en', p_en_title, p_en_body, p_en_title, left(p_en_body, 155)),
    (v_page_id, 'ar', p_ar_title, p_ar_body, p_ar_title, left(p_ar_body, 155))
  ON CONFLICT (page_id, language_code) DO UPDATE
    SET title = EXCLUDED.title, body = EXCLUDED.body,
        seo_title = EXCLUDED.seo_title, seo_description = EXCLUDED.seo_description;
END;
$$;

-- -----------------------------------------------------------------------------
-- Privacy policy
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'privacy', 'legal', true,

  'Politique de confidentialité',
  E'**Données que nous collectons**\n\nNous collectons le strict nécessaire : votre adresse e-mail si vous vous inscrivez à l’infolettre ou créez un compte, vos préférences de langue, de pays et de devise, et des statistiques d’usage agrégées.\n\n**Données que nous ne collectons pas**\n\nNous n’enregistrons jamais votre adresse IP complète. Lorsqu’un identifiant est nécessaire à la détection de la fraude, nous stockons uniquement une empreinte salée qui change chaque jour et ne permet pas de remonter jusqu’à vous.\n\n**Liens d’affiliation**\n\nCertains liens sont des liens d’affiliation. Nous pouvons percevoir une commission lorsque vous effectuez un achat, sans aucun coût supplémentaire pour vous. Cela ne modifie ni le prix que vous payez, ni notre sélection des offres.\n\n**Vos droits**\n\nVous pouvez à tout moment demander l’accès à vos données, leur export ou leur suppression depuis la page dédiée. Vous pouvez également vous désinscrire de l’infolettre en un clic depuis n’importe quel e-mail reçu.',

  'Privacy policy',
  E'**What we collect**\n\nWe collect only what is necessary: your email address if you subscribe to the newsletter or create an account, your language, country and currency preferences, and aggregated usage statistics.\n\n**What we do not collect**\n\nWe never store your full IP address. When an identifier is needed for fraud prevention, we store only a salted digest that rotates daily and cannot be traced back to you.\n\n**Affiliate links**\n\nSome links are affiliate links. We may earn a commission when you make a purchase, at no extra cost to you. This never changes the price you pay, nor how we select offers.\n\n**Your rights**\n\nYou can request access to your data, export it, or delete it at any time from the dedicated page. You can also unsubscribe from the newsletter in one click from any email we send.',

  'سياسة الخصوصية',
  E'**ما نجمعه**\n\nنجمع الحد الأدنى الضروري فقط: بريدك الإلكتروني إذا اشتركت في النشرة أو أنشأت حساباً، وتفضيلات اللغة والبلد والعملة، وإحصاءات استخدام مجمّعة.\n\n**ما لا نجمعه**\n\nلا نخزن عنوان IP الكامل أبداً. وعند الحاجة إلى معرّف لمنع الاحتيال، نخزن بصمة مشفّرة تتغير يومياً ولا يمكن تتبعها إليك.\n\n**روابط العمولة**\n\nبعض الروابط روابط عمولة. قد نحصل على عمولة عند إتمامك عملية شراء، دون أي تكلفة إضافية عليك. لا يؤثر ذلك على السعر الذي تدفعه ولا على طريقة اختيارنا للعروض.\n\n**حقوقك**\n\nيمكنك في أي وقت طلب الوصول إلى بياناتك أو تصديرها أو حذفها من الصفحة المخصصة. كما يمكنك إلغاء الاشتراك في النشرة بنقرة واحدة من أي رسالة تصلك.'
);

-- -----------------------------------------------------------------------------
-- Cookie policy
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'cookies', 'legal', true,

  'Politique de cookies',
  E'Nous utilisons très peu de cookies.\n\n**Cookies indispensables**\n\nUn cookie de session vous permet de rester connecté. Il est strictement nécessaire, n’est jamais partagé et expire automatiquement.\n\n**Cookies de préférences**\n\nTrois cookies mémorisent votre langue, votre pays et votre devise afin que le site s’affiche correctement lors de votre prochaine visite. Ils ne servent à aucune publicité.\n\n**Ce que nous n’utilisons pas**\n\nAucun cookie publicitaire, aucun cookie tiers de réseaux sociaux, aucun pixel de reciblage.\n\nVous pouvez supprimer ces cookies à tout moment depuis les paramètres de votre navigateur : le site continuera de fonctionner, vous devrez simplement resélectionner vos préférences.',

  'Cookie policy',
  E'We use very few cookies.\n\n**Essential cookies**\n\nA session cookie keeps you signed in. It is strictly necessary, never shared, and expires automatically.\n\n**Preference cookies**\n\nThree cookies remember your language, country and currency so the site displays correctly on your next visit. They serve no advertising purpose.\n\n**What we do not use**\n\nNo advertising cookies, no third-party social media cookies, no retargeting pixels.\n\nYou can delete these cookies at any time from your browser settings: the site will keep working, you will simply need to reselect your preferences.',

  'سياسة الكوكيز',
  E'نستخدم عدداً قليلاً جداً من الكوكيز.\n\n**كوكيز أساسية**\n\nكوكي الجلسة يبقيك مسجلاً الدخول. هي ضرورية تماماً، ولا تُشارك أبداً، وتنتهي تلقائياً.\n\n**كوكيز التفضيلات**\n\nثلاث كوكيز تحفظ لغتك وبلدك وعملتك ليظهر الموقع بشكل صحيح في زيارتك القادمة. لا تُستخدم لأي غرض إعلاني.\n\n**ما لا نستخدمه**\n\nلا كوكيز إعلانية، ولا كوكيز لشبكات التواصل، ولا وحدات تتبّع لإعادة الاستهداف.\n\nيمكنك حذف هذه الكوكيز في أي وقت من إعدادات المتصفح: سيستمر الموقع بالعمل، وكل ما عليك هو إعادة اختيار تفضيلاتك.'
);

-- -----------------------------------------------------------------------------
-- Terms of use
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'terms', 'legal', true,

  'Conditions d’utilisation',
  E'**Nature du service**\n\nDealPass est un service de agrégation d’offres promotionnelles. Nous relayons des offres provenant de programmes d’affiliation officiels et de flux autorisés. Nous ne vendons rien nous-mêmes : l’achat, la réservation ou l’inscription sont conclus directement avec le marchand.\n\n**Exactitude des offres**\n\nLes offres sont vérifiées régulièrement, mais un code peut expirer, un prix changer ou un stock s’épuiser entre deux vérifications. Vérifiez toujours le montant final sur le site du marchand avant de payer. En cas d’écart, signalez l’offre : nous la corrigeons ou la retirons.\n\n**Rémunération**\n\nNous pouvons percevoir une commission sur les ventes réalisées via nos liens. Cela ne majore jamais le prix que vous payez.\n\n**Responsabilité**\n\nNous ne sommes pas partie au contrat qui vous lie au marchand. Les litiges relatifs à une commande, un remboursement ou une livraison relèvent du marchand concerné.\n\n**Modifications**\n\nCes conditions peuvent évoluer. La version en vigueur est celle publiée sur cette page.',

  'Terms of use',
  E'**Nature of the service**\n\nDealPass is a promotional-offer aggregation service. We relay offers that come from official affiliate programmes and authorised feeds. We do not sell anything ourselves: the purchase, booking or registration is concluded directly with the merchant.\n\n**Accuracy of offers**\n\nOffers are checked regularly, but a code can expire, a price can change or stock can run out between two checks. Always verify the final amount on the merchant’s site before paying. If something is wrong, report the offer and we will correct or remove it.\n\n**Remuneration**\n\nWe may earn a commission on sales made through our links. This never increases the price you pay.\n\n**Liability**\n\nWe are not a party to the contract between you and the merchant. Disputes about an order, a refund or a delivery are matters for the merchant.\n\n**Changes**\n\nThese terms may change. The version in force is the one published on this page.',

  'شروط الاستخدام',
  E'**طبيعة الخدمة**\n\nديل باس خدمة لتجميع العروض الترويجية. ننقل عروضاً من برامج عمولة رسمية وخلاصات مصرّح بها. نحن لا نبيع شيئاً بأنفسنا: الشراء أو الحجز أو التسجيل يتم مباشرة مع المتجر.\n\n**دقة العروض**\n\nنراجع العروض بانتظام، لكن قد ينتهي كود أو يتغير سعر أو ينفد المخزون بين مراجعتين. تحقق دائماً من المبلغ النهائي في موقع المتجر قبل الدفع. وإذا وجدت فرقاً، أبلغ عن العرض وسنصححه أو نزيله.\n\n**المقابل المالي**\n\nقد نحصل على عمولة على المبيعات التي تتم عبر روابطنا. لا يزيد ذلك أبداً من السعر الذي تدفعه.\n\n**المسؤولية**\n\nلسنا طرفاً في العقد بينك وبين المتجر. النزاعات المتعلقة بطلب أو استرداد أو توصيل تعود إلى المتجر المعني.\n\n**التعديلات**\n\nقد تتغير هذه الشروط. النسخة السارية هي المنشورة على هذه الصفحة.'
);

-- -----------------------------------------------------------------------------
-- Affiliate disclosure
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'affiliate-disclosure', 'legal', true,

  'Divulgation d’affiliation',
  E'DealPass participe à des programmes d’affiliation.\n\nConcrètement : lorsque vous cliquez sur une offre puis effectuez un achat, une réservation ou une inscription chez le marchand, celui-ci peut nous verser une commission.\n\n**Ce que cela change pour vous : rien.**\n\nLe prix que vous payez est identique, que vous passiez par notre lien ou que vous alliez directement sur le site du marchand. Notre rémunération est prélevée sur la marge du marchand, jamais ajoutée à votre facture.\n\n**Ce que cela ne change pas non plus**\n\nNotre sélection des offres n’est pas dictée par le montant des commissions. Une offre est publiée parce qu’elle est valide et utile, pas parce qu’elle rapporte davantage.\n\nNous n’affichons que des offres issues de sources autorisées : programmes d’affiliation officiels, flux approuvés et exportations CSV fournies par les marchands. Nous ne récupérons jamais de codes sur des sites concurrents.',

  'Affiliate disclosure',
  E'DealPass participates in affiliate programmes.\n\nIn practice: when you click an offer and then make a purchase, booking or registration with the merchant, that merchant may pay us a commission.\n\n**What this changes for you: nothing.**\n\nThe price you pay is identical whether you use our link or go straight to the merchant’s site. Our commission comes out of the merchant’s margin and is never added to your bill.\n\n**What it does not change either**\n\nOur selection of offers is not driven by commission size. An offer is published because it is valid and useful, not because it pays more.\n\nWe only display offers from authorised sources: official affiliate programmes, approved feeds and CSV exports supplied by merchants. We never take codes from competitor websites.',

  'إفصاح العمولة',
  E'تشارك ديل باس في برامج التسويق بالعمولة.\n\nعملياً: عندما تنقر على عرض ثم تشتري أو تحجز أو تسجل لدى المتجر، قد يدفع لنا المتجر عمولة.\n\n**ما الذي يتغير عليك: لا شيء.**\n\nالسعر الذي تدفعه متطابق، سواء استخدمت رابطنا أو ذهبت مباشرة إلى موقع المتجر. تُخصم عمولتنا من هامش المتجر، ولا تُضاف إلى فاتورتك أبداً.\n\n**ما لا يتغير أيضاً**\n\nاختيارنا للعروض لا تحكمه قيمة العمولة. يُنشر العرض لأنه صالح ومفيد، لا لأنه يدرّ أكثر.\n\nنعرض فقط عروضاً من مصادر مصرّح بها: برامج عمولة رسمية، وخلاصات معتمدة، وملفات CSV يوفرها المتجر. ولا نأخذ الأكواد أبداً من مواقع منافسة.'
);

-- -----------------------------------------------------------------------------
-- About
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'about', 'editorial', true,

  'À propos de DealPass',
  E'DealPass rassemble au même endroit les codes promo, les réductions voyage et les offres de services numériques.\n\n**Notre approche**\n\nPlutôt que de multiplier les onglets, nous centralisons des offres issues de sources autorisées, nous les vérifions, puis nous vous indiquons clairement dans quels pays elles sont valides et quand elles ont été contrôlées pour la dernière fois.\n\n**Comment nous travaillons**\n\nChaque offre reçoit un score de confiance calculé à partir de la complétude de ses informations, de la cohérence de ses dates et de la fiabilité de sa source. Les offres qui franchissent le seuil le plus élevé sont publiées automatiquement. Celles qui restent incertaines passent en revue humaine avant d’apparaître.\n\n**Ce que nous ne faisons pas**\n\nNous ne récupérons pas de codes sur des sites concurrents, nous n’inventons aucune réduction, et nous ne présentons jamais une offre expirée comme valable.\n\n**Transparence**\n\nNous sommes rémunérés par des commissions d’affiliation, sans que cela modifie le prix que vous payez. Les détails sont sur notre page de divulgation.',

  'About DealPass',
  E'DealPass brings promo codes, travel discounts and digital-service offers together in one place.\n\n**Our approach**\n\nRather than juggling a dozen tabs, we centralise offers from authorised sources, verify them, and show you clearly which countries they are valid in and when they were last checked.\n\n**How we work**\n\nEvery offer receives a confidence score based on how complete its information is, whether its dates are coherent and how reliable its source is. Offers above the highest threshold publish automatically. Uncertain ones go to human review before appearing.\n\n**What we do not do**\n\nWe do not take codes from competitor websites, we never invent a discount, and we never present an expired offer as valid.\n\n**Transparency**\n\nWe are paid through affiliate commissions, which never change the price you pay. The details are on our disclosure page.',

  'من نحن — ديل باس',
  E'تجمع ديل باس في مكان واحد أكواد الخصم وعروض السفر وعروض الخدمات الرقمية.\n\n**نهجنا**\n\nبدل تنقّل بين عشرات التبويبات، نجمع العروض من مصادر مصرّح بها، ونؤكدها، ثم نوضح لك بوضوح في أي الدول تكون صالحة ومتى تم التحقق منها آخر مرة.\n\n**كيف نعمل**\n\nيحصل كل عرض على درجة ثقة تُحسب من مدى اكتمال معلوماته واتساق تواريخه وموثوقية مصدره. العروض التي تتجاوز الحد الأعلى تُنشر تلقائياً. أما غير المؤكدة فتمرّ بمراجعة بشرية قبل الظهور.\n\n**ما لا نفعله**\n\nلا نأخذ الأكواد من مواقع منافسة، ولا نختلق أي خصم، ولا نعرض عرضاً منتهياً وكأنه ساري.\n\n**الشفافية**\n\nنتقاضى عمولات من برامج التسويق بالعمولة، دون أن يغير ذلك السعر الذي تدفعه. التفاصيل في صفحة الإفصاح.'
);

-- -----------------------------------------------------------------------------
-- FAQ
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'faq', 'faq', true,

  'Questions fréquentes',
  E'**Les codes affichés sont-ils valables ?**\n\nNous vérifions régulièrement chaque offre et affichons la date de la dernière vérification. Un code peut toutefois expirer entre deux contrôles : si c’est le cas, signalez l’offre et nous la corrigeons rapidement.\n\n**Pourquoi une offre n’est-elle pas disponible dans mon pays ?**\n\nLa plupart des promotions sont limitées à certains marchés. Nous affichons la liste des pays concernés sur chaque offre et masquons celles qui ne vous concernent pas.\n\n**Est-ce que je paie plus cher en passant par DealPass ?**\n\nNon, jamais. Notre commission est versée par le marchand et ne majore pas le prix que vous payez.\n\n**Comment utiliser un code promo ?**\n\nCopiez le code, rendez-vous sur le site du marchand, puis collez-le dans le champ prévu au moment du paiement. La remise s’applique si votre commande respecte les conditions affichées.\n\n**Dois-je créer un compte ?**\n\nNon. La recherche et l’utilisation des offres sont ouvertes à tous. Un compte sert uniquement à enregistrer vos favoris et à recevoir des alertes.',

  'Frequently asked questions',
  E'**Are the codes shown valid?**\n\nWe check every offer regularly and display the date it was last verified. A code can still expire between two checks: if that happens, report the offer and we will correct it quickly.\n\n**Why is an offer not available in my country?**\n\nMost promotions are limited to specific markets. We list the eligible countries on every offer and hide the ones that do not apply to you.\n\n**Do I pay more by going through DealPass?**\n\nNo, never. Our commission is paid by the merchant and never increases the price you pay.\n\n**How do I use a promo code?**\n\nCopy the code, go to the merchant’s site, then paste it into the promo-code field at checkout. The discount applies if your order meets the stated conditions.\n\n**Do I need an account?**\n\nNo. Searching and using offers is open to everyone. An account is only for saving favourites and receiving alerts.',

  'الأسئلة الشائعة',
  E'**هل الأكواد المعروضة صالحة؟**\n\nنراجع كل عرض بانتظام ونعرض تاريخ آخر تأكيد. ومع ذلك قد ينتهي كود بين مراجعتين: إن حدث ذلك، أبلغ عن العرض وسنصححه سريعاً.\n\n**لماذا عرض غير متاح في بلدي؟**\n\nمعظم العروض الترويجية محدودة بأسواق معينة. نعرض قائمة الدول المؤهلة على كل عرض ونخفي ما لا ينطبق عليك.\n\n**هل أدفع أكثر عند المرور عبر ديل باس؟**\n\nلا، أبداً. تُدفع عمولتنا من المتجر ولا تزيد السعر الذي تدفعه.\n\n**كيف أستخدم كود الخصم؟**\n\nانسخ الكود، واذهب إلى موقع المتجر، ثم الصقه في حقل كود الخصم عند إتمام الطلب. يُطبق الخصم إذا استوفى طلبك الشروط المذكورة.\n\n**هل أحتاج إلى حساب؟**\n\nلا. البحث واستخدام العروض متاح للجميع. الحساب مخصص فقط لحفظ المفضلة واستلام التنبيهات.'
);

-- -----------------------------------------------------------------------------
-- How it works
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'how-it-works', 'editorial', true,

  'Comment ça marche',
  E'**1. Nous rassemblons**\n\nLes offres proviennent de programmes d’affiliation officiels, de flux approuvés et d’exportations fournies par les marchands eux-mêmes. Nous ne récupérons jamais de codes sur des sites concurrents.\n\n**2. Nous vérifions**\n\nChaque offre reçoit un score de confiance calculé sur la complétude de ses informations, la cohérence de ses dates et la fiabilité de sa source. Au-dessus du seuil le plus élevé, la publication est automatique. En dessous, l’offre part en revue humaine.\n\n**3. Nous expirons ce qui doit l’être**\n\nChaque nuit, les offres dont la date est dépassée sont retirées des listes actives.\n\n**4. Vous économisez**\n\nCopiez le code ou suivez le lien : la remise s’applique chez le marchand, sans coût supplémentaire.',

  'How it works',
  E'**1. We gather**\n\nOffers come from official affiliate programmes, approved feeds and exports supplied by the merchants themselves. We never take codes from competitor websites.\n\n**2. We verify**\n\nEvery offer receives a confidence score based on how complete its information is, whether its dates are coherent and how reliable its source is. Above the highest threshold, publishing is automatic. Below it, the offer goes to human review.\n\n**3. We expire what must expire**\n\nEvery night, offers past their end date are removed from the active listings.\n\n**4. You save**\n\nCopy the code or follow the link: the discount applies at the merchant, at no extra cost.',

  'كيف تعمل المنصة',
  E'**١. نجمع**\n\nتأتي العروض من برامج عمولة رسمية وخلاصات معتمدة وملفات يوفرها المتجر نفسه. لا نأخذ الأكواد أبداً من مواقع منافسة.\n\n**٢. نتحقق**\n\nيحصل كل عرض على درجة ثقة تُحسب من اكتمال معلوماته واتساق تواريخه وموثوقية مصدره. فوق الحد الأعلى، يُنشر تلقائياً. ودونه، يُحوَّل إلى مراجعة بشرية.\n\n**٣. ننهي ما يجب إنهاؤه**\n\nكل ليلة تُزال العروض التي تجاوزت تاريخ انتهائها من القوائم النشطة.\n\n**٤. أنت توفّر**\n\nانسخ الكود أو اتبع الرابط: يُطبق الخصم لدى المتجر دون أي تكلفة إضافية.'
);

-- -----------------------------------------------------------------------------
-- Contact
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'contact', 'editorial', true,

  'Contact',
  E'**Une offre ne fonctionne pas ?**\n\nUtilisez le bouton « Signaler un problème » présent sur chaque offre : c’est le moyen le plus rapide de nous prévenir, et le signalement arrive directement dans notre file de modération.\n\n**Une question sur vos données ?**\n\nRendez-vous sur la page d’accès et de suppression de vos données. Nous traitons ces demandes sans délai inutile.\n\n**Vous représentez un programme d’affiliation ?**\n\nNous travaillons uniquement avec des programmes officiels et des flux autorisés. Si vous souhaitez que vos offres soient relayées, contactez-nous en précisant votre réseau et les pays concernés.\n\n*Cette instance est une démonstration technique : les marchands et les offres présentés sont fictifs.*',

  'Contact',
  E'**An offer is not working?**\n\nUse the "Report a problem" button on every offer: it is the fastest way to tell us, and the report goes straight into our moderation queue.\n\n**A question about your data?**\n\nVisit the data access and deletion page. We handle these requests without undue delay.\n\n**Do you represent an affiliate programme?**\n\nWe only work with official programmes and authorised feeds. If you would like your offers to be listed, contact us with your network and the countries concerned.\n\n*This instance is a technical demonstration: the merchants and offers shown are fictional.*',

  'اتصل بنا',
  E'**عرض لا يعمل؟**\n\nاستخدم زر «الإبلاغ عن مشكلة» الموجود على كل عرض: هي أسرع طريقة لإبلاغنا، ويصل البلاغ مباشرة إلى قائمة المراجعة لدينا.\n\n**سؤال حول بياناتك؟**\n\nانتقل إلى صفحة الوصول إلى البيانات وحذفها. نتعامل مع هذه الطلبات دون تأخير غير مبرر.\n\n**هل تمثل برنامج عمولة؟**\n\nنتعامل فقط مع البرامج الرسمية والخلاصات المصرّح بها. إذا رغبت في عرض عروضك، تواصل معنا مع تحديد شبكتك والدول المعنية.\n\n*هذه النسخة عرض تقني: المتاجر والعروض المعروضة خيالية.*'
);

-- -----------------------------------------------------------------------------
-- Data request
-- -----------------------------------------------------------------------------
SELECT seed_page(
  'data-request', 'legal', true,

  'Accès et suppression de vos données',
  E'Vous pouvez exercer vos droits à tout moment.\n\n**Depuis votre compte**\n\nConnectez-vous puis ouvrez la page « Mon compte ». Les boutons d’export et de suppression s’y trouvent : l’export rassemble l’ensemble des données associées à votre compte, et la suppression est définitive.\n\n**Sans compte**\n\nSi vous n’avez jamais créé de compte mais que vous êtes inscrit à l’infolettre, utilisez le lien de désinscription présent dans nos e-mails : il supprime votre adresse de nos listes immédiatement.\n\n**Délais**\n\nLes demandes sont traitées sans délai inutile. La suppression d’un compte est irréversible.',

  'Access and deletion of your data',
  E'You can exercise your rights at any time.\n\n**From your account**\n\nSign in and open the "My account" page. The export and deletion buttons are there: export gathers everything associated with your account, and deletion is permanent.\n\n**Without an account**\n\nIf you never created an account but subscribed to the newsletter, use the unsubscribe link in our emails: it removes your address from our lists immediately.\n\n**Timeframes**\n\nRequests are handled without undue delay. Deleting an account is irreversible.',

  'الوصول إلى بياناتك وحذفها',
  E'يمكنك ممارسة حقوقك في أي وقت.\n\n**من حسابك**\n\nسجّل الدخول ثم افتح صفحة «حسابي». ستجد أزرار التصدير والحذف: يجمع التصدير كل البيانات المرتبطة بحسابك، والحذف نهائي.\n\n**بدون حساب**\n\nإذا لم تكن قد أنشأت حساباً لكنك مشترك في النشرة، استخدم رابط إلغاء الاشتراك الموجود في رسائلنا: يزيل عنوانك من قوائمنا فوراً.\n\n**المدد الزمنية**\n\nنعالج الطلبات دون تأخير غير مبرر. حذف الحساب غير قابل للتراجع.'
);

DROP FUNCTION seed_page(text, text, boolean, text, text, text, text, text, text);
