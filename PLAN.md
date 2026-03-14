## NAS 机场订阅聚合服务（Node + Vue + Docker）实施方案

### Summary

- 构建一个单管理员、图形化的 NAS Docker 服务，聚合多个机场订阅并产出 `Clash/Mihomo` 配置。
- 默认内置整套分流规则（来自 [`base-rules.yaml`](./base-rules.yaml)，涵盖订阅直连、Steam 直连、Apple 分流、国内直连、海外代理、广告拦截、Telegram IP 段、GeoIP CN 兜底共 9 个分类），支持 YAML 可视编辑与增删。
- 配置产出同时支持两种方式：本地订阅 URL（推荐）+ 手动导出 YAML。
- 核心策略：优先保留源订阅的基础配置（尤其 DNS 相关），聚合层可覆盖。
- 节点不固化写死到最终配置，最终配置使用 `proxy-providers`，客户端自行定时拉取。
- `proxy-providers` URL 经由本服务代理中转，防止原始订阅链接泄露到客户端配置文件。

### Key Changes

- 架构与部署
    - 单镜像部署：`Node.js API + 静态 Vue 前端`，一个容器完成服务。
    - 数据持久化：`SQLite`（挂载 volume）。
    - `docker-compose.yml` 暴露一个 HTTP 端口，仅内网访问；如需外网访问由用户自行在 NAS 反向代理层加 TLS。
    - 订阅链接加密存储（AES-GCM），UI 仅脱敏展示。

- 安全与密钥管理
    - **加密密钥**：首次启动自动生成 256-bit 随机密钥，持久化到挂载 volume 的 `.key` 文件；可通过环境变量 `ENCRYPTION_KEY` 覆盖。
    - **认证方案**：管理员登录返回 JWT（HS256，密钥从加密密钥派生），有效期 7 天，前端存 httpOnly cookie。
    - **订阅 Token**：UUID v4，支持吊销与重新生成；`/sub/:token` 为公开端点，仅凭 token 鉴权。
    - **管理员初始化**：首次启动进入引导页设置密码（`POST /api/auth/setup`）；后续可通过环境变量 `ADMIN_PASSWORD` 强制重置。

- 后端能力
    - 机场源管理：新增/编辑/启用/禁用/拖拽排序。
    - 聚合策略管理：国家筛选、倍率正则筛选、节点命名规范、分组模板。
    - 配置编译器：
        1. 读取机场源及顺序。
        2. 构建 `proxy-providers`（URL 指向本服务代理中转端点、interval、filter 等）。
        3. 为每个 `proxy-provider` 自动注入 `health-check`：`{ enable: true, url: "https://www.gstatic.com/generate_204", interval: 300, lazy: true }`，用户可在策略页覆盖。
        4. 生成 `proxy-groups`（含 `🚀 节点选择`、`⚡ 自动选择`、国家/机场分组，顺序可拖拽）。
        5. 合并 DNS 与基础配置：`用户覆盖 > 主机场继承 > 系统默认`。**主机场**定义：排序第一位且启用的机场，其 DNS / 基础配置被继承（由排序自动派生，无需手动标记）。
        6. 注入默认规则（`base-rules.yaml`）并应用用户编辑增减。
    - 降级策略：某机场源拉取失败时，编译器跳过该源并在输出 YAML 中以注释标注，不阻断整体编译；前端展示失败机场的告警状态。
    - 信息展示采集（按需触发，不做后台定时刷新）：
        - 拉取响应头 `subscription-userinfo` 解析流量/到期。
        - 拉取一次节点列表用于统计国家、节点数、倍率命中情况、可用性状态。

- 前端交互（Vue）
    - 页面 1：机场订阅列表（状态、流量、到期、节点数、最后检查时间）。
    - 页面 2：分组与顺序编排（机场顺序 + 节点/分组顺序，拖拽）。
    - 页面 3：筛选器（国家、多选；倍率正则；命名清洗）。
    - 页面 4：规则编辑器（CodeMirror 6 + YAML 语法高亮 + 校验 + 预览差异）。
    - 页面 5：发布中心（订阅 URL、复制按钮、YAML 下载、配置预览、版本历史与回滚）。
    - 页面 6：系统设置（管理员账号、访问令牌、导出备份）。
    - 首次访问引导页：设置管理员密码。

### Public APIs / Interfaces

- API（REST）
    - `POST /api/auth/setup`：首次初始化管理员密码。
    - `POST /api/auth/login`：管理员登录，返回 JWT。
    - `GET /api/providers` / `POST /api/providers` / `PUT /api/providers/:id` / `DELETE /api/providers/:id`。
    - `POST /api/providers/reorder`：保存机场拖拽顺序。
    - `POST /api/providers/:id/check`：按需抓取订阅信息与节点统计。
    - `GET /api/policies` / `PUT /api/policies`：国家、倍率、分组策略。
    - `GET /api/rules` / `PUT /api/rules`：默认规则+自定义规则。
    - `POST /api/config/preview`：返回编译后的 YAML 文本预览。
    - `GET /api/config/download`：下载 YAML。
    - `GET /api/config/versions`：配置版本历史列表。
    - `POST /api/config/rollback/:versionId`：回滚到指定版本。
    - `GET /api/proxy/:providerId/:token`：代理中转机场订阅请求，防止原始 URL 泄露。
    - `GET /sub/:token`：客户端订阅入口（返回最新编译 YAML）。
- 数据模型（SQLite）
    - `providers`：id, name, url（AES-GCM 加密）, sort_order, enabled, filter, check_data（JSON：流量/到期/节点统计）, created_at, updated_at。
    - `policy_profiles`：id, country_filter（JSON 数组）, rate_regex, group_template（JSON）, sort_config（JSON）, updated_at。
    - `rulesets`：id, builtin_version, user_overrides（YAML 文本）, updated_at。
    - `publish_tokens`：id, token（UUID v4）, enabled, last_accessed_at, created_at。
    - `settings`：key, value（管理员密码哈希、系统默认 DNS 等）。
    - `config_versions`：id, yaml_text, created_at, trigger_source（manual/auto/rollback）。
- 配置输出（Clash/Mihomo）
    - 固定包含：`proxy-providers`、`proxy-groups`、`rules`。
    - 默认组名保留：`🚀 节点选择`、`⚡ 自动选择`。
    - 规则初始值来自 `base-rules.yaml`，后续可编辑。
    - `proxy-providers` URL 均通过本服务 `/api/proxy/:providerId/:token` 代理中转。
    - 每次编译保存版本快照，保留最近 20 个版本，支持 diff 查看与一键回滚。

### Implementation Milestones

- **Phase 1 — MVP（核心可用）**
    1. 项目脚手架：Node.js (Fastify) 后端 + Vue 3 (Vite) 前端 + Docker 构建。
    2. SQLite schema + knex migrations（全部 6 张表）。
    3. 安全基础：加密工具（AES-GCM）、JWT 认证中间件、管理员初始化引导。
    4. 机场源 CRUD + 按需检查（subscription-userinfo 解析 + 节点统计）。
    5. 配置编译器：proxy-providers（含代理中转 URL + health-check）→ proxy-groups → 注入 base-rules.yaml → 完整 YAML 输出。
    6. 订阅输出：`/sub/:token` + `/api/proxy/:providerId/:token`。
    7. 前端：登录/引导页 + 机场列表页 + 发布中心（订阅 URL 复制 + YAML 下载 + 预览）。

- **Phase 2 — 策略与编辑**
    1. 国家/倍率筛选器 UI + 后端策略 API。
    2. 规则 YAML 编辑器（CodeMirror 6 + diff 预览 + 冲突检测提示）。
    3. 分组拖拽排序（机场顺序 + proxy-groups 顺序）。
    4. DNS 覆盖编辑 UI。

- **Phase 3 — 完善与加固**
    1. 系统设置：备份导出/导入、token 管理（生成/吊销）。
    2. 配置版本历史 + diff 查看 + 一键回滚。
    3. ARM64 多架构 Docker 构建（`docker buildx`）。
    4. 节点命名清洗规则 UI。

### Test Plan

- 单元测试
    - `subscription-userinfo` 解析正确（总流量/已用/到期）。
    - 国家与倍率正则筛选正确（含中文国家名与 `x2/2x/倍率2`）。
    - 配置编译顺序正确（机场拖拽顺序、分组顺序）。
    - DNS 合并优先级正确（用户覆盖优先）。
    - AES-GCM 加密/解密往返正确。
    - 编译器降级策略：单机场失败时跳过不阻断。
- 集成测试
    - 多机场输入后生成的 YAML 可被 Mihomo 正常加载。
    - `/sub/:token` 可被客户端周期拉取且返回最新配置。
    - `/api/proxy/:providerId/:token` 正确转发订阅请求并返回节点数据。
    - 规则编辑后即时影响预览与订阅输出。
    - 版本回滚后订阅输出为目标版本内容。
- 端到端测试
    - 从新增机场到发布订阅 URL 的完整流程。
    - 拖拽排序后 `⚡ 自动选择` 与 `🚀 节点选择` 展示顺序符合预期。
    - 异常场景：机场失效、超时、返回非 Clash 格式时 UI 给出可读错误。
    - 首次启动引导流程：设密码 → 添加机场 → 生成订阅 URL。

### Assumptions / Defaults

- 工作模式：单管理员、内网访问、x86_64 NAS（Phase 3 支持 ARM64）、Docker Compose 部署。
- 技术栈：
    - 后端：Node.js >= 20 LTS、Fastify、better-sqlite3、knex（migrations）。
    - 前端：Vue 3、Vite、Naive UI、Vue Router、Pinia。
    - 编辑器：CodeMirror 6 + `@codemirror/lang-yaml`。
- 输出目标仅 `Clash/Mihomo`，暂不覆盖 Surge/Stash/Loon。
- 不做服务端周期刷新节点，只做按需检查；客户端通过 `proxy-providers.interval` 自行刷新。
- 默认规则集来自 [`base-rules.yaml`](./base-rules.yaml) 作为内置基线（可增删改）。
- HTTPS 不在服务本身处理，由 NAS 反向代理层（如 Nginx Proxy Manager）加 TLS。
