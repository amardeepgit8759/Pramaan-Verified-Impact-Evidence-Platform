# Demo data

Real photos for the demo organisation that `pnpm seed:demo` creates. The seed uploads them
through the same API and Cloudinary pipeline as the app. It inserts no scores, metrics or
reports directly: everything you see is computed by Pramaan from these files.

## How the demo metadata works

The photos come from Wikimedia Commons (credits below). All of their original metadata was
removed when they were downloaded. When seeding, `seed-demo.ts` writes a capture date and
GPS position into each file, **relative to the day you seed**, so the demo always looks like
an ongoing project. The dates and places are illustrative, not where the originals were
taken. `sohna-03-no-metadata.jpg` is uploaded without any metadata on purpose.

## What each file demonstrates

| File | Project | Role | Captured | GPS | What it shows |
| ---- | ------- | ---- | -------- | --- | ------------- |
| `rampur-01-before.jpg` | Clean Water for Gurugram Villages – Phase 1 | **before** | 85 days ago | 28.4708, 77.0306 | Dry, unused land where the borewell went: the "before" of the before/after pair. |
| `rampur-02-borewell-drilling.jpg` | Clean Water for Gurugram Villages – Phase 1 | **progress** | 70 days ago | 28.4712, 77.0309 | Borewell drilling in progress. |
| `rampur-03-hand-pump.jpg` | Clean Water for Gurugram Villages – Phase 1 | **after** | 9 days ago | 28.4705, 77.0296 | The new hand pump; the "after" of the before/after pair. |
| `rampur-04-rainwater-tank.jpg` | Clean Water for Gurugram Villages – Phase 1 | **evidence** | 26 days ago | 28.4697, 77.0312 | Rainwater storage tank. Later reused in Phase 2 (see the exact duplicate). |
| `sohna-01-overhead-tank.jpg` | Clean Water for Gurugram Villages – Phase 1 | **evidence** | 55 days ago | 28.2481, 77.0671 | Overhead water tank. A resized copy turns up in Phase 2 (see the near-duplicate). |
| `sohna-02-hand-pump.jpg` | Clean Water for Gurugram Villages – Phase 1 | **evidence** | 8 days ago | 28.2469, 77.0652 | A second hand pump, recently installed. |
| `sohna-03-no-metadata.jpg` | Clean Water for Gurugram Villages – Phase 1 | **no-exif** | — | — | No capture date or GPS at all: scored as "missing metadata" (unverified, not fake). |
| `offsite-pump.jpg` | Clean Water for Gurugram Villages – Phase 1 | **off-site** | 15 days ago | 28.8400, 77.0300 | Taken about 41 km from the nearest project site: flagged for the wrong location. |
| `bhondsi-01-borewell-lorry.jpg` | Clean Water for Gurugram Villages – Phase 2 | **progress** | 50 days ago | 28.3196, 77.0588 | Drilling rig arriving at the site. |
| `bhondsi-02-borewell-field.jpg` | Clean Water for Gurugram Villages – Phase 2 | **evidence** | 40 days ago | 28.3184, 77.0575 | The finished borewell pump. Nothing newer than 30 days, so the site shows a gap alert. |
| (same bytes as `rampur-04-rainwater-tank.jpg`) | Clean Water for Gurugram Villages – Phase 2 | **exact-duplicate** | — | — | The very same file as Phase 1’s rainwater tank photo: an exact duplicate across projects, and taken far from Bhondsi. |
| `bhondsi-04-tank-resized.jpg` | Clean Water for Gurugram Villages – Phase 2 | **near-duplicate** | 30 days ago | 28.3193, 77.0583 | Phase 1’s overhead tank photo, scaled down and re-compressed: a near-duplicate (pHash). |
| `school-01-before.jpg` | Learning Spaces for Government Schools | **before** | 88 days ago | 28.4063, 76.9814 | The school building at the start of the project. |
| `school-02-after.jpg` | Learning Spaces for Government Schools | **after** | 25 days ago | 28.4058, 76.9807 | The school after repairs. |
| `school-03-rooftop-solar.jpg` | Learning Spaces for Government Schools | **evidence** | 18 days ago | 28.4407, 77.0714 | Rooftop solar panels. |
| `school-04-rainwater-pit.jpg` | Learning Spaces for Government Schools | **evidence** | 33 days ago | 28.4413, 77.0706 | Rainwater harvesting pit. |

Planted problems, and what Pramaan should do with them:

- **Exact duplicate across projects:** `bhondsi-03-reused-tank.jpg` is uploaded with the same
  bytes as Phase 1's rainwater tank photo. Both are flagged (a reused photo makes the original
  suspicious too). The seed then has the admin approve the Phase 1 original with a note, which
  shows the review workflow.
- **Near-duplicate:** `bhondsi-04-tank-resized.jpg` is Phase 1's overhead tank photo at half
  size and heavier compression. The perceptual hash still matches it.
- **Off-site:** `offsite-pump.jpg` is geotagged about 41 km from the nearest project site.
- **No EXIF:** `sohna-03-no-metadata.jpg` has no date or location. It's scored "missing
  metadata", which means unverified, not fake.
- **Documentation gaps:** Village Damdama never gets evidence, and Village Bhondsi's newest
  verified photo is older than the 30-day gap window.

## Credits

- `rampur-01-before.jpg`: [Dry agricultural land.jpg](https://commons.wikimedia.org/wiki/File:Dry_agricultural_land.jpg) by Karpagavarsini, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- `rampur-02-borewell-drilling.jpg`: [Rig drilling known locally as Borewell for Water well drilling in operation in India.jpg](https://commons.wikimedia.org/wiki/File:Rig_drilling_known_locally_as_Borewell_for_Water_well_drilling_in_operation_in_India.jpg) by Amrith Raj, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0).
- `rampur-03-hand-pump.jpg`: [An old Hand Pump at Yeleswaram.jpg](https://commons.wikimedia.org/wiki/File:An_old_Hand_Pump_at_Yeleswaram.jpg) by Adityamadhav83, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0).
- `rampur-04-rainwater-tank.jpg`: [Rainwater harvesting tank, India.jpg](https://commons.wikimedia.org/wiki/File:Rainwater_harvesting_tank,_India.jpg) by Spiritualfade, Public domain.
- `sohna-01-overhead-tank.jpg`: [Overhead water tank rural Raichur Karnataka India water tower.jpg](https://commons.wikimedia.org/wiki/File:Overhead_water_tank_rural_Raichur_Karnataka_India_water_tower.jpg) by Vraj Acharya, WELL Labs, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- `sohna-02-hand-pump.jpg`: [Hand pump in Rajasthan, India.jpg](https://commons.wikimedia.org/wiki/File:Hand_pump_in_Rajasthan,_India.jpg) by Deccantrap, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0).
- `sohna-03-no-metadata.jpg`: [Hand pump India.jpg](https://commons.wikimedia.org/wiki/File:Hand_pump_India.jpg) by Nikhilb239, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- `offsite-pump.jpg`: [Water pump in Uttar Pardesh, India, 2014.jpg](https://commons.wikimedia.org/wiki/File:Water_pump_in_Uttar_Pardesh,_India,_2014.jpg) by Bhaveshkumar855, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- `bhondsi-01-borewell-lorry.jpg`: [Lorry,borewell,near kallakurichi,Tamil Nadu422.JPG](https://commons.wikimedia.org/wiki/File:Lorry,borewell,near_kallakurichi,Tamil_Nadu422.JPG) by தகவலுழவன், [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0).
- `bhondsi-02-borewell-field.jpg`: [Borewell pump and young crop field in Raichur, Karnataka, Raichur.jpg](https://commons.wikimedia.org/wiki/File:Borewell_pump_and_young_crop_field_in_Raichur,_Karnataka,_Raichur.jpg) by User: Vraj Acharya, WELL Labs, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- `bhondsi-04-tank-resized.jpg`: derived from `sohna-01-overhead-tank.jpg` (scaled to half size and re-compressed), CC BY-SA 4.0.
- `school-01-before.jpg`: [Government Primary School Janiyon ka Magra.jpg](https://commons.wikimedia.org/wiki/File:Government_Primary_School_Janiyon_ka_Magra.jpg) by JaniyonKaMagraEditor, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0).
- `school-02-after.jpg`: [Government Primary School Janiyon ka Magra 2.jpg](https://commons.wikimedia.org/wiki/File:Government_Primary_School_Janiyon_ka_Magra_2.jpg) by JaniyonKaMagraEditor, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0).
- `school-03-rooftop-solar.jpg`: [Photovoltaic panels on a school building.jpg](https://commons.wikimedia.org/wiki/File:Photovoltaic_panels_on_a_school_building.jpg) by Z22, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- `school-04-rainwater-pit.jpg`: [Rainwater harvesting pit in Hyderabad.jpg](https://commons.wikimedia.org/wiki/File:Rainwater_harvesting_pit_in_Hyderabad.jpg) by Rajasekhar1961, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).

Photos under CC BY-SA are shared under the same licence, including the scaled-down copy.
To fetch them again: `pnpm demo:images`.
