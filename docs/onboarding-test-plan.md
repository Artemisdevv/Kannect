# Real-shelf onboarding test plan

**Status: plan only; no timed onboarding result is claimed.** This is a task-based prototype test, not a shopkeeper interview or a representative study. Issue [#40](https://github.com/Artemisdevv/Kannect/issues/40) sets the target: onboard 50 items from a real shelf in under 30 minutes. Existing onboarding documentation explicitly says the workflow has not yet been validated with real shops and that interviews have not been done. [Project onboarding assumptions](./onboarding.md)

## Test question

Can one first-time operator use the current Kannect retailer prototype to add **50 distinct sellable product variants** visible on a real shelf, with each entry saved, in **less than 30:00 elapsed time**?

This measures the prototype task only. It does not establish retailer demand, shopkeeper behavior, market adoption, or a population-level completion time. A teammate/family member may run the first test on a home pantry; a shop may be used only with the owner’s permission, as allowed by issue #40.

## Roles and equipment

- **Participant:** one person unfamiliar with the Kannect onboarding flow. Record their role using a code (for example, P01); do not record their name in the results file.
- **Observer/timekeeper:** reads the task verbatim, starts/stops the timer, counts taps, and records help or failures. Do not coach unless the participant asks for help.
- **Device:** the same supported phone, app build, network connection, and scanner configuration throughout the run. Record device model, OS, app version/commit, and test environment before starting.
- **Shelf:** a real home pantry or shop shelf containing at least 50 distinct product variants. One SKU/brand/variant is one item; duplicate packs are the on-shelf quantity for that item, not additional distinct items.
- **Ground-truth list:** observer prepares a private 50-row list before the session with the visible product identity (brand, product, variant/size) and visible quantity. Keep it out of the participant’s view until the task is finished.

## Safety and privacy checks

1. Use a test shop/account or a disposable inventory. Do not overwrite a live shop catalogue or inventory.
2. Obtain permission before photographing any shop shelf. Frame out people, faces, receipts, addresses, and unrelated personal information. For a home pantry, get the household’s permission.
3. Tell the participant that the prototype is being tested, not them; participation is voluntary and they may stop at any time. Do not ask interview questions or invent quotes.
4. Store only the anonymized participant code, test metadata, timing/tap measurements, item-level accuracy, and permitted test photos. Follow the project’s applicable data-retention/privacy policy for any photos.

## Before the participant arrives

- [ ] Confirm the current build can take shelf photos, show a review/confirmation list, use barcode-scan fallback, and save inventory. These are the intended project flow; if a step is absent in the build, record it as unavailable rather than pretending it worked. [Project onboarding flow](./onboarding.md)
- [ ] Prepare a clean test account and confirm no old items are preloaded.
- [ ] Select one shelf area with 50 distinct product variants visible from the front. Do not hide or rearrange labels to make recognition easier.
- [ ] Prepare the private ground-truth list and mark duplicate physical units as quantity.
- [ ] Check camera, network, barcode scanner, permissions, and that the timer is ready.
- [ ] Open the blank results template at the end of this document. Keep the 50-item ground-truth list hidden from the participant.

## Session protocol (30-minute cap)

Before timing, obtain permission, read the task/privacy note, and make sure the app is open at the starting screen. Start the clock at the participant’s first in-app action for adding shelf inventory. Keep it running through image processing, corrections, scans, retries, and saving. Do not pause it for normal app delays or participant actions. Record external interruptions separately; do not subtract them from elapsed time.

| Elapsed window | Action | Observer records |
|---|---|---|
| 00:00–02:00 | Participant starts from the retailer inventory/onboarding screen and begins setup. | Start time; first app action; any clarification requested. |
| 02:00–07:00 | Participant photographs and submits the shelf using the app’s supported photo flow (up to six photos if the build supports it). | Photo count, retakes, taps, errors, processing time. |
| 07:00–20:00 | Participant reviews the generated list, accepts correct rows, edits/swaps wrong products or quantities, and continues until the 50 target variants are represented. | Taps; accepted, edited, duplicate, missing, and uncertain rows; help requested. |
| 20:00–27:00 | Participant uses the available barcode-scan/add flow for unrepresented items and corrects quantities. | Scan attempts, successful scans, manual steps, unresolved items. |
| 27:00–30:00 | Participant saves. Observer checks that saved entries persist in the test inventory, then stops the clock. | Save completion, saved count, crashes/timeouts, finish time. |

The windows are checkpoints, not claims that the task will fit them. If the participant is still working at 30:00, stop the task, record the run as not completed under the target, and preserve the partial results. Do not rush the participant or silently finish entries for them.

### Verbatim task prompt

> Please add the products visible on this shelf to the test inventory. Use the photo flow and any scan or correction options available in the app. Enter the visible quantity for each product. Work as you normally would; I will observe but won’t guide you unless you ask. Stop when all 50 different products are saved or when 30 minutes have passed. You can stop at any time.

## Measurements and scoring

Record actual observations only; leave a field blank if it was not observed.

- **Elapsed time:** first app action through confirmation that the saved inventory contains the entries; report `mm:ss`.
- **Completion:** number of the 50 ground-truth product variants represented in the saved inventory at the deadline.
- **Tap count:** each intentional screen tap by the participant from task start through save, including retakes, back navigation, correction, and scan actions. Do not count observer touches or hardware-button presses. Count a multi-tap/long-press as one tap and document the rule if the prototype requires otherwise.
- **Identity correctness:** compare saved brand + product + variant/size with the private ground-truth list. Count exact variant mismatches separately from missing/extra entries. A correct brand with the wrong variant is not an exact identity match.
- **Quantity correctness:** compare saved quantity with the visible ground-truth quantity. Report the number exact and the absolute difference; do not infer hidden stock behind front-facing products.
- **Fallback and intervention:** record scans, scan retries, manual additions, participant-requested help, observer help, app errors, and any items left unresolved.
- **Data integrity:** verify entries persisted, and check for duplicates, entries absent from the shelf, and any unintended writes to a real inventory.

### Decision rule

- **Time-target pass:** all 50 distinct target variants are saved by the participant before 30:00.
- **Time-target miss:** fewer than 50 are saved at 30:00, the participant stops early, or a blocking failure prevents completion.
- **Report quality separately:** exact product/variant accuracy, exact quantity accuracy, taps, fallback use, and failures. A time-target pass does not imply that the saved inventory is accurate.

One run is a pilot result for that participant, shelf, device, and build only. Report the exact `n`, task completion count, and context. Do not generalize it to shopkeepers or all Kerala retailers; no shopkeeper interviews have been conducted. [Issue #40](https://github.com/Artemisdevv/Kannect/issues/40), [project constraint](./onboarding.md)

## Blank result record

Do not fill this with expected or illustrative values. Duplicate the item row until all 50 ground-truth products are recorded; if the run ends early, retain the uncompleted rows as not completed.

**Session metadata**

| Field | Observed value |
|---|---|
| Participant code / role | |
| Date and location type (home/shop) | |
| Permission obtained (yes/no/not applicable) | |
| Device / OS | |
| App version or commit / test environment | |
| Start / stop time; total elapsed (`mm:ss`) | |
| Distinct products saved by deadline (`/50`) | |
| Participant taps | |
| Completed under 30:00 (yes/no) | |
| Exact identities (`/50`) / exact quantities (`/50`) | |
| Scans / retries / manual additions | |
| Help requested / provided | |
| Errors, timeouts, duplicates, unintended writes | |

**Item-level record template**

| Item # | Ground truth: brand / product / variant-size | Visible qty | Saved identity | Saved qty | Exact identity? | Exact qty? | Photo/scan/manual | Notes |
|---:|---|---:|---|---:|---|---|---|---|
| 1 | | | | | | | | |

## Source trail

- [GitHub issue #40](https://github.com/Artemisdevv/Kannect/issues/40): real-shelf test setting, 50-item scope, under-30-minute target, and no invented quotes.
- [Project onboarding flow and validation constraint](./onboarding.md): photo review, scan fallback, save path, and explicit status that no shopkeeper interviews or real-shop validation have yet been done.
- [Shelf evaluation results and scoring procedure](./vision-results.md): current shelf-photo pipeline limitations and the existing evaluation harness; shelf identification accuracy and onboarding completion time are separate measures.
