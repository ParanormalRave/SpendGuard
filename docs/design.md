# SpendGuard design system

Save this file as `docs/design.md`. It is the single source of truth for how the frontend looks and reads.

**For coding agents:** read this file before building or changing any UI. If a component you write conflicts with this file, this file wins. Do not invent colors, fonts, radii or copy that are not defined here. If something you need is missing, stop and ask the human.

**Status:** version 2. Version 1 set the palette, typography, the leash gauge and the writing rules. Version 2 adds the authenticated application shell, the dashboard and activity structure, and the allowed layering (two surfaces, one accent wash, a subtle glow), following `docs/ui-redesign-spec.md`. Palette values, radius roles, status semantics and every functional rule are unchanged. Build with the tokens below so a change is a one-file edit.

---

## 1. Subject, audience and job

- **Product:** a control panel that lets an owner give an AI agent a spending allowance that the Solana blockchain enforces.
- **Audience:** a developer or founder who is nervous about letting an AI touch money, and hackathon judges who will look at it for about three minutes.
- **Primary job of the interface:** make the owner feel in control. At any moment they should see how much the agent may still spend, whether anything unusual happened, and how to stop it.
- **Tone:** calm, exact, plain. This is a safety tool, so it never shouts unless something is wrong.

## 2. References (confirm)

Pinterest board: https://pin.it/2I4V32tCO

Things to confirm after the picks are reviewed:

- Accent hue (the violet below is a starting point)
- Flat panels with borders, or glass and blur
- Density: roomy or compact
- Whether a light theme is wanted. Version 1 is dark only.

## 3. The one memorable thing: the leash gauge

Everything else is quiet so this can stand out. The **leash gauge** is a horizontal bar that shows how much of the agent's spending window has been used.

- A thick, rounded track. The filled part is `spent_in_window / window_limit`.
- A small notch on the track marks the per-transaction limit, scaled to the same axis.
- Fill color: violet below 80 percent, amber from 80 to 99 percent, red at 100 percent.
- A text line under it states the facts: `0.12 of 0.2 SOL spent. Resets in 5h 12m.`
- It appears three times: large in the landing hero (with sample data), large on the dashboard, and small on the policy list.
- The fill animates when the value changes. It does not animate on page load.

Use no shield icons, padlocks or glowing orbs anywhere. The product's own gauge is the visual identity.

## 4. Color

Dark theme. Tokens live in `src/app/globals.css` as CSS variables, mapped into the Tailwind theme. Never write a hex value inside a component.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0F1424` | Page background |
| `--panel` | `#171E33` | Raised surfaces |
| `--line` | `#2A3354` | Borders and dividers |
| `--paper` | `#E8ECF8` | Primary text |
| `--muted` | `#8F9AC0` | Secondary text |
| `--leash` | `#7C6CFF` | Brand accent: gauge fill, links, focus ring |
| `--leash-strong` | `#5B4BFF` | Primary button background (white text) |
| `--allowed` | `#2FD2A4` | Success and allowed |
| `--caution` | `#F4B740` | Warnings and pending |
| `--blocked` | `#FF5C6C` | Rejected, critical, paused |

```css
:root {
  --ink: #0f1424;
  --panel: #171e33;
  --line: #2a3354;
  --paper: #e8ecf8;
  --muted: #8f9ac0;
  --leash: #7c6cff;
  --leash-strong: #5b4bff;
  --allowed: #2fd2a4;
  --caution: #f4b740;
  --blocked: #ff5c6c;
}
```

Rules:

- Status colors only mean status. Never use green, amber or red for decoration.
- Color is never the only signal. Every status also has an icon and a word.
- Layering is allowed only where section 6 names it: two surface levels, one accent wash, and a subtle glow on the gauge. Never a decorative gradient on text, status or buttons.

## 5. Typography

Two families plus a monospace for data.

| Role | Font | Notes |
|---|---|---|
| Headings, big numbers | Bricolage Grotesque | Weight 600. Use for the hero line, page titles, gauge numbers, countdowns. |
| Interface and body text | Instrument Sans | Weights 400 and 600. |
| Addresses and signatures only | JetBrains Mono | Never for labels or ordinary numbers. |

Load them with `next/font/google`. If one is unavailable, fall back in this order: Bricolage Grotesque to Instrument Sans to system sans.

Scale (rem): 0.8125, 0.9375, 1, 1.25, 1.625, 2.25, 3.25. Body is 1rem with a line height of 1.5. Keep line length under 70 characters. Numbers use tabular figures (`font-variant-numeric: tabular-nums`) so amounts line up.

Sentence case everywhere. Do not use all-caps labels, tracked-out small caps, or eyebrow text above headings.

## 6. Layout, shape, depth

- **Two layouts.** The landing page uses its own header and a centered column. The three application pages (`/create`, `/dashboard`, `/activity`) use the authenticated shell: a 264px sidebar, a 64px top bar and a content column capped at 1100px.
- **Sidebar:** the logo mark and wordmark, then Dashboard, Policies, Alerts, Transactions and Settings. The active item is marked by a `--leash` rail and `--paper` text; the other items are `--muted`. Settings opens a sheet, not a page.
- **Top bar:** the current page title on the left; a `Devnet` pill, the alert bell and the wallet button on the right. Below 1024px the sidebar becomes a drawer, opened from a menu button in the top bar.
- **Landing header:** wordmark on the left, `Devnet` pill, bell and wallet button on the right. No sidebar.
- The wordmark is the text `SpendGuard` in Bricolage Grotesque, with a short horizontal line segment to its left as a tether mark. No shield.
- Left aligned. A section heading and its one-line context sit above the panel they describe, not inside a header bar.
- Do not chop the dashboard into a grid of identical cards. Use one large panel for the policy and the gauge, then sections separated by `--line` dividers, with at most two secondary panels side by side.
- **Radius by role:** large panels 20px, inputs and buttons 10px, pills fully round, address chips 6px. Do not use one radius for everything.
- **Depth:** two surface levels (`--panel` and `--surface-raised`) plus 1px `--line` borders. A subtle `--s-panel` shadow may separate a floating layer (drawer, sheet, dropdown, toast). No drop shadows on ordinary page sections.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 72.

## 7. Components

| Component | Spec |
|---|---|
| Button, primary | `--leash-strong` background, white text, 10px radius, 44px minimum height. Label says what happens: `Create policy`, `Request withdrawal`. |
| Button, secondary | Transparent, 1px `--line` border, `--paper` text. |
| Button, danger | `--blocked` text and border on transparent. Used for `Pause agent`. |
| Input | `--panel` background, 1px `--line` border, focus ring in `--leash`. Amount fields show a `SOL` suffix and a muted helper line with the lamport value. |
| Status pill | Icon, word and color: `Active` (allowed), `Paused` (blocked), `Pending` (caution). |
| Address chip | Mono, shortened to the first 4 and last 4 characters with an ellipsis, copy button, full address in a tooltip. |
| Leash gauge | As described in section 3. |
| Recipient list | Plain rows with dividers. A muted note: `Recipients can be added but never removed.` |
| Pending withdrawal card | `--caution` border. Large countdown in Bricolage Grotesque. `Cancel withdrawal` is the visually strongest button here. `Release` is disabled until the countdown reaches zero. |
| Activity row | Icon (check or cross), a plain sentence, amount, time, and a Solana Explorer link for successful payments. Blocked rows show the reason in plain language. |
| Alert bell | Unread count badge. Dropdown lists alerts newest first, each with a severity icon. |
| Critical banner | Full-width band in `--blocked` under the top bar. Stays until dismissed or resolved. Contains one action link. |
| Wizard stepper | Numbered 1, 2, 3, because the create flow really is a sequence. |
| Toast | Bottom left, 5 seconds, says what happened in the same words as the button. |
| Empty state | One sentence that says what to do next, plus the action button. Only after the data has loaded and is confirmed empty. |
| Loading state | One muted sentence (`Loading payments…`) with an optional spinner. Never an empty-state sentence while data is still arriving. |
| Unavailable state | Says which capability is missing and why it is missing. Never rendered as an empty list or a zero. |
| App shell | Sidebar, top bar and content column from section 6. The sidebar scrolls on its own; the top bar stays in place. |
| Page heading | Page title in Bricolage Grotesque, one sentence of context in `--muted`, the primary action on the right. |
| Data panel | `--panel`, a 1px `--line` border and a 20px radius. A panel that must sit above others uses `--surface-raised`. |
| Chart | Bars for daily spend, `--leash` fill, `--line` baseline, amounts in SOL, a 7 day, 30 day and all range filter. No other grid lines. |
| Settings sheet | Right-hand sheet for local display preferences and wallet details. Closes on Escape and returns focus to the trigger. |
| Scenario runner | One button per scenario with a one-line description beneath it. The result area shows the agent message, each attempt and the on-chain outcome. |

## 8. Pages

### `/` Landing

The hero shows the product, not a stock illustration: a sample policy with the leash gauge and one rejected payment row underneath.

```
+--------------------------------------------------------------+
| -SpendGuard                         [Devnet]  (bell) [Connect] |
+--------------------------------------------------------------+
|  Give your AI agent a wallet          +---------------------+ |
|  it can't abuse.                      | Research agent      | |
|                                       | [=======-----] 0.12 | |
|  Set spending rules once. Solana      | of 0.2 SOL spent    | |
|  enforces them on every payment.      |---------------------| |
|                                       | x Blocked: unknown  | |
|  [Create a policy]  [See a demo]      |   recipient         | |
|                                       +---------------------+ |
+--------------------------------------------------------------+
|  Three short facts, each with plain text (no numbered markers):|
|  Rules cannot be changed. Withdrawals wait. You get alerts.    |
+--------------------------------------------------------------+
```

### `/create` Create policy (3 steps)

```
Step 1 Agent        Step 2 Rules        Step 3 Review
[agent public key]  [per-payment limit] [summary of everything]
                    [window limit]      [x] I understand these rules
                    [window length]         cannot be changed and
                    [withdrawal delay]      recipients can only be
                    [recipients (max 10)]   added, never removed.
                                        [Create policy]
```

Validate before enabling the next button. The review step is a plain summary list, not a form.

### `/dashboard` Policy overview

```
+--------------------------------------------------------------+
| Research agent                  [Active]    [Pause agent]     |
| +----------------------------------------------------------+ |
| | Vault balance 0.84 SOL                                    | |
| | [===========----------] 0.12 of 0.2 SOL spent. Resets 5h  | |
| +----------------------------------------------------------+ |
| [Pending withdrawal card, only when one exists]              |
|--------------------------------------------------------------|
| Recipients                                  [Add recipient]  |
|  3Fk2...9aQ  Added   -------------------------------------   |
|--------------------------------------------------------------|
| Funds                [Deposit]  [Request withdrawal]          |
+--------------------------------------------------------------+
```

The page has six sections, in this order:

1. **Welcome:** greeting, one sentence describing the current state, and the `Create policy` action.
2. **Spending overview:** the large leash gauge, spent and remaining amounts, reset countdown and the per-payment marker.
3. **Spending analytics:** the chart from section 7, with 7 day, 30 day and all filters.
4. **Active policy panel:** status, window allowance, per-payment limit, remaining, reset time and the pause or resume control.
5. **Recent activity:** payments, blocked attempts and alerts, each with a status word: `Allowed`, `Pending`, `Blocked` or `Failed`.
6. **Quick actions:** only destinations that exist.

Below them sit the policy management controls: vault balance, the recipient list, `Add recipient`, `Deposit`, `Request withdrawal`, and the pending withdrawal card when one exists.

When paused, the whole page shows a `--blocked` band: `Agent paused. No payments can go through.` and the button becomes `Resume agent`.

### `/activity` Activity

```
+--------------------------------------------------------------+
| Activity        [Payments] [Blocked] [Alerts]                 |
|--------------------------------------------------------------|
| list of rows for the selected tab                            |
|--------------------------------------------------------------|
| Run a scenario:  [Normal] [Overspend] [Injection] [Unusual]   |
|  each button has a one-line description beneath it            |
|  result area shows what the agent said and what it tried      |
+--------------------------------------------------------------+
```

## 9. Motion

- No entrance animations on page load, and no hover transitions on every card.
- Allowed motion answers an action: the gauge fill changing, a toast appearing, a dropdown opening, the countdown ticking.
- Durations 150 to 250 ms, ease-out. Respect `prefers-reduced-motion` by turning everything off.

## 10. Writing rules

- Sentence case, plain verbs, active voice. Write for a person who has never used Solana.
- Name things by what they do: `Pause agent`, not `Toggle paused flag`.
- A button keeps its name through the whole flow: `Request withdrawal` leads to a toast that says `Withdrawal requested`.
- Errors say what happened and how to fix it. They do not apologize and are never vague. Use `explainError(code)` for program errors.
- Show amounts in SOL with the lamport value available in details. Never show only lamports.
- Do not use middle dots to join text, spaced em dashes, or arrows on buttons.

| Moment | Text |
|---|---|
| Hero | Give your AI agent a wallet it can't abuse. |
| Hero support line | Set spending rules once. Solana enforces them on every payment. |
| Review checkbox | I understand these rules cannot be changed, and recipients can only be added, never removed. |
| Pause banner | Agent paused. No payments can go through. |
| Withdrawal requested toast | Withdrawal requested. It unlocks in 30 minutes. |
| Critical banner | A withdrawal of 0.3 SOL was requested. It will release in 29m 12s unless you cancel it. |
| Blocked payment row | Blocked: the agent tried to pay an address that is not on your list. |
| Empty activity | Nothing here yet. Run a scenario to see the agent work. |
| Wallet not connected | Connect a wallet to see your policies. |

## 11. Accessibility and responsive

- Text contrast of at least 4.5 to 1 against its background.
- Visible keyboard focus: a 2px ring in `--leash` with a 2px offset on every interactive element.
- Touch targets at least 44px.
- Mobile first: a single column below 768px. Below 1024px the sidebar becomes a drawer. The top bar collapses to the menu button, the page title, the bell and the wallet button. Tables become stacked rows. The chart takes the panel width without horizontal scrolling.
- Every icon-only button has an accessible name.
- Severity is conveyed by icon and word, never color alone.

## 12. Do not

- Do not use a shield, lock or glowing orb as imagery.
- Do not use decorative gradients, glows, drop shadows or frosted glass. Section 6 names the only allowed layering and depth.
- Do not use all-caps labels, eyebrow text above headings, or numbered markers outside the wizard.
- Do not make a grid of identical rounded cards.
- Do not put one word of a headline in a different color or weight.
- Do not animate things on page load.
- Do not hardcode colors, fonts or radii in components.

## 13. Checklist before finishing any UI task

1. Colors, fonts and radii come from tokens, not literals.
2. Every status has an icon, a word and a color.
3. Buttons and toasts use the same wording for the same action.
4. The page works at 375px wide and with the keyboard only.
5. Loading, error and empty states exist.
6. Nothing in section 12 appears.
7. Every data surface distinguishes loading, unavailable and empty. Unavailable is never shown as zero.
8. Every sidebar item leads to a real page, section or tab, and no control is inert.