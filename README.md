# Sub Edit Helper

NAS 机场订阅聚合服务 — 聚合多个代理订阅并产出 Clash/Mihomo 配置。

## 功能

- 🔗 **多机场订阅管理** — 订阅 URL AES-256-GCM 加密存储，支持按需检查流量/到期/节点数
- 📋 **多配置文件（Profile）** — 可创建多个独立配置文件，每个文件绑定不同机场组合，互不干扰，支持一键复制
- 🎯 **节点过滤与策略** — 国家代码筛选、倍率正则过滤、订阅信息节点展示
- 🔀 **代理分组管理** — 支持 select / url-test / fallback / load-balance 四种类型，可拖拽排序
- ✏️ **分流规则编辑** — 内置完整 base-rules.yaml 规则集，支持用户通过 YAML 追加/移除规则（CodeMirror 编辑器）
- 📡 **订阅链接发布** — 为每个配置文件生成独立的 Token 订阅链接（`/sub/:token`），客户端直接拉取编译后的 YAML
- 📦 **配置版本历史** — 每次发布或手动下载自动存档，保留最近 15 个版本，支持一键回滚
- 🔒 **单管理员认证** — bcrypt 密码哈希 + JWT (HS256) + HttpOnly Cookie，首次访问引导初始化
- 🐳 **Docker 一键部署** — 多阶段构建镜像，前后端一体，开箱即用

## 快速开始

### Docker Compose（推荐）

```bash
git clone https://github.com/everlst/sub-edit-helper.git
cd sub-edit-helper
docker compose up -d
```

访问 `http://your-nas-ip:17080`，首次使用会引导设置管理员密码。

> 默认映射端口为 `17080`，可在 `docker-compose.yml` 中修改 `ports` 配置。

### 开发模式

```bash
# 后端
cd server
npm install
npm run dev

# 前端（另一个终端）
cd client
npm install
npm run dev
```

前端开发服务器运行在 `http://localhost:5173`，自动代理 API 请求到后端 `http://localhost:3000`。

## 技术栈

| 层   | 技术                                                                     |
| ---- | ------------------------------------------------------------------------ |
| 后端 | Node.js 20+, Fastify 5, better-sqlite3, Knex, js-yaml, jsonwebtoken      |
| 前端 | Vue 3, Vite 6, Naive UI, Pinia, Vue Router 4, CodeMirror 6, vuedraggable |
| 部署 | Docker（多阶段构建）, docker-compose                                     |
| 安全 | AES-256-GCM 加密, JWT (HS256), bcrypt                                    |

## 环境变量

| 环境变量         | 说明                         | 默认值           |
| ---------------- | ---------------------------- | ---------------- |
| `PORT`           | 服务监听端口                 | `3000`           |
| `DATA_DIR`       | 数据库及数据存储目录         | `/app/data`      |
| `ENCRYPTION_KEY` | 订阅 URL 加密密钥（64位hex） | 自动生成并持久化 |
| `ADMIN_PASSWORD` | 强制重置管理员密码           | —                |
| `LOG_LEVEL`      | 日志级别                     | `info`           |

## 数据持久化

所有数据（SQLite 数据库、加密密钥）存储在 `DATA_DIR` 目录下，Docker 部署时通过 Volume 挂载：

```yaml
volumes:
    - ./data:/app/data
```

## 订阅链接格式

```
http://your-nas-ip:17080/sub/<token>
```

将此链接填入 Clash / Mihomo 客户端的订阅地址，客户端会自动拉取最新编译的 YAML 配置，并每 24 小时检查更新（`Profile-Update-Interval: 24`）。

## 许可

MIT
