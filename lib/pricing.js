/**
 * Pure pricing and schedule helpers for the DeepSeek price-tip plugin.
 *
 * This module deliberately imports nothing: the Host half uses it at runtime and
 * the Node test suite imports it directly. All times inside it are UTC; the
 * official pricing page states its peak windows in UTC.
 */

/** Official Chinese pricing page: prices are in CNY (元). */
export const PRICING_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing'

/** Cache-file format version. Bump when the stored shape changes. */
export const CACHE_VERSION = 2

/** Source of the embedded 2026 mainland-China public-holiday calendar. */
export const HOLIDAY_SOURCE = 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm'

const DAY_NAMES = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const SECTIONS = ['cacheHit', 'cacheMiss', 'output']

/**
 * Expand an inclusive UTC date range into `YYYY-MM-DD` keys.
 * @param {string} start first day
 * @param {string} end last day
 * @returns {string[]} every day in the range
 */
function datesInRange(start, end) {
  const dates = []
  const cursor = new Date(`${start}T00:00:00.000Z`)
  const last = new Date(`${end}T00:00:00.000Z`)
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

/**
 * Embedded fallback data, fetched from the official Chinese page on 2026-10-18.
 * It is a cache, not the source of truth: the refresh operation replaces the
 * prices and the peak windows from the live page.
 */
export const DEFAULT_PRICING = {
  version: CACHE_VERSION,
  sourceUrl: PRICING_URL,
  fetchedAt: '2026-10-18T10:32:00.000Z',
  fetchedBy: 'bundled',
  currency: 'CNY',
  unit: 'per-1M-tokens',
  models: [
    {
      id: 'deepseek-flash',
      cacheHit: { offPeak: 0.02, peak: 0.04 },
      cacheMiss: { offPeak: 1, peak: 2 },
      output: { offPeak: 4, peak: 8 },
    },
    {
      id: 'deepseek-v4-pro',
      cacheHit: { offPeak: 0.15, peak: 0.3 },
      cacheMiss: { offPeak: 4.5, peak: 9 },
      output: { offPeak: 13.5, peak: 27 },
    },
  ],
  // Minutes after 00:00 UTC: 01:00-04:00 and 06:00-10:00.
  peakWindows: [[60, 240], [360, 600]],
  // JavaScript weekday numbers: 0 = Sunday ... 6 = Saturday.
  weekdays: [1, 2, 3, 4, 5],
  excludeChineseHolidays: true,
  holidays: {
    2026: {
      dates: [
        ...datesInRange('2026-01-01', '2026-01-03'),
        ...datesInRange('2026-02-15', '2026-02-23'),
        ...datesInRange('2026-04-04', '2026-04-06'),
        ...datesInRange('2026-05-01', '2026-05-05'),
        ...datesInRange('2026-06-19', '2026-06-21'),
        ...datesInRange('2026-09-25', '2026-09-27'),
        ...datesInRange('2026-10-01', '2026-10-07'),
      ],
      source: HOLIDAY_SOURCE,
    },
  },
  note: '空闲时段价格为高峰时段价格的一半。',
}

/**
 * @param {unknown} value candidate
 * @returns {value is number} whether it is a usable non-negative price
 */
function isPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * @param {unknown} value candidate
 * @returns {value is string} whether it looks like a `YYYY-MM-DD` key
 */
function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Validate and copy a peak-window list.
 * @param {unknown} value candidate
 * @returns {Array<[number, number]> | null} normalized windows, or null
 */
export function normalizeWindows(value) {
  if (!Array.isArray(value)) return null
  const windows = []
  for (const entry of value) {
    const pair = Array.isArray(entry) ? entry : [entry?.start, entry?.end]
    const start = Number(pair[0])
    const end = Number(pair[1])
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null
    if (start < 0 || start >= 1440 || end < 0 || end > 1440 || start === end) return null
    windows.push([start, end])
  }
  if (windows.length === 0) return null
  windows.sort((a, b) => a[0] - b[0])
  return windows
}

/**
 * Validate and copy a weekday list.
 * @param {unknown} value candidate
 * @returns {number[] | null} normalized weekdays, or null
 */
export function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return null
  const days = [...new Set(value.map(Number))]
  if (days.length === 0) return null
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null
  return days.sort((a, b) => a - b)
}

/**
 * Merge flat extra holiday dates into a calendar object.
 * @param {Record<string, { dates?: string[], source?: string | null }> | undefined} base calendar
 * @param {readonly string[]} extra additional `YYYY-MM-DD` dates
 * @returns {Record<string, { dates: string[], source: string | null }>} merged copy
 */
export function mergeHolidays(base, extra) {
  /** @type {Record<string, { dates: string[], source: string | null }>} */
  const merged = {}
  for (const [year, entry] of Object.entries(base ?? {})) {
    merged[year] = {
      dates: [...new Set((entry?.dates ?? []).filter(isDateKey))].sort(),
      source: typeof entry?.source === 'string' ? entry.source : null,
    }
  }
  for (const date of extra ?? []) {
    if (!isDateKey(date)) continue
    const year = date.slice(0, 4)
    merged[year] ??= { dates: [], source: null }
    if (!merged[year].dates.includes(date)) merged[year].dates.push(date)
    merged[year].dates.sort()
  }
  return merged
}

/**
 * Normalize the raw Loader config into the small settings object used here.
 * @param {unknown} raw row config
 * @returns {{ autoRefreshHours: number, sourceUrl: string, peakWindows: Array<[number, number]> | null, weekdays: number[] | null, holidays: string[] }} settings
 */
export function normalizeConfig(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const hours = Number(value.autoRefreshHours)
  return {
    autoRefreshHours: Number.isFinite(hours) && hours >= 0 ? hours : 6,
    sourceUrl: typeof value.sourceUrl === 'string' && /^https?:\/\//i.test(value.sourceUrl)
      ? value.sourceUrl
      : PRICING_URL,
    peakWindows: normalizeWindows(value.peakWindows),
    weekdays: normalizeWeekdays(value.weekdays),
    holidays: Array.isArray(value.holidays) ? value.holidays.filter(isDateKey) : [],
  }
}

/**
 * Resolve the effective schedule: stored data plus settings overrides.
 * @param {typeof DEFAULT_PRICING} data stored pricing data
 * @param {ReturnType<typeof normalizeConfig>} config settings
 * @returns {{ peakWindows: Array<[number, number]>, weekdays: number[], excludeChineseHolidays: boolean, holidays: Record<string, { dates: string[], source: string | null }> }} schedule
 */
export function buildSchedule(data, config) {
  return {
    peakWindows: config.peakWindows ?? data.peakWindows,
    weekdays: config.weekdays ?? data.weekdays,
    excludeChineseHolidays: data.excludeChineseHolidays !== false,
    holidays: mergeHolidays(data.holidays, config.holidays),
  }
}

/**
 * @param {Record<string, { dates: string[] }>} holidays calendar
 * @returns {Set<string>} every holiday date across years
 */
function holidaySetOf(holidays) {
  const set = new Set()
  for (const entry of Object.values(holidays ?? {})) {
    for (const date of entry?.dates ?? []) set.add(date)
  }
  return set
}

/**
 * Read the schedule at one instant.
 * @param {Date} at UTC instant
 * @param {ReturnType<typeof buildSchedule>} schedule schedule
 * @param {Set<string>} holidaySet precomputed holiday dates
 * @returns {{ isPeak: boolean, holiday: boolean, weekday: number, minute: number, date: string, inWindow: boolean }} reading
 */
function readMoment(at, schedule, holidaySet) {
  const minute = at.getUTCHours() * 60 + at.getUTCMinutes()
  const weekday = at.getUTCDay()
  const date = at.toISOString().slice(0, 10)
  const holiday = schedule.excludeChineseHolidays && holidaySet.has(date)
  const inWindow = schedule.peakWindows.some(([start, end]) => (
    start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end
  ))
  return {
    isPeak: !holiday && schedule.weekdays.includes(weekday) && inWindow,
    holiday,
    weekday,
    minute,
    date,
    inWindow,
  }
}

/**
 * Find the first minute after `now` whose peak/off-peak state differs.
 * @param {Date} now UTC instant
 * @param {ReturnType<typeof buildSchedule>} schedule schedule
 * @param {Set<string>} holidaySet precomputed holiday dates
 * @returns {{ at: number, state: 'peak' | 'off-peak' } | null} next boundary
 */
function nextTransition(now, schedule, holidaySet) {
  const cursor = new Date(now.getTime())
  cursor.setUTCSeconds(0, 0)
  const initial = readMoment(cursor, schedule, holidaySet).isPeak
  // A full fortnight always contains the weekly pattern.
  for (let index = 1; index <= 14 * 1440; index += 1) {
    cursor.setTime(cursor.getTime() + 60_000)
    if (readMoment(cursor, schedule, holidaySet).isPeak !== initial) {
      return { at: cursor.getTime(), state: initial ? 'off-peak' : 'peak' }
    }
  }
  return null
}

/**
 * Compute the current state, its reason, and the next change.
 * @param {Date} now current instant
 * @param {ReturnType<typeof buildSchedule>} schedule schedule
 * @returns {{ state: 'peak' | 'off-peak', reason: 'peak-hours' | 'holiday' | 'weekend' | 'outside-peak-hours', nowMs: number, nowIso: string, nextChangeMs: number | null, nextChangeIso: string | null, nextState: 'peak' | 'off-peak' | null, peakWindows: Array<[number, number]>, weekdays: number[], excludeChineseHolidays: boolean, holiday: { known: boolean, isHoliday: boolean, date: string, year: string, source: string | null } }} status
 */
export function computeStatus(now, schedule) {
  const holidaySet = holidaySetOf(schedule.holidays)
  const moment = readMoment(now, schedule, holidaySet)
  const next = nextTransition(now, schedule, holidaySet)
  const year = moment.date.slice(0, 4)
  const calendar = schedule.holidays?.[year]
  const reason = moment.isPeak
    ? 'peak-hours'
    : moment.holiday
      ? 'holiday'
      : !schedule.weekdays.includes(moment.weekday)
        ? 'weekend'
        : 'outside-peak-hours'
  return {
    state: moment.isPeak ? 'peak' : 'off-peak',
    reason,
    nowMs: now.getTime(),
    nowIso: now.toISOString(),
    nextChangeMs: next?.at ?? null,
    nextChangeIso: next === null ? null : new Date(next.at).toISOString(),
    nextState: next?.state ?? null,
    peakWindows: schedule.peakWindows,
    weekdays: schedule.weekdays,
    excludeChineseHolidays: schedule.excludeChineseHolidays,
    holiday: {
      known: schedule.excludeChineseHolidays ? Boolean(calendar) : true,
      isHoliday: moment.holiday,
      date: moment.date,
      year,
      source: calendar?.source ?? null,
    },
  }
}

/**
 * Median off-peak/peak ratio across every listed price.
 * @param {Array<{ cacheHit: { peak: number, offPeak: number }, cacheMiss: { peak: number, offPeak: number }, output: { peak: number, offPeak: number } }>} models models
 * @returns {number} ratio, or 0.5 when nothing is usable
 */
export function discountOf(models) {
  const ratios = []
  for (const model of models ?? []) {
    for (const section of SECTIONS) {
      const price = model?.[section]
      if (isPrice(price?.peak) && price.peak > 0 && isPrice(price?.offPeak)) {
        ratios.push(price.offPeak / price.peak)
      }
    }
  }
  if (ratios.length === 0) return 0.5
  ratios.sort((a, b) => a - b)
  const middle = Math.floor(ratios.length / 2)
  return ratios.length % 2 === 0 ? (ratios[middle - 1] + ratios[middle]) / 2 : ratios[middle]
}

/**
 * Validate and copy stored/cached pricing data.
 * @param {unknown} raw candidate
 * @returns {typeof DEFAULT_PRICING | null} normalized data, or null when unusable
 */
export function normalizeStoredPricing(raw) {
  if (!raw || typeof raw !== 'object') return null
  // A cache written by an older currency/shape generation is not reusable.
  if (raw.version !== CACHE_VERSION) return null
  const models = []
  if (!Array.isArray(raw.models) || raw.models.length === 0) return null
  for (const entry of raw.models) {
    if (!entry || typeof entry.id !== 'string' || !/^deepseek-[a-z0-9][a-z0-9.-]*$/i.test(entry.id)) return null
    /** @type {any} */
    const model = { id: entry.id.toLowerCase() }
    for (const section of SECTIONS) {
      const price = entry[section]
      if (!isPrice(price?.peak) || !isPrice(price?.offPeak)) return null
      model[section] = { peak: price.peak, offPeak: price.offPeak }
    }
    models.push(model)
  }
  const peakWindows = normalizeWindows(raw.peakWindows)
  const weekdays = normalizeWeekdays(raw.weekdays)
  if (peakWindows === null || weekdays === null) return null
  if (typeof raw.fetchedAt !== 'string' || Number.isNaN(Date.parse(raw.fetchedAt))) return null
  const holidays = {}
  if (raw.holidays && typeof raw.holidays === 'object') {
    for (const [year, entry] of Object.entries(raw.holidays)) {
      if (!/^\d{4}$/.test(year)) continue
      holidays[year] = {
        dates: [...new Set((entry?.dates ?? []).filter(isDateKey))].sort(),
        source: typeof entry?.source === 'string' ? entry.source : null,
      }
    }
  }
  return {
    version: CACHE_VERSION,
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : PRICING_URL,
    fetchedAt: raw.fetchedAt,
    fetchedBy: raw.fetchedBy === 'remote' ? 'remote' : 'cache',
    currency: raw.currency === 'CNY' ? 'CNY' : 'USD',
    unit: typeof raw.unit === 'string' ? raw.unit : 'per-1M-tokens',
    models,
    peakWindows,
    weekdays,
    excludeChineseHolidays: raw.excludeChineseHolidays !== false,
    holidays,
    note: typeof raw.note === 'string' ? raw.note : null,
  }
}

/**
 * Decode the handful of HTML entities that occur in the pricing table.
 * @param {string} text raw text
 * @returns {string} decoded text
 */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

/**
 * Turn either the provider's text rendering or raw HTML into plain lines.
 * @param {string} content page content
 * @param {'html' | 'text'} kind content kind
 * @returns {string} plain text
 */
export function toPlainText(content, kind) {
  if (kind !== 'html') return content
  return decodeEntities(
    content
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:td|th)>/gi, ' | ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
}

/**
 * Trim a line and collapse its whitespace while keeping table separators.
 * @param {string} line raw line
 * @returns {string} clean line
 */
function cleanLine(line) {
  return decodeEntities(line)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract model ids from the `MODEL` header row.
 * @param {string[]} lines plain lines
 * @param {number} index header-row index
 * @returns {string[]} model ids
 */
function readModelIds(lines, index) {
  const header = lines[index]
  if (header === undefined) return []
  const ids = []
  for (const match of header.matchAll(/deepseek-[a-z0-9][a-z0-9.-]*/gi)) {
    const id = match[0].toLowerCase().replace(/[.-]+$/, '')
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Parse time ranges and convert them to UTC minutes.
 * @param {string} text range text
 * @param {number} offsetMinutes minutes to subtract (Beijing local -> UTC is 480)
 * @returns {Array<[number, number]>} windows
 */
function parseWindows(text, offsetMinutes) {
  const windows = []
  const pattern = /(\d{1,2}):(\d{2})\s*(?:-|–|—|~|to|至|到)\s*(\d{1,2}):(\d{2})/gi
  for (const range of text.matchAll(pattern)) {
    const hoursStart = Number(range[1])
    const minutesStart = Number(range[2])
    const hoursEnd = Number(range[3])
    const minutesEnd = Number(range[4])
    if (minutesStart > 59 || minutesEnd > 59) throw new Error(`invalid peak window "${range[0]}"`)
    if (hoursStart > 24 || hoursEnd > 24) throw new Error(`invalid peak window "${range[0]}"`)
    if ((hoursStart === 24 && minutesStart !== 0) || (hoursEnd === 24 && minutesEnd !== 0)) {
      throw new Error(`invalid peak window "${range[0]}"`)
    }
    const start = ((hoursStart * 60 + minutesStart - offsetMinutes) % 1440 + 1440) % 1440
    const end = ((hoursEnd * 60 + minutesEnd - offsetMinutes) % 1440 + 1440) % 1440
    if (start === end) throw new Error(`invalid peak window "${range[0]}"`)
    windows.push([start, end])
  }
  if (windows.length === 0) throw new Error('the peak-hours rule contained no time ranges')
  windows.sort((a, b) => a[0] - b[0])
  return windows
}

/**
 * Parse English weekday names or a "Monday through Friday" range.
 * @param {string} text schedule text
 * @returns {number[]} sorted weekday numbers
 */
function parseEnglishWeekdays(text) {
  const weekdays = []
  const named = /(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:through|thru|to|-|–)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
  const rangeMatch = text.match(named)
  if (rangeMatch !== null) {
    const first = DAY_NAMES[rangeMatch[1].toLowerCase()]
    const last = DAY_NAMES[rangeMatch[2].toLowerCase()]
    for (let day = first; ; day = (day + 1) % 7) {
      weekdays.push(day)
      if (day === last) break
    }
  } else {
    for (const day of text.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi)) {
      weekdays.push(DAY_NAMES[day[1].toLowerCase()])
    }
  }
  if (weekdays.length === 0) throw new Error('the peak-hours rule named no weekdays')
  return [...new Set(weekdays)].sort((a, b) => a - b)
}

const CHINESE_DAYS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }

/**
 * Parse Chinese weekday text such as "周一至周五" or "周六、周日".
 * @param {string} text schedule text
 * @returns {number[]} sorted weekday numbers
 */
function parseChineseWeekdays(text) {
  const weekdays = []
  const rangeMatch = text.match(/周([一二三四五六日天])\s*(?:至|到|—|-|~)\s*周([一二三四五六日天])/)
  if (rangeMatch !== null) {
    const first = CHINESE_DAYS[rangeMatch[1]]
    const last = CHINESE_DAYS[rangeMatch[2]]
    for (let day = first; ; day = (day + 1) % 7) {
      weekdays.push(day)
      if (day === last) break
    }
  } else {
    for (const day of text.matchAll(/周([一二三四五六日天])/g)) {
      weekdays.push(CHINESE_DAYS[day[1]])
    }
  }
  if (weekdays.length === 0) throw new Error('the peak-hours rule named no weekdays')
  return [...new Set(weekdays)].sort((a, b) => a - b)
}

/**
 * Parse the peak-hours rule from either official page.
 *
 * English: "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through
 * Friday, excluding Chinese public holidays."
 * Chinese: "北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00
 * 为高峰时段".
 * @param {string} text plain page text
 * @returns {{ peakWindows: Array<[number, number]>, weekdays: number[], excludeChineseHolidays: boolean, note: string | null }} parsed schedule
 */
function readScheduleSentence(text) {
  const flat = text.replace(/\s+/g, ' ').trim()
  const english = flat.match(/peak hours are\s+(.*?)\s+UTC\s*,\s*(.*?)(?:\.|$)/i)
  if (english !== null) {
    const [, rangesText, daysText] = english
    const noteMatch = flat.match(/off-peak rates? (?:are|is) ([^.]*)\./i)
    return {
      peakWindows: parseWindows(rangesText, 0),
      weekdays: parseEnglishWeekdays(daysText),
      excludeChineseHolidays: /excluding|except|not including/i.test(daysText)
        ? true
        : /including/i.test(daysText)
          ? false
          : /holiday/i.test(daysText),
      note: noteMatch === null ? null : `Off-peak rates are ${noteMatch[1]}.`,
    }
  }

  const chinese = flat.match(/北京时间[^。；]*?高峰时段/)
  if (chinese !== null) {
    const phrase = chinese[0]
    const noteMatch = flat.match(/(空闲时段价格[^。]*。)/)
    return {
      peakWindows: parseWindows(phrase, 8 * 60),
      weekdays: parseChineseWeekdays(phrase),
      excludeChineseHolidays: /不含|不包括|除外|排除/.test(phrase)
        ? true
        : /包括/.test(phrase)
          ? false
          : true,
      note: noteMatch === null ? null : noteMatch[1],
    }
  }

  throw new Error('could not find the peak-hours rule (English UTC sentence or Chinese Beijing-time sentence)')
}

/**
 * Parse the live pricing page into prices plus the peak/off-peak schedule.
 * Throws when either part cannot be read confidently, so the caller can keep
 * the previous data instead of storing a half-parsed table.
 * @param {string} content page content (provider text or raw HTML)
 * @param {'html' | 'text'} kind content kind
 * @returns {{ models: Array<{ id: string, cacheHit: { peak: number, offPeak: number }, cacheMiss: { peak: number, offPeak: number }, output: { peak: number, offPeak: number } }>, currency: 'CNY' | 'USD', peakWindows: Array<[number, number]>, weekdays: number[], excludeChineseHolidays: boolean, note: string | null }} parsed page data
 */
export function parsePricingPage(content, kind) {
  const text = toPlainText(content, kind)
  const lines = text.split(/\r?\n/).map(cleanLine).filter((line) => line.length > 0)
  const headerIndex = lines.findIndex((line) => (
    /^(?:\|\s*)?(?:MODEL|模型)\s*(?:\||\s)/i.test(line)
    && !/(?:VERSION|版本)/i.test(line)
    && /deepseek-/i.test(line)
  ))
  if (headerIndex === -1) throw new Error('could not find the model header row')
  const ids = readModelIds(lines, headerIndex)
  if (ids.length === 0) throw new Error('could not find the model header row')

  // The title and table of contents name the page before the table, so start
  // from the first price row after the model header.
  const start = lines.findIndex((line, index) => index > headerIndex && /(?:\bPRICING\b|价格|價格)/i.test(line))
  if (start === -1) throw new Error('could not find the PRICING table')

  /** @type {Record<string, Record<string, { peak?: number, offPeak?: number }>>} */
  const prices = {}
  for (const id of ids) {
    prices[id] = { cacheHit: {}, cacheMiss: {}, output: {} }
  }
  const amountPattern = /\$\s*([0-9]+(?:\.[0-9]+)?)|(?:¥|￥)\s*([0-9]+(?:\.[0-9]+)?)|([0-9]+(?:\.[0-9]+)?)\s*(?:元|CNY)/gi
  /** @type {'CNY' | 'USD' | null} */
  let currency = null
  let section = null
  for (const line of lines.slice(start, start + 60)) {
    if (/并发限制|並發限制|\bCONCURRENCY\b|搜索与抓取|搜索與抓取|SEARCH\s*(?:&|AND)\s*FETCH|网页搜索|網頁搜索/i.test(line)) break
    const offPeak = /\bOFF[-\s]?PEAK\b|空闲时段|空閒時段|低谷时段|谷时/i.test(line)
    const peak = !offPeak && (/\bPEAK\b|高峰时段|高峰時段|峰时/i.test(line))
    const tier = offPeak ? 'offPeak' : peak ? 'peak' : null
    if (tier === null) continue
    if (/CACHE\s*HIT|缓存命中|緩存命中/i.test(line)) section = 'cacheHit'
    else if (/CACHE\s*MISS|缓存未命中|緩存未命中/i.test(line)) section = 'cacheMiss'
    else if (/\bOUTPUT\b|输出|輸出/i.test(line)) section = 'output'
    if (section === null) continue
    const amounts = []
    for (const match of line.matchAll(amountPattern)) {
      if (match[1] !== undefined) {
        if (currency === 'CNY') throw new Error('the pricing table mixes CNY and USD amounts')
        currency = 'USD'
        amounts.push(Number(match[1]))
      } else {
        if (currency === 'USD') throw new Error('the pricing table mixes CNY and USD amounts')
        currency = 'CNY'
        amounts.push(Number(match[2] ?? match[3]))
      }
    }
    if (amounts.length < ids.length) continue
    ids.forEach((id, index) => {
      prices[id][section][tier] = amounts[index]
    })
  }

  const models = ids.map((id) => {
    const model = { id }
    for (const name of SECTIONS) {
      const entry = prices[id][name]
      if (!isPrice(entry.peak) || !isPrice(entry.offPeak)) {
        throw new Error(`the price row for ${id} / ${name} is incomplete`)
      }
      model[name] = { peak: entry.peak, offPeak: entry.offPeak }
    }
    return model
  })

  return { models, currency: currency ?? 'USD', ...readScheduleSentence(text) }
}

/**
 * Render a compact, model-facing summary of a status object.
 * @param {any} status host status payload
 * @returns {string} plain text for the tool result
 */
export function formatStatusText(status) {
  const zone = 'Asia/Shanghai'
  const format = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: zone, hour12: false })
  const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  const stateLabel = status.state === 'peak' ? 'PEAK (峰价)' : 'OFF-PEAK (谷价)'
  const lines = [
    `DeepSeek official API pricing: ${stateLabel} at ${format(status.nowMs)} (${zone}).`,
  ]
  if (status.nextChangeIso !== null) {
    const target = status.nextState === 'peak' ? 'PEAK' : 'OFF-PEAK'
    const delta = Math.max(0, status.nextChangeMs - status.nowMs)
    const hours = Math.floor(delta / 3_600_000)
    const minutes = Math.floor((delta % 3_600_000) / 60_000)
    lines.push(`Next change: ${format(status.nextChangeMs)} (${zone}) -> ${target}, in ${hours}h ${minutes}m.`)
  }
  lines.push(`Peak windows (UTC): ${status.peakWindows.map(([start, end]) => `${clock(start)}-${clock(end)}`).join(', ')}; weekdays ${status.weekdays.join(',')}; Chinese public holidays excluded: ${status.excludeChineseHolidays ? 'yes' : 'no'}.`)
  if (!status.holiday.known) lines.push(`Holiday calendar for ${status.holiday.year} is not embedded; a holiday may be reported as peak.`)
  else if (status.holiday.isHoliday) lines.push(`Today (${status.holiday.date}) is a Chinese public holiday, so the whole day is off-peak.`)
  const currencyLabel = status.currency === 'CNY' ? 'CNY (元)' : status.currency
  const symbol = status.currency === 'CNY' ? '¥' : '$'
  lines.push(`Prices (${currencyLabel}, ${status.unit}; off-peak / peak):`)
  for (const model of status.models) {
    lines.push(`- ${model.id}: cache hit ${symbol}${model.cacheHit.offPeak}/${symbol}${model.cacheHit.peak}, cache miss ${symbol}${model.cacheMiss.offPeak}/${symbol}${model.cacheMiss.peak}, output ${symbol}${model.output.offPeak}/${symbol}${model.output.peak}`)
  }
  lines.push(`Source: ${status.source.url} (fetched ${status.source.fetchedAt}, origin: ${status.source.origin}).`)
  if (status.source.lastError) lines.push(`Last refresh error: ${status.source.lastError.message}`)
  if (status.refreshError) lines.push(`Refresh failed: ${status.refreshError}`)
  return lines.join('\n')
}
