# Demo script (4 minutes)

A walkthrough for presenting Pramaan live. It covers the full journey: a photo taken on a
phone, scored live on a laptop, a reused photo caught, a review, a report where every
sentence opens its evidence, the PDF, and the funder link.

## Before you start (10 minutes, once)

1. **Seed the demo organisation** against the deployment:
   `SEED_BASE_URL=https://<your-app> pnpm seed:demo`. Note the email and password it prints.
2. **Laptop:** sign in and leave the **Dashboard** open. In a second tab, open
   _Clean Water for Gurugram Villages – Phase 1 → Evidence_.
3. **Add a site where you're standing,** so the phone photo is taken on site. In Phase 1,
   go to **Sites → Add site**, name it "Demo venue", press **Use my current location**, and set the
   radius to 300 m.
4. **Phone:** under **Settings → Team**, invite yourself as _Field staff_ and open the
   invite link on the phone. Keep Phase 1 → Evidence open there too.
5. **Have a reused photo ready.** In Phase 1, open the rainwater tank photo, open its
   **Cloudinary** link in the details, and save the image. This file has exactly the bytes
   Cloudinary stored.
6. Close notifications and zoom the laptop browser to 110%.

> Some phones strip location from photos uploaded through a browser. If that happens, the
> photo scores 85 with "No GPS location… unverified, not necessarily fake". That's worth
> showing too.

## The script

**0:00 · The problem (20 s)**

> "NGOs are funded on photos: the borewell, the classroom, the solar roof. Funders get
> thousands of them and can't tell which are genuine, reused from another project, or
> taken somewhere else. Pramaan checks every photo and writes reports where every sentence
> links back to the photo that proves it."

Point at the dashboard: the evidence total, the share verified, the items waiting for
review and the sites with documentation gaps. "Every number here comes from the evidence. Nothing is typed in."

**0:20 · Upload from the phone (30 s)**

On the phone, tap **Take a photo** and photograph something nearby.

> "The photo goes straight to Cloudinary with a signed upload. Our server then re-reads
> the file from Cloudinary (its fingerprint, perceptual hash, GPS and capture time) and
> never trusts what the phone claims."

The phone shows _Verifying…_, then **Verified · 100**.

**0:50 · Live on the laptop (20 s)**

Turn to the laptop. Without a refresh, _Total evidence_ ticks up by one, the uploads chart
moves, and the activity feed says "New asset verified in Clean Water… Phase 1".

> "Server-Sent Events: the whole team sees evidence arrive."

**1:10 · Catch a reused photo (45 s)**

On the laptop, open **Phase 2 → Evidence** and drop in the rainwater tank photo you
downloaded.

It lands as **Flagged · 0**. Open it:

- _Exact copy · −60_: "Exact copy of an asset in Clean Water… Phase 1". The etag matches
  byte for byte.
- _Location · −40_: taken 17 km from Village Bhondsi.

> "A reused photo makes the original suspicious too, so both are flagged. And resizing
> doesn't help."

Open the overhead tank photo in Phase 2: a half-size, re-compressed copy caught as a
_Near-copy_: its Cloudinary perceptual hash differs by only a few of 64 bits.

**1:55 · Review (25 s)**

Go to **Phase 1 → Review**. The original tank photo is waiting, with the reason spelled out.
Press **Approve** without a note to show that a note is required. Then type "Taken by our
team at Rampur; Phase 2 reused it" and approve.

> "Approval makes it usable in reports, but the score stays 40 and the decision is on the
> record, in the app and in the PDF annex."

**2:20 · A report that proves itself (45 s)**

Go to **Phase 1 → Reports → Generate report** and choose **Generate**. The card shows
_Writing…_, then turns **Ready** on its own.

Open it and click a sentence, such as "Village Rampur was photographed… and again…". The
side panel shows the before and after photos with their Trust Scores and every check.

> "Gemini only sees verified evidence. Any sentence that doesn't cite it is removed; here
> one was, and the report says so. It never claims legal compliance: it's aligned to the
> SDG and CSR categories."

Click **Download PDF** and scroll it briefly: the cover, the numbered statements with
[E1, E2] references, thumbnails, and the evidence annex with every file's link, score,
failed checks and review note.

**3:05 · Share with a funder (35 s)**

Go to **Phase 1 → Share → Create link**; it's copied. Open it in a private window:

> "No account needed. The funder sees verified evidence only, the map, the numbers and
> the report. Nothing can be changed, and the link expires."

Show **Compare** on the laptop for a moment: dry land, then the new hand pump, with a
side-by-side image built by Cloudinary.

**3:40 · Close (20 s)**

> "Cloudinary does the heavy lifting: signed uploads, etag and perceptual hashes,
> embedded metadata, auto-tagging, and transformations for thumbnails, the before/after
> composite and the PDF. Pramaan turns that into proof. We don't just organise evidence;
> we prove it's genuine, and every claim links back to a photo."

## If something goes wrong

| Symptom                              | What to do                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Phone photo shows "missing metadata" | The phone stripped location. Say so and use it: unverified, not fake.                 |
| Report shows "couldn't be generated" | Gemini quota or network. Press **Try again**; there is also the report the seed made. |
| Dashboard not updating               | Check the dot next to "Live" in the sidebar; reload once.                             |
| Upload rejected                      | The format isn't allowed (phones' JPEG, HEIC, MP4 and MOV are).                       |
