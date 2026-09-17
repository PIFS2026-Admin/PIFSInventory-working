# TITAN RTS Integration Plan

## Resume Trigger

When the user says **"resume TITAN RTS integration"**, continue from this plan.

## Current Status

- Assessment is complete.
- Phase 1 acceptance-criteria foundation has been implemented in the workspace and awaits database migration/deployment.
- Criteria sets are separated by Drill Pipe, HWDP, and Subs, with draft/published/retired versions, controlled source documents, structured rules, and immutable report snapshots.
- No acceptance values were invented or seeded.
- Neither source Excel workbook was modified.
- Continue with Phase 1 verification and controlled criteria entry when work resumes, then begin Phase 2 automatic classification.

## Reference Workbooks

- Existing Pathfinder report: `C:/Users/Wade Wisenor/OneDrive - Pathfinder Inspections/Desktop/Blank Report.xlsx`
- RTS reference report: `C:/Users/Wade Wisenor/OneDrive - Pathfinder Inspections/Desktop/Blank DP Report RTS.xlsx`

## Non-Negotiable Requirements

- Preserve the existing Pathfinder Excel report and its original-format export exactly. RTS-inspired capabilities must not alter that template.
- Drill pipe, HWDP, and subs are separate inspections and separate reports.
- Center-pad fields apply only to HWDP.
- Optimize field entry for the crew's rack workflow: complete one end of every joint, then move to the other end.
- Report setup must accept a joint count and create the correct number of rows.
- OD gauge is a Yes/No value.
- Percent of nominal wall is automatically calculated from nominal wall and actual UT thickness.
- Each joint has an EMI Prove Up checkbox, and checked joints populate the EMI Prove Up sheet/register.
- Users with DTI access should have access to the complete DTI module.
- Field inspection must be offline-first and safely synchronize when connectivity returns.
- Audit/checklist content must support adding, deleting, and editing items.
- A job may be entered manually; selecting an existing job is not required.

## RTS Workbook Assessment

The RTS workbook contains 53 sheets: 20 visible and 33 hidden. It uses approximately 1.2 million formula cells, 137 data validations, 446 conditional-formatting rules, 104 defined names, and protection on 52 sheets.

Useful capabilities identified:

- API, DS-1, Class 2 Alternate, and customer-specific acceptance criteria.
- Automatic tube, pin, box, tool-joint, and final-joint classifications.
- Class 1-4, premium, DBR, NI, NC, and previous-downgrade handling.
- Approaching-downgrade lists.
- Leading-cause and detailed downgrade summaries.
- Percent remaining body-wall and tool-joint service-life summaries.
- Field-ready counts.
- Filtered joint views and serial-number validation.
- NI/NC exception reports.
- Field reface tracking and reports.
- Hardband tracking and reports.
- Machine-shop lifecycle tracking.
- Pre-job and post-job reconciliation.
- Field ticket pricing, discounts, taxes, and signatures.
- Split tickets for up to ten wells.
- Invoice and accounting-import exports.
- Protected input/calculation cells and controlled print areas.

## Items Not To Copy Directly

- The RTS workbook has at least 12,040 formulas containing `#REF!` and 35,047 cached `#VALUE!` results.
- It contains four stale links to external local files.
- Its roughly 540-column joint sheet and million-formula architecture should not be reproduced in TITAN.
- Proprietary RTS/CertaTrack branding and proprietary formulas must not be copied.
- Rebuild useful behavior using TITAN's own data model and maintainable rules.

## Recommended Roadmap

### Phase 1: Criteria Engine

- Create a central, versioned criteria model for API, DS-1, Class 2 Alternate, and customer-specific limits.
- Keep criteria separate from inspection readings and report rendering.
- Record which criteria version graded every report.
- Define separate schemas for drill pipe, HWDP, and subs.

### Phase 2: Automatic Classification

- Calculate tube, pin, box, tool-joint, and final-joint classifications.
- Show the reason for every downgrade or exception.
- Support Classes 1-4, premium, DBR, NI, NC, and previous downgrade where applicable.

### Phase 3: Quality Summaries

- Add downgrade and approaching-downgrade summaries.
- Add NI/NC exception reporting.
- Add remaining-wall, tool-joint-life, leading-cause, and field-ready summaries.

### Phase 4: Field Registers

- Add filtered joint registers and serial validation.
- Preserve the pin-side/box-side rack workflow.
- Support quick entry, keyboard/touch navigation, autosave, and offline operation.

### Phase 5: Repair Lifecycles

- Add reface, hardband, and machine-shop tracking as separate lifecycle records.
- Keep initial findings, repair actions, and final disposition auditable.

### Phase 6: Reconciliation

- Add pre-job/post-job counts and discrepancy resolution.
- Preserve history rather than overwriting prior states.

### Phase 7: Commercial Features

- Evaluate optional field tickets, split tickets, pricing, discounts, taxes, signatures, and invoice/accounting exports.
- Keep these separate from the inspection data model so they can be enabled only where needed.

### Phase 8: Reporting

- Add an enhanced TITAN report package as an optional output.
- Preserve the existing original-format Pathfinder Excel export without changes.
- Maintain print/PDF output and exact field mappings for each equipment type.

## Offline Architecture Direction

- Store active reports, criteria, lookup values, and unsynchronized edits locally on the device.
- Queue create/update/delete operations while offline.
- Assign stable client-generated IDs so records and attachments can be created without a server connection.
- Display sync state and unresolved conflicts clearly.
- Use version checks and an audit log to prevent silent overwrites.
- Cache only the jobs and reference data needed for field work, while still allowing manual job entry.
- Test interrupted sync, duplicate submissions, device restarts, and long offline periods.

## First Action When Resuming

Install and verify `supabase/titan_dti_acceptance_criteria.sql`, enter approved acceptance rules from controlled source documents, and test report snapshots for Drill Pipe, HWDP, and Subs. Then begin Phase 2 automatic classification without changing the existing Excel export template.
