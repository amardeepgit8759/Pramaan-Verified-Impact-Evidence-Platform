/**
 * The demo dataset: who the organisation is, its projects and sites, and every photo with
 * the role it plays. Read by prepare-demo-images.ts (which fetches the photos) and by
 * seed-demo.ts (which uploads them through the real API).
 *
 * Photos are real, freely licensed pictures from Wikimedia Commons. Capture dates and GPS
 * are written into each file at seed time, relative to the day you seed, so the demo
 * always looks like an ongoing project; see demo-data/README.md.
 */

export interface DemoSite {
  key: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface DemoProject {
  key: string;
  name: string;
  description: string;
  /** The project started this many days before seeding. */
  startDaysAgo: number;
  sdgGoals: number[];
  csrCategory: string;
  sites: DemoSite[];
}

export type DemoRole =
  | 'before'
  | 'progress'
  | 'after'
  | 'evidence'
  | 'exact-duplicate'
  | 'near-duplicate'
  | 'off-site'
  | 'no-exif';

export interface DemoPhoto {
  /** File name in demo-data/ (and the name it's uploaded under). */
  file: string;
  project: string;
  /** Upload to this site; omitted means "match from GPS", as the uploader offers. */
  site?: string;
  /** Capture time written to EXIF, in days before seeding. Omitted: no capture time. */
  daysAgo?: number;
  /** GPS written to EXIF. Omitted: no GPS. */
  at?: { lat: number; lng: number };
  role: DemoRole;
  /** What this photo demonstrates, for the README. */
  note: string;
  /** Downloaded from Wikimedia Commons, scaled to this width. */
  source?: { title: string; width: number };
  /** An exact duplicate: uploads the very same bytes as this other photo. */
  copyOf?: string;
  /** A near-duplicate generated from this other photo (scaled down and re-compressed). */
  derivedFrom?: string;
}

export const DEMO_ORG = {
  name: 'Jal Sahayog Foundation (demo)',
  admin: 'Asha Rao',
};

const RAMPUR: DemoSite = {
  key: 'rampur',
  name: 'Village Rampur',
  lat: 28.47,
  lng: 77.03,
  radiusM: 500,
};
const SOHNA: DemoSite = {
  key: 'sohna',
  name: 'Village Sohna',
  lat: 28.2475,
  lng: 77.066,
  radiusM: 600,
};
const DAMDAMA: DemoSite = {
  key: 'damdama',
  name: 'Village Damdama',
  lat: 28.305,
  lng: 77.125,
  radiusM: 500,
};
const BHONDSI: DemoSite = {
  key: 'bhondsi',
  name: 'Village Bhondsi',
  lat: 28.319,
  lng: 77.058,
  radiusM: 500,
};
const KHERKI: DemoSite = {
  key: 'kherki',
  name: 'Govt. Primary School, Kherki Daula',
  lat: 28.406,
  lng: 76.981,
  radiusM: 300,
};
const WAZIRABAD: DemoSite = {
  key: 'wazirabad',
  name: 'Govt. Middle School, Wazirabad',
  lat: 28.441,
  lng: 77.071,
  radiusM: 300,
};

export const DEMO_PROJECTS: DemoProject[] = [
  {
    key: 'water1',
    name: 'Clean Water for Gurugram Villages – Phase 1',
    description:
      'Borewells, hand pumps and rainwater storage for three villages in Gurugram district, so families no longer walk kilometres for drinking water.',
    startDaysAgo: 120,
    sdgGoals: [6, 5],
    csrCategory: 'Safe drinking water and sanitation',
    sites: [RAMPUR, SOHNA, DAMDAMA],
  },
  {
    key: 'water2',
    name: 'Clean Water for Gurugram Villages – Phase 2',
    description: 'Extending borewell water supply to Village Bhondsi.',
    startDaysAgo: 60,
    sdgGoals: [6],
    csrCategory: 'Safe drinking water and sanitation',
    sites: [BHONDSI],
  },
  {
    key: 'schools',
    name: 'Learning Spaces for Government Schools',
    description:
      'Repairing classrooms, adding rooftop solar power and rainwater harvesting at two government schools.',
    startDaysAgo: 150,
    sdgGoals: [4, 7],
    csrCategory: 'Education',
    sites: [KHERKI, WAZIRABAD],
  },
];

export const DEMO_PHOTOS: DemoPhoto[] = [
  // Phase 1: the story of one village's water, before → during → after.
  {
    file: 'rampur-01-before.jpg',
    project: 'water1',
    daysAgo: 85,
    at: { lat: 28.4708, lng: 77.0306 },
    role: 'before',
    note: 'Dry, unused land where the borewell went: the "before" of the before/after pair.',
    source: { title: 'File:Dry agricultural land.jpg', width: 960 },
  },
  {
    file: 'rampur-02-borewell-drilling.jpg',
    project: 'water1',
    daysAgo: 70,
    at: { lat: 28.4712, lng: 77.0309 },
    role: 'progress',
    note: 'Borewell drilling in progress.',
    source: {
      title:
        'File:Rig drilling known locally as Borewell for Water well drilling in operation in India.jpg',
      width: 960,
    },
  },
  {
    file: 'rampur-03-hand-pump.jpg',
    project: 'water1',
    daysAgo: 9,
    at: { lat: 28.4705, lng: 77.0296 },
    role: 'after',
    note: 'The new hand pump; the "after" of the before/after pair.',
    source: { title: 'File:An old Hand Pump at Yeleswaram.jpg', width: 960 },
  },
  {
    file: 'rampur-04-rainwater-tank.jpg',
    project: 'water1',
    daysAgo: 26,
    at: { lat: 28.4697, lng: 77.0312 },
    role: 'evidence',
    note: 'Rainwater storage tank. Later reused in Phase 2 (see the exact duplicate).',
    source: { title: 'File:Rainwater harvesting tank, India.jpg', width: 1280 },
  },
  {
    file: 'sohna-01-overhead-tank.jpg',
    project: 'water1',
    daysAgo: 55,
    at: { lat: 28.2481, lng: 77.0671 },
    role: 'evidence',
    note: 'Overhead water tank. A resized copy turns up in Phase 2 (see the near-duplicate).',
    source: {
      title: 'File:Overhead water tank rural Raichur Karnataka India water tower.jpg',
      width: 960,
    },
  },
  {
    file: 'sohna-02-hand-pump.jpg',
    project: 'water1',
    daysAgo: 8,
    at: { lat: 28.2469, lng: 77.0652 },
    role: 'evidence',
    note: 'A second hand pump, recently installed.',
    source: { title: 'File:Hand pump in Rajasthan, India.jpg', width: 1280 },
  },
  {
    file: 'sohna-03-no-metadata.jpg',
    project: 'water1',
    site: 'sohna',
    role: 'no-exif',
    note: 'No capture date or GPS at all: scored as "missing metadata" (unverified, not fake).',
    source: { title: 'File:Hand pump India.jpg', width: 1280 },
  },
  {
    file: 'offsite-pump.jpg',
    project: 'water1',
    daysAgo: 15,
    at: { lat: 28.84, lng: 77.03 },
    role: 'off-site',
    note: 'Taken about 41 km from the nearest project site: flagged for the wrong location.',
    source: { title: 'File:Water pump in Uttar Pardesh, India, 2014.jpg', width: 1280 },
  },
  // Phase 2: genuine photos, plus two that were reused from Phase 1.
  {
    file: 'bhondsi-01-borewell-lorry.jpg',
    project: 'water2',
    daysAgo: 50,
    at: { lat: 28.3196, lng: 77.0588 },
    role: 'progress',
    note: 'Drilling rig arriving at the site.',
    source: { title: 'File:Lorry,borewell,near kallakurichi,Tamil Nadu422.JPG', width: 1280 },
  },
  {
    file: 'bhondsi-02-borewell-field.jpg',
    project: 'water2',
    daysAgo: 40,
    at: { lat: 28.3184, lng: 77.0575 },
    role: 'evidence',
    note: 'The finished borewell pump. Nothing newer than 30 days, so the site shows a gap alert.',
    source: {
      title: 'File:Borewell pump and young crop field in Raichur, Karnataka, Raichur.jpg',
      width: 1280,
    },
  },
  {
    file: 'bhondsi-03-reused-tank.jpg',
    project: 'water2',
    role: 'exact-duplicate',
    note: 'The very same file as Phase 1’s rainwater tank photo: an exact duplicate across projects, and taken far from Bhondsi.',
    copyOf: 'rampur-04-rainwater-tank.jpg',
  },
  {
    file: 'bhondsi-04-tank-resized.jpg',
    project: 'water2',
    daysAgo: 30,
    at: { lat: 28.3193, lng: 77.0583 },
    role: 'near-duplicate',
    note: 'Phase 1’s overhead tank photo, scaled down and re-compressed: a near-duplicate (pHash).',
    derivedFrom: 'sohna-01-overhead-tank.jpg',
  },
  // Schools.
  {
    file: 'school-01-before.jpg',
    project: 'schools',
    daysAgo: 88,
    at: { lat: 28.4063, lng: 76.9814 },
    role: 'before',
    note: 'The school building at the start of the project.',
    source: { title: 'File:Government Primary School Janiyon ka Magra.jpg', width: 1280 },
  },
  {
    file: 'school-02-after.jpg',
    project: 'schools',
    daysAgo: 25,
    at: { lat: 28.4058, lng: 76.9807 },
    role: 'after',
    note: 'The school after repairs.',
    source: { title: 'File:Government Primary School Janiyon ka Magra 2.jpg', width: 1280 },
  },
  {
    file: 'school-03-rooftop-solar.jpg',
    project: 'schools',
    daysAgo: 18,
    at: { lat: 28.4407, lng: 77.0714 },
    role: 'evidence',
    note: 'Rooftop solar panels.',
    source: { title: 'File:Photovoltaic panels on a school building.jpg', width: 1280 },
  },
  {
    file: 'school-04-rainwater-pit.jpg',
    project: 'schools',
    daysAgo: 33,
    at: { lat: 28.4413, lng: 77.0706 },
    role: 'evidence',
    note: 'Rainwater harvesting pit.',
    source: { title: 'File:Rainwater harvesting pit in Hyderabad.jpg', width: 1280 },
  },
];
