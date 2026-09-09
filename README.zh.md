# dsh-lan-access

> **适用人群**：本插件只适合**已经配置好虚拟局域网**（EasyTier / Tailscale / WireGuard / ZeroTier 等），或只打算从**自己可控的安全局域网**（家庭、办公室内网）访问 dsh Web 界面的用户。
>
> **⚠️ 安全提示**：开启局域网访问意味着**任何能访问该地址的人都能操作你的 Harness —— 相当于把远程代码执行暴露到该网段**。请只在可信网络启用；不要在公共 Wi-Fi、校园网、共享机房网段启用；不要把启动日志里带 token 的 URL 转发给他人。
>
> **🤖 关于本仓库**：本仓库的全部代码、文档与提交都由 AI 编码 Agent 生成，作者未逐行人工审阅。请自行审阅 `cordis.patch.yml` 与 `lib/client.js`（其中含对 dsh 内部结构的处理）后再使用。欢迎 issue / PR。

打开 DeepSeek Harness Web GUI 的局域网访问限制：让局域网内的其他设备（包括虚拟局域网 / VPN 网段）通过 `局域网IP:端口` 直接访问，并在设置界面提供一个选项卡配置要绑定的局域网 IP。

## 它解决什么

`dsh web` 有四层局域网护栏，本插件全部打开：

| 护栏 | 位置 | 本插件的处理 |
| --- | --- | --- |
| 默认只监听 `127.0.0.1` | `dsh-host-webserver`（host schema 仅允许 `127.0.0.1` / `0.0.0.0`） | 启用后通过 patch 层把 `webserver` 行的 host 设为 `0.0.0.0`（全接口监听） |
| CLI 拒绝 `--host 0.0.0.0` | `dsh-web-app/startup` | 走组合配置路径（patch 层），不经过 CLI 护栏；README 末尾有说明 |
| `/api` 浏览器信任围栏 | `dsh-client-connection` 的 `trustedHosts` | 围栏**只**信任你填写的地址；只有当你一个地址都没填时，才回退到 dsh 自动派生的信任项（见「严格围栏」） |
| 浏览器会话认证（token/ cookie） | `dsh-client-connection` | 启动时打印带 token 的局域网 URL；首次访问用 token URL 换取 cookie 后即可正常使用（**这一层可以用 `noAuth` 整层关掉**，见「免鉴权」） |

因为 webserver schema 只允许 `127.0.0.1` / `0.0.0.0`，插件不直接绑定某个具体 IP，而是：**监听所有网卡（0.0.0.0）+ 信任你配置的地址**。访问地址在设置页配置，效果与“绑定到这个局域网 IP”等价，且接口晚于启动出现（如 VPN 后启动）也不影响。

## 安装

```bash
dsh plugin --profile web add github:longisland-icetea/dsh-lan-access
# 后续升级：
dsh plugin --profile web update dsh-lan-access
```

> ⚠️ **npm 上的 `dsh-lan-access` 是别人的包**（Leon0555，`0.1.3`，bind 0.0.0.0 + `crypto.randomUUID` polyfill），与本插件无关。本插件目前**只从 GitHub 安装**，不发布到 npm。

然后重启 `dsh web`（重启后设置页即可见“局域网访问”选项卡）。

## 使用

1. 打开 Web UI 的 **设置 → 局域网访问** 选项卡。
2. 勾选“打开局域网访问”，在“访问地址（局域的 IP）”里填你要用来访问的地址（可逗号分隔多个），也可以点“使用”自动填充检测到的本机 IPv4 地址。
3. 点“保存”，重启 `dsh web` 生效。
4. 重启后终端会打印 `dsh-lan-access: LAN: http://<ip>:<port>/?token=...`。局域网设备用这个完整地址首次访问（换取浏览器 cookie），之后直接用干净地址即可。
5. 不想做这一步、也不想被 cookie 到期/清缓存打断，就勾“免鉴权”：见下节。

## 严格围栏（0.2.0 起，破坏性变更）

dsh 自己在 webserver 绑定 `0.0.0.0` 时会信任**所有非内部 IPv4**（`dsh-web-app` 的 `resolveLanTrust`）。0.1.x 取的是并集，于是你在 `accessHosts` 里删掉的地址仍会被信任。0.2.0 起：

- **配置了地址** → 只有这些地址能过 `/api` 围栏，dsh 自动信任的那份不再并入；
- **一个地址都没配** → 回退到 dsh 的自动信任，否则「启用但没配」会把所有局域网访客 403 锁死。

想退回 0.1.x 的并集行为，把 `cordis.patch.yml` 里 `connection` 行 `trustedHosts` 表达式中「配置非空则直接返回配置」的分支改成「配置与 `ctx.webRuntime.trustedHosts` 取并集」即可。

> 注意：启动日志里 `dsh web: ... (LAN: http://<ip>:<port>/?token=...)` 是 dsh 自己按 `lanAddresses[0]` 打印的，严格模式下**未必可用**；以插件自己那行 `dsh-lan-access: LAN: ...` 为准。

## 从局域网地址打开页面时的两个额外行为

dsh 有个客户端策略：`persistence = ctx.remote.$host.isLoopback ? "host" : "memory"`（`dsh-client-ui-settings`）。也就是说**只要不是从 `127.0.0.1` 打开，整个设置层就退化成内存模式**——读不到、写了也不落盘。本插件为远程访问补了两件事：

1. **内测/欢迎声明不再每次刷新重弹**：它的确认位存在 `ui-onboarding.welcomeNoticeVersion`，内存模式下永远读不到。插件用更低的 `priority` 注册一个同 id（`welcome-notice`）的空壳顶替该槽位（SlotCore 语义：同 id 低 priority 覆盖，"lowest renders"），渲染为空并立刻标记该步完成。只在非回环访问时注册。
2. **设置层救援**：把共享的 describe mirror 从 memory 拉回 host 并触发真实读取，让「提供方目录」「可配置插件列表」等不再报 `settings are unavailable in this browser`；已绑定的 namespace scope 因为在 bind 时就固定了 `persistence`，插件会对 `SettingsScopeController` 原型上的 `getSnapshot` / `subscribe` 打惰性补丁，首次读取时补上 mirror 订阅并重算一次（`derive()` 本身只读共享 mirror，与 `persistence` 无关）。

**用 `rescueSettings` 关闭**（默认开启）：设置页「远程访问时修复设置层」勾选框，或直接写 `~/.dsh/settings.yaml`：

```yaml
lan-access:
  rescueSettings: false
```

关闭后上述第 2 项完全不执行（第 1 项仍在，它只走公开槽位，不碰 dsh 内部结构）。

### 浏览器会话有效期（`sessionDays`）

用带 token 的地址访问一次后，cookie 会在那台设备上保存 `sessionDays` 天，期间直接打开干净地址即可，不必再翻启动日志。要点：

- 默认 **30**（等于 dsh 原值），可调范围 **1–3650**；设置页「浏览器会话有效期（天）」，或写进 `settings.yaml` 的 `lan-access.sessionDays`。改动需重启 `dsh web`。
- cookie 按**访问地址**（host:port）分别保存，`.2` 与 `.5` 各一份，互不影响。
- **重启 dsh 不会让 cookie 失效** —— 校验只用到 `~/.dsh/.credentials.yaml` 里持久化的签名密钥，不含进程随机数。真正的失效条件是：到期、删了 `.credentials.yaml`、或浏览器清了 cookie。
- 调大的代价：拿到那台设备的人在这段时间内都能直接操作 Harness。

### 免鉴权（`noAuth`，0.4.0 起）

cookie 路径有个麻烦：换新设备、换浏览器、清了 cookie、或 cookie 到期，都得回头翻启动日志找那串 token。设置页「免鉴权（去掉启动 token 与 cookie 登录）」把这层整个摘掉——之后任何能连到这个端口的人直接就能用，不需要任何凭据：

```yaml
lan-access:
  enabled: true
  accessHosts:
    - 192.168.255.5
  noAuth: true
```

生效方式（宿主机侧，见 `lib/index.js` 的 `disableBrowserAuth`）：`client-connection` 只问两个问题，插件把这两个答案换掉——

| 原方法 | 原行为 | 免鉴权后 |
| --- | --- | --- |
| `requestRejection(request)` | Host/Origin 不信任 → `403`；没有有效 cookie → `401` | **只**去掉 `401`；`403`（`trustedHosts` 围栏）原样保留 |
| `authorizeIndex(request, response)` | 首屏要么拿 `?token=` 换 cookie，要么出示 cookie | 一律放行；碰到陈旧的 `?token=` 书签则 303 跳回干净地址 |
| `authenticatedUrl(baseUrl)` | 拼上 `?token=…` | 原样返回，启动日志那行 `LAN:` 也不再带 token |

要点：

- **默认关闭**。开启后 `sessionDays` 不再有意义（没有任何会话需要保活），设置页会把那一项置灰。
- **与「打开局域网访问」相互独立**：`noAuth` 只管要不要凭据，不管监听地址。开着它、关掉局域网访问，本机 `127.0.0.1` 同样免登录。
- **Host/Origin 围栏仍在**：不在「访问地址」里的 Host 依旧 `403`。这层不是“登录”，是防 DNS rebinding / 跨站调用 `/api` 的，摘掉它等于把你浏览器里任何网页都变成 Harness 的客户端，所以本插件不提供这个开关。
- **其余全部交给网络**：虚拟局域网 / VPN / 防火墙 / 网段隔离，谁都行——但请确认它们真的挡住了不该来的人。
- 改动需要重启 `dsh web`；生效时启动日志会打印 `dsh-lan-access: browser authentication removed (noAuth) ...`。若打印的是 `... exposes no browser authentication to remove`，说明你装的 dsh 改了 `connection` 的方法名，此时 dsh 的登录照旧（插件不会假装成功）。
- 它改的是 `connection` 服务**原型**上的方法（dsh 内部结构）。补丁带还原函数，挂在插件 fiber 上随插件卸载一起撤销；和「设置层救援」一样，最坏情况是降级回 dsh 原行为，不会白屏。

## 工作原理（插件结构，0.6.0 起）

0.6.0 改为**静态组合、零运行时行所有权**：绑定与围栏由 bundle patch 里的 loader `!!js` 表达式在**每次启动时求值一次**决定，进程运行期间不再改任何行：

- **`cordis.patch.yml`**（bundle 层）做三件事：
  1. `insert:` 插件自身行 `lan-access`（market 开关只会把 `disabled` 写在这一行上，永远碰不到官方行）；
  2. 按 id 覆盖 `webserver` 行：`host` 是表达式——`lan-access` 条目启用**且**设置页「打开局域网访问」开启时为 `0.0.0.0`，否则为官方表达式（`ctx.webStartup.host ?? '127.0.0.1'`）；
  3. 按 id 覆盖 `connection` 行：`trustedHosts` 在两个开关都开启时为「配置的 `accessHosts`（严格围栏，配置即策略；为空才回退到 `ctx.webRuntime.trustedHosts`）」，否则为官方表达式；`cookieMaxAgeDays` 同理取 `sessionDays`（默认 30）。

  表达式通过 `[...ctx.loader.entries()]` 读取 `lan-access` 条目的 `disabled` 状态（dshmarket 开关在启动前写进组合层的那一位），并通过注入的 `settings` 服务读 `settings.yaml` 的 `lan-access.enabled`（设置页开关）——两者都在启动前就位，因此**没有时序竞态**；表达式全部失败闭合（任何求值错误都回退官方默认，绝不导致启动失败）。
- **宿主端 `lib/index.js`**：注册 `lan-access` 设置命名空间（`enabled` + `accessHosts` + `rescueSettings` + `noAuth` + `sessionDays`），暴露 `lanAccess/overview` Remote，启动后**只读**校验覆盖是否生效（不重写、不 `entry.update`），按 `noAuth` 决定是否摘掉浏览器鉴权，并打印局域网 URL（免鉴权时不带 token）。
- **浏览器端 `lib/client.js`**：注册“局域网访问”设置选项卡（`settings.section` 槽位），读写 `remote.settings`，调用 `lanAccess/overview` 展示本机 IP 候选和生效状态。

**开关语义 = 重启生效**：设置页保存、或 market 里禁用/启用，都只改变组合层里的状态（market 写 patch 的 `disabled`、设置页写 settings 的 `enabled`），下次 `dsh web` 重启时表达式求值出新的绑定与围栏。运行中的进程保持原状，Remote 的 overview 会如实报告 `live vs configured` 差异（设置页文案本就写的是“重启后生效”）。

插件**零运行时依赖**（宿主端只 import Node 内置模块；设置 schema 为可调用对象，Remote 用鸭子类型绑定），因此无论以 registry、tarball 还是本地 `link:` 安装都能工作，也不与 dsh 安装里的模块副本发生实例冲突。

## 升级 dsh 后会不会失效？

设计目标是**噪音式降级，而不是静默失效**：

- 针对 dsh 官方行的覆盖是**按 id 的 patch**；某行 id 或结构变化时，组合器会警告并跳过该条（dsh 照常启动、完全回到官方行为），插件启动时的只读校验会打印 `LAN access configured but not live ...`，并提示“重启后若仍不生效，可能是该 dsh 版本改了 `webserver`/`connection` 行的结构”。
- 两条 `!!js` 表达式**失败闭合**：任何求值错误都回退到官方默认（回环绑定 / 部署默认信任表），不会让 dsh 启动失败。
- 插件只依赖稳定的公开接缝：`settings` 服务、`webStartup` / `webRuntime` 服务形状、`loader.entries()` 的条目状态、`connection` 的 `trustedHosts`、`settings.section` / `settings.onboarding` 槽位、`remote.settings`。
- 唯一碰 dsh 内部结构的两处是「设置层救援」对 `SettingsScopeController` 原型、以及「免鉴权」对 `connection` 服务原型的补丁，都整段包在 `try/catch` 里（免鉴权找不到目标方法时只警告并跳过）：dsh 若改了这些类，最坏结果是相应功能静默失效（救援失效则那几个卡片继续报 `settings are unavailable`；免鉴权失效则继续要 token），不会白屏或启动失败。可分别用 `rescueSettings: false` / `noAuth: false` 关掉。

唯一无法防护的是 dsh 侧**新增护栏**（例如 webserver schema 以后拒绝 `0.0.0.0`，或 CLI 护栏搬到配置层）——那种情况下护栏会赢，插件会如实报告降级状态。

## 排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 设置页选项卡不显示 | 插件行未挂载：检查 `dsh --profile web --dump-config` 里是否有 `lan-access` 行；确认 profile 的 `dsh.profile.bundles` 含 `dsh-lan-access` |
| 启动日志出现 `LAN access configured but not live` | 重启 `dsh web` 让表达式重新求值即可；若重启后依旧，说明该 dsh 版本改了 `webserver` / `connection` 行的 id 或结构（组合器已警告跳过），需要更新插件 |
| 局域网访问打不开（403） | 围栏未信任该地址：确认设置里填的地址规范（纯 IP 或 域名，`host:port` 均可），或该地址不在 webserver 正在监听的网卡上 |
| 局域网访问提示 401 | 需要带 token 的 URL 先换 cookie；重启 `dsh web` 看打印的 `dsh-lan-access: LAN:` 行。不想每次都来这一遍就开 `noAuth` |
| 开了 `noAuth` 还是 401 | 改动需重启 `dsh web`；重启后看日志里有没有 `browser authentication removed (noAuth)`。若出现 `exposes no browser authentication to remove`，说明该 dsh 版本的 `connection` 方法名变了，插件未接管（dsh 登录照旧） |
| 从局域网地址打开时报错 `settings are unavailable in this browser` | 设置层内存模式；确认 `rescueSettings` 未关闭，并且页面是从受信任地址打开的（严格围栏下未配置地址时会回退到 dsh 自动信任） |
| 从局域网地址打开时所有设置项都改不动、刷新后丢失 | 同上：这是 dsh 对非回环页面的既定行为，救援只补读取与写入通道；要完整体验请从 `127.0.0.1` 打开 |

## 安全说明

局域网访问等于把具备代码执行能力的界面暴露给该网段。**只在可信网络启用**，不要转发票面显示的带 token URL；token 每进程随机，cookie 按访问主机绑定。

开启 `noAuth` 后连这层凭据也没有了：任何能连到该端口的人都能直接操作 Harness。此时你的**网络**是唯一的门（虚拟局域网 / VPN / 防火墙 / 网段隔离），而 Host/Origin 围栏只是防止别人借你的浏览器跨站调用 `/api`，不是访问控制。

## 与 `--host 0.0.0.0` 护栏的关系

`dsh web --host 0.0.0.0` 在 CLI 层被明确拒绝（安全护栏）。本插件通过组合配置（bundle patch 层、启动时求值的 `!!js` 表达式）实现同样的“全接口监听”，这是插件的设计意图，也是它的全部功能边界——它不是一个通用“绕过 dsh 安全限制”的工具。

## License

MIT
