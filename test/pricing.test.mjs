import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PRICING,
  buildSchedule,
  computeStatus,
  discountOf,
  formatStatusText,
  normalizeConfig,
  normalizeStoredPricing,
  parsePricingPage,
} from '../lib/pricing.js'

const SAMPLE_PAGE = `
# Models & Pricing

| MODEL | deepseek-flash(1) | deepseek-v4-pro |
| --- | --- | --- |
| MODEL VERSION | DeepSeek-V4.1-Flash-1017 | DeepSeek-V4-Pro-0813 |
| CONTEXT LENGTH | 1M | 1M |
| MAX OUTPUT | MAXIMUM: 384K | 384K |
| PRICING(2) | 1M INPUT TOKENS  <br>(CACHE HIT) | OFF-PEAK | $0.003 | $0.022 |
| PEAK | $0.006 | $0.044 |
| 1M INPUT TOKENS  <br>(CACHE MISS) | OFF-PEAK | $0.15 | $0.66 |
| PEAK | $0.3 | $1.32 |
| 1M OUTPUT TOKENS | OFF-PEAK | $0.6 | $1.98 |
| PEAK | $1.2 | $3.96 |
| Concurrency Limit(3) | 2500 | 500 |

Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public holidays. All other hours are off-peak, including weekends and Chinese public holidays in full.
`

const SAMPLE_PAGE_ZH = `
# 模型 & 价格

| 模型  | deepseek-flash(1) | deepseek-v4-pro |
| --- | --- | --- |
| 模型版本 | DeepSeek-V4.1-Flash-1017 | DeepSeek-V4-Pro-0813 |
| 上下文长度 | 1M | 1M |
| 价格(2) | 百万tokens输入  <br>（缓存命中） | 空闲时段 | 0.02元 | 0.15元 |
| 高峰时段 | 0.04元 | 0.30元 |
| 百万tokens输入  <br>（缓存未命中） | 空闲时段 | 1元  | 4.5元 |
| 高峰时段 | 2元  | 9.0元 |
| 百万tokens输出 | 空闲时段 | 4元  | 13.5元 |
| 高峰时段 | 8元  | 27.0元 |
| 并发限制(3) | 2500 | 500 |

(2) 空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。
`

const schedule = () => buildSchedule(DEFAULT_PRICING, normalizeConfig({}))

test('parses the live table shape including both models and both tiers', () => {
  const parsed = parsePricingPage(SAMPLE_PAGE, 'text')
  assert.equal(parsed.currency, 'USD')
  assert.deepEqual(parsed.models.map((model) => model.id), ['deepseek-flash', 'deepseek-v4-pro'])
  assert.deepEqual(parsed.models[0].cacheHit, { peak: 0.006, offPeak: 0.003 })
  assert.deepEqual(parsed.models[0].cacheMiss, { peak: 0.3, offPeak: 0.15 })
  assert.deepEqual(parsed.models[0].output, { peak: 1.2, offPeak: 0.6 })
  assert.deepEqual(parsed.models[1].cacheHit, { peak: 0.044, offPeak: 0.022 })
  assert.deepEqual(parsed.models[1].cacheMiss, { peak: 1.32, offPeak: 0.66 })
  assert.deepEqual(parsed.models[1].output, { peak: 3.96, offPeak: 1.98 })
  assert.deepEqual(parsed.peakWindows, [[60, 240], [360, 600]])
  assert.deepEqual(parsed.weekdays, [1, 2, 3, 4, 5])
  assert.equal(parsed.excludeChineseHolidays, true)
  assert.match(parsed.note, /half of the peak rates/)
})

test('parses the Chinese page into CNY prices and Beijing-time peak hours', () => {
  const parsed = parsePricingPage(SAMPLE_PAGE_ZH, 'text')
  assert.equal(parsed.currency, 'CNY')
  assert.deepEqual(parsed.models.map((model) => model.id), ['deepseek-flash', 'deepseek-v4-pro'])
  assert.deepEqual(parsed.models[0].cacheHit, { peak: 0.04, offPeak: 0.02 })
  assert.deepEqual(parsed.models[0].cacheMiss, { peak: 2, offPeak: 1 })
  assert.deepEqual(parsed.models[0].output, { peak: 8, offPeak: 4 })
  assert.deepEqual(parsed.models[1].cacheHit, { peak: 0.3, offPeak: 0.15 })
  assert.deepEqual(parsed.models[1].cacheMiss, { peak: 9, offPeak: 4.5 })
  assert.deepEqual(parsed.models[1].output, { peak: 27, offPeak: 13.5 })
  assert.deepEqual(parsed.peakWindows, [[60, 240], [360, 600]])
  assert.deepEqual(parsed.weekdays, [1, 2, 3, 4, 5])
  assert.equal(parsed.excludeChineseHolidays, true)
  assert.match(parsed.note, /空闲时段价格为高峰时段价格的一半/)
})

test('parses the same table from raw HTML tags', () => {
  const html = `<table><tr><td>MODEL</td><td>deepseek-flash</td><td>deepseek-v4-pro</td></tr>
    <tr><td>PRICING</td><td>1M INPUT TOKENS <br>(CACHE HIT)</td><td>OFF-PEAK</td><td>$0.003</td><td>$0.022</td></tr>
    <tr><td>PEAK</td><td>$0.006</td><td>$0.044</td></tr>
    <tr><td>1M INPUT TOKENS <br>(CACHE MISS)</td><td>OFF-PEAK</td><td>$0.15</td><td>$0.66</td></tr>
    <tr><td>PEAK</td><td>$0.3</td><td>$1.32</td></tr>
    <tr><td>1M OUTPUT TOKENS</td><td>OFF-PEAK</td><td>$0.6</td><td>$1.98</td></tr>
    <tr><td>PEAK</td><td>$1.2</td><td>$3.96</td></tr></table>
    <p>Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public holidays.</p>`
  const parsed = parsePricingPage(html, 'html')
  assert.equal(parsed.currency, 'USD')
  assert.equal(parsed.models.length, 2)
  assert.deepEqual(parsed.models[1].output, { peak: 3.96, offPeak: 1.98 })
  assert.deepEqual(parsed.peakWindows, [[60, 240], [360, 600]])
})

test('rejects a page whose peak-hour rule cannot be read', () => {
  assert.throws(
    () => parsePricingPage(SAMPLE_PAGE.replace(/Peak hours[^.]*\./, ''), 'text'),
    /peak-hours rule/,
  )
})

test('weekend is off-peak and the next switch is Monday 01:00 UTC', () => {
  const status = computeStatus(new Date('2026-10-18T10:17:00.000Z'), schedule())
  assert.equal(status.state, 'off-peak')
  assert.equal(status.reason, 'weekend')
  assert.equal(status.nextChangeIso, '2026-10-19T01:00:00.000Z')
  assert.equal(status.nextState, 'peak')
})

test('a weekday inside a peak window is peak', () => {
  const status = computeStatus(new Date('2026-10-19T02:00:00.000Z'), schedule())
  assert.equal(status.state, 'peak')
  assert.equal(status.reason, 'peak-hours')
  assert.equal(status.nextChangeIso, '2026-10-19T04:00:00.000Z')
  assert.equal(status.nextState, 'off-peak')
})

test('the gap between the two daily windows is off-peak', () => {
  const status = computeStatus(new Date('2026-10-19T05:00:00.000Z'), schedule())
  assert.equal(status.state, 'off-peak')
  assert.equal(status.reason, 'outside-peak-hours')
  assert.equal(status.nextChangeIso, '2026-10-19T06:00:00.000Z')
})

test('a Chinese public holiday is off-peak for the whole day', () => {
  const status = computeStatus(new Date('2026-10-01T02:00:00.000Z'), schedule())
  assert.equal(status.state, 'off-peak')
  assert.equal(status.reason, 'holiday')
  assert.equal(status.holiday.known, true)
  assert.equal(status.holiday.isHoliday, true)
  assert.equal(status.holiday.date, '2026-10-01')
})

test('the day before a holiday still follows the weekday rule', () => {
  const status = computeStatus(new Date('2026-09-30T02:00:00.000Z'), schedule())
  assert.equal(status.state, 'peak')
  assert.equal(status.holiday.isHoliday, false)
})

test('a missing holiday calendar is reported instead of guessed', () => {
  const status = computeStatus(new Date('2027-01-04T02:00:00.000Z'), schedule())
  assert.equal(status.holiday.known, false)
  assert.equal(status.reason, 'peak-hours')
})

test('an off-peak/peak ratio is derived from the prices', () => {
  assert.equal(discountOf(DEFAULT_PRICING.models), 0.5)
})

test('stored data round-trips through validation', () => {
  const normalized = normalizeStoredPricing(structuredClone(DEFAULT_PRICING))
  assert.ok(normalized !== null)
  assert.equal(normalized.models.length, 2)
  assert.equal(normalized.peakWindows.length, 2)
  assert.equal(normalizeStoredPricing({ models: [] }), null)
  assert.equal(normalizeStoredPricing({ ...DEFAULT_PRICING, peakWindows: [[0, 0]] }), null)
  assert.equal(normalizeStoredPricing({ ...DEFAULT_PRICING, version: 1 }), null)
})

test('config can override the windows and weekdays', () => {
  const config = normalizeConfig({ peakWindows: [[0, 60]], weekdays: [6], autoRefreshHours: 0 })
  const overridden = buildSchedule(DEFAULT_PRICING, config)
  assert.deepEqual(overridden.peakWindows, [[0, 60]])
  assert.deepEqual(overridden.weekdays, [6])
  assert.equal(config.autoRefreshHours, 0)
})

test('the tool text names the state, next switch, prices, and source', () => {
  const status = computeStatus(new Date('2026-10-19T02:00:00.000Z'), schedule())
  const text = formatStatusText({
    ...status,
    models: DEFAULT_PRICING.models,
    currency: 'CNY',
    unit: 'per-1M-tokens',
    discount: 0.5,
    source: {
      url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
      fetchedAt: '2026-10-18T10:32:00.000Z',
      origin: 'bundled',
      lastError: null,
    },
  })
  assert.match(text, /PEAK/)
  assert.match(text, /Next change/)
  assert.match(text, /deepseek-flash/)
  assert.match(text, /CNY \(元\)/)
  assert.match(text, /¥0.02\/¥0.04/)
  assert.match(text, /Source:/)
})
