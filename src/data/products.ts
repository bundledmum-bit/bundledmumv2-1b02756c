export interface Brand {
  id: string;
  label: string;
  price: number;
  img: string;
  tier: number;
  color: string;
}

export interface Product {
  id: number;
  name: string;
  baseImg: string;
  rating: number;
  reviews: number;
  tags: string[];
  badge: string | null;
  brands: Brand[];
  category: "baby" | "mum";
  stage: string[];
  priority: "essential" | "recommended" | "nice-to-have";
  tier: string[];
  hospitalType: string[];
  deliveryMethod: string[];
  genderRelevant: boolean;
  genderColors?: { boy: string; girl: string; neutral: string };
  multiplesBump: number;
  scope: string[];
  firstBaby: boolean | null;
  description: string;
  whyIncluded: string | Record<string, string>;
  sizes?: string[];
  contents?: string[];
  material?: string;
  allergenInfo?: string;
  packInfo?: string;
  stock?: number; // undefined = in stock, 0 = out of stock, 1-5 = low stock
}

export const PRODUCTS: { baby: Product[]; mum: Product[] } = {
  baby: [
    {
      id: 1, name: "Newborn Nappy Pack (50pcs)", baseImg: "🧷", rating: 4.9, reviews: 312,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:neutral","category:baby","type:toiletries","gift:yes"],
      badge: "Bestseller",
      brands: [
        { id: "molfix", label: "Molfix", price: 3200, img: "🧷", tier: 0, color: "#E3F2FD" },
        { id: "huggies", label: "Huggies Pure", price: 4800, img: "🧷", tier: 1, color: "#E8F5E9" },
        { id: "pampers", label: "Pampers Premium", price: 6500, img: "🧷", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m"], priority: "essential",
      tier: ["starter","standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 2.0,
      scope: ["hospital-bag","general-baby-prep"], firstBaby: null,
      description: "Ultra-soft nappies for your newborn's delicate skin. 50pcs · Size 1 (up to 5kg).",
      whyIncluded: "Baby will go through 8-12 nappies a day in the first weeks — this keeps you covered.",
      packInfo: "50 nappies · Size 1 (up to 5kg)",
    },
    {
      id: 2, name: "Baby Wipes (60pcs)", baseImg: "🫧", rating: 4.8, reviews: 278,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:neutral","category:baby","type:toiletries","gift:yes"],
      badge: "Essential",
      brands: [
        { id: "local_w", label: "Local Wipes", price: 800, img: "🫧", tier: 0, color: "#FFF8E1" },
        { id: "waterwipes", label: "WaterWipes", price: 2200, img: "🫧", tier: 1, color: "#E8F5E9" },
        { id: "waterwipes_p", label: "WaterWipes Pure", price: 3500, img: "🫧", tier: 2, color: "#E3F2FD" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m","3-6m"], priority: "essential",
      tier: ["starter","standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 2.0,
      scope: ["hospital-bag","general-baby-prep"], firstBaby: null,
      description: "Gentle, alcohol-free wipes safe for newborn skin. 60 wipes per pack.",
      whyIncluded: "You'll use these for everything — nappy changes, spit-ups, sticky fingers. We packed extra.",
      packInfo: "60 wipes per pack",
    },
    {
      id: 3, name: "Baby Skincare Set", baseImg: "🧴", rating: 4.7, reviews: 189,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:baby","type:skincare","gift:yes"],
      badge: null,
      brands: [
        { id: "purity", label: "Purity", price: 2500, img: "🧴", tier: 0, color: "#FFF8E1" },
        { id: "johnsons", label: "Johnson's", price: 4200, img: "🧴", tier: 1, color: "#E8F5E9" },
        { id: "mustela", label: "Mustela Set", price: 12500, img: "🧴", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.5,
      scope: ["hospital-bag","general-baby-prep"], firstBaby: true,
      description: "Complete baby care set: lotion, wash, and oil in one pack.",
      whyIncluded: "Newborn skin is 5× thinner than yours — these gentle products protect without irritating.",
      contents: ["Baby lotion (200ml)", "Baby wash (200ml)", "Baby oil (100ml)"],
      allergenInfo: "Dermatologist tested · Hypoallergenic",
    },
    {
      id: 4, name: "Muslin Swaddle", baseImg: "🌿", rating: 4.9, reviews: 165,
      tags: ["bundle:standard","bundle:premium","gender:neutral","gender:boy","gender:girl","category:baby","type:comfort","gift:yes"],
      badge: null,
      brands: [
        { id: "local_s", label: "Local Premium", price: 4500, img: "🌿", tier: 0, color: "#FFF8E1" },
        { id: "adenanais", label: "Aden+Anais", price: 7200, img: "🌿", tier: 1, color: "#E8F5E9" },
        { id: "adenanais_d", label: "Aden+Anais Dream", price: 14000, img: "🌿", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: true,
      genderColors: { boy: "blue/white", girl: "pink/white", neutral: "cream/sage" },
      multiplesBump: 2.0, scope: ["hospital-bag","general-baby-prep"], firstBaby: null,
      description: "Breathable 100% cotton muslin wrap for safe, comfortable sleep.",
      whyIncluded: "Swaddling helps your newborn feel safe outside the womb — this breathable muslin is perfect for Nigerian weather.",
      material: "100% Cotton Muslin",
    },
    {
      id: 5, name: "Newborn Onesie Set (3pcs)", baseImg: "👶", rating: 4.8, reviews: 234,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:boy","gender:girl","gender:neutral","category:baby","type:clothing","gift:yes"],
      badge: "Bestseller",
      brands: [
        { id: "local_o", label: "Local Brands", price: 3200, img: "👶", tier: 0, color: "#E3F2FD" },
        { id: "hm", label: "H&M Essentials", price: 6800, img: "👶", tier: 1, color: "#E8F5E9" },
        { id: "carters", label: "Carter's", price: 12000, img: "👶", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m"], priority: "essential",
      tier: ["starter","standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: true,
      genderColors: { boy: "blue/grey", girl: "pink/white", neutral: "cream/yellow" },
      multiplesBump: 2.0, scope: ["hospital-bag","general-baby-prep"], firstBaby: null,
      description: "Soft cotton bodysuits with snap closures. Size: 0-3 Months.",
      whyIncluded: "Your baby's first wardrobe — soft cotton onesies with easy snap closures for quick nappy changes.",
      material: "100% Cotton", packInfo: "Size: 0-3 Months",
    },
    {
      id: 6, name: "Going-Home Outfit", baseImg: "🎀", rating: 4.6, reviews: 143,
      tags: ["bundle:standard","bundle:premium","gender:boy","gender:girl","category:baby","type:clothing","gift:yes"],
      badge: null,
      brands: [
        { id: "hm_o", label: "H&M Occasion", price: 4500, img: "🎀", tier: 1, color: "#E8F5E9" },
        { id: "carters_s", label: "Carter's Special", price: 8500, img: "🎀", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: true,
      genderColors: { boy: "blue/white", girl: "pink/white", neutral: "cream/yellow" },
      multiplesBump: 2.0, scope: ["hospital-bag"], firstBaby: null,
      description: "Your baby's first special outfit for the journey home. Size: Newborn (0-3M).",
      whyIncluded: "The outfit your baby wears home for the first time — a moment you'll photograph forever.",
      material: "Cotton", packInfo: "Size: Newborn (0-3M)",
    },
    {
      id: 7, name: "Cap + Mittens + Booties", baseImg: "🧤", rating: 4.7, reviews: 198,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:neutral","category:baby","type:clothing"],
      badge: null,
      brands: [
        { id: "local_k", label: "Local Knitwear", price: 1800, img: "🧤", tier: 0, color: "#FFF8E1" },
        { id: "carters_p", label: "Carter's Premium", price: 4200, img: "🧤", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m"], priority: "recommended",
      tier: ["starter","standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: true,
      genderColors: { boy: "blue", girl: "pink", neutral: "white/cream" },
      multiplesBump: 2.0, scope: ["hospital-bag","general-baby-prep"], firstBaby: null,
      description: "Matching knit accessories to keep baby warm on day one. Size: Newborn (one size).",
      whyIncluded: "Newborns lose heat fast through their head and feet — these keep your little one warm and protected.",
      material: "Cotton Knit", packInfo: "Size: Newborn (one size)",
    },
    {
      id: 8, name: "Baby Thermometer", baseImg: "🌡️", rating: 4.5, reviews: 89,
      tags: ["bundle:premium","gender:neutral","category:baby","type:gear"],
      badge: null,
      brands: [
        { id: "basic_t", label: "Basic Digital", price: 3500, img: "🌡️", tier: 1, color: "#E8F5E9" },
        { id: "braun", label: "Braun No-Touch", price: 18000, img: "🌡️", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m","3-6m"], priority: "nice-to-have",
      tier: ["premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["general-baby-prep"], firstBaby: true,
      description: "Accurate temperature reading in seconds. Essential for monitoring baby's health.",
      whyIncluded: "A reliable thermometer gives you peace of mind when baby feels warm — no guessing needed.",
    },
    {
      id: 9, name: "Nasal Aspirator", baseImg: "👃", rating: 4.4, reviews: 76,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:baby","type:gear"],
      badge: null,
      brands: [
        { id: "bulb", label: "Bulb Syringe", price: 1200, img: "👃", tier: 0, color: "#FFF8E1" },
        { id: "frida_n", label: "Frida NoseFrida", price: 8500, img: "👃", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m","3-6m"], priority: "nice-to-have",
      tier: ["premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["general-baby-prep"], firstBaby: true,
      description: "Gently clears your baby's blocked nose — essential for cold season. BPA-free.",
      whyIncluded: "When baby's nose gets blocked (and it will!), this gentle aspirator clears it in seconds. First-time mum essential.",
    },
    {
      id: 10, name: "Baby Nail Kit", baseImg: "✂️", rating: 4.3, reviews: 65,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:baby","type:gear"],
      badge: null,
      brands: [
        { id: "basic_n", label: "Basic Set", price: 1500, img: "✂️", tier: 0, color: "#FFF8E1" },
        { id: "safety1st", label: "Safety 1st", price: 4500, img: "✂️", tier: 2, color: "#FCE4EC" },
      ],
      category: "baby", stage: ["expecting","newborn","0-3m","3-6m"], priority: "nice-to-have",
      tier: ["premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["general-baby-prep"], firstBaby: true,
      description: "Safe baby-sized grooming tools: clipper, scissors, and file.",
      whyIncluded: "Baby nails grow surprisingly fast and can scratch their face — these tiny tools make trimming safe and easy.",
      contents: ["Nail clipper", "Safety scissors", "Nail file (3-piece set)"],
    },
  ],
  mum: [
    {
      id: 11, name: "Maternity Pads", baseImg: "💛", rating: 4.8, reviews: 287,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:neutral","category:mum","type:comfort","gift:yes"],
      badge: "Essential",
      brands: [
        { id: "always_b", label: "Always Maxi Basic", price: 2200, img: "💛", tier: 0, color: "#FFF8E1" },
        { id: "always_o", label: "Always Overnight ×3", price: 3800, img: "💛", tier: 1, color: "#E8F5E9" },
        { id: "always_i", label: "Always Infinity ×3", price: 5500, img: "💛", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting","newborn"], priority: "essential",
      tier: ["starter","standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag"], firstBaby: null,
      description: "Extra-absorbent pads for heavy post-birth flow. Hospital-grade.",
      whyIncluded: "Post-birth bleeding is heavy and lasts weeks — hospital-grade pads are a must. Regular pads won't cut it.",
      packInfo: "Always Overnight: 10 pads × 3 packs (30 total) — Heavy flow",
    },
    {
      id: 12, name: "Nursing Pads", baseImg: "🤱", rating: 4.6, reviews: 156,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:mum","type:feeding","gift:yes"],
      badge: null,
      brands: [
        { id: "lansinoh_np", label: "Lansinoh ×10", price: 3500, img: "🤱", tier: 1, color: "#E8F5E9" },
        { id: "medela_np", label: "Medela ×30", price: 6800, img: "🤱", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting","newborn","0-3m"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag","general-baby-prep"], firstBaby: true,
      description: "Disposable breast pads to keep you dry and comfortable.",
      whyIncluded: "Your milk can leak at any time (especially in the early days) — these keep you dry and confident.",
      packInfo: "Lansinoh: 10 pads / Medela: 30 pads",
    },
    {
      id: 13, name: "Nipple Cream", baseImg: "💊", rating: 4.9, reviews: 203,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:mum","type:skincare","gift:yes"],
      badge: null,
      brands: [
        { id: "lansinoh_10", label: "Lansinoh 10ml", price: 4200, img: "💊", tier: 1, color: "#E8F5E9" },
        { id: "lansinoh_40", label: "Lansinoh 40ml", price: 8500, img: "💊", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting","newborn","0-3m"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag","general-baby-prep"], firstBaby: true,
      description: "Lanolin-based cream that soothes cracked nipples. Safe for breastfeeding.",
      whyIncluded: "Breastfeeding can be rough on your nipples, especially in the first week. This cream heals and soothes — and it's safe for baby.",
      packInfo: "Lansinoh 10ml (travel) / Lansinoh 40ml (full size)",
    },
    {
      id: 14, name: "Postpartum Belly Band", baseImg: "🩺", rating: 4.5, reviews: 112,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:mum","type:comfort"],
      badge: null,
      brands: [
        { id: "carriwell", label: "Carriwell Seamless", price: 8500, img: "🩺", tier: 1, color: "#E8F5E9" },
        { id: "bellybandit", label: "Belly Bandit", price: 22000, img: "🩺", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting","newborn"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag"], firstBaby: null,
      description: "Compression support band for post-delivery recovery and comfort.",
      whyIncluded: {
        csection: "After your C-section, this band supports your incision area and helps you move more comfortably.",
        vaginal: "This compression band supports your core as your body recovers and helps your belly feel held.",
      },
      sizes: ["S (UK 8-10)", "M (UK 12-14)", "L (UK 16-18)", "XL (UK 20-22)"],
    },
    {
      id: 15, name: "Hospital Slippers", baseImg: "🩴", rating: 4.5, reviews: 134,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:neutral","category:mum","type:comfort"],
      badge: null,
      brands: [
        { id: "eva", label: "Foam EVA Non-Slip", price: 2500, img: "🩴", tier: 0, color: "#FFF8E1" },
        { id: "birkenstock", label: "Birkenstock EVA", price: 18000, img: "🩴", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag"], firstBaby: null,
      description: "Non-slip, easy-clean slippers for the hospital ward.",
      whyIncluded: "Hospital floors are cold and slippery — these non-slip slippers keep you safe on your feet.",
      sizes: ["S (UK 3-4)", "M (UK 5-6)", "L (UK 7-8)"],
    },
    {
      id: 16, name: "Labour Snack Pack", baseImg: "🍫", rating: 4.9, reviews: 245,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:neutral","category:mum","type:comfort","gift:yes"],
      badge: "Bestseller",
      brands: [
        { id: "bm_snack", label: "BundledMum Curated", price: 4500, img: "🍫", tier: 1, color: "#E8F5E9" },
        { id: "bm_snack_p", label: "BundledMum Premium", price: 12000, img: "🍫", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","both"],
      deliveryMethod: ["vaginal","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag"], firstBaby: null,
      description: "Energy-boosting snacks curated for the delivery room.",
      whyIncluded: {
        public: "Public hospital waits can be long and canteens unreliable — these energy-boosting snacks keep you fuelled through labour.",
        private: "Labour is hard work — these snacks keep your energy up when you need it most.",
      },
      contents: ["Energy bars ×3", "Coconut water ×2", "Dried fruit mix", "Honey sticks", "Mints"],
      allergenInfo: "May contain traces of nuts",
    },
    {
      id: 17, name: "Disposable Underwear", baseImg: "👙", rating: 4.7, reviews: 167,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:mum","type:comfort"],
      badge: null,
      brands: [
        { id: "always_d", label: "Always Discreet ×10", price: 4200, img: "👙", tier: 1, color: "#E8F5E9" },
        { id: "frida_u", label: "Frida Mom ×12", price: 9500, img: "👙", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting","newborn"], priority: "recommended",
      tier: ["standard","premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag"], firstBaby: null,
      description: "Comfortable mesh underwear for post-birth recovery days.",
      whyIncluded: "You won't want to ruin your regular underwear in the first days post-birth. These are comfortable, absorbent, and disposable.",
      sizes: ["S/M", "L/XL"],
    },
    {
      id: 18, name: "Nursing Nightgown", baseImg: "👘", rating: 4.7, reviews: 98,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:mum","type:clothing","gift:yes"],
      badge: null,
      brands: [
        { id: "seraphine", label: "Seraphine", price: 12500, img: "👘", tier: 1, color: "#E8F5E9" },
        { id: "cachecoeur", label: "Cache Coeur ×2", price: 28000, img: "👘", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting","newborn","0-3m"], priority: "nice-to-have",
      tier: ["premium"], hospitalType: ["private","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag","general-baby-prep"], firstBaby: null,
      description: "Easy-access nursing nightgown with button-front for breastfeeding.",
      whyIncluded: "Night feeds are easier when you don't have to wrestle with your clothes. This button-front gown makes breastfeeding at 3am simple.",
      sizes: ["S (8-10)", "M (12-14)", "L (16-18)", "XL (20-22)"],
      material: "Cotton/Modal Blend",
    },
    {
      id: 19, name: "Antenatal Records Folder", baseImg: "📋", rating: 4.3, reviews: 67,
      tags: ["bundle:starter","bundle:standard","bundle:premium","gender:neutral","category:mum","type:gear"],
      badge: null,
      brands: [
        { id: "bm_folder", label: "BundledMum Organiser", price: 2200, img: "📋", tier: 1, color: "#E8F5E9" },
        { id: "bm_folder_p", label: "BundledMum Premium", price: 4500, img: "📋", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting"], priority: "nice-to-have",
      tier: ["standard","premium"], hospitalType: ["public","both"],
      deliveryMethod: ["vaginal","csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag"], firstBaby: true,
      description: "A4 organiser with labelled sections for scan results, prescriptions, blood tests, and appointment notes. Wipe-clean cover.",
      whyIncluded: {
        public: "Public hospital paperwork can be chaotic — this folder keeps your scans, prescriptions, and test results organised so you're never scrambling.",
        private: "All your antenatal records, scan images, and prescriptions in one place — no more digging through bags at appointments.",
      },
    },
    {
      id: 20, name: "Compression Socks", baseImg: "🧦", rating: 4.4, reviews: 56,
      tags: ["bundle:standard","bundle:premium","gender:neutral","category:mum","type:comfort"],
      badge: null,
      brands: [
        { id: "scholl", label: "Scholl Flight", price: 3800, img: "🧦", tier: 1, color: "#E8F5E9" },
        { id: "physix", label: "Physix Gear ×2", price: 7500, img: "🧦", tier: 2, color: "#FCE4EC" },
      ],
      category: "mum", stage: ["expecting","newborn"], priority: "nice-to-have",
      tier: ["premium"], hospitalType: ["public","private","both"],
      deliveryMethod: ["csection","both"], genderRelevant: false, multiplesBump: 1.0,
      scope: ["hospital-bag"], firstBaby: null,
      description: "Medical-grade compression to reduce post-birth swelling. Compression level: 15-20 mmHg (mild).",
      whyIncluded: {
        csection: "After a C-section, compression socks are medically recommended to prevent blood clots while you're less mobile.",
        vaginal: "These reduce post-birth swelling in your feet and legs — especially welcome after hours of labour.",
      },
      sizes: ["S/M (UK 3-6)", "L/XL (UK 6-9)"],
      packInfo: "Compression level: 15-20 mmHg (mild)",
    },
  ]
};

export const ALL_PRODUCTS = [...PRODUCTS.baby, ...PRODUCTS.mum];

export const HERO_KIT = [
  { id: "hk1", name: "Huggies Nappy Pack", img: "🧷", price: 9500 },
  { id: "hk2", name: "Avent Bottle Set", img: "🍼", price: 18000 },
  { id: "hk3", name: "Carter's Onesie Set", img: "👶", price: 14500 },
  { id: "hk4", name: "Medela Nursing Pads", img: "💛", price: 8500 },
  { id: "hk5", name: "Aden+Anais Swaddle", img: "🌿", price: 11000 },
  { id: "hk6", name: "Lansinoh Nipple Cream", img: "🤱", price: 9500 },
];

export const TESTIMONIALS = [
  { name: "Adaeze O.", loc: "Lagos", stars: 5, text: "I was so overwhelmed before finding BundledMum. The quiz took 2 minutes and I had the perfect list. My Standard Boy Bundle arrived in 2 days — absolutely everything I needed!" },
  { name: "Ngozi T.", loc: "Abuja", stars: 5, text: "As a first-time mum in Nigeria, I had no idea where to start. BundledMum made it so easy. The products are actually good quality, not cheap imports. 10/10 recommend." },
  { name: "Kemi A.", loc: "Port Harcourt", stars: 5, text: "Bought the Premium Bundle as a baby shower gift. My friend cried when she saw everything. The presentation alone was worth it. Will always shop here for baby gifts." },
];

export const FAQ = [
  { q: "How does the quiz work?", a: "Our quiz asks about who you're shopping for, your baby's gender, hospital type, delivery method, and your budget. We instantly recommend the perfect products — no overwhelm, no guesswork." },
  { q: "Do you deliver across Nigeria?", a: "Yes! We deliver nationwide. Lagos orders arrive in 1–2 working days. Everywhere else is 3–5 working days. Free delivery on qualifying orders." },
  { q: "Can I change my bundle?", a: "Absolutely. The quiz gives you a personalised starting point, but you can add or remove individual items before checkout. It's your bundle." },
  { q: "Are the products safe for newborns?", a: "Every product on BundledMum is vetted for newborn safety. We stock only certified, skin-safe, and age-appropriate items." },
  { q: "What payment methods do you accept?", a: "Card (Mastercard, Visa, Verve), bank transfers, and USSD payments via Paystack. All transactions are secure and encrypted." },
  { q: "Can I return or exchange items?", a: "Yes — unused, sealed items can be returned within 7 days. Contact us on WhatsApp and we'll arrange a pickup. See our Returns Policy for details." },
  { q: "How long does delivery take?", a: "Lagos: 1–2 working days. Everywhere else: 3–5 working days. You'll receive tracking updates via WhatsApp and email." },
  { q: "Can I pay on delivery?", a: "We currently don't offer pay-on-delivery. We accept card payments, bank transfers, and USSD via Paystack — all secure and instant." },
  { q: "What happens if an item is out of stock?", a: "We'll contact you immediately via WhatsApp and offer a suitable replacement of equal or higher value at no extra cost." },
  { q: "Do you deliver to my state?", a: "We deliver to all 36 states and the FCT. Lagos and Abuja get the fastest delivery. Enter your state at checkout for an estimated delivery date." },
  { q: "Can I track my order?", a: "Yes! Once dispatched, we'll send tracking updates to your email and WhatsApp with your courier's details." },
  { q: "What brands do you use?", a: "We stock trusted brands like Pampers, Huggies, Carter's, Aden+Anais, Mustela, Lansinoh, and more. Each tier (Starter, Standard, Premium) uses different brand levels." },
];
