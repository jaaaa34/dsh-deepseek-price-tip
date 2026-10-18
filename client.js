/**
 * Client half of the DeepSeek price-tip bundle.
 *
 * This file is plain JavaScript: the Harness browser module loader evaluates it,
 * React comes from the browser module table, and visible text goes through the
 * Client locale service. It registers one ambient pill below the composer and a
 * portaled details dialog; all data comes from the Host routes.
 */
window.__ModuleLoader__.load({
  id: '@local/deepseek-price-tip',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const NS = 'deepseekPriceTip'
    const STATUS_URL = '/api/deepseek-price-tip/status'
    const REFRESH_URL = '/api/deepseek-price-tip/refresh'
    const POLL_MS = 5 * 60 * 1000
    const PANEL_MARGIN = 12
    const PANEL_GAP = 8

    const CSS = `
.dspt-anchor{flex:none;min-width:0;display:inline-flex;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}
.dspt-pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-tertiary,#8b8b8b);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;cursor:pointer}
.dspt-pill:hover,.dspt-pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-secondary,#666)}
.dspt-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary,#999)}
.dspt-dot[data-state="peak"]{background:var(--dsw-alias-state-warn-primary,#d97706)}
.dspt-dot[data-state="off-peak"]{background:var(--dsw-alias-state-success-primary,#16a34a)}
.dspt-label{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dspt-sep{margin:0 6px}
.dspt-panel{position:fixed;z-index:1100;box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-height:min(72vh,560px);overflow:auto;padding:16px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,rgba(248,249,250,.58));backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1,rgba(127,127,127,.25));box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:18px;cursor:default}
.dspt-panel:focus{outline:none}
.dspt-title{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary,#111);font-weight:500}
.dspt-titleLabel{display:inline-flex;align-items:center;gap:6px;min-width:0}
.dspt-rule{margin-bottom:10px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.dspt-close{width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-tertiary,#8b8b8b);font:inherit;font-size:16px;line-height:1;cursor:pointer}
.dspt-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-secondary,#666)}
.dspt-stateRow{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.dspt-chip{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary,#111);font-weight:500}
.dspt-reason{color:var(--dsw-alias-label-tertiary,#8b8b8b)}
.dspt-next{margin-top:6px;color:var(--dsw-alias-label-primary,#111);font-weight:500}
.dspt-meta{margin-top:6px;color:var(--dsw-alias-label-tertiary,#8b8b8b)}
.dspt-table{width:100%;border-collapse:collapse;margin-top:10px;font-variant-numeric:tabular-nums}
.dspt-table thead th{padding:4px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:11px;font-weight:500;text-align:right;white-space:nowrap}
.dspt-table thead th:first-child,.dspt-table thead th.dspt-tierHead{text-align:left}
.dspt-table tbody th,.dspt-table tbody td{padding:5px 6px;text-align:right;white-space:nowrap}
.dspt-table tbody th{text-align:left;font-weight:500;color:var(--dsw-alias-label-primary,#111);vertical-align:top}
.dspt-table tbody tr[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.dspt-table tbody tr[data-active="true"] td{color:var(--dsw-alias-label-primary,#111);font-weight:500}
.dspt-table tbody tr[data-active="false"] td{color:var(--dsw-alias-label-secondary,#666)}
.dspt-table .dspt-tier{text-align:left;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-weight:400}
.dspt-table tbody:not(:first-of-type) tr:first-child th,.dspt-table tbody:not(:first-of-type) tr:first-child td{border-top:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.dspt-discount{margin-top:8px;color:var(--dsw-alias-label-tertiary,#8b8b8b)}
.dspt-warn{margin-top:6px;color:var(--dsw-alias-state-warn-primary,#b45309)}
.dspt-error{margin-top:6px;color:var(--dsw-alias-state-error-primary,#dc2626);overflow-wrap:anywhere}
.dspt-loading{padding:10px 0;color:var(--dsw-alias-label-tertiary,#8b8b8b)}
.dspt-foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.dspt-source{min-width:0;color:var(--dsw-alias-label-tertiary,#8b8b8b)}
.dspt-link{color:var(--dsw-alias-brand-primary,#3b82f6);text-decoration:none}
.dspt-link:hover{text-decoration:underline}
.dspt-origin{margin-left:4px;padding:0 4px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:11px}
.dspt-refresh{flex:none;padding:2px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-secondary,#666);font:inherit;cursor:pointer}
.dspt-refresh:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary,#111)}
.dspt-refresh:disabled{opacity:.6;cursor:default}
.dspt-panel :focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:2px}
@media (max-width:520px){.dspt-detail,.dspt-sep{display:none}}
`

    const ZH = {
      'pill.peak': '峰价',
      'pill.offPeak': '谷价',
      'pill.switch': '{time}后转{target}',
      'pill.unavailable': '价格时段不可用',
      'pill.aria': '{state}，{detail}',
      'pill.ariaNoDetail': '{state}',
      'unit.day': '天',
      'unit.hour': '小时',
      'unit.minute': '分',
      'unit.second': '秒',
      'day.0': '日',
      'day.1': '一',
      'day.2': '二',
      'day.3': '三',
      'day.4': '四',
      'day.5': '五',
      'day.6': '六',
      'panel.title': 'DeepSeek API 价格时段',
      'panel.close': '关闭',
      'panel.next': '距{state}还有 {time}',
      'panel.noChange': '暂无切换时间',
      'panel.windowHoliday': '峰时 {windows}（{zone}）· {days} · 不含中国法定节假日',
      'panel.windowPlain': '峰时 {windows}（{zone}）· {days}',
      'panel.local': '本地时间',
      'panel.weekdays': '周一至周五',
      'panel.customDays': '周{days}',
      'panel.daySep': '、',
      'panel.holidayToday': '今天是节假日（{date}），全天谷价。',
      'panel.holidayUnknown': '未内置 {year} 年的中国法定节假日，节假日当天可能被误判为峰价。',
      'panel.model': '模型',
      'panel.tier': '档位',
      'panel.cacheHit': '缓存命中',
      'panel.cacheMiss': '缓存未命中',
      'panel.output': '输出',
      'tier.peak': '峰',
      'tier.offPeak': '谷',
      'panel.unit.CNY': '元 / 百万 tokens',
      'panel.unit.USD': '美元 / 百万 tokens',
      'panel.discount': '谷价约为峰价的 {percent}%',
      'panel.fetched': '抓取于 {time}',
      'panel.source': '官方定价页',
      'panel.refresh': '立即更新',
      'panel.refreshing': '更新中…',
      'panel.refreshFailed': '更新失败',
      'panel.error': '更新失败：{message}',
      'panel.lastError': '上次自动更新失败：{message}',
      'panel.stale': '无法刷新读数：{message}',
      'panel.loadFailed': '无法读取价格时段：{message}',
      'panel.retry': '重试',
      'panel.loading': '正在读取价格时段…',
      'source.bundled': '内置',
      'source.cache': '缓存',
      'source.remote': '官网',
      'reason.peak-hours': '工作日峰时',
      'reason.holiday': '法定节假日',
      'reason.weekend': '周末',
      'reason.outside-peak-hours': '非高峰时段',
    }

    const EN = {
      'pill.peak': 'Peak',
      'pill.offPeak': 'Off-peak',
      'pill.switch': '{time} to {target}',
      'pill.unavailable': 'Price period unavailable',
      'pill.aria': '{state}, {detail}',
      'pill.ariaNoDetail': '{state}',
      'unit.day': 'd',
      'unit.hour': 'h',
      'unit.minute': 'm',
      'unit.second': 's',
      'day.0': 'Sun',
      'day.1': 'Mon',
      'day.2': 'Tue',
      'day.3': 'Wed',
      'day.4': 'Thu',
      'day.5': 'Fri',
      'day.6': 'Sat',
      'panel.title': 'DeepSeek API price period',
      'panel.close': 'Close',
      'panel.next': '{state} in {time}',
      'panel.noChange': 'No upcoming switch',
      'panel.windowHoliday': 'Peak {windows} ({zone}) · {days} · Chinese holidays excluded',
      'panel.windowPlain': 'Peak {windows} ({zone}) · {days}',
      'panel.local': 'local time',
      'panel.weekdays': 'Mon–Fri',
      'panel.customDays': '{days}',
      'panel.daySep': ', ',
      'panel.holidayToday': 'Today ({date}) is a Chinese public holiday, so the whole day is off-peak.',
      'panel.holidayUnknown': 'No Chinese holiday calendar for {year}; a holiday may be misread as peak.',
      'panel.model': 'Model',
      'panel.tier': 'Tier',
      'panel.cacheHit': 'Cache hit',
      'panel.cacheMiss': 'Cache miss',
      'panel.output': 'Output',
      'tier.peak': 'Peak',
      'tier.offPeak': 'Off',
      'panel.unit.CNY': 'CNY / 1M tokens',
      'panel.unit.USD': 'USD / 1M tokens',
      'panel.discount': 'Off-peak is about {percent}% of peak',
      'panel.fetched': 'Fetched {time}',
      'panel.source': 'Official pricing page',
      'panel.refresh': 'Refresh now',
      'panel.refreshing': 'Refreshing…',
      'panel.refreshFailed': 'Refresh failed',
      'panel.error': 'Refresh failed: {message}',
      'panel.lastError': 'Last automatic refresh failed: {message}',
      'panel.stale': 'Could not refresh the reading: {message}',
      'panel.loadFailed': 'Could not read the price period: {message}',
      'panel.retry': 'Retry',
      'panel.loading': 'Loading the price period…',
      'source.bundled': 'built-in',
      'source.cache': 'cached',
      'source.remote': 'official',
      'reason.peak-hours': 'weekday peak hours',
      'reason.holiday': 'public holiday',
      'reason.weekend': 'weekend',
      'reason.outside-peak-hours': 'outside peak hours',
    }

    /**
     * @param {string} name class suffix
     * @returns {string} prefixed class name
     */
    function cls(name) {
      return `dspt-${name}`
    }

    /**
     * @param {unknown} error caught value
     * @returns {string} message text
     */
    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /**
     * @param {number} value price
     * @param {'CNY' | 'USD'} currency displayed currency
     * @returns {string} compact price text
     */
    function formatPrice(value, currency) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      const fixed = value.toFixed(4).replace(/\.?0+$/, '')
      const symbol = currency === 'CNY' ? '¥' : '$'
      return `${symbol}${fixed === '' ? '0' : fixed}`
    }

    /**
     * @param {string} iso timestamp
     * @returns {string} local stamp without seconds
     */
    function formatStamp(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return String(iso ?? '—')
      return date.toLocaleString(undefined, {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      })
    }

    /**
     * @param {number} minutes minutes after 00:00 UTC
     * @returns {string} local clock text
     */
    function formatClock(minutes) {
      const date = new Date(Date.UTC(2020, 0, 1, Math.floor(minutes / 60), minutes % 60))
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    }

    /**
     * @param {number} milliseconds remaining time
     * @param {Function} t translate
     * @returns {string} compact remaining text
     */
    function formatRemaining(milliseconds, t) {
      const total = Math.max(0, Math.round(milliseconds / 1000))
      const days = Math.floor(total / 86400)
      const hours = Math.floor((total % 86400) / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      if (days > 0) return `${days}${t('unit.day')}${hours}${t('unit.hour')}`
      if (hours > 0) return `${hours}${t('unit.hour')}${minutes}${t('unit.minute')}`
      if (minutes > 0) return `${minutes}${t('unit.minute')}${String(seconds).padStart(2, '0')}${t('unit.second')}`
      return `${seconds}${t('unit.second')}`
    }

    /**
     * @param {number[]} weekdays JavaScript weekday numbers
     * @param {Function} t translate
     * @returns {string} readable weekday list
     */
    function formatDays(weekdays, t) {
      const workweek = [1, 2, 3, 4, 5]
      if (weekdays.length === workweek.length && workweek.every((day) => weekdays.includes(day))) {
        return t('panel.weekdays')
      }
      return t('panel.customDays', {
        days: weekdays.map((day) => t(`day.${day}`)).join(t('panel.daySep')),
      })
    }

    /**
     * @param {number} discount ratio
     * @returns {string} integer percentage value without the percent sign,
     *   because the locale templates already append it
     */
    function formatPercent(discount) {
      return String(Math.round((typeof discount === 'number' ? discount : 0.5) * 100))
    }

    /**
     * Fetch the status payload and keep a server-clock offset so the countdown
     * does not depend on the browser clock.
     */
    function usePricing() {
      const [snapshot, setSnapshot] = React.useState({ data: null, error: null, loading: true })
      const [now, setNow] = React.useState(() => Date.now())
      const offsetRef = React.useRef(0)
      const mountedRef = React.useRef(true)

      const accept = React.useCallback((data) => {
        if (!data || data.ok !== true) {
          setSnapshot((previous) => ({ data: previous.data, error: 'invalid status payload', loading: false }))
          return
        }
        offsetRef.current = Date.now() - (typeof data.nowMs === 'number' ? data.nowMs : Date.now())
        setSnapshot({ data, error: null, loading: false })
      }, [])

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(STATUS_URL, {
            cache: 'no-store',
            headers: { accept: 'application/json' },
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          accept(await response.json())
        } catch (error) {
          if (mountedRef.current) {
            setSnapshot((previous) => ({ data: previous.data, error: messageOf(error), loading: false }))
          }
        }
      }, [accept])

      React.useEffect(() => {
        mountedRef.current = true
        void load()
        const poll = setInterval(() => { void load() }, POLL_MS)
        const onVisible = () => {
          if (document.visibilityState === 'visible') void load()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          mountedRef.current = false
          clearInterval(poll)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [load])

      React.useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(tick)
      }, [])

      const nextChangeMs = snapshot.data?.nextChangeMs
      React.useEffect(() => {
        if (typeof nextChangeMs !== 'number') return undefined
        const delay = nextChangeMs - (Date.now() - offsetRef.current) + 2000
        if (delay <= 0 || delay > 6 * 3600 * 1000) return undefined
        const timer = setTimeout(() => { void load() }, delay)
        return () => clearTimeout(timer)
      }, [nextChangeMs, load])

      return { ...snapshot, now, offsetRef, load, accept }
    }

    /**
     * The ambient pill and its details dialog.
     * @param {{ t: Function }} props slot locale seat
     */
    function PricePill({ t }) {
      const pricing = usePricing()
      const [open, setOpen] = React.useState(false)
      const [pos, setPos] = React.useState(null)
      const [refreshing, setRefreshing] = React.useState(false)
      const [refreshError, setRefreshError] = React.useState(null)
      const rootRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const data = pricing.data

      const remaining = data && typeof data.nextChangeMs === 'number'
        ? data.nextChangeMs - (pricing.now - pricing.offsetRef.current)
        : null
      const isPeak = data?.state === 'peak'
      const stateLabel = data === null ? t('pill.unavailable') : isPeak ? t('pill.peak') : t('pill.offPeak')
      const targetLabel = isPeak ? t('pill.offPeak') : t('pill.peak')
      const countdown = remaining === null ? null : formatRemaining(remaining, t)
      const detail = countdown === null ? null : t('pill.switch', { time: countdown, target: targetLabel })

      React.useEffect(() => {
        if (!open) {
          setPos(null)
          return undefined
        }
        const place = () => {
          const anchor = rootRef.current
          const panel = panelRef.current
          if (anchor === null || panel === null) return
          const rect = anchor.getBoundingClientRect()
          const width = panel.offsetWidth
          const height = panel.offsetHeight
          const left = Math.min(
            Math.max(PANEL_MARGIN, rect.left),
            Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
          )
          let top = rect.top - height - PANEL_GAP
          if (top < PANEL_MARGIN) {
            top = Math.min(window.innerHeight - height - PANEL_MARGIN, rect.bottom + PANEL_GAP)
          }
          setPos({ left, top: Math.max(PANEL_MARGIN, top) })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, data, refreshError, refreshing])

      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            event.stopPropagation()
          }
        }
        const onDown = (event) => {
          const target = event.target
          if (rootRef.current?.contains(target) === true) return
          if (panelRef.current?.contains(target) === true) return
          setOpen(false)
        }
        document.addEventListener('keydown', onKey, true)
        document.addEventListener('pointerdown', onDown, true)
        return () => {
          document.removeEventListener('keydown', onKey, true)
          document.removeEventListener('pointerdown', onDown, true)
        }
      }, [open])

      const refresh = async () => {
        if (refreshing) return
        setRefreshing(true)
        setRefreshError(null)
        try {
          const response = await fetch(REFRESH_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: '{}',
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          if (payload?.refreshed === false) throw new Error(payload.refreshError || t('panel.refreshFailed'))
          pricing.accept(payload)
        } catch (error) {
          setRefreshError(messageOf(error))
        } finally {
          setRefreshing(false)
        }
      }

      if (data === null && pricing.loading) return null

      const ariaDetail = detail === null ? t('pill.ariaNoDetail', { state: stateLabel }) : t('pill.aria', { state: stateLabel, detail })
      const close = () => setOpen(false)

      /** @returns {any} details body */
      const body = () => {
        if (data === null) {
          return h(React.Fragment, null,
            pricing.error === null
              ? h('div', { className: cls('loading') }, t('panel.loading'))
              : h('div', { className: cls('error') }, t('panel.loadFailed', { message: pricing.error })),
            h('div', { className: cls('foot') },
              h('span', { className: cls('source') }, t('panel.source')),
              h('button', { type: 'button', className: cls('refresh'), disabled: refreshing, onClick: refresh },
                refreshing ? t('panel.refreshing') : t('panel.retry')),
            ),
          )
        }
        const windowsText = data.peakWindows.map(([start, end]) => `${formatClock(start)}–${formatClock(end)}`).join(', ')
        const daysText = formatDays(data.weekdays, t)
        const zoneText = t('panel.local')
        const scheduleText = data.excludeChineseHolidays
          ? t('panel.windowHoliday', { windows: windowsText, days: daysText, zone: zoneText })
          : t('panel.windowPlain', { windows: windowsText, days: daysText, zone: zoneText })
        const reasonText = t(`reason.${data.reason}`)
        const nextText = data.nextState === null || countdown === null
          ? t('panel.noChange')
          : t('panel.next', { state: data.nextState === 'peak' ? t('pill.peak') : t('pill.offPeak'), time: countdown })

        /** @param {{ id: string }} model */
        const modelRows = (model) => h('tbody', { key: model.id },
          h('tr', { 'data-active': isPeak ? 'true' : 'false' },
            h('th', { scope: 'rowgroup', rowSpan: 2, className: cls('model') }, model.id),
            h('td', { className: cls('tier') }, t('tier.peak')),
            h('td', null, formatPrice(model.cacheHit.peak, data.currency)),
            h('td', null, formatPrice(model.cacheMiss.peak, data.currency)),
            h('td', null, formatPrice(model.output.peak, data.currency)),
          ),
          h('tr', { 'data-active': isPeak ? 'false' : 'true' },
            h('td', { className: cls('tier') }, t('tier.offPeak')),
            h('td', null, formatPrice(model.cacheHit.offPeak, data.currency)),
            h('td', null, formatPrice(model.cacheMiss.offPeak, data.currency)),
            h('td', null, formatPrice(model.output.offPeak, data.currency)),
          ),
        )

        return h(React.Fragment, null,
          h('div', { className: cls('stateRow') },
            h('span', { className: cls('chip') },
              h('span', { className: cls('dot'), 'data-state': data.state, 'aria-hidden': true }),
              stateLabel),
            h('span', { className: cls('reason') }, reasonText),
          ),
          h('div', { className: cls('next') }, nextText),
          h('div', { className: cls('meta') }, scheduleText),
          data.holiday.isHoliday
            ? h('div', { className: cls('meta') }, t('panel.holidayToday', { date: data.holiday.date }))
            : null,
          h('table', { className: cls('table') },
            h('thead', null,
              h('tr', null,
                // The model cell below spans both tier rows, so the header
                // needs an explicit tier column to keep prices under their
                // own headings.
                h('th', { scope: 'col' }, t('panel.model')),
                h('th', { scope: 'col', className: cls('tierHead') }, t('panel.tier')),
                h('th', { scope: 'col' }, t('panel.cacheHit')),
                h('th', { scope: 'col' }, t('panel.cacheMiss')),
                h('th', { scope: 'col' }, t('panel.output')),
              ),
            ),
            data.models.map(modelRows),
          ),
          h('div', { className: cls('discount') },
            `${t(data.currency === 'CNY' ? 'panel.unit.CNY' : 'panel.unit.USD')} · ${t('panel.discount', { percent: formatPercent(data.discount) })}`),
          data.holiday.known ? null : h('div', { className: cls('warn') }, t('panel.holidayUnknown', { year: data.holiday.year })),
          data.source.lastError === null ? null : h('div', { className: cls('warn') }, t('panel.lastError', { message: data.source.lastError.message })),
          pricing.error === null ? null : h('div', { className: cls('warn') }, t('panel.stale', { message: pricing.error })),
          refreshError === null ? null : h('div', { className: cls('error') }, t('panel.error', { message: refreshError })),
          h('div', { className: cls('foot') },
            h('div', { className: cls('source') },
              h('a', { className: cls('link'), href: data.source.url, target: '_blank', rel: 'noreferrer' }, t('panel.source')),
              ' · ',
              t('panel.fetched', { time: formatStamp(data.source.fetchedAt) }),
              h('span', { className: cls('origin') }, t(`source.${data.source.origin}`)),
            ),
            h('button', { type: 'button', className: cls('refresh'), disabled: refreshing, onClick: refresh },
              refreshing ? t('panel.refreshing') : t('panel.refresh')),
          ),
        )
      }

      const panel = open ? ReactDOM.createPortal(
        h('div', {
          ref: panelRef,
          className: cls('panel'),
          role: 'dialog',
          'aria-label': t('panel.title'),
          style: pos === null
            ? { visibility: 'hidden', left: 0, top: 0 }
            : { left: `${pos.left}px`, top: `${pos.top}px` },
        },
        h('div', { className: cls('title') },
          h('div', { className: cls('titleLabel') },
            h('span', { className: cls('dot'), 'data-state': data?.state ?? 'unknown', 'aria-hidden': true }),
            h('span', null, t('panel.title')),
          ),
          h('button', { type: 'button', className: cls('close'), onClick: close, 'aria-label': t('panel.close') }, '×'),
        ),
        h('div', { className: cls('rule'), 'aria-hidden': true }),
        body(),
        ),
        document.body,
      ) : null

      return h(React.Fragment, null,
        h('span', { className: cls('anchor'), ref: rootRef },
          h('button', {
            type: 'button',
            className: cls('pill'),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-label': ariaDetail,
            title: ariaDetail,
            onClick: () => {
              setPos(null)
              setOpen((value) => !value)
            },
          },
          h('span', { className: cls('dot'), 'data-state': data?.state ?? 'unknown', 'aria-hidden': true }),
          h('span', { className: cls('label') },
            stateLabel,
            detail === null ? null : h('span', { className: cls('sep'), 'aria-hidden': true }, '·'),
            detail === null ? null : h('span', { className: cls('detail') }, detail),
          ),
          ),
        ),
        panel,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.pluginCss = '@local/deepseek-price-tip'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => style.remove()
        })
        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH))
        ctx.effect(() => ctx.locale.register(NS, 'en', EN))
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'deepseek-price-tip',
          order: 2,
          locale: NS,
        }, PricePill))
      },
    }
  },
})
