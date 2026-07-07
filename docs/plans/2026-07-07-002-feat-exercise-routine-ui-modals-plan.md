---
title: Exercise & Routine UI Pop-ups and Validation - Plan
type: feat
date: 2026-07-07
topic: exercise-routine-ui-modals
execution: code
---

# Exercise & Routine UI Pop-ups and Validation - Plan

## Goal Capsule

- **Objective:** A batch of UI/UX refinements to the exercise and routine editors — introduce a reusable modal primitive, convert several inline "add" flows into pop-ups, require an explicit category on new exercises (client + server validation), expand the move-unused alert with a details view, and add back navigation to the routine detail page.
- **Execution profile:** Local development, single implementer. Work is split into discrete tasks intended to be handed to subagents; several tasks edit the same files, so ordering and worktree isolation matter (see Sequencing).
- **Definition of done:** Every task ends with `npm run typecheck` and `npm test` green, and preserves the existing Tailwind visual language (gray borders, `text-sm`, blue-600 action links).

## Context / Current State

- There is **no modal/dialog component** in the repo today — all "add" affordances are inline inputs or full routes. Four of the seven changes need a pop-up, so a shared primitive is built first.
- Add/edit exercise is a full route: `src/routes/exercises/$exerciseId.tsx`, with the `new` param branch handling creation. Category defaults to `categories[0]?.id` (i.e. "Abs").
- The move-unused flow (`src/routes/exercises/index.tsx`) only fetches a **count** via `countUnusedExercisesFn`. An internal helper `listUnusedCandidates` in `exercises.server.ts` already returns `{ id, name, categoryName }[]` but is not exported.
- The routine detail page (`src/routes/routines/$routineId.tsx`) has no back link, and its per-section "add exercise" is an inline `<select>` + button.

## Tasks

### Task 0 — Reusable Modal component (blocking dependency for Tasks 2, 4, 5, 6)

- **New file:** `src/components/Modal.tsx`.
- Controlled component: props `{ open, onClose, title, children }`.
- Fixed full-screen overlay (`fixed inset-0 z-50`), semi-transparent backdrop, centered white panel (`max-w-md rounded bg-white p-6 shadow-lg`). Header with `title` and an `×` close button.
- Closes on: backdrop click, Escape key, `×` button. Does **not** close on clicks inside the panel.
- No new dependencies — plain React + Tailwind, consistent with the codebase.
- **Acceptance:** Renders nothing when `open` is false; the three close paths all fire `onClose`; inner clicks do not.

### Task 1 — Move-unused alert lists all items behind a "Show details" toggle

- **Files:** `src/server/functions/exercises.server.ts`, `src/server/functions/exercises.ts`, `src/routes/exercises/index.tsx` (alert block, lines ~254–282).
- Export `listUnusedExercises()` in `exercises.server.ts`, reusing `listUnusedCandidates` + `findUnusedCategoryId`; wrap as `listUnusedExercisesFn` (GET) in `exercises.ts`.
- In `handlePreviewMoveUnused`, fetch the list instead of the count (count = `list.length`). Keep the existing summary sentence.
- Add a **"Show details"** toggle (a `<details>` or button-driven state) that expands a `<ul>` of every candidate, each showing the resulting prefixed name (e.g. `Abs - Incline Crunch`).
- **Acceptance:** Alert still shows the count and confirm/cancel; expanding details lists exactly the candidates that would be moved.

### Task 2 — "Add exercise" as a pop-up instead of a full page (depends on Task 0)

- **Files:** `src/routes/exercises/index.tsx`, `src/routes/exercises/$exerciseId.tsx`, new `src/components/ExerciseForm.tsx`.
- Extract the form body of `$exerciseId.tsx` (fields + save/error handling, lines ~55–109) into a shared `ExerciseForm` component: props `{ exercise?, categories, defaultCategoryId?, onSaved, onCancel }`.
- Replace the top-right `+ Add exercise` **Link** (index.tsx lines ~231–233) with a button that opens a Modal containing `ExerciseForm` in create mode; on save → `router.invalidate()` + close.
- **Keep edit on its existing route** — clicking an exercise name still navigates to the full edit page; only _add_ becomes a modal. The route's `new` branch may remain for deep-linking but the primary add flow is the modal.
- **Acceptance:** Adding an exercise never leaves the list page; the edit route still works unchanged.

### Task 3 — Require an explicit category; no "Abs" pre-fill; client + server validation

> Pairs with Task 2's shared `ExerciseForm`. If Task 2 lands first, apply here; otherwise apply to `$exerciseId.tsx` directly and carry into the extracted form.

- **Files:** `src/components/ExerciseForm.tsx` / `src/routes/exercises/$exerciseId.tsx`, `src/server/functions/exercises.server.ts`, `src/server/functions/exercises.ts`, `src/server/functions/exercises.server.test.ts`.
- **Client:** for a new exercise, `categoryId` starts _unset_ (remove the `categories[0]?.id` default at line ~26). The `<select>` gets a disabled placeholder option (`Select a category…`, empty value). Block save + show inline error when no category is chosen; disable Save until valid.
- **Server:** in `createExercise` and `updateExercise`, after the name check, throw `Category is required.` when `categoryId` is missing and `Category not found.` when the id doesn't exist in `Category`. Loosen `ExerciseInput.categoryId` typing so the unset state crosses the boundary and the server check is the real gate.
- **Tests:** add cases for missing category and non-existent category, following existing conventions (`setupTestWorkingDb`, per-fn dynamic imports).
- **Acceptance:** Saving with no category fails on both client (blocked/inline error) and server (thrown error); tests cover both server cases.

### Task 4 — "Add exercise" in the category `•••` menu (depends on Tasks 0 & 2)

- **File:** `src/routes/exercises/index.tsx` (category menu, lines ~390–416, currently Edit/Delete only).
- Add an **"Add exercise"** item that opens the same `ExerciseForm` Modal with `defaultCategoryId` = that category's id (pre-selected but still editable). On save → invalidate + close.
- **Acceptance:** Launching from a category's menu opens the modal with that category preselected; saving adds the exercise to it.

### Task 5 — New-category section restyled as a `+ New category` button that opens a pop-up (depends on Task 0)

- **File:** `src/routes/exercises/index.tsx` (sidebar block, lines ~330–341).
- Remove the inline input + "Add" button. Replace with a button styled like the `+ Add exercise` link (`text-sm text-blue-600`, label e.g. `+ New category`) that opens a Modal with a single name field (optionally the color picker) + Save.
- Reuse existing `handleAddCategory` logic (`createCategoryFn`, `colour: 0`). Remove now-unused inline `newCategoryName` state if fully replaced.
- **Acceptance:** No inline add field remains in the sidebar; creating a category happens in the modal and refreshes the list.

### Task 6 — Routines per-section "add exercise" restyled to a pop-up (depends on Task 0)

- **File:** `src/routes/routines/$routineId.tsx` (`SectionCard`, lines ~229–244).
- Replace the inline `<select>` + `+ Add exercise` button with a `+ Add exercise` button (styled like the exercises page) that opens a Modal listing the section's available exercises (searchable list or select) with a confirm action calling the existing `addExerciseToSectionFn`. Remove the redundant `pickedExerciseId` inline pattern in favor of the modal's local selection.
- **Acceptance:** Adding an exercise to a section happens through the pop-up; the section refreshes afterward.

### Task 7 — Back navigation in the routine detail view (independent)

- **File:** `src/routes/routines/$routineId.tsx` (`RoutineDetailPage`, around lines ~41–43).
- Add a `← Back` Link to `/routines` above/next to `RoutineHeader`, matching the app's `text-sm text-blue-600` link style.
- **Acceptance:** A back link returns to the routines list.

## Sequencing

- **Wave 1:** Task 0 (Modal). Tasks 1, 3, and 7 are independent of the Modal and can run in parallel with Task 0.
- **Wave 2 (after Modal + shared `ExerciseForm`):** Task 2 → then Task 4 (reuses the form/modal from 2). Tasks 5 and 6 depend only on the Modal and can run parallel to 2/4.
- **Merge caution:** Tasks 1, 2, 3, 4, 5 all edit `src/routes/exercises/index.tsx`; Tasks 2 and 3 both touch `$exerciseId.tsx`/the shared form. Run these sequentially or on separate worktrees — not as blind parallel writers to the same files. Task 6, Task 7 (routines files), and the server-side work are safely parallel.

## Verification

- `npm run typecheck` and `npm test` must be green after each task.
- New server validation (Task 3) is covered by unit tests in `exercises.server.test.ts`.
- UI changes verified in the running dev app where practical (add-exercise modal, category modal, routine add-exercise modal, back link, move-unused details).
