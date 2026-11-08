# SpendGuard — Complete UI Redesign and Implementation Specification

## 1. Project context

I am developing SpendGuard, a Solana-based spending-control application.

The application allows a wallet owner to give an AI agent a spending allowance enforced by Solana smart-contract logic.

Technology:
- Next.js
- TypeScript
- Tailwind CSS
- Solana wallet adapters
- Existing backend and smart-contract integration

This is an existing project.

DO NOT create a new application.
DO NOT recreate the backend.
DO NOT replace working wallet functionality.
DO NOT modify smart-contract logic for visual reasons.

Your responsibility is to redesign the frontend while preserving all existing product functionality.

## 2. Design references and priority

I have supplied a dashboard screenshot.

Treat it as the primary visual reference.

The intended appearance is a premium cryptocurrency fintech dashboard.

Use:
- Deep navy and near-black backgrounds.
- Purple as the primary accent.
- Teal for successful and allowed states.
- Amber for warnings and pending states.
- Red for rejected, blocked and critical states.
- Rounded dashboard panels.
- Subtle panel borders.
- Carefully balanced spacing.
- Refined typography.
- Detailed charts and visualizations.
- A sophisticated dark interface.

Controlled gradients, subtle glow effects and layered surfaces are permitted where they help reproduce the supplied reference.

Avoid excessive decoration, unnecessary animations and visual clutter.

IMPORTANT DESIGN PRIORITY:

The supplied dashboard screenshot determines the visual style and visual arrangement.

This specification determines the actual content, functionality, hierarchy and page structures.

Do not simplify the technical requirements to make the design easier.

## 3. Branding

Use my supplied SpendGuard logo.

Expected location:

frontend/public/images/spendguard-logo.png

Use the logo in the sidebar and relevant branding areas.

Do not invent another brand identity.

If the image asset is missing, temporarily use the SpendGuard wordmark. Do not block the rest of the implementation.

## 4. Application architecture

Maintain exactly four primary application routes:

1. / — Landing page.
2. /create — Create policy.
3. /dashboard — Policy overview.
4. /activity — Activity.

Do not create additional unrelated pages.

The authenticated application interface should have a reusable responsive sidebar and top navigation.

The public landing page must have its own composition and must not be forced into the authenticated dashboard layout.

### Authenticated sidebar

Include:

- SpendGuard logo and wordmark.
- Dashboard.
- Policies.
- Alerts.
- Transactions.
- Settings.

Show the active navigation item clearly.

Reuse the existing four-route structure. Navigation items without independent routes must link to the appropriate existing section or tab rather than pointing to nonexistent pages.

On smaller screens, collapse the sidebar into an accessible mobile navigation menu.

### Top navigation

Include:

- Current page title.
- Solana Devnet indicator.
- Notification bell with unread count.
- Wallet connection button.
- Connected wallet address when available.

Reuse the existing wallet adapter.

Never create a second wallet connection system.

## 5. PAGE ONE: LANDING PAGE (/)

This page introduces SpendGuard.

It must follow the landing-page composition defined in docs/design.md.

Do not copy the dashboard layout onto the landing page.

### Header

Display:

- SpendGuard wordmark/logo.
- Devnet status.
- Alert bell where applicable.
- Connect wallet button.

### Hero section

Use this exact headline:

"Give your AI agent a wallet it can't abuse."

Supporting text:

"Set spending rules once. Solana enforces them on every payment."

Place the text on the left.

Place a detailed sample policy visualization on the right.

Include two actions:

- Create a policy.
- See a demo.

### Sample policy visualization

This is the central visual element of the landing page.

Display:

- Research agent.
- Active status.
- Sample spending: 0.12 SOL.
- Sample spending-window limit: 0.20 SOL.
- Horizontal leash gauge.
- Per-transaction limit marker.
- Spending-window reset countdown.

Directly beneath the gauge, show a rejected payment row:

"Blocked: the agent tried to pay an address that is not on your list."

Use the actual reusable leash gauge component.

These figures are demonstration values and must be identified as sample data.

Do not represent them as real user wallet information.

### Trust statements

At the bottom of the hero composition, display exactly three concise product statements:

1. Rules cannot be changed.
2. Withdrawals wait.
3. You get alerts.

Each should have a relevant icon and a short explanation.

Do not add invented pricing sections, testimonials, blog sections or unrelated marketing content.

### Landing-page layout

The intended composition is:

HEADER
----------------------------------------------
HERO TEXT                 SAMPLE POLICY PANEL
Headline                  Research agent
Supporting text           Active status
Create policy              Leash gauge
See a demo                 Spending information
                           Blocked payment
----------------------------------------------
THREE TRUST STATEMENTS
----------------------------------------------

Keep this structure recognizable at desktop and mobile sizes.

## 6. PAGE TWO: CREATE POLICY (/create)

Build a three-step policy creation wizard.

Do not turn it into one long generic form.

### Step 1 — Agent

Display:

- Step indicator.
- Agent public key input.
- Appropriate validation.
- Continue button.

### Step 2 — Rules

Display:

- Per-payment spending limit.
- Spending-window limit.
- Window length.
- Withdrawal delay.
- Recipient allowlist.

The recipient allowlist must support a maximum of 10 recipients.

Display clear labels, helper text and validation messages.

### Step 3 — Review

Display a plain summary of all configured rules.

Include this exact required acknowledgement:

"I understand these rules cannot be changed, and recipients can only be added, never removed."

Include the Create policy action.

The review screen must be a summary, not another editable form.

### Wizard requirements

- Use a numbered 1, 2, 3 stepper.
- Validate every step before enabling the next step.
- Preserve entered values when navigating between steps.
- Display useful validation errors.
- Prevent duplicate submissions.
- Connect policy creation to existing backend and smart-contract functionality.

## 7. PAGE THREE: DASHBOARD (/dashboard)

This is the main authenticated application experience.

Use the supplied dashboard screenshot as the visual reference.

The page must contain all six sections below.

### A. Welcome section

Heading:

"Your wallet. Your rules. Your control."

Supporting text:

"Set spending limits, enforce wallet policies, and stay in control of your Solana assets."

Include a primary Create policy action.

### B. Spending overview

This is the most important dashboard section.

Display:

- Total amount spent.
- Spending allowance.
- Remaining allowance.
- Percentage used.
- Per-transaction limit.
- Spending-window reset countdown.

Use a prominent horizontal leash gauge.

The gauge must show:

spent_in_window / window_limit

The per-transaction limit must be indicated by a marker on the same scale.

Gauge states:
- Purple below 80%.
- Amber from 80% to 99%.
- Red at 100%.

Display the exact spending facts below the gauge.

Example:

"0.12 of 0.2 SOL spent. Resets in 5h 12m."

The gauge must use actual backend or contract data.

Never replace real calculations with hardcoded numbers.

### C. Spending analytics

Create a detailed spending chart.

Include filters:

- Last 7 days.
- Last 30 days.
- All time.

Use an existing charting library if available.

Show appropriate empty and loading states.

Do not invent spending history.

### D. Active policy panel

Display:

- Policy name.
- Policy status.
- Monthly or window allowance.
- Per-transaction limit.
- Remaining allowance.
- Reset time.
- Pause/resume action.

The pause and resume controls must use actual existing functionality.

### E. Recent activity

Display recent transactions and policy events.

Each row must include:

- Event icon.
- Description.
- Amount where applicable.
- Date and time.
- Status.

Statuses:

- Allowed.
- Pending.
- Blocked.
- Failed.

Successful transactions must link to Solana Explorer when a transaction signature is available.

Blocked transactions must show the reason in plain language.

### F. Quick actions

Include:

- Create Policy.
- View Policy.
- Set Alerts.
- View Transactions.

Every action must lead to a real existing route, section, tab or implemented feature.

Do not create decorative buttons.

### Additional dashboard requirements

The dashboard must also retain these policy-management functions:

- Vault balance.
- Recipient list.
- Add recipient.
- Deposit.
- Request withdrawal.
- Pending withdrawal card when one exists.
- Withdrawal countdown.
- Cancel withdrawal.
- Pause agent.
- Resume agent.

Do not hide critical actions simply because the reference screenshot does not show every one of them.

### Paused state

When paused, display a full-width critical banner beneath the top navigation:

"Agent paused. No payments can go through."

The action must become:

"Resume agent"

The dashboard must visually communicate that payments cannot proceed.

### Pending withdrawal

Only show the pending withdrawal card when a withdrawal actually exists.

Include:
- Requested amount.
- Remaining countdown.
- Cancel withdrawal action.
- Release action disabled until the countdown reaches zero.

The countdown must reflect actual state.

## 8. PAGE FOUR: ACTIVITY (/activity)

Create a detailed activity interface.

Use three tabs:

- Payments.
- Blocked.
- Alerts.

### Payments tab

Show successful and pending payment activity.

### Blocked tab

Show rejected transactions and their reasons.

### Alerts tab

Show security alerts and relevant policy events.

### Activity rows

Each row should display:

- Icon.
- Description.
- Amount where applicable.
- Timestamp.
- Status.

Use the same status terminology and colors throughout the application.

### Demo scenario controls

Include the following four scenarios:

- Normal.
- Overspend.
- Injection.
- Unusual.

Each scenario must have:

1. A clearly labelled button.
2. A one-line description beneath the button.
3. An action that runs the existing demo scenario functionality.
4. A result area showing what the agent said.
5. A result area showing what the agent attempted.
6. The actual policy enforcement result.

Do not fake successful blockchain transactions.

The scenarios are important for the hackathon demonstration.

Preserve their functionality even when the visual layout is redesigned.

## 9. Shared component specifications

Build reusable components rather than repeating interface code.

Expected components include:

- ApplicationSidebar.
- TopNavigation.
- WalletConnectButton.
- DevnetBadge.
- NotificationBell.
- StatusBadge.
- SpendingGauge.
- PolicyOverview.
- SpendingChart.
- ActivityRow.
- RecipientList.
- PendingWithdrawalCard.
- CriticalBanner.
- PolicyWizard.
- WizardStepper.
- ScenarioSelector.
- ToastNotification.
- EmptyState.
- LoadingState.

Reuse existing components whenever appropriate.

Do not create duplicate wallet providers or duplicate API clients.

## 10. Design tokens and styling

Centralize visual values.

Use the existing SpendGuard CSS variables as the starting point.

Colors:

- Ink: #0F1424.
- Panel: #171E33.
- Line: #2A3354.
- Paper: #E8ECF8.
- Muted: #8F9AC0.
- Leash: #7C6CFF.
- Leash strong: #5B4BFF.
- Allowed: #2FD2A4.
- Caution: #F4B740.
- Blocked: #FF5C6C.

Typography:

- Bricolage Grotesque for headings and prominent numbers.
- Instrument Sans for interface and body text.
- JetBrains Mono for addresses and transaction signatures only.

Use centralized tokens for:
- Colors.
- Typography.
- Radii.
- Spacing.
- Borders.
- Component states.

Do not scatter arbitrary hex values throughout components.

## 11. Functional requirements

Preserve all existing functionality:

- Phantom wallet connection.
- Solflare wallet connection.
- Solana Devnet.
- Agent spending policies.
- Per-transaction spending limits.
- Spending-window limits.
- Recipient restrictions.
- Withdrawal delays.
- Pending withdrawal countdowns.
- Pause/resume.
- Transaction validation.
- Blockchain interaction.
- Backend API integration.

Inspect existing backend endpoints and frontend API clients before implementation.

Do not invent new API endpoints.

Do not change smart-contract logic.

Do not expose environment variables, private keys, API secrets or credentials.

## 12. Data integrity

This is a financial application.

Never display invented financial data as real user data.

Use sample values only in explicitly identified demonstration states.

For disconnected wallets, display an appropriate empty state.

For connected wallets, load the actual data.

Provide:
- Loading states.
- Error states.
- Empty states.
- Successful action feedback.

All financial calculations must be correct.

## 13. Responsive design

Support:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

Desktop:
- Full sidebar.
- Full top navigation.
- Multi-column dashboard layout.

Tablet:
- Compact sidebar.
- Adapted panel widths.

Mobile:
- Collapsed navigation.
- Single-column content.
- Stacked activity rows.
- Responsive charts.
- Accessible touch targets.

No horizontal overflow at 375px.

## 14. Technical implementation rules

Use the existing:

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- CSS variables.
- Wallet providers.
- Backend clients.
- Smart-contract interfaces.

Keep server and client components appropriately separated.

Avoid unnecessary dependencies.

Do not rewrite existing application architecture without a clear technical reason.

Do not delete working features.

## 15. Implementation sequence

Work in this exact order.

PHASE 1 — INSPECTION
Read AGENTS.md, docs/design.md and inspect the existing application.

Report existing features, architecture and potential conflicts.

Do not edit anything yet.

PHASE 2 — DESIGN SYSTEM
Update docs/design.md to reflect the approved dashboard reference and visual direction.

Retain all functional product requirements.

PHASE 3 — SHARED APPLICATION SHELL
Implement the sidebar, top navigation, wallet display, notification bell and reusable layout.

PHASE 4 — LANDING PAGE
Implement the exact landing-page structure described in section 5.

PHASE 5 — CREATE POLICY
Implement the complete three-step wizard.

PHASE 6 — DASHBOARD
Implement all six dashboard sections and additional policy-management controls.

PHASE 7 — ACTIVITY
Implement the three tabs and four demo scenarios.

PHASE 8 — INTEGRATION
Connect all components to existing backend and Solana functionality.

PHASE 9 — VERIFICATION
Run TypeScript checks, lint, tests and production build.

Fix issues introduced by the redesign.

## 16. Final quality checklist

Before declaring completion, verify:

- All four routes exist.
- Landing page follows the specified hero composition.
- The landing page contains the sample policy and blocked payment.
- The three trust statements are present.
- The policy wizard contains exactly three steps.
- The review acknowledgement is correct.
- The dashboard contains all six required sections.
- The leash gauge uses correct calculations.
- Analytics filters work.
- Active policy data is real.
- Withdrawal countdown works.
- Pause and resume work.
- Recipient restrictions remain intact.
- Activity has all three tabs.
- All four demo scenarios work.
- Wallet connection still works.
- No fake financial data is presented as real.
- No buttons are inert.
- Mobile layout works at 375px.
- Keyboard navigation works.
- No secrets are exposed.
- Production build succeeds.

At the end, report:

1. Files created.
2. Files modified.
3. Features implemented.
4. Existing features preserved.
5. Tests and checks passed.
6. Remaining incomplete features.

The goal is to produce a technically complete, visually polished SpendGuard application that matches the supplied reference without compromising its actual security and spending-control functionality.    