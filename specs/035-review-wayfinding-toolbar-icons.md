# Spec035 — review wayfinding and compact toolbar icons

## Problem

Review markers displayed the message count inside each thread. New threads therefore all appeared as `1`, and selecting a marker focused the thread without restoring a visible highlight around its anchor. The toolbar also mixed text actions with platform-dependent arrow glyphs.

## Contract

- Current-version threads receive stable, document-order numbers (`1`, `2`, `3`); replies do not renumber a thread.
- The same number appears on the document marker and the corresponding inspector anchor.
- Selecting a marker highlights the original text/region, emphasizes the marker, opens the correct filter and focuses its thread.
- Missing or viewport-dependent anchors remain visible and keep their warning instead of disappearing.
- Reading, editing and review remain explicit text modes. Frequent actions use one compact, self-authored line-icon language with accessible names and tooltips.
- Apple Keynote informs hierarchy and density only. No Apple icon asset is copied.

## Acceptance

- Automated marker coverage verifies sequential numbering, resolved/missing retention, active state and authenticated click-through.
- Browser QA creates three independent comments and observes markers `1`, `2`, `3` plus matching inspector labels.
- Clicking marker `2` visibly outlines its source heading and focuses thread `2`.
- Full tests, audit, typecheck, both build bases and static closure budgets pass.

## Outside this slice

- Cloud identity, shared cursors, realtime collaboration and voice comments.
- Recreating every Keynote inspector or making ambiguous mode switches icon-only.
- Deployment or public repository push.
