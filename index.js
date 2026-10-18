/**
 * Host half of the DeepSeek price-tip bundle.
 *
 * It owns three things:
 *  - the live peak/off-peak reading (a pure computation over the stored table),
 *  - the refresh operation that reads the official pricing page and stores the
 *    parsed prices plus the peak-hour rule,
 *  - the two browser routes and the agent tool that expose those operations.
 *
 * The Client half only renders; every number it shows comes from these routes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CACHE_VERSION,
  DEFAULT_PRICING,
  PRICING_URL,
  buildSchedule,
  computeStatus,
  discountOf,
  formatStatusText,
  normalizeConfig,
  normalizeStoredPricing,
  parsePricingPage,
} from './lib/pricing.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = join(HERE, 'data', 'pricing-cache.json')

/** Browser route the Client polls for the current reading. */
const STATUS_PATH = '/api/deepseek-price-tip/status'
/** Browser route the refresh button posts to. */
const REFRESH_PATH = '/api/deepseek-price-tip/refresh'
/** Agent tool name. */
const TOOL_NAME = 'deepseek_price_tip'

/** Keep a manual refresh from hammering the docs page. */
const MANUAL_REFRESH_FLOOR_MS = 60_000
/** How often the Host checks whether the stored table has gone stale. */
const AUTO_CHECK_MS = 30 * 60_000

/**
 * @param {unknown} error caught value
 * @returns {string} a useful message
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}

/**
 * Read one URL through the composed web service, falling back to the Host's
 * own fetch when that service is absent or unavailable.
 * @param {import('@deepseek-ai/cordis').Context} ctx plugin context
 * @param {string} url pricing page
 * @returns {Promise<{ content: string, kind: 'html' | 'text' }>} page body
 */
async function fetchPricingPage(ctx, url) {
  /** @type {string | null} */
  let firstError = null
  const web = ctx.get('web')
  if (web !== undefined && typeof web?.fetch === 'function') {
    try {
      const result = await web.fetch({ url })
      if (result.statusCode >= 200 && result.statusCode < 300) {
        return { content: result.body.content, kind: result.body.kind }
      }
      firstError = `web provider returned HTTP ${result.statusCode}`
    } catch (error) {
      firstError = `web provider failed: ${messageOf(error)}`
    }
  }
  if (typeof globalThis.fetch === 'function') {
    try {
      const response = await globalThis.fetch(url, {
        headers: {
          accept: 'text/html, text/plain;q=0.9',
          'user-agent': 'dsh-deepseek-price-tip/1.0 (+local plugin)',
        },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return { content: await response.text(), kind: 'html' }
    } catch (error) {
      const second = `direct fetch failed: ${messageOf(error)}`
      throw new Error(firstError === null ? second : `${firstError}; ${second}`)
    }
  }
  throw new Error(firstError ?? 'no web access service and no global fetch')
}

/**
 * Build the runtime controller for one plugin activation.
 * @param {import('@deepseek-ai/cordis').Context} ctx plugin context
 * @param {ReturnType<typeof normalizeConfig>} config settings
 */
function createController(ctx, config) {
  let data = structuredClone(DEFAULT_PRICING)
  /** @type {'bundled' | 'cache' | 'remote'} */
  let origin = 'bundled'
  /** @type {{ message: string, at: string } | null} */
  let lastError = null
  /** @type {Promise<any> | null} */
  let inFlight = null
  let lastAttempt = 0
  let disposed = false

  /**
   * @param {string} message text
   */
  function log(message) {
    try {
      ctx.logger?.warn?.(`[deepseek-price-tip] ${message}`)
    } catch {
      // Logging must never break the reading.
    }
  }

  /** Build the exact payload the browser and the tool consume. */
  function status() {
    const schedule = buildSchedule(data, config)
    const reading = computeStatus(new Date(), schedule)
    return {
      ok: true,
      ...reading,
      models: data.models.map((model) => ({
        id: model.id,
        cacheHit: { ...model.cacheHit },
        cacheMiss: { ...model.cacheMiss },
        output: { ...model.output },
      })),
      currency: data.currency,
      unit: data.unit,
      discount: discountOf(data.models),
      source: {
        url: data.sourceUrl,
        fetchedAt: data.fetchedAt,
        origin,
        lastError,
      },
    }
  }

  /** Read a previously written table. A broken cache is ignored, never fatal. */
  async function loadCache() {
    try {
      const raw = JSON.parse(await readFile(CACHE_FILE, 'utf8'))
      const cached = normalizeStoredPricing(raw)
      if (cached === null) {
        log('ignoring a cache file with an unusable shape')
        return
      }
      cached.holidays = { ...structuredClone(DEFAULT_PRICING.holidays), ...cached.holidays }
      data = cached
      origin = cached.fetchedBy === 'remote' ? 'remote' : 'cache'
    } catch (error) {
      if (error?.code !== 'ENOENT') log(`could not read the cache: ${messageOf(error)}`)
    }
  }

  /** Persist the next table; a read-only package directory must not fail a refresh. */
  async function saveCache(next) {
    try {
      await mkdir(dirname(CACHE_FILE), { recursive: true })
      await writeFile(CACHE_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    } catch (error) {
      log(`could not write the cache: ${messageOf(error)}`)
    }
  }

  /**
   * Fetch and parse the official page, then replace the stored table.
   * @param {boolean} force skip the manual-refresh floor
   * @returns {Promise<any>} the status after the attempt
   */
  async function refresh(force) {
    if (disposed) throw new Error('plugin is no longer active')
    if (inFlight !== null) return inFlight
    if (!force && Date.now() - lastAttempt < MANUAL_REFRESH_FLOOR_MS) return status()
    inFlight = (async () => {
      lastAttempt = Date.now()
      try {
        const page = await fetchPricingPage(ctx, config.sourceUrl)
        const parsed = parsePricingPage(page.content, page.kind)
        const next = {
          ...data,
          ...parsed,
          version: CACHE_VERSION,
          sourceUrl: config.sourceUrl,
          fetchedAt: new Date().toISOString(),
          fetchedBy: 'remote',
        }
        const normalized = normalizeStoredPricing(next)
        if (normalized === null) throw new Error('the parsed pricing table failed validation')
        data = normalized
        origin = 'remote'
        lastError = null
        await saveCache(data)
        return status()
      } catch (error) {
        lastError = { message: messageOf(error), at: new Date().toISOString() }
        log(`refresh failed: ${lastError.message}`)
        throw error
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  /** Refresh only when the stored table is older than the configured age. */
  function maybeAutoRefresh() {
    if (disposed || config.autoRefreshHours <= 0) return
    const fetchedAt = Date.parse(data.fetchedAt)
    if (!Number.isFinite(fetchedAt)) return
    if (Date.now() - fetchedAt >= config.autoRefreshHours * 3_600_000) {
      refresh(false).catch(() => {})
    }
  }

  /**
   * Start the cache read and the staleness checker.
   * @returns {() => void} cleanup that stops the timer
   */
  function start() {
    void loadCache()
      .catch((error) => log(`cache load failed: ${messageOf(error)}`))
      .then(() => maybeAutoRefresh())
    const timer = setInterval(() => maybeAutoRefresh(), AUTO_CHECK_MS)
    timer.unref?.()
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }

  return { start, status, refresh, maybeAutoRefresh }
}

/**
 * Register the two authenticated browser routes.
 * @param {import('@deepseek-ai/cordis').Context} ctx plugin context
 * @param {ReturnType<typeof createController>} controller runtime controller
 */
function registerRoutes(ctx, controller) {
  const connection = ctx.get('connection')
  if (connection === undefined || typeof connection?.fetch?.register !== 'function') {
    ctx.logger?.warn?.('[deepseek-price-tip] connection.fetch is unavailable; the browser badge will not load')
    return
  }
  ctx.effect(() => {
    const disposeStatus = connection.fetch.register({
      path: STATUS_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => Response.json(controller.status(), {
        headers: { 'cache-control': 'no-store' },
      }),
    })
    const disposeRefresh = connection.fetch.register({
      path: REFRESH_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          const next = await controller.refresh(true)
          return Response.json({ ...next, refreshed: true }, {
            headers: { 'cache-control': 'no-store' },
          })
        } catch (error) {
          return Response.json({
            ...controller.status(),
            refreshed: false,
            refreshError: messageOf(error),
          }, { headers: { 'cache-control': 'no-store' } })
        }
      },
    })
    return () => {
      void disposeStatus()
      void disposeRefresh()
    }
  })
}

/**
 * Register the agent tool that reads or refreshes the same controller.
 * @param {import('@deepseek-ai/cordis').Context} ctx plugin context
 * @param {ReturnType<typeof createController>} controller runtime controller
 */
function registerTool(ctx, controller) {
  const tools = ctx.get('tools')
  if (tools === undefined || typeof tools?.register !== 'function') return
  ctx.effect(() => tools.register({
    name: TOOL_NAME,
    description: [
      'Report whether DeepSeek\'s official API is currently on peak or off-peak pricing,',
      'including the current price table and the time of the next switch.',
      'Use action "refresh" to read the official pricing page again and update the stored table.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'refresh'],
          description: 'status reads the stored table; refresh fetches the official page first (default: status).',
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: formatStatusText(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args) {
      const action = args && typeof args === 'object' && typeof args.action === 'string'
        ? args.action
        : 'status'
      if (action === 'refresh') {
        try {
          const next = await controller.refresh(true)
          return { ...next, refreshed: true }
        } catch (error) {
          return { ...controller.status(), refreshed: false, refreshError: messageOf(error) }
        }
      }
      return { ...controller.status(), refreshed: false }
    },
  }))
}

/**
 * Activate the Host half.
 * @param {import('@deepseek-ai/cordis').Context} ctx plugin context
 * @param {unknown} rawConfig row config
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const controller = createController(ctx, config)
  ctx.effect(() => controller.start())
  // Keep activation independent of composition order: each capability gets its
  // own child fiber and disappears with it.
  ctx.inject(['connection'], (scope) => registerRoutes(scope, controller))
  ctx.inject(['tools'], (scope) => registerTool(scope, controller))
}

export { PRICING_URL }
