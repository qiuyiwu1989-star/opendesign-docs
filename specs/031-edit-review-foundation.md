# Spec031 — Edit and review foundations

User approved the next local iteration after reporting incomplete long-document editing, absent saved comment markers and no review export. Production remains frozen for trial. No deployment or GitHub push in this task.

## This implementation slice

- Adapt Bento's numbered comment-button rendering into our opaque-origin preview, with upstream attribution. Keep our immutable version/anchor model, not Bento's Store or collaboration transport.
- Persisted comments appear as compact numbered buttons; resolved comments remain identifiable. Clicking a marker opens its existing thread. Re-render on scrolling/resizing without changing the document. Unavailable anchors must not pretend to be precisely located.
- Export the selected saved version as content, or a portable read-only review HTML with that version's saved comments and markers. Original scripts never execute inside the review viewer. No unsubmitted text, other versions or cloud collaboration claims. Clearly distinguish safe review rendering from original-source HTML export.
- Expand long-document text targets to direct text runs inside mixed markup, without flattening surrounding tags. Preserve old leaf IDs so existing review anchors remain valid. This is segmented text editing, not arbitrary rich-text restructuring.
- Close the same ready-message race for the long-document iframe as spec030 fixed for slides.

## Acceptance

Targeted source/anchor/security tests, full regression and unchanged bundle budgets, then one consolidated browser check: mixed text + formatting preservation; save/reload; add marker/reply/resolve/reload; selected-version export; actual downloaded file and independent read-only viewer. Preserve all user documents and existing preview tabs.

## Following slices in the approved scope

Long-document image/object tools and block reordering; contextual insertion/style controls; bounded Moveable/Selecto integration trial on representative HTML. Do not mix these into comment persistence or prematurely replace the document model. Track actual reuse vs original adapter code in NOTICE and acceptance records.
