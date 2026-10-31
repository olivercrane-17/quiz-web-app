// Knewt design tokens: the single source of truth.
// `node build-tokens.js` writes ../tokens.css (plain CSS custom properties plus a Tailwind v4 @theme block).
// `node contrast.js` measures every pairing listed in PAIRS below against these exact values.
'use strict';

// ---------------------------------------------------------------------------
// Colour, per theme. Names are semantic so the high-contrast feedback setting
// can swap "correct" and "incorrect" without touching components.
// ---------------------------------------------------------------------------
const light = {
  // Paper and ink
  page: '#F5EFE4', // warm newsprint; the grain sits on this layer only, under content
  surface: '#FFFBF5', // cards, answer options, sheets (no grain)
  'surface-2': '#FAF3E8', // hover on list rows and ghost buttons
  sunken: '#ECE4D6', // wells, letter badges, empty progress segments
  ink: '#1D1A16',
  'ink-2': '#4E463D',
  'ink-3': '#665C51',
  rule: '#E2D9CA', // decorative hairlines only, never a control's only boundary
  'rule-strong': '#8A7F70', // borders that identify a control (3:1)
  ledge: '#DCD0BC', // the solid thickness under cards and buttons
  scrim: 'rgb(29 26 22 / 0.45)',

  // The one primary action per screen
  primary: '#1D1A16',
  'on-primary': '#FFFBF5',
  'primary-ledge': '#000000',

  // Eft, the brand orange. Never means "wrong".
  accent: '#E55F29', // fills that carry ink content or an ink outline
  'on-accent': '#1D1A16',
  'accent-text': '#B4421A', // eft as text or as a thin line on paper
  'accent-tint': '#FADCCB', // highlighter wash, active suggestion row
  'accent-ledge': '#B9481F',

  // The Daily ticket (the brand's hero surface)
  ticket: '#E55F29',
  'on-ticket': '#1D1A16',
  'ticket-ledge': '#B9481F',
  'ticket-card': '#ED8C63',
  'ticket-invert': '#1D1A16', // the Encore card inside the ticket
  'on-ticket-invert': '#F28A5C',
  'focus-on-ticket': '#1D1A16',

  // Feedback (swapped by the high-contrast setting)
  correct: '#0B6670', // a blue-leaning teal: stays apart from wrong under protan and deutan
  'on-correct': '#FFFBF5',
  'correct-line': '#0B6670',
  'correct-text': '#0B6670',
  'correct-tint': '#DAECEC',
  'correct-ledge': '#063D43',
  incorrect: '#B42A3C', // cranberry, a cool red, so it never borrows the brand orange
  'on-incorrect': '#FFFBF5',
  'incorrect-line': '#B42A3C',
  'incorrect-text': '#A32536',
  'incorrect-tint': '#F8E0E1',
  'incorrect-ledge': '#D9A3A6',
  'play-accent': '#E55F29', // in-play accents beside verdicts; turns to ink in high contrast
  'on-play-accent': '#1D1A16',
  'play-accent-text': '#B4421A',

  // States and utilities
  selected: '#1D1A16', // locked-in border before the reveal
  focus: '#1D1A16',
  warning: '#F2BE4A', // room timer only
  'on-warning': '#1D1A16',
  'warning-text': '#7A5300',
  caution: '#FBEBC4', // outage banner
  'on-caution': '#1D1A16',
  'caution-line': '#9A6B00',
  freeze: '#DDE7EC',
  'on-freeze': '#2B4250',
  'chart-bar': '#8A7F70',
  'chart-you': '#E55F29',
  'chart-you-line': '#1D1A16',
  link: '#1D1A16',
  'link-underline': '#B4421A',
};

const dark = {
  page: '#1A1714', // warm charcoal near the #121212 guidance, never black
  surface: '#25211C',
  'surface-2': '#2C2722',
  sunken: '#13110E',
  ink: '#F3EBDE',
  'ink-2': '#CEC3B3',
  'ink-3': '#A99D8D',
  rule: '#3A332B',
  'rule-strong': '#857A6B',
  ledge: '#0D0B09',
  scrim: 'rgb(0 0 0 / 0.62)',

  primary: '#F3EBDE',
  'on-primary': '#1A1714',
  'primary-ledge': '#A99B86',

  accent: '#F07A45', // small accent fills only; large orange areas use `ticket`
  'on-accent': '#1A1714',
  'accent-text': '#F59466',
  'accent-tint': '#3B2A20', // a wash under ink text; highlights in dark also get an eft underline
  'accent-ledge': '#9A4320',

  ticket: '#AD4219', // burnt eft: rich, not salmon, and no longer the brightest block on the page
  'on-ticket': '#F7EEE1',
  'ticket-ledge': '#5E230C',
  'ticket-card': '#873314',
  'ticket-invert': '#1A1714',
  'on-ticket-invert': '#F59466',
  'focus-on-ticket': '#F7EEE1',

  correct: '#175B60', // fill that carries cream text
  'on-correct': '#F3EBDE',
  'correct-line': '#6AD3CF', // boundary and solved squares
  'correct-text': '#7FDCD6',
  'correct-tint': '#183737',
  'correct-ledge': '#0B2E31',
  incorrect: '#E0566A',
  'on-incorrect': '#1A1714',
  'incorrect-line': '#E0566A',
  'incorrect-text': '#FF8C9A',
  'incorrect-tint': '#45212A',
  'incorrect-ledge': '#2A1419',
  'play-accent': '#F07A45',
  'on-play-accent': '#1A1714',
  'play-accent-text': '#F59466',

  selected: '#F3EBDE',
  focus: '#F3EBDE',
  warning: '#F2BE4A',
  'on-warning': '#1A1714',
  'warning-text': '#F6CD6E',
  caution: '#3A2F14',
  'on-caution': '#F3EBDE',
  'caution-line': '#F6CD6E',
  freeze: '#22303A',
  'on-freeze': '#B9D3E2',
  'chart-bar': '#857A6B',
  'chart-you': '#F07A45',
  'chart-you-line': '#1A1714', // an inset ink line, so your bar stands apart from its neighbours
  link: '#F3EBDE',
  'link-underline': '#F59466',
};

// High-contrast feedback (Settings): blue and orange, as Wordle does. Applied over either theme.
// In this mode orange means "wrong", so in-play accents beside verdicts switch to ink.
const hcLight = {
  correct: '#1E5BA8',
  'on-correct': '#FFFBF5',
  'correct-line': '#1E5BA8',
  'correct-text': '#1E5BA8',
  'correct-tint': '#DCE7F5',
  'correct-ledge': '#0F3566',
  incorrect: '#B04A0C',
  'on-incorrect': '#FFFBF5',
  'incorrect-line': '#B04A0C',
  'incorrect-text': '#9A3F08',
  'incorrect-tint': '#FBE3D0',
  'incorrect-ledge': '#E0B08E',
  'play-accent': '#1D1A16',
  'on-play-accent': '#FFFBF5',
  'play-accent-text': '#1D1A16',
  'chart-you': '#1D1A16',
  'chart-you-line': '#FFFBF5',
};
const hcDark = {
  correct: '#1F4F8F',
  'on-correct': '#F3EBDE',
  'correct-line': '#8DB8F2',
  'correct-text': '#A9CBF7',
  'correct-tint': '#1B2A40',
  'correct-ledge': '#0E2747',
  incorrect: '#F09A55',
  'on-incorrect': '#1A1714',
  'incorrect-line': '#F09A55',
  'incorrect-text': '#FFB27A',
  'incorrect-tint': '#4A2A16',
  'incorrect-ledge': '#2B180C',
  'play-accent': '#F3EBDE',
  'on-play-accent': '#1A1714',
  'play-accent-text': '#F3EBDE',
  'chart-you': '#F3EBDE',
  'chart-you-line': '#25211C',
};

// Readable text mode (Settings): plainer, slightly lighter paper and no grain.
const readableLight = { page: '#FBF8F2' };
const readableDark = { page: '#211D19', surface: '#2A2520' };

// Per-theme non-colour values
const themeExtras = {
  light: { 'grain-opacity': '0.16', 'grain-blend': 'multiply', 'shadow-soft': '0 14px 26px -20px rgb(70 40 15 / 0.45)', 'shadow-sheet': '0 -16px 40px -26px rgb(60 35 10 / 0.5)', 'shadow-pop': '0 18px 40px -18px rgb(60 35 10 / 0.42)' },
  dark: { 'grain-opacity': '0.12', 'grain-blend': 'screen', 'shadow-soft': '0 14px 26px -18px rgb(0 0 0 / 0.7)', 'shadow-sheet': '0 -16px 40px -22px rgb(0 0 0 / 0.75)', 'shadow-pop': '0 18px 40px -16px rgb(0 0 0 / 0.7)' },
};

// ---------------------------------------------------------------------------
// Static tokens (the same in both themes)
// ---------------------------------------------------------------------------
const fonts = {
  display: '"Fraunces", "Fraunces Fallback", "Times New Roman", serif',
  text: '"Atkinson Hyperlegible Next", "Atkinson Fallback", Arial, sans-serif',
  emoji: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
};

// [size, line-height, weight, face, tracking]
const type = {
  hero: ['clamp(66px, 22vw, 88px)', '0.82', '700', 'display', '-0.04em'],
  'display-1': ['clamp(30px, 9vw, 35px)', '0.98', '700', 'display', '-0.02em'],
  'display-2': ['clamp(28px, 8.5vw, 33px)', '1.05', '600', 'display', '-0.015em'],
  'display-3': ['clamp(26px, 7.7vw, 30px)', '1.05', '650', 'display', '-0.015em'],
  'display-4': ['clamp(24px, 6.9vw, 27px)', '1.08', '650', 'display', '-0.01em'],
  'display-5': ['21px', '1.12', '650', 'display', '-0.005em'],
  'display-6': ['19px', '1.15', '650', 'display', '0em'],
  stem: ['clamp(22px, 6.2vw, 25px)', '1.28', '700', 'text', '-0.005em'],
  lead: ['18px', '1.38', '600', 'text', '0em'],
  body: ['17px', '1.5', '400', 'text', '0em'],
  'body-sm': ['15px', '1.42', '400', 'text', '0em'],
  label: ['17px', '1.2', '700', 'text', '0.005em'],
  'label-sm': ['15px', '1.2', '700', 'text', '0.005em'],
  meta: ['13px', '1.3', '700', 'text', '0.01em'],
  micro: ['12px', '1.25', '700', 'text', '0.01em'],
  // Host big screen: sized by viewport so a 1080p TV gets the PRD's 48 px question and 36 px answers
  'host-code': ['clamp(64px, 8.6vw, 168px)', '0.9', '700', 'display', '0.02em'],
  'host-title': ['clamp(32px, 3vw, 64px)', '1.05', '650', 'display', '-0.01em'],
  'host-question': ['clamp(40px, 3.4vw, 72px)', '1.18', '700', 'text', '-0.005em'],
  'host-answer': ['clamp(28px, 2.2vw, 48px)', '1.2', '600', 'text', '0em'],
  'host-body': ['clamp(18px, 1.35vw, 30px)', '1.35', '600', 'text', '0em'],
};

const radius = { xs: '6px', sm: '10px', md: '14px', lg: '16px', xl: '24px', sheet: '28px', pill: '9999px' };

const space = { gutter: 'clamp(16px, 5.2vw, 20px)', 'tap-min': '44px', 'answer-min': '56px', 'answer-gap': '12px' };

const elevation = { 'ledge-1': '2px', 'ledge-2': '4px', 'ledge-3': '6px' };

const motion = {
  'dur-press': '90ms',
  'dur-lock': '120ms',
  'dur-quick': '160ms',
  'dur-base': '240ms',
  'dur-reveal': '320ms',
  'dur-sheet': '360ms',
  'dur-count': '500ms',
  'dur-celebrate': '900ms',
  'dur-fade': '140ms', // every reduced-motion substitute
  'ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
  'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  'ease-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  'ease-press': 'cubic-bezier(0.3, 0, 0.5, 1)',
  'ease-exit': 'cubic-bezier(0.4, 0, 1, 1)',
};

const z = { raised: '1', sticky: '10', banner: '20', sheet: '30', toast: '40', dialog: '50' };

const layout = { 'container-play': '720px', 'container-reading': '640px', 'container-page': '1120px' };

// ---------------------------------------------------------------------------
// Pairs that contrast.js measures. [fg, bg, target, use]
// ---------------------------------------------------------------------------
const PAIRS = [
  ['ink', 'page', 4.5, 'Body text on the page'],
  ['ink', 'surface', 4.5, 'Text on cards and options'],
  ['ink', 'sunken', 4.5, 'Text in wells and keypads'],
  ['ink-2', 'page', 4.5, 'Secondary text on the page'],
  ['ink-2', 'surface', 4.5, 'Dimmed options, secondary text on cards'],
  ['ink-3', 'page', 4.5, 'Meta text (dates, counts) on the page'],
  ['ink-3', 'surface', 4.5, 'Meta text on cards'],
  ['ink-3', 'sunken', 4.5, 'Meta text in wells'],
  ['on-primary', 'primary', 4.5, 'Primary button label'],
  ['primary', 'page', 3, 'Primary button against the page'],
  ['on-accent', 'accent', 4.5, 'Text on accent fills (points marker, New tag)'],
  ['accent-text', 'page', 4.5, 'Accent text and links on the page'],
  ['accent-text', 'surface', 4.5, 'Accent text on cards'],
  ['ink', 'accent-tint', 4.5, 'Text on the highlighter wash'],
  ['on-ticket', 'ticket', 4.5, 'Text on the Daily ticket'],
  ['on-ticket', 'ticket-card', 4.5, 'Text on the answer-type cards inside the ticket'],
  ['on-ticket-invert', 'ticket-invert', 4.5, 'Encore card text inside the ticket'],
  ['ticket', 'page', 3, 'Ticket edge against the page'],
  ['focus-on-ticket', 'ticket', 3, 'Focus ring on the ticket'],
  ['primary', 'ticket', 3, 'Play button against the ticket'],
  ['on-correct', 'correct', 4.5, 'Correct answer text on its fill'],
  ['correct-text', 'surface', 4.5, '"Correct answer" label on cards'],
  ['ink', 'correct-tint', 4.5, 'Text on a solved clue'],
  ['correct-line', 'surface', 3, 'Correct border, solved square on a card'],
  ['correct-line', 'page', 3, 'Solved square on the page'],
  ['ink', 'incorrect-tint', 4.5, 'Your wrong pick: text on its tint'],
  ['incorrect-text', 'surface', 4.5, '"Your answer" label and wrong-guess stamp on cards'],
  ['incorrect-text', 'incorrect-tint', 4.5, '"Your answer" label on its own tint'],
  ['incorrect-line', 'surface', 3, 'Wrong-pick border, used-clue square'],
  ['incorrect-line', 'incorrect-tint', 3, 'Wrong-pick border against its own fill'],
  ['on-incorrect', 'incorrect', 3, 'X icon on the wrong badge'],
  ['on-correct', 'correct', 3, 'Check icon on the correct badge'],
  ['on-play-accent', 'play-accent', 4.5, 'Text on in-play accents (points marker)'],
  ['play-accent-text', 'page', 4.5, 'In-play accent text on the page (best-moment stamp)'],
  ['selected', 'surface', 3, 'Locked-in border'],
  ['focus', 'page', 3, 'Focus ring on the page'],
  ['focus', 'surface', 3, 'Focus ring on cards'],
  ['rule-strong', 'page', 3, 'Input and option borders on the page'],
  ['rule-strong', 'surface', 3, 'Option borders on cards'],
  ['warning-text', 'page', 4.5, 'Warning text (rooms only)'],
  ['on-warning', 'warning', 4.5, 'Text on the amber timer state'],
  ['on-caution', 'caution', 4.5, 'Outage banner text'],
  ['caution-line', 'caution', 3, 'Outage banner border and icon'],
  ['on-freeze', 'freeze', 4.5, 'Freeze day label and icon'],
  ['chart-bar', 'surface', 3, 'Chart bars on cards'],
  ['chart-you-line', 'chart-you', 3, 'The outline on your bar'],
  ['chart-you', 'surface', 3, 'Your bar on the card'],
  ['link', 'surface', 4.5, 'Links on cards'],
  ['link-underline', 'surface', 3, 'Link underline on cards'],
];

// Pairs measured under simulated colour-vision deficiency: [a, b, use]
const CVD_PAIRS = [
  ['correct', 'incorrect-tint', 'Correct fill next to a wrong pick'],
  ['correct-line', 'incorrect-line', 'Solved square next to a used-clue square'],
  ['correct-line', 'surface', 'Correct border against an untouched option'],
  ['incorrect-line', 'surface', 'Wrong border against an untouched option'],
  ['chart-you', 'chart-bar', 'Your bar next to the other bars'],
  ['chart-you-line', 'chart-you', 'The outline on your bar'],
];

module.exports = { light, dark, hcLight, hcDark, readableLight, readableDark, themeExtras, fonts, type, radius, space, elevation, motion, z, layout, PAIRS, CVD_PAIRS };
