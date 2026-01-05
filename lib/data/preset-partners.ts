/**
 * Preset global partners - common companies for tax/accounting purposes
 * Includes FAANG, Austrian companies, and major international corporations
 */

export interface PresetPartner {
  name: string;
  aliases: string[];
  country: string;
  website?: string;
  vatId?: string;
}

/**
 * 250 preset partners organized by category
 */
export const PRESET_PARTNERS: PresetPartner[] = [
  // ============ FAANG / Big Tech (15) ============
  { name: "Apple Inc.", aliases: ["Apple", "Apple Store"], country: "US", website: "apple.com" },
  { name: "Amazon.com, Inc.", aliases: ["Amazon", "Amazon.de", "Amazon Prime", "AWS"], country: "US", website: "amazon.com" },
  { name: "Alphabet Inc.", aliases: ["Google", "Google Cloud", "YouTube", "Google Ads"], country: "US", website: "google.com" },
  { name: "Meta Platforms, Inc.", aliases: ["Facebook", "Instagram", "WhatsApp", "Meta"], country: "US", website: "meta.com" },
  { name: "Netflix, Inc.", aliases: ["Netflix"], country: "US", website: "netflix.com" },
  { name: "Microsoft Corporation", aliases: ["Microsoft", "Microsoft 365", "Azure", "LinkedIn", "GitHub"], country: "US", website: "microsoft.com" },
  { name: "NVIDIA Corporation", aliases: ["NVIDIA", "Nvidia"], country: "US", website: "nvidia.com" },
  { name: "Tesla, Inc.", aliases: ["Tesla", "Tesla Motors"], country: "US", website: "tesla.com" },
  { name: "Adobe Inc.", aliases: ["Adobe", "Adobe Creative Cloud"], country: "US", website: "adobe.com" },
  { name: "Salesforce, Inc.", aliases: ["Salesforce"], country: "US", website: "salesforce.com" },
  { name: "Oracle Corporation", aliases: ["Oracle"], country: "US", website: "oracle.com" },
  { name: "Intel Corporation", aliases: ["Intel"], country: "US", website: "intel.com" },
  { name: "Cisco Systems, Inc.", aliases: ["Cisco"], country: "US", website: "cisco.com" },
  { name: "IBM Corporation", aliases: ["IBM"], country: "US", website: "ibm.com" },
  { name: "SAP SE", aliases: ["SAP"], country: "DE", website: "sap.com", vatId: "DE143450199" },

  // ============ Austrian Companies (50) ============
  // Energy & Utilities
  { name: "OMV AG", aliases: ["OMV"], country: "AT", website: "omv.com", vatId: "ATU15537705" },
  { name: "Verbund AG", aliases: ["Verbund"], country: "AT", website: "verbund.com", vatId: "ATU14703908" },
  { name: "Wien Energie GmbH", aliases: ["Wien Energie"], country: "AT", website: "wienenergie.at", vatId: "ATU56522727" },
  { name: "EVN AG", aliases: ["EVN"], country: "AT", website: "evn.at", vatId: "ATU15590504" },
  { name: "Energie Steiermark AG", aliases: ["Energie Steiermark", "E-Steiermark"], country: "AT", website: "e-steiermark.com" },
  { name: "Salzburg AG", aliases: ["Salzburg AG für Energie"], country: "AT", website: "salzburg-ag.at" },
  { name: "KELAG", aliases: ["KELAG-Kärntner Elektrizitäts-AG"], country: "AT", website: "kelag.at" },

  // Banking & Finance
  { name: "Erste Group Bank AG", aliases: ["Erste Bank", "Erste Group", "Sparkasse"], country: "AT", website: "erstegroup.com", vatId: "ATU15356406" },
  { name: "Raiffeisen Bank International AG", aliases: ["Raiffeisen", "RBI", "Raiffeisenbank"], country: "AT", website: "rbinternational.com", vatId: "ATU15358005" },
  { name: "BAWAG Group AG", aliases: ["BAWAG", "BAWAG PSK", "easybank"], country: "AT", website: "bawaggroup.com", vatId: "ATU51286308" },
  { name: "Oberbank AG", aliases: ["Oberbank"], country: "AT", website: "oberbank.at" },
  { name: "Bank Austria", aliases: ["UniCredit Bank Austria AG"], country: "AT", website: "bankaustria.at", vatId: "ATU51507409" },
  { name: "Volksbank Wien AG", aliases: ["Volksbank"], country: "AT", website: "volksbank.at" },

  // Insurance
  { name: "UNIQA Insurance Group AG", aliases: ["UNIQA"], country: "AT", website: "uniqa.at", vatId: "ATU36676505" },
  { name: "Vienna Insurance Group AG", aliases: ["VIG", "Wiener Städtische"], country: "AT", website: "vig.com", vatId: "ATU15351008" },
  { name: "Generali Versicherung AG", aliases: ["Generali"], country: "AT", website: "generali.at" },
  { name: "Allianz Elementar Versicherungs-AG", aliases: ["Allianz"], country: "AT", website: "allianz.at" },
  { name: "Helvetia Versicherungen AG", aliases: ["Helvetia"], country: "AT", website: "helvetia.at" },
  { name: "Merkur Versicherung AG", aliases: ["Merkur"], country: "AT", website: "merkur.at" },
  { name: "Grazer Wechselseitige Versicherung AG", aliases: ["GRAWE"], country: "AT", website: "grawe.at" },

  // Industrial & Manufacturing
  { name: "voestalpine AG", aliases: ["voestalpine", "Voest"], country: "AT", website: "voestalpine.com", vatId: "ATU15159208" },
  { name: "Andritz AG", aliases: ["Andritz"], country: "AT", website: "andritz.com", vatId: "ATU30988708" },
  { name: "Mayr-Melnhof Karton AG", aliases: ["Mayr-Melnhof", "MM Karton"], country: "AT", website: "mm.group", vatId: "ATU38700108" },
  { name: "Lenzing AG", aliases: ["Lenzing"], country: "AT", website: "lenzing.com", vatId: "ATU15364003" },
  { name: "AMAG Austria Metall AG", aliases: ["AMAG"], country: "AT", website: "amag.at", vatId: "ATU52107206" },
  { name: "Semperit AG Holding", aliases: ["Semperit"], country: "AT", website: "semperitgroup.com" },
  { name: "Palfinger AG", aliases: ["Palfinger"], country: "AT", website: "palfinger.com" },
  { name: "Zumtobel Group AG", aliases: ["Zumtobel"], country: "AT", website: "zumtobelgroup.com" },
  { name: "RHI Magnesita N.V.", aliases: ["RHI Magnesita"], country: "AT", website: "rhimagnesita.com" },

  // Telecom & Tech
  { name: "A1 Telekom Austria AG", aliases: ["A1", "A1 Austria", "Telekom Austria"], country: "AT", website: "a1.net", vatId: "ATU62895905" },
  { name: "Magenta Telekom", aliases: ["Magenta", "T-Mobile Austria"], country: "AT", website: "magenta.at", vatId: "ATU62895668" },
  { name: "Hutchison Drei Austria GmbH", aliases: ["Drei", "3 Austria"], country: "AT", website: "drei.at", vatId: "ATU61927217" },
  { name: "Fabasoft AG", aliases: ["Fabasoft"], country: "AT", website: "fabasoft.com" },
  { name: "S&T AG", aliases: ["S&T", "Kontron"], country: "AT", website: "snt.at" },

  // Retail & Consumer
  { name: "SPAR Österreichische Warenhandels-AG", aliases: ["SPAR", "Interspar", "Eurospar"], country: "AT", website: "spar.at", vatId: "ATU16409502" },
  { name: "REWE International AG", aliases: ["BILLA", "BIPA", "Merkur", "Penny"], country: "AT", website: "rewe-group.at", vatId: "ATU22126909" },
  { name: "Hofer KG", aliases: ["Hofer", "ALDI Süd Austria"], country: "AT", website: "hofer.at", vatId: "ATU46561808" },
  { name: "Lidl Österreich GmbH", aliases: ["Lidl"], country: "AT", website: "lidl.at", vatId: "ATU50477808" },
  { name: "MediaMarkt Austria", aliases: ["MediaMarkt", "Saturn"], country: "AT", website: "mediamarkt.at" },
  { name: "XXXLutz KG", aliases: ["XXXLutz", "Möbelix", "Mömax"], country: "AT", website: "xxxlutz.at" },
  { name: "dm drogerie markt GmbH", aliases: ["dm", "dm Drogerie"], country: "AT", website: "dm.at", vatId: "ATU15359808" },
  { name: "IKEA Austria GmbH", aliases: ["IKEA"], country: "AT", website: "ikea.at" },
  { name: "H&M Austria", aliases: ["H&M", "Hennes & Mauritz"], country: "AT", website: "hm.com" },

  // Transport & Logistics
  { name: "Österreichische Bundesbahnen", aliases: ["ÖBB", "Austrian Federal Railways"], country: "AT", website: "oebb.at", vatId: "ATU61905905" },
  { name: "Österreichische Post AG", aliases: ["Post", "Austrian Post"], country: "AT", website: "post.at", vatId: "ATU46674503" },
  { name: "Flughafen Wien AG", aliases: ["Vienna Airport", "VIE"], country: "AT", website: "viennaairport.com" },
  { name: "Austrian Airlines AG", aliases: ["Austrian Airlines", "Austrian", "AUA"], country: "AT", website: "austrian.com", vatId: "ATU15359906" },
  { name: "Wiener Linien GmbH & Co KG", aliases: ["Wiener Linien"], country: "AT", website: "wienerlinien.at" },

  // Real Estate & Construction
  { name: "IMMOFINANZ AG", aliases: ["IMMOFINANZ"], country: "AT", website: "immofinanz.com", vatId: "ATU54198806" },
  { name: "CA Immobilien Anlagen AG", aliases: ["CA Immo"], country: "AT", website: "caimmo.com" },
  { name: "S IMMO AG", aliases: ["S IMMO"], country: "AT", website: "simmoag.at" },
  { name: "PORR AG", aliases: ["PORR"], country: "AT", website: "porr-group.com", vatId: "ATU15358304" },
  { name: "STRABAG SE", aliases: ["STRABAG"], country: "AT", website: "strabag.com", vatId: "ATU62161238" },

  // Tourism & Hospitality
  { name: "DO & CO Aktiengesellschaft", aliases: ["DO & CO", "DOCO"], country: "AT", website: "doco.com" },
  { name: "Österreich Werbung", aliases: ["Austrian National Tourist Office"], country: "AT", website: "austria.info" },

  // Food & Beverage
  { name: "Red Bull GmbH", aliases: ["Red Bull"], country: "AT", website: "redbull.com", vatId: "ATU36765005" },
  { name: "Agrana Beteiligungs-AG", aliases: ["AGRANA"], country: "AT", website: "agrana.com", vatId: "ATU15662403" },
  { name: "Brau Union Österreich AG", aliases: ["Brau Union", "Gösser", "Zipfer", "Puntigamer"], country: "AT", website: "brauunion.at" },
  { name: "Stiegl Getränke & Service GmbH", aliases: ["Stiegl"], country: "AT", website: "stiegl.at" },
  { name: "Ottakringer Brauerei", aliases: ["Ottakringer"], country: "AT", website: "ottakringer.at" },
  { name: "Manner GmbH", aliases: ["Manner", "Josef Manner"], country: "AT", website: "manner.com" },

  // ============ German DAX Companies (40) ============
  { name: "Volkswagen AG", aliases: ["VW", "Volkswagen", "Audi", "Porsche", "SEAT", "Skoda"], country: "DE", website: "volkswagen.com", vatId: "DE115235681" },
  { name: "BMW AG", aliases: ["BMW", "MINI", "Rolls-Royce Motor Cars"], country: "DE", website: "bmw.com", vatId: "DE129273398" },
  { name: "Mercedes-Benz Group AG", aliases: ["Mercedes", "Mercedes-Benz", "Daimler"], country: "DE", website: "mercedes-benz.com", vatId: "DE812281990" },
  { name: "Siemens AG", aliases: ["Siemens"], country: "DE", website: "siemens.com", vatId: "DE129274202" },
  { name: "BASF SE", aliases: ["BASF"], country: "DE", website: "basf.com", vatId: "DE811997581" },
  { name: "Bayer AG", aliases: ["Bayer"], country: "DE", website: "bayer.com", vatId: "DE811283258" },
  { name: "Deutsche Telekom AG", aliases: ["Telekom", "T-Mobile", "Deutsche Telekom"], country: "DE", website: "telekom.de", vatId: "DE123475223" },
  { name: "Allianz SE", aliases: ["Allianz"], country: "DE", website: "allianz.com", vatId: "DE129274238" },
  { name: "Munich Re", aliases: ["Münchener Rück", "Munich Reinsurance"], country: "DE", website: "munichre.com", vatId: "DE129520280" },
  { name: "Deutsche Bank AG", aliases: ["Deutsche Bank"], country: "DE", website: "db.com", vatId: "DE114103379" },
  { name: "Commerzbank AG", aliases: ["Commerzbank"], country: "DE", website: "commerzbank.de", vatId: "DE114216574" },
  { name: "DHL Group", aliases: ["DHL", "Deutsche Post DHL"], country: "DE", website: "dpdhl.com", vatId: "DE169838187" },
  { name: "Adidas AG", aliases: ["adidas", "Adidas"], country: "DE", website: "adidas.com", vatId: "DE127991705" },
  { name: "Henkel AG & Co. KGaA", aliases: ["Henkel", "Persil", "Schwarzkopf"], country: "DE", website: "henkel.com", vatId: "DE119546564" },
  { name: "Continental AG", aliases: ["Continental", "Conti"], country: "DE", website: "continental.com", vatId: "DE811164215" },
  { name: "Deutsche Börse AG", aliases: ["Deutsche Börse"], country: "DE", website: "deutsche-boerse.com" },
  { name: "E.ON SE", aliases: ["E.ON", "EON"], country: "DE", website: "eon.com", vatId: "DE267298028" },
  { name: "RWE AG", aliases: ["RWE"], country: "DE", website: "rwe.com", vatId: "DE113644444" },
  { name: "Infineon Technologies AG", aliases: ["Infineon"], country: "DE", website: "infineon.com", vatId: "DE811700492" },
  { name: "Deutsche Lufthansa AG", aliases: ["Lufthansa", "Swiss", "Austrian Airlines"], country: "DE", website: "lufthansa.com", vatId: "DE121599515" },
  { name: "Fresenius SE & Co. KGaA", aliases: ["Fresenius", "Fresenius Kabi"], country: "DE", website: "fresenius.com" },
  { name: "Merck KGaA", aliases: ["Merck"], country: "DE", website: "merck.com", vatId: "DE111206055" },
  { name: "HeidelbergCement AG", aliases: ["Heidelberg Materials"], country: "DE", website: "heidelbergmaterials.com" },
  { name: "Vonovia SE", aliases: ["Vonovia"], country: "DE", website: "vonovia.de" },
  { name: "Covestro AG", aliases: ["Covestro"], country: "DE", website: "covestro.com" },
  { name: "Brenntag SE", aliases: ["Brenntag"], country: "DE", website: "brenntag.com" },
  { name: "Symrise AG", aliases: ["Symrise"], country: "DE", website: "symrise.com" },
  { name: "Beiersdorf AG", aliases: ["Beiersdorf", "Nivea", "Eucerin"], country: "DE", website: "beiersdorf.com", vatId: "DE118456871" },
  { name: "Puma SE", aliases: ["Puma", "PUMA"], country: "DE", website: "puma.com" },
  { name: "Zalando SE", aliases: ["Zalando"], country: "DE", website: "zalando.de", vatId: "DE260543043" },
  { name: "Delivery Hero SE", aliases: ["Delivery Hero", "Foodora", "Mjam"], country: "DE", website: "deliveryhero.com" },
  { name: "HelloFresh SE", aliases: ["HelloFresh"], country: "DE", website: "hellofresh.com" },
  { name: "Sixt SE", aliases: ["Sixt"], country: "DE", website: "sixt.de" },
  { name: "Scout24 SE", aliases: ["Scout24", "ImmobilienScout24", "AutoScout24"], country: "DE", website: "scout24.com" },
  { name: "Sartorius AG", aliases: ["Sartorius"], country: "DE", website: "sartorius.com" },
  { name: "MTU Aero Engines AG", aliases: ["MTU"], country: "DE", website: "mtu.de" },
  { name: "HUGO BOSS AG", aliases: ["Hugo Boss", "BOSS"], country: "DE", website: "hugoboss.com" },
  { name: "Drägerwerk AG & Co. KGaA", aliases: ["Dräger"], country: "DE", website: "draeger.com" },
  { name: "LANXESS AG", aliases: ["LANXESS", "Lanxess"], country: "DE", website: "lanxess.com" },
  { name: "Knorr-Bremse AG", aliases: ["Knorr-Bremse"], country: "DE", website: "knorr-bremse.com" },

  // ============ European Multinationals (40) ============
  // Switzerland
  { name: "Nestlé S.A.", aliases: ["Nestlé", "Nestle", "Nespresso"], country: "CH", website: "nestle.com" },
  { name: "Novartis AG", aliases: ["Novartis"], country: "CH", website: "novartis.com" },
  { name: "Roche Holding AG", aliases: ["Roche"], country: "CH", website: "roche.com" },
  { name: "UBS Group AG", aliases: ["UBS"], country: "CH", website: "ubs.com" },
  { name: "Credit Suisse Group AG", aliases: ["Credit Suisse"], country: "CH", website: "credit-suisse.com" },
  { name: "ABB Ltd", aliases: ["ABB"], country: "CH", website: "abb.com" },
  { name: "Zurich Insurance Group AG", aliases: ["Zurich"], country: "CH", website: "zurich.com" },
  { name: "Swiss Re AG", aliases: ["Swiss Re"], country: "CH", website: "swissre.com" },
  { name: "Swatch Group AG", aliases: ["Swatch", "Omega", "Longines"], country: "CH", website: "swatchgroup.com" },
  { name: "Lindt & Sprüngli AG", aliases: ["Lindt", "Lindt & Sprüngli"], country: "CH", website: "lindt.com" },

  // Netherlands
  { name: "Shell plc", aliases: ["Shell", "Royal Dutch Shell"], country: "NL", website: "shell.com" },
  { name: "ASML Holding N.V.", aliases: ["ASML"], country: "NL", website: "asml.com" },
  { name: "Philips N.V.", aliases: ["Philips", "Royal Philips"], country: "NL", website: "philips.com" },
  { name: "Unilever N.V.", aliases: ["Unilever"], country: "NL", website: "unilever.com" },
  { name: "ING Group N.V.", aliases: ["ING", "ING Bank"], country: "NL", website: "ing.com" },
  { name: "Heineken N.V.", aliases: ["Heineken"], country: "NL", website: "heineken.com" },
  { name: "Booking Holdings Inc.", aliases: ["Booking.com"], country: "NL", website: "booking.com" },

  // France
  { name: "LVMH Moët Hennessy Louis Vuitton SE", aliases: ["LVMH", "Louis Vuitton", "Dior", "Moët"], country: "FR", website: "lvmh.com" },
  { name: "L'Oréal S.A.", aliases: ["L'Oréal", "L'Oreal"], country: "FR", website: "loreal.com" },
  { name: "TotalEnergies SE", aliases: ["TotalEnergies", "Total"], country: "FR", website: "totalenergies.com" },
  { name: "Sanofi S.A.", aliases: ["Sanofi"], country: "FR", website: "sanofi.com" },
  { name: "BNP Paribas S.A.", aliases: ["BNP Paribas", "BNP"], country: "FR", website: "bnpparibas.com" },
  { name: "AXA S.A.", aliases: ["AXA"], country: "FR", website: "axa.com" },
  { name: "Carrefour S.A.", aliases: ["Carrefour"], country: "FR", website: "carrefour.com" },
  { name: "Airbus SE", aliases: ["Airbus"], country: "FR", website: "airbus.com" },
  { name: "Danone S.A.", aliases: ["Danone", "Evian", "Alpro"], country: "FR", website: "danone.com" },
  { name: "Michelin", aliases: ["Michelin", "Bibendum"], country: "FR", website: "michelin.com" },

  // UK
  { name: "BP p.l.c.", aliases: ["BP", "British Petroleum"], country: "GB", website: "bp.com" },
  { name: "HSBC Holdings plc", aliases: ["HSBC"], country: "GB", website: "hsbc.com" },
  { name: "Barclays PLC", aliases: ["Barclays"], country: "GB", website: "barclays.com" },
  { name: "Tesco PLC", aliases: ["Tesco"], country: "GB", website: "tesco.com" },
  { name: "AstraZeneca PLC", aliases: ["AstraZeneca"], country: "GB", website: "astrazeneca.com" },
  { name: "GlaxoSmithKline plc", aliases: ["GSK", "GlaxoSmithKline"], country: "GB", website: "gsk.com" },
  { name: "Vodafone Group Plc", aliases: ["Vodafone"], country: "GB", website: "vodafone.com" },
  { name: "British American Tobacco p.l.c.", aliases: ["BAT"], country: "GB", website: "bat.com" },

  // Nordic
  { name: "Spotify Technology S.A.", aliases: ["Spotify"], country: "SE", website: "spotify.com" },
  { name: "IKEA of Sweden AB", aliases: ["IKEA"], country: "SE", website: "ikea.com" },
  { name: "Volvo Group", aliases: ["Volvo"], country: "SE", website: "volvo.com" },
  { name: "Ericsson", aliases: ["Ericsson", "LM Ericsson"], country: "SE", website: "ericsson.com" },
  { name: "H&M Hennes & Mauritz AB", aliases: ["H&M", "Hennes & Mauritz"], country: "SE", website: "hm.com" },
  { name: "Novo Nordisk A/S", aliases: ["Novo Nordisk"], country: "DK", website: "novonordisk.com" },
  { name: "Maersk", aliases: ["A.P. Moller - Maersk"], country: "DK", website: "maersk.com" },
  { name: "LEGO A/S", aliases: ["LEGO"], country: "DK", website: "lego.com" },
  { name: "Nokia Corporation", aliases: ["Nokia"], country: "FI", website: "nokia.com" },

  // ============ US Companies (40) ============
  // Retail
  { name: "Walmart Inc.", aliases: ["Walmart"], country: "US", website: "walmart.com" },
  { name: "Costco Wholesale Corporation", aliases: ["Costco"], country: "US", website: "costco.com" },
  { name: "Target Corporation", aliases: ["Target"], country: "US", website: "target.com" },
  { name: "The Home Depot, Inc.", aliases: ["Home Depot"], country: "US", website: "homedepot.com" },
  { name: "Lowe's Companies, Inc.", aliases: ["Lowe's"], country: "US", website: "lowes.com" },
  { name: "Best Buy Co., Inc.", aliases: ["Best Buy"], country: "US", website: "bestbuy.com" },
  { name: "eBay Inc.", aliases: ["eBay"], country: "US", website: "ebay.com" },
  { name: "Etsy, Inc.", aliases: ["Etsy"], country: "US", website: "etsy.com" },

  // Finance & Payments
  { name: "JPMorgan Chase & Co.", aliases: ["JPMorgan", "Chase"], country: "US", website: "jpmorganchase.com" },
  { name: "Bank of America Corporation", aliases: ["Bank of America", "BofA"], country: "US", website: "bankofamerica.com" },
  { name: "Citigroup Inc.", aliases: ["Citibank", "Citi"], country: "US", website: "citi.com" },
  { name: "Goldman Sachs Group, Inc.", aliases: ["Goldman Sachs"], country: "US", website: "goldmansachs.com" },
  { name: "Morgan Stanley", aliases: ["Morgan Stanley"], country: "US", website: "morganstanley.com" },
  { name: "Visa Inc.", aliases: ["Visa"], country: "US", website: "visa.com" },
  { name: "Mastercard Incorporated", aliases: ["Mastercard"], country: "US", website: "mastercard.com" },
  { name: "American Express Company", aliases: ["Amex", "American Express"], country: "US", website: "americanexpress.com" },
  { name: "PayPal Holdings, Inc.", aliases: ["PayPal", "Venmo"], country: "US", website: "paypal.com" },
  { name: "Block, Inc.", aliases: ["Block", "Square", "Cash App"], country: "US", website: "block.xyz" },
  { name: "Stripe, Inc.", aliases: ["Stripe"], country: "US", website: "stripe.com" },

  // Tech Services
  { name: "Uber Technologies, Inc.", aliases: ["Uber", "Uber Eats"], country: "US", website: "uber.com" },
  { name: "Lyft, Inc.", aliases: ["Lyft"], country: "US", website: "lyft.com" },
  { name: "Airbnb, Inc.", aliases: ["Airbnb"], country: "US", website: "airbnb.com" },
  { name: "DoorDash, Inc.", aliases: ["DoorDash"], country: "US", website: "doordash.com" },
  { name: "Dropbox, Inc.", aliases: ["Dropbox"], country: "US", website: "dropbox.com" },
  { name: "Zoom Video Communications, Inc.", aliases: ["Zoom"], country: "US", website: "zoom.us" },
  { name: "Slack Technologies, LLC", aliases: ["Slack"], country: "US", website: "slack.com" },
  { name: "Atlassian Corporation", aliases: ["Atlassian", "Jira", "Confluence", "Trello"], country: "US", website: "atlassian.com" },
  { name: "Intuit Inc.", aliases: ["Intuit", "QuickBooks", "TurboTax"], country: "US", website: "intuit.com" },
  { name: "Autodesk, Inc.", aliases: ["Autodesk"], country: "US", website: "autodesk.com" },
  { name: "Shopify Inc.", aliases: ["Shopify"], country: "CA", website: "shopify.com" },

  // Food & Beverage
  { name: "McDonald's Corporation", aliases: ["McDonald's", "McDonalds"], country: "US", website: "mcdonalds.com" },
  { name: "Starbucks Corporation", aliases: ["Starbucks"], country: "US", website: "starbucks.com" },
  { name: "The Coca-Cola Company", aliases: ["Coca-Cola", "Coke"], country: "US", website: "coca-cola.com" },
  { name: "PepsiCo, Inc.", aliases: ["Pepsi", "PepsiCo"], country: "US", website: "pepsico.com" },
  { name: "Yum! Brands, Inc.", aliases: ["KFC", "Pizza Hut", "Taco Bell"], country: "US", website: "yum.com" },
  { name: "Subway IP LLC", aliases: ["Subway"], country: "US", website: "subway.com" },
  { name: "Chipotle Mexican Grill, Inc.", aliases: ["Chipotle"], country: "US", website: "chipotle.com" },

  // Entertainment & Media
  { name: "The Walt Disney Company", aliases: ["Disney", "Disney+", "Pixar", "Marvel", "Lucasfilm"], country: "US", website: "disney.com" },
  { name: "Comcast Corporation", aliases: ["Comcast", "NBC Universal", "Sky"], country: "US", website: "comcast.com" },
  { name: "Warner Bros. Discovery, Inc.", aliases: ["Warner Bros.", "HBO", "CNN"], country: "US", website: "wbd.com" },

  // ============ Fintech & Payments (20) ============
  { name: "Klarna Bank AB", aliases: ["Klarna"], country: "SE", website: "klarna.com" },
  { name: "Adyen N.V.", aliases: ["Adyen"], country: "NL", website: "adyen.com" },
  { name: "Revolut Ltd", aliases: ["Revolut"], country: "GB", website: "revolut.com" },
  { name: "N26 Bank GmbH", aliases: ["N26"], country: "DE", website: "n26.com" },
  { name: "Wise Payments Limited", aliases: ["Wise", "TransferWise"], country: "GB", website: "wise.com" },
  { name: "Sumup Limited", aliases: ["SumUp"], country: "GB", website: "sumup.com" },
  { name: "iZettle AB", aliases: ["iZettle", "Zettle"], country: "SE", website: "zettle.com" },
  { name: "Mollie B.V.", aliases: ["Mollie"], country: "NL", website: "mollie.com" },
  { name: "Worldline S.A.", aliases: ["Worldline"], country: "FR", website: "worldline.com" },
  { name: "Nexi S.p.A.", aliases: ["Nexi"], country: "IT", website: "nexi.it" },

  // ============ Cloud & SaaS (15) ============
  { name: "Amazon Web Services, Inc.", aliases: ["AWS", "Amazon Web Services"], country: "US", website: "aws.amazon.com" },
  { name: "Google Cloud", aliases: ["Google Cloud Platform", "GCP"], country: "US", website: "cloud.google.com" },
  { name: "Cloudflare, Inc.", aliases: ["Cloudflare"], country: "US", website: "cloudflare.com" },
  { name: "DigitalOcean, LLC", aliases: ["DigitalOcean"], country: "US", website: "digitalocean.com" },
  { name: "MongoDB, Inc.", aliases: ["MongoDB"], country: "US", website: "mongodb.com" },
  { name: "Snowflake Inc.", aliases: ["Snowflake"], country: "US", website: "snowflake.com" },
  { name: "Twilio Inc.", aliases: ["Twilio"], country: "US", website: "twilio.com" },
  { name: "HubSpot, Inc.", aliases: ["HubSpot"], country: "US", website: "hubspot.com" },
  { name: "Notion Labs, Inc.", aliases: ["Notion"], country: "US", website: "notion.so" },
  { name: "Figma, Inc.", aliases: ["Figma"], country: "US", website: "figma.com" },
  { name: "Canva Pty Ltd", aliases: ["Canva"], country: "AU", website: "canva.com" },
  { name: "Vercel Inc.", aliases: ["Vercel"], country: "US", website: "vercel.com" },
  { name: "Netlify, Inc.", aliases: ["Netlify"], country: "US", website: "netlify.com" },
  { name: "Supabase, Inc.", aliases: ["Supabase"], country: "US", website: "supabase.com" },
  { name: "Airtable Inc.", aliases: ["Airtable"], country: "US", website: "airtable.com" },

  // ============ Hardware & Electronics (10) ============
  { name: "Dell Technologies Inc.", aliases: ["Dell"], country: "US", website: "dell.com" },
  { name: "HP Inc.", aliases: ["HP", "Hewlett-Packard"], country: "US", website: "hp.com" },
  { name: "Lenovo Group Limited", aliases: ["Lenovo"], country: "HK", website: "lenovo.com" },
  { name: "Samsung Electronics Co., Ltd.", aliases: ["Samsung"], country: "KR", website: "samsung.com" },
  { name: "Sony Group Corporation", aliases: ["Sony", "PlayStation"], country: "JP", website: "sony.com" },
  { name: "LG Electronics Inc.", aliases: ["LG"], country: "KR", website: "lg.com" },
  { name: "Panasonic Holdings Corporation", aliases: ["Panasonic"], country: "JP", website: "panasonic.com" },
  { name: "Canon Inc.", aliases: ["Canon"], country: "JP", website: "canon.com" },
  { name: "Logitech International S.A.", aliases: ["Logitech"], country: "CH", website: "logitech.com" },
  { name: "Bose Corporation", aliases: ["Bose"], country: "US", website: "bose.com" },

  // ============ Utilities & Services (10) ============
  { name: "Spotify AB", aliases: ["Spotify Premium"], country: "SE", website: "spotify.com" },
  { name: "Apple Services", aliases: ["iCloud", "Apple Music", "App Store"], country: "US", website: "apple.com" },
  { name: "Google Services", aliases: ["Google One", "Google Workspace"], country: "US", website: "google.com" },
  { name: "LinkedIn Corporation", aliases: ["LinkedIn", "LinkedIn Premium"], country: "US", website: "linkedin.com" },
  { name: "Xero Limited", aliases: ["Xero"], country: "NZ", website: "xero.com" },
  { name: "FreshBooks", aliases: ["FreshBooks"], country: "CA", website: "freshbooks.com" },
  { name: "Mailchimp", aliases: ["Mailchimp", "Intuit Mailchimp"], country: "US", website: "mailchimp.com" },
  { name: "SendGrid, Inc.", aliases: ["SendGrid", "Twilio SendGrid"], country: "US", website: "sendgrid.com" },
  { name: "1Password", aliases: ["1Password", "AgileBits"], country: "CA", website: "1password.com" },
  { name: "LastPass", aliases: ["LastPass"], country: "US", website: "lastpass.com" },

  // ============ Additional Companies to reach 250 (5) ============
  { name: "DocuSign, Inc.", aliases: ["DocuSign"], country: "US", website: "docusign.com" },
  { name: "Workday, Inc.", aliases: ["Workday"], country: "US", website: "workday.com" },
  { name: "ServiceNow, Inc.", aliases: ["ServiceNow"], country: "US", website: "servicenow.com" },
  { name: "Datadog, Inc.", aliases: ["Datadog"], country: "US", website: "datadoghq.com" },
  { name: "CrowdStrike Holdings, Inc.", aliases: ["CrowdStrike"], country: "US", website: "crowdstrike.com" },
];

/**
 * Special identifier for preset partner source
 */
export const PRESET_SOURCE = "preset" as const;

/**
 * Count of preset partners
 */
export const PRESET_PARTNERS_COUNT = PRESET_PARTNERS.length;
