/**
 * The words the identity islands render (ARCHITECTURE §2.4): the sync code
 * (PRD §3.10.2, DESIGN §12.25), restoring from it (§12.26), the claim link
 * and its page (PRD §3.10.4, DESIGN §12.27) and Today's restore note
 * (§12.1). `copy.ts` re-exports them with the rest of the feature's words.
 * Tone: calm and factual, as everything about streaks and data is
 * (DESIGN §1.3).
 */
import type { AppTag } from "@/backend";

/**
 * The one line every surface that offers a restore or a claim carries
 * (PRD §3.10.2, AC-SYN-07): practice data stays on the device it was made
 * on.
 */
export const WHAT_MOVES =
  "Your streak, Daily history, Groups, challenges and achievements come with you. Practice stats stay on this device.";

/** An in-app browser's app, as the claim card names it; null for no name. */
export const APP_NAMES: Readonly<Record<AppTag, string | null>> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  linkedin: "LinkedIn",
  telegram: "Telegram",
  google: "the Google app",
  other: null,
  none: null,
};

/** "Daily No. 42", as DESIGN §6.11 writes a Daily's number in running text. */
const dailyNo = (n: number) => `Daily No. ${n}`;

export const IDENTITY_CLIENT_COPY = {
  whatMoves: WHAT_MOVES,
  tryAgain: "Try again",
  cancel: "Cancel",
  goToToday: "Go to Today",
  playDaily: "Play today's Daily",
  unavailable: "This feature isn't available on this server.",

  sync: {
    title: "Your sync code",
    intro:
      "Use it to bring your progress to another device, or back here if your browser clears its data.",
    /** The code well's accessible name; the code follows. */
    codeLabel: "Your sync code",
    copy: "Copy code",
    saved: "I've saved it",
    warning: "Anyone with this code can play as you, so keep it private.",
    show: "Show my code",
    /** Under Show my code when a code made elsewhere may still be out there. */
    replacesOld:
      "If you made a code before, showing one here makes the old one stop working.",
    makeNew: "Make a new code",
    confirmNewTitle: "Make a new code?",
    confirmNewBody: "Your old code will stop working.",
    noProfile:
      "Your sync code arrives with your first Daily. It brings your streak and Daily history to another device.",
    copied: "Copied. Keep it somewhere safe.",
    copyFailed:
      "We couldn't copy it. Select the code and copy it, or write it down.",
    savedLine: "Saved. You'll find it here again in Me, then Your sync code.",
    loading: "Loading your sync code",
    errors: {
      offline:
        "Your sync code needs a connection the first time. Try again once you're online.",
      rateLimited: "That's a lot of new codes for one day. Try again tomorrow.",
      generic: "We couldn't get your code. Nothing changed. Try again.",
    },
    restoreLink: "Restore from a code",
    restoreLead: "Have a code from another device?",
    /** The stop screen's offer (PRD §3.10.2). */
    offer: {
      title: "Keep your streak safe",
      body: "Save your sync code to restore your progress on another device or if your browser clears its data.",
      action: "Show my code",
    },
    /** The same offer in a private window (PRD §3.10.5). */
    privateOffer: {
      title: "Private window?",
      body: "Your progress disappears when you close it. Save your sync code to keep it.",
    },
    /** Below the claim card, the fallback (PRD §3.10.4). */
    fallback: {
      title: "Or save your sync code",
      body: "Can't get to your browser? Enter the code there instead, under Settings, then Restore from a code.",
    },
  },

  restore: {
    title: "Restore from a code",
    intro: "Bring your progress here from another device.",
    fieldLabel: "Your sync code",
    hint: "You'll find it in Me, then Your sync code, on your other device.",
    submit: "Restore",
    confirmTitle: "Replace this device's progress?",
    /**
     * PRD §3.10.2's confirm step, for a code or a claim link; the device's
     * own streak shows when it is known.
     */
    confirmBody: (streak: number | null, via: "code" | "link") => {
      const own =
        streak !== null && streak > 0
          ? `This device has its own progress (streak ${streak}).`
          : "This device has its own progress.";
      return via === "code"
        ? `${own} Restoring replaces it with the profile from your code.`
        : `${own} Continuing replaces it with the profile from your link.`;
    },
    confirmAction: "Restore",
    errors: {
      bad: "That code didn't work. Check for typos, or make a new code on your other device.",
      rateLimited: "Too many tries. Please wait 15 minutes.",
      rateLimitedToday: "Too many tries today. Please try again tomorrow.",
      offline: "Restoring needs a connection. Try again once you're online.",
      generic:
        "That didn't reach us. Nothing changed on this device. Try again.",
    },
  },

  claim: {
    /** The card's title, by app (PRD §3.10.4). */
    title: (app: string | null) =>
      app === null ? "Playing inside an app?" : `Playing inside ${app}?`,
    body: "Open Knewt in your browser to keep your streak.",
    action: "Keep my streak",
    notNow: "Not now",
    stepsTitle: "Now open this page in your browser",
    /** The two taps, by platform (§9.5). */
    steps: {
      ios: [
        "Tap the three dots (⋯) at the top or bottom of the screen.",
        "Choose Open in Safari. Some apps call it Open in browser.",
      ],
      android: [
        "Tap the three dots (⋮) at the top right.",
        "Choose Open in Chrome. Some apps call it Open in browser.",
      ],
      other: ["Open this app's menu.", "Choose Open in browser."],
    },
    openInChrome: "Open in Chrome",
    lasts: "This link works for 10 minutes.",
    expired: "That link has run out. Tap Keep my streak for a new one.",
    errors: {
      offline:
        "Making a link needs a connection. Try again once you're online, or save your sync code below.",
      rateLimited:
        "That's a lot of links for one hour. Try again later, or save your sync code below.",
      generic:
        "We couldn't make your link. Try again, or save your sync code below.",
    },
  },

  /** The claim's page in the system browser (DESIGN §12.27). */
  claimPage: {
    title: "Keep your streak",
    loading: "Checking your link",
    confirmTitle: (name: string) => `Continue as ${name}?`,
    /** "Streak 1 · Daily No. 42 done", with only the parts that apply. */
    detail: (streak: number, dailyNumber: number | null) =>
      [
        streak > 0 ? `Streak ${streak}` : null,
        dailyNumber === null ? null : `${dailyNo(dailyNumber)} done`,
      ]
        .filter((part) => part !== null)
        .join(" · "),
    continue: "Continue",
    notMe: "This isn't me",
    expired:
      "This link has expired. Go back to the app where you played and tap 'Keep my streak' again, or use your sync code.",
    enterCode: "Enter a sync code",
    sameDevice:
      "You made this link on this device, so your profile is already here. To keep your streak, open the link in your browser.",
    offline:
      "Keeping your streak needs a connection. Try again once you're online.",
    rateLimited: "Too many tries. Please wait a few minutes and try again.",
    generic: "That didn't reach us. Nothing changed on this device. Try again.",
  },

  /** Today's note after a restore (DESIGN §12.1). */
  notice: {
    synced: (name: string | null, streak: number) => {
      const greeting =
        name === null ? "Welcome back." : `Welcome back, ${name}.`;
      return streak > 0
        ? `${greeting} Your ${streak}-day streak is here.`
        : `${greeting} Your Daily history is here.`;
    },
    claimed: "You're all set. Your streak is safe in this browser.",
  },
} as const;
