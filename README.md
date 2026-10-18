# DeepSeek 价格峰谷提醒

在 Harness Web UI 的输入框下方显示一个小胶囊，提醒你 DeepSeek 官方 API 当前处于 **峰价** 还是 **谷价**，以及距离下次切换还有多久。点开胶囊可以查看当前价目表（人民币）、峰时规则、数据来源和抓取时间，并可从官网重新抓取。

## 功能

- **实时读数**：按官网规则计算当前时段（北京时间 09:00–12:00、14:00–18:00，周一至周五，不含中国法定节假日），并倒计时到下一次切换。
- **人民币价目表**：读取官方中文定价页，显示模型、档位、缓存命中/未命中输入价、输出价，峰/谷两档同时列出，当前生效的一档高亮。
- **从官网更新**：面板里的“立即更新”会读取 <https://api-docs.deepseek.com/zh-cn/quick_start/pricing>，同时更新价格和峰谷时段规则（时间窗口、星期、是否排除节假日）。
- **自动更新**：启动时以及之后每 30 分钟检查一次，缓存超过 `autoRefreshHours` 小时就在后台重新抓取。抓取失败时保留旧表，并在面板里报告原因。
- **Agent 工具**：`deepseek_price_tip`，`action: status | refresh`，与面板共用同一份数据。

## 安装

本仓库就是插件包本身（`package.json` 里的 `dsh.bundle.patch` 和 `dsh.client`），没有构建步骤，也没有第三方依赖，只用 Node 内置模块。

**从 GitHub 安装**

在 Harness 的插件管理里安装这个 bundle，安装 spec 填：

```text
github:jaaaa34/dsh-deepseek-price-tip
```

也可以让 Agent 调用 `plugin_manager` 的 `install_bundle`，`target` 用同一个 spec。装好后重启 Harness Web UI，输入框下方就会出现胶囊。

**本地开发时直接 link**

在 profile 的 `package.json` 里把依赖指向本目录，并把包名加进 `dsh.profile.bundles`：

```json
"@local/deepseek-price-tip": "link:C:/path/to/dsh-deepseek-price-tip"
```

## 数据与缓存

| 内容 | 位置 |
| --- | --- |
| 人民币价格、峰时窗口、星期规则 | 首次抓取后写入 `data/pricing-cache.json` |
| 内置兜底数据 | `lib/pricing.js` 的 `DEFAULT_PRICING`（2026-10-18 抓取，人民币） |
| 中国法定节假日 | 内置 2026 年安排，来源见 `HOLIDAY_SOURCE`；跨年后请用配置补充 |

如果官网表格结构发生大改，解析会失败而不是写入半张表：界面继续显示上一次成功的数据，并提示失败原因。

## 配置

在 profile 的 `cordis.patch.yml` 中给这一行加 `config`：

```yaml
- id: deepseek-price-tip
  name: '@local/deepseek-price-tip'
  config:
    autoRefreshHours: 6
    # 可选：覆盖峰时窗口，单位是 UTC 零点的分钟数
    # peakWindows: [[60, 240], [360, 600]]
    # 可选：覆盖星期（0 = 周日，6 = 周六）
    # weekdays: [1, 2, 3, 4, 5]
    # 可选：追加法定节假日（YYYY-MM-DD）
    # holidays: ['2027-01-01']
    # 可选：换一个抓取地址（英文页会按美元解析并显示 $）
    # sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing'
```

`autoRefreshHours: 0` 关闭自动抓取，只保留手动按钮。

## 验证

```powershell
npm test
```

也可以单独跑其中一组：

```powershell
node test/pricing.test.mjs   # 解析、峰谷计算、节假日、缓存校验
node test/host.test.mjs      # Host 路由、刷新、失败回退、Agent 工具
node test/client.test.mjs    # Client 注册、locale 字典、样式清理
```

不需要 `npm install`：测试只用 Node 内置模块（Node 20+）。GitHub Actions 在 Node 20/22/24 上跑同一套测试，见 `.github/workflows/test.yml`。

安装后在 Harness Web UI 里确认：输入框下方出现胶囊；点开有价目表；点“立即更新”后抓取时间变化。浏览器内的实际渲染效果需要在页面中查看，测试只覆盖模块注册和纯逻辑。

## 限制

- 峰时窗口支持官网中文页的“北京时间 … 为高峰时段”和英文页的 “Peak hours are … UTC” 两种写法；页面改版时可能需要调整解析器。
- 节假日只内置到 2026 年。2027 年及以后，界面会明确提示“未内置该年节假日”，避免把节假日误报成峰价。
- 价格表按官网当前的“模型列 + 峰/谷行”结构解析；Search & Fetch 的按次计费不在模型价目表内。
- 人民币价格直接取自官方中文页，不是按汇率从美元换算。
- 缓存写在插件包目录里的 `data/pricing-cache.json`（已在 `.gitignore` 中忽略）。重新安装或升级插件会让这份缓存丢失，下次刷新时重新抓取，期间用内置的 `DEFAULT_PRICING` 兜底。
