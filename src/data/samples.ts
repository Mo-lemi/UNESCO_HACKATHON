import { SamplePosting, Lesson } from '../types';

export const SAMPLE_POSTINGS: SamplePosting[] = [
  {
    id: 'sample-scam-1',
    title: 'High-Risk Scam: Registration Fee & POPIA ID Request',
    category: 'scam',
    badgeLabel: 'HIGH RISK SCAM',
    description: 'Combines upfront fee, WhatsApp migration, fake POPIA legal clause, and ID/banking requests.',
    text: 'Receptionist position available, Gqeberha, R21836/month, apply today! A small registration fee is required to process your onboarding pack. Kindly WhatsApp 0614009366 with your full ID number and banking details for verification as per our POPIA data policy. Act fast, this offer closes tonight!',
  },
  {
    id: 'sample-scam-2',
    title: 'High-Risk Scam: Starter Pack Deposit & Inflated Salary',
    category: 'scam',
    badgeLabel: 'UPFRONT FEE SCAM',
    description: 'Demands refundable deposit for starter pack, inflated driver salary, and artificial scarcity.',
    text: 'Driver needed, Durban area, R27166/month. Kindly note a refundable registration deposit is required before your starter pack is issued. Limited spaces, apply now.',
  },
  {
    id: 'sample-scam-3',
    title: 'Medium-High Risk: WhatsApp Off-Platform Migration',
    category: 'scam',
    badgeLabel: 'WHATSAPP MIGRATION',
    description: 'Pushes applicant off official platforms to an unverified WhatsApp cell number with extreme urgency.',
    text: 'Warehouse Assistant vacancy in Bloemfontein, R28739 a month. WhatsApp 0834176986 if interested, only a few spots remain so don\'t delay your application.',
  },
  {
    id: 'sample-scam-4',
    title: 'High-Risk Scam: Free-Email Recruiter & Document Request',
    category: 'scam',
    badgeLabel: 'FREE-EMAIL & ID REQUEST',
    description: 'Recruiter using Gmail requesting sensitive ID documents and upfront admin fee.',
    text: 'Data Capturer needed urgently. Salary R19,500 pm. No experience required. We strictly comply with POPIA regulations; please send a copy of your ID document to hr.recruitment2024@gmail.com. An admin processing fee of R150 is payable before your placement interview.',
  },
  {
    id: 'sample-legit-1',
    title: 'Legitimate Posting: Cape Town Cashier Role',
    category: 'legitimate',
    badgeLabel: 'VERIFIED LEGITIMATE',
    description: 'Official company domain, market-aligned salary, and explicit zero-fee recruitment policy.',
    text: 'A Cashier position is now open at Thandeka (Pty) Ltd 351, Cape Town. Remuneration is R6218 per month, in line with industry norms. The successful candidate will handle day-to-day cashier tasks for the team. Candidates should have a Grade 12 qualification and some relevant work history. To apply, submit your CV via our official careers page at careers.thandeka351.co.za. Only shortlisted applicants will be contacted. This process is entirely free of charge to candidates.',
  },
  {
    id: 'sample-legit-2',
    title: 'Legitimate Posting: Software Developer',
    category: 'legitimate',
    badgeLabel: 'VERIFIED LEGITIMATE',
    description: 'Verified portal link, realistic technical pay scale, standard 2-week interview timeline.',
    text: 'Mpho Retail 639 is recruiting a Software Developer based in Cape Town. The role pays R32131/month depending on relevant experience. The successful candidate will handle day-to-day software developer tasks for the team. Candidates should have a Grade 12 qualification and some relevant work history. To apply, submit your CV via our official careers page at careers.mphoretail639.co.za. Shortlisted candidates will be contacted for an interview within two weeks. No fees of any kind are charged during recruitment.',
  },
];

export const ACADEMY_LESSONS: Lesson[] = [
  {
    id: 'upfront-payment',
    title: 'Payment before interview',
    en: 'A real employer never asks you to pay before you\'re hired. If a posting asks for a "registration fee", a "starter pack" fee, or a refundable deposit before an interview, that is not a real job. It\'s designed to take your money.',
    zu: 'Umqashi weqiniso akaze akucele ukuthi ukhokhe ngaphambi kokuqashwa. Uma isikhangiso sicela "imali yokubhalisa", imali ye-"starter pack", noma isibambiso esingabuyiselwa ngaphambi kwenhlolokhono, lowo akulona ithuba eliqinisile. Kuhlose ukuthatha imali yakho.',
    af: '\'n Regte werkgewer vra jou nooit om te betaal voordat jy aangestel is nie. As \'n advertensie \'n "registrasiefooi", \'n "aanvangspak"-fooi, of \'n terugbetaalbare deposito voor \'n onderhoud vra, is dit nie \'n regte werk nie. Dit is ontwerp om jou geld te vat.',
  },
  {
    id: 'whatsapp-migration',
    title: 'Moved off the platform to WhatsApp',
    en: 'If a posting on a job site or Facebook pushes you to "WhatsApp us" instead of applying through the platform, be careful. Moving off an official channel makes the scammer harder to trace and makes it easier to pressure you.',
    zu: 'Uma isikhangiso kusizindalwazi somsebenzi noma ku-Facebook sikucindezela ukuthi "usithumele i-WhatsApp" esikhundleni sokufaka isicelo ngesiteshi esisemthethweni, qaphela. Ukusuka endlelene esemthethweni kwenza kube nzima ukulandelela umenzi wobuqili futhi kulula ukukucindezela.',
    af: 'As \'n advertensie op \'n werkswebwerf of Facebook jou aanmoedig om "ons op WhatsApp te kontak" pleks van deur die amptelike platform aansoek te doen, wees versigtig. Om van \'n amptelike kanaal weg te skuif maak die bedrieër moeiliker om op te spoor en makliker om jou onder druk te plaas.',
  },
  {
    id: 'fake-popia',
    title: 'A legal clause used to sound official',
    en: 'Scammers quote POPIA (the Protection of Personal Information Act) to sound official while asking for your ID document. Real POPIA compliance protects your data. It\'s never the reason to demand an ID copy before you\'ve even been shortlisted.',
    zu: 'Abaqili bacaphuna i-POPIA ukuze bezwakale bengabomthetho ngenkathi becela idokhumenti yakho yesazisi. Ukuhambisana okuyikho ne-POPIA kuvikela idatha yakho. Akusetshenziswa njengesizathu sokucela ikhophi yesazisi ngaphambi kokuba ukhethwe ngisho nasohlwini.',
    af: 'Bedrieërs haal POPIA aan om amptelik te klink terwyl hulle jou ID-dokument vra. Regte POPIA-nakoming beskerm jou data. Dit is nooit die rede om \'n ID-afskrif te eis voordat jy eers op \'n kortlys geplaas is nie.',
  },
  {
    id: 'salary-mismatch',
    title: 'A salary too good for the role',
    en: 'A salary far above the normal range for a role with "no experience needed" is designed to make desperation override doubt. Check the real market rate before you get excited.',
    zu: 'Iholo eliphezulu kakhulu kunobulili obuvamile besikhundla esithi "akudingeki lwazi" lakhelwe ukuthi ukuphelelwa yithemba kudlule ukungabaza. Hlola izinga lemakethe langempela ngaphambi kokujabula.',
    af: '\'n Salaris baie hoër as die normale reeks vir \'n pos wat "geen ondervinding nodig nie" aandui, is ontwerp om wanhoop jou twyfel te laat oorheers. Gaan die werklike markkoers na voordat jy opgewonde raak.',
  },
];
