/**
 * Zone names that denote one zone (decisions memo §14.1, PRD §4.4.7). A
 * device reports its zone by name, and browsers disagree on the spelling:
 * Chrome reports CLDR's ids (`Asia/Calcutta`, `Europe/Kiev`), Firefox and
 * Safari IANA's (`Asia/Kolkata`, `Europe/Kyiv`), so one player on two
 * devices can flip between them. Two names for one zone are no zone change:
 * they set no honest-play flag 16, and they aren't the new zone name the
 * date-line rule asks for.
 *
 * Each row is an IANA tz database zone and the names linked to it (tzdata
 * 2026e: the `backward` links, plus the legacy zones `CET`, `EET`, `EST`,
 * `HST`, `MET`, `MST` and `WET`, which became links in 2024b), kept only
 * where ICU agrees the names are one zone. `Etc/GMT` folds into `Etc/UTC`,
 * as ICU does: both are UTC+0 forever. Links between distinct places that
 * only share their clocks since 1970 (Bratislava and Prague, say) are left
 * out. The table is data rather than an `Intl` lookup, because engines
 * differ on whether `resolvedOptions().timeZone` canonicalizes a name, and
 * SQL needs the same pairs: SQL-6 seeds its alias map from this table. A
 * link that tzdata adds later is added here.
 */
import type { TimeZone } from "../types/ids.ts";

const LINKED_NAMES: readonly (readonly [string, readonly string[]])[] = [
  ["Africa/Asmara", ["Africa/Asmera"]],
  ["Africa/Bamako", ["Africa/Timbuktu"]],
  ["Africa/Cairo", ["Egypt"]],
  ["Africa/Tripoli", ["Libya"]],
  ["America/Adak", ["America/Atka", "US/Aleutian"]],
  ["America/Anchorage", ["US/Alaska"]],
  ["America/Argentina/Buenos_Aires", ["America/Buenos_Aires"]],
  [
    "America/Argentina/Catamarca",
    ["America/Argentina/ComodRivadavia", "America/Catamarca"],
  ],
  ["America/Argentina/Cordoba", ["America/Cordoba", "America/Rosario"]],
  ["America/Argentina/Jujuy", ["America/Jujuy"]],
  ["America/Argentina/Mendoza", ["America/Mendoza"]],
  ["America/Atikokan", ["America/Coral_Harbour"]],
  ["America/Chicago", ["US/Central"]],
  ["America/Denver", ["America/Shiprock", "Navajo", "US/Mountain"]],
  ["America/Detroit", ["US/Michigan"]],
  ["America/Edmonton", ["America/Yellowknife", "Canada/Mountain"]],
  ["America/Halifax", ["Canada/Atlantic"]],
  ["America/Havana", ["Cuba"]],
  [
    "America/Indiana/Indianapolis",
    ["America/Fort_Wayne", "America/Indianapolis", "US/East-Indiana"],
  ],
  ["America/Indiana/Knox", ["America/Knox_IN", "US/Indiana-Starke"]],
  ["America/Iqaluit", ["America/Pangnirtung"]],
  ["America/Jamaica", ["Jamaica"]],
  ["America/Kentucky/Louisville", ["America/Louisville"]],
  ["America/Los_Angeles", ["US/Pacific"]],
  ["America/Manaus", ["Brazil/West"]],
  ["America/Mazatlan", ["Mexico/BajaSur"]],
  ["America/Mexico_City", ["Mexico/General"]],
  ["America/New_York", ["US/Eastern"]],
  ["America/Noronha", ["Brazil/DeNoronha"]],
  ["America/Nuuk", ["America/Godthab"]],
  ["America/Panama", ["EST"]],
  ["America/Phoenix", ["MST", "US/Arizona"]],
  ["America/Regina", ["Canada/Saskatchewan"]],
  ["America/Rio_Branco", ["America/Porto_Acre", "Brazil/Acre"]],
  ["America/Santiago", ["Chile/Continental"]],
  ["America/Sao_Paulo", ["Brazil/East"]],
  ["America/St_Johns", ["Canada/Newfoundland"]],
  ["America/St_Thomas", ["America/Virgin"]],
  [
    "America/Tijuana",
    ["America/Ensenada", "America/Santa_Isabel", "Mexico/BajaNorte"],
  ],
  [
    "America/Toronto",
    [
      "America/Montreal",
      "America/Nipigon",
      "America/Thunder_Bay",
      "Canada/Eastern",
    ],
  ],
  ["America/Vancouver", ["Canada/Pacific"]],
  ["America/Whitehorse", ["Canada/Yukon"]],
  ["America/Winnipeg", ["America/Rainy_River", "Canada/Central"]],
  ["Antarctica/McMurdo", ["Antarctica/South_Pole"]],
  ["Asia/Ashgabat", ["Asia/Ashkhabad"]],
  ["Asia/Dhaka", ["Asia/Dacca"]],
  ["Asia/Ho_Chi_Minh", ["Asia/Saigon"]],
  ["Asia/Hong_Kong", ["Hongkong"]],
  ["Asia/Jerusalem", ["Asia/Tel_Aviv", "Israel"]],
  ["Asia/Kathmandu", ["Asia/Katmandu"]],
  ["Asia/Kolkata", ["Asia/Calcutta"]],
  ["Asia/Macau", ["Asia/Macao"]],
  ["Asia/Makassar", ["Asia/Ujung_Pandang"]],
  ["Asia/Nicosia", ["Europe/Nicosia"]],
  ["Asia/Seoul", ["ROK"]],
  ["Asia/Shanghai", ["Asia/Chongqing", "Asia/Chungking", "Asia/Harbin", "PRC"]],
  ["Asia/Singapore", ["Singapore"]],
  ["Asia/Taipei", ["ROC"]],
  ["Asia/Tehran", ["Iran"]],
  ["Asia/Thimphu", ["Asia/Thimbu"]],
  ["Asia/Tokyo", ["Japan"]],
  ["Asia/Ulaanbaatar", ["Asia/Choibalsan", "Asia/Ulan_Bator"]],
  ["Asia/Urumqi", ["Asia/Kashgar"]],
  ["Asia/Yangon", ["Asia/Rangoon"]],
  ["Atlantic/Faroe", ["Atlantic/Faeroe"]],
  ["Atlantic/Reykjavik", ["Iceland"]],
  ["Australia/Adelaide", ["Australia/South"]],
  ["Australia/Brisbane", ["Australia/Queensland"]],
  ["Australia/Broken_Hill", ["Australia/Yancowinna"]],
  ["Australia/Darwin", ["Australia/North"]],
  ["Australia/Hobart", ["Australia/Currie", "Australia/Tasmania"]],
  ["Australia/Lord_Howe", ["Australia/LHI"]],
  ["Australia/Melbourne", ["Australia/Victoria"]],
  ["Australia/Perth", ["Australia/West"]],
  [
    "Australia/Sydney",
    ["Australia/ACT", "Australia/Canberra", "Australia/NSW"],
  ],
  [
    "Etc/UTC",
    [
      "Etc/GMT",
      "Etc/GMT+0",
      "Etc/GMT-0",
      "Etc/GMT0",
      "Etc/Greenwich",
      "Etc/UCT",
      "Etc/Universal",
      "Etc/Zulu",
      "GMT",
      "GMT+0",
      "GMT-0",
      "GMT0",
      "Greenwich",
      "UCT",
      "UTC",
      "Universal",
      "Zulu",
    ],
  ],
  ["Europe/Athens", ["EET"]],
  ["Europe/Brussels", ["CET", "MET"]],
  ["Europe/Chisinau", ["Europe/Tiraspol"]],
  ["Europe/Dublin", ["Eire"]],
  ["Europe/Istanbul", ["Asia/Istanbul", "Turkey"]],
  ["Europe/Kyiv", ["Europe/Kiev", "Europe/Uzhgorod", "Europe/Zaporozhye"]],
  ["Europe/Lisbon", ["Portugal", "WET"]],
  ["Europe/London", ["Europe/Belfast", "GB", "GB-Eire"]],
  ["Europe/Moscow", ["W-SU"]],
  ["Europe/Warsaw", ["Poland"]],
  ["Pacific/Auckland", ["NZ"]],
  ["Pacific/Chatham", ["NZ-CHAT"]],
  ["Pacific/Chuuk", ["Pacific/Truk", "Pacific/Yap"]],
  ["Pacific/Easter", ["Chile/EasterIsland"]],
  ["Pacific/Honolulu", ["HST", "Pacific/Johnston", "US/Hawaii"]],
  ["Pacific/Kanton", ["Pacific/Enderbury"]],
  ["Pacific/Kwajalein", ["Kwajalein"]],
  ["Pacific/Pago_Pago", ["Pacific/Samoa", "US/Samoa"]],
  ["Pacific/Pohnpei", ["Pacific/Ponape"]],
];

/** Each linked name's zone. */
export const ZONE_LINKS: ReadonlyMap<string, string> = new Map(
  LINKED_NAMES.flatMap(([zone, names]) =>
    names.map((name) => [name, zone] as const),
  ),
);

/** The zone a name denotes: its link target, or the name itself. */
export function canonicalZone(zone: TimeZone): TimeZone {
  return (ZONE_LINKS.get(zone) ?? zone) as TimeZone;
}
